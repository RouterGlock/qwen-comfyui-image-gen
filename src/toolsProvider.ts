import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, openSync, realpathSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, basename, extname, resolve, sep } from "node:path";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";

// If ComfyUI isn't running when a tool fires, we spawn this launcher and wait for
// it rather than returning "fetch failed". Override with COMFYUI_LAUNCHER; only
// used when COMFYUI_URL is a local address (never try to "start" a remote box).
const COMFYUI_LAUNCHER =
  process.env.COMFYUI_LAUNCHER ??
  join(homedir(), "ComfyUI-Installs", "run-comfyui-optimized.sh");
const COMFYUI_START_LOG = join(
  homedir(),
  "ComfyUI-Installs",
  "ComfyUI",
  "logs",
  "plugin-autostart.log"
);
const COMFYUI_IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(
  COMFYUI_URL
);

// Workflow files live at the plugin root; this file runs from dist/ once built.
// Qwen-Image workflows: base Qwen-Image for t2i, Qwen-Image-Edit-2511 for edit/reference.
const QWEN_T2I_WORKFLOW_PATH = join(__dirname, "..", "workflow-qwen-t2i.json");
const QWEN_EDIT_WORKFLOW_PATH = join(__dirname, "..", "workflow-qwen-edit.json");
const QWEN_REFERENCE_WORKFLOW_PATH = join(__dirname, "..", "workflow-qwen-reference.json");

// Cold Qwen runs (GGUF load + dequant + Qwen2.5-VL encode + sampling) can exceed the
// 300s default, so the Qwen tools pass this explicitly.
const QWEN_TIMEOUT_MS = 900_000;

const POSITIVE_PROMPT_NODE_ID = "4";
const NEGATIVE_PROMPT_NODE_ID = "5";
const LATENT_SIZE_NODE_ID = "6";
const SEED_NODE_ID = "7";

// workflow-qwen-edit.json: source image loads into node 10.
const EDIT_LOAD_IMAGE_NODE_ID = "10";

// workflow-qwen-reference.json: up to 3 LoadImage nodes feeding node 4's image1/2/3 inputs.
const REFERENCE_LOAD_IMAGE_NODE_IDS = ["10", "14", "15"] as const;

const MARKDOWN_REPLY_RULE =
  "This tool's result IS the literal chat reply, verbatim: your entire response must start with that exact " +
  "markdown line, character for character. Do not wrap it in parentheses, backticks, or quotes; do not prefix " +
  "it with \"Done —\" or a description of the image; do not reword, summarize, or describe the image in prose " +
  "instead of showing it. You may add one short plain sentence after it on a new line.";

const ASPECT_RATIOS = {
  square: { width: 1024, height: 1024 },
  landscape: { width: 1216, height: 832 },
  portrait: { width: 832, height: 1216 }
} as const;

type AspectRatio = keyof typeof ASPECT_RATIOS;

type ComfyImageResult = {
  filename: string;
  subfolder: string;
  type: string;
};

type UploadedImage = {
  name: string;
  subfolder: string;
  type: string;
};

// ---- caller-supplied path safety ----------------------------------------
// image_path / image_path_2 / image_path_3 come straight from the model, and a
// prompt injection can put any path there. Without a gate the tool would read
// that file off disk and POST it to ComfyUI, which then serves it back over
// /view — an arbitrary-file-read/exfil primitive. Every caller path is funnelled
// through safeImagePath() first.

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);
const MAX_INPUT_IMAGE_BYTES = 64 * 1024 * 1024;

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

// Real (symlink-resolved) directories a caller image path may live under.
// Extend with QWEN_ALLOWED_IMAGE_DIRS (":"-separated, "~" ok).
function allowedImageRoots(workingDirectory: string): string[] {
  const candidates = [
    workingDirectory,
    join(homedir(), "Desktop"),
    join(homedir(), "Downloads"),
    join(homedir(), "Pictures"),
    join(homedir(), "Documents"),
    ...(process.env.QWEN_ALLOWED_IMAGE_DIRS ?? "")
      .split(":")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(expandHome)
  ];
  const roots: string[] = [];
  for (const c of candidates) {
    try {
      roots.push(realpathSync(resolve(c)));
    } catch {
      /* skip roots that don't exist */
    }
  }
  return roots;
}

function safeImagePath(input: string, workingDirectory: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("image path is required");
  }
  let real: string;
  try {
    real = realpathSync(resolve(expandHome(input.trim())));
  } catch {
    throw new Error(`Image not found: ${input}`);
  }
  const st = statSync(real);
  if (!st.isFile()) {
    throw new Error(`Not a regular file: ${input}`);
  }
  if (st.size > MAX_INPUT_IMAGE_BYTES) {
    throw new Error(
      `Image is ${(st.size / 1048576).toFixed(1)} MB, over the ${MAX_INPUT_IMAGE_BYTES / 1048576} MB limit.`
    );
  }
  if (!IMAGE_EXTS.has(extname(real).toLowerCase())) {
    throw new Error(
      `Unsupported image type "${extname(real) || "(none)"}". Allowed: ${[...IMAGE_EXTS].join(", ")}`
    );
  }
  const roots = allowedImageRoots(workingDirectory);
  if (!roots.some((root) => real === root || real.startsWith(root + sep))) {
    throw new Error(
      `Refusing to read "${input}": outside the allowed image folders (LM Studio working ` +
        `directory, ~/Desktop, ~/Downloads, ~/Pictures, ~/Documents). ` +
        `Set QWEN_ALLOWED_IMAGE_DIRS to allow another location.`
    );
  }
  return real;
}

async function loadWorkflow(path: string): Promise<any> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

async function comfyUIIsUp(timeoutMs = 2_000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${COMFYUI_URL}/system_stats`, { signal: ctrl.signal });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

// One in-flight start per plugin process: concurrent tool calls await the same
// launch instead of each spawning a server that then fails to bind port 8188.
let comfyStartInFlight: Promise<void> | null = null;

async function startComfyUIOnce(status: (message: string) => void): Promise<void> {
  if (!comfyStartInFlight) {
    comfyStartInFlight = (async () => {
      status("ComfyUI is not responding — starting it...");

      let stdio: "ignore" | ["ignore", number, number] = "ignore";
      try {
        const fd = openSync(COMFYUI_START_LOG, "a");
        stdio = ["ignore", fd, fd];
      } catch {
        // logs dir not present yet — run without capturing output
      }

      const child = spawn("/bin/zsh", [COMFYUI_LAUNCHER], { detached: true, stdio });
      child.unref();

      // A fully cold start (evicted disk cache + ComfyUI-Manager's registry
      // fetches + first model load) has been seen to take past 2 minutes on
      // this hardware; give it a generous budget before giving up.
      const deadlineMs = Date.now() + 240_000;
      while (Date.now() < deadlineMs) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        if (await comfyUIIsUp()) {
          status("ComfyUI is up.");
          return;
        }
        status("Waiting for ComfyUI to finish starting...");
      }

      throw new Error(
        `Launched ComfyUI via ${COMFYUI_LAUNCHER} but it was still not reachable at ${COMFYUI_URL} ` +
          `after 240s. It may just need a little longer on a cold start — retry in a moment. ` +
          `If it keeps failing, check ${COMFYUI_START_LOG}.`
      );
    })();
  }

  try {
    await comfyStartInFlight;
  } finally {
    comfyStartInFlight = null;
  }
}

/**
 * Run at the top of every tool. A ~cheap no-op when ComfyUI is already reachable;
 * otherwise it spawns the tuned launcher detached (so the server outlives this
 * tool call and serves later images too) and waits for it to answer before the
 * tool proceeds. Net effect: a cold machine makes the first image take ~30-60s
 * longer instead of failing with "fetch failed".
 */
async function ensureComfyUIReady(status: (message: string) => void): Promise<void> {
  if (await comfyUIIsUp()) return;

  // A remote/unrecognized COMFYUI_URL isn't ours to start, and a missing launcher
  // means there's nothing to run — in both cases fall through and let the real
  // request fail with its own, more specific error.
  if (!COMFYUI_IS_LOCAL || !existsSync(COMFYUI_LAUNCHER)) return;

  await startComfyUIOnce(status);
}

function applyPromptFields(
  workflow: any,
  prompt: string,
  negativePrompt: string,
  aspectRatio: AspectRatio
): void {
  const { width, height } = ASPECT_RATIOS[aspectRatio];

  workflow[POSITIVE_PROMPT_NODE_ID].inputs.prompt = prompt;
  workflow[NEGATIVE_PROMPT_NODE_ID].inputs.prompt = negativePrompt;
  workflow[LATENT_SIZE_NODE_ID].inputs.width = width;
  workflow[LATENT_SIZE_NODE_ID].inputs.height = height;
  workflow[SEED_NODE_ID].inputs.seed = Math.floor(Math.random() * 2 ** 32);
}

function comfyImageRef(image: UploadedImage): string {
  return image.subfolder ? `${image.subfolder}/${image.name}` : image.name;
}

async function uploadImageToComfyUI(localPath: string): Promise<UploadedImage> {
  const bytes = await readFile(localPath);
  const form = new FormData();
  form.append("image", new Blob([bytes]), basename(localPath));
  form.append("overwrite", "true");

  const response = await fetch(`${COMFYUI_URL}/upload/image`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ComfyUI /upload/image failed: ${response.status} ${response.statusText} - ${body}`);
  }

  return response.json();
}

async function submitWorkflow(workflow: any): Promise<string> {
  const response = await fetch(`${COMFYUI_URL}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: workflow,
      client_id: crypto.randomUUID()
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ComfyUI /prompt failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const result: any = await response.json();
  return result.prompt_id;
}

async function getHistory(promptId: string): Promise<any> {
  const response = await fetch(`${COMFYUI_URL}/history/${encodeURIComponent(promptId)}`);

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function waitForImage(promptId: string, timeoutMs = 300_000): Promise<ComfyImageResult> {
  const startedAt = Date.now();

  while (true) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timeout waiting for ComfyUI image generation");
    }

    const history = await getHistory(promptId);

    if (history?.[promptId]) {
      const outputs = history[promptId].outputs ?? {};

      for (const nodeOutput of Object.values(outputs) as any[]) {
        const images = nodeOutput.images;

        if (images && images.length > 0) {
          const image = images[0];

          return {
            filename: image.filename,
            subfolder: image.subfolder ?? "",
            type: image.type ?? "output"
          };
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function buildComfyUIImageUrl(image: ComfyImageResult): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type
  });

  return `${COMFYUI_URL}/view?${params.toString()}`;
}

async function downloadImageToLmStudioWorkingDir(
  imageUrl: string,
  originalFilename: string,
  workingDirectory: string
): Promise<string> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to download image from ComfyUI: ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  // basename() strips any path from ComfyUI's reported filename; then keep only a
  // conservative charset and force an image extension so the write target stays a
  // plain file directly inside workingDirectory.
  const stripped = basename(originalFilename).replace(/[^A-Za-z0-9._-]/g, "_");
  const ext = IMAGE_EXTS.has(extname(stripped).toLowerCase()) ? "" : ".png";
  const safeFilename = `${Date.now()}-${stripped || "image"}${ext}`;
  const filePath = join(workingDirectory, safeFilename);

  await writeFile(filePath, bytes);

  return filePath;
}

/**
 * Runs a fully-patched workflow through ComfyUI and returns ONLY the bare markdown
 * image line. Kept minimal on purpose: the less surrounding text the model has to
 * carry through to its reply, the less likely it is to paraphrase/summarize instead
 * of reproducing the line verbatim (see README Troubleshooting).
 */
async function runWorkflowAndReturnMarkdown(
  workflow: any,
  workingDirectory: string,
  status: (message: string) => void,
  timeoutMs = 300_000
): Promise<string> {
  status("Sending prompt to ComfyUI...");
  const promptId = await submitWorkflow(workflow);

  status("Waiting for ComfyUI image generation...");
  const image = await waitForImage(promptId, timeoutMs);

  status("Downloading generated image into LM Studio working directory...");
  const imageUrl = buildComfyUIImageUrl(image);
  const lmStudioImagePath = await downloadImageToLmStudioWorkingDir(
    imageUrl,
    image.filename,
    workingDirectory
  );

  status("Image generated successfully.");

  return `![Generated image](${lmStudioImagePath})`;
}

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  // ---- Qwen-Image tools -----------------------------------------------------
  // Backed by base Qwen-Image (t2i) and Qwen-Image-Edit-2511 (edit/reference):
  // slower than a distilled turbo model, but far cleaner for illustration and
  // style conversion, and it actually holds composition on an edit.

  const qwenGenerateImage = tool({
    name: "qwen_generate_image",
    description:
      "Generate a brand-new image locally via ComfyUI using base Qwen-Image (no existing image involved). " +
      "Use this when the user asks to create, draw, or generate an image from scratch (~1-2 min). Pass one " +
      "richly detailed natural-language English prompt (subject, environment, mood, lighting, style). " +
      MARKDOWN_REPLY_RULE,
    parameters: {
      prompt: z.string().describe("A detailed, natural-language English description of the desired image."),
      negative_prompt: z
        .string()
        .optional()
        .describe("What to avoid in the image, e.g. 'blurry, watermark, text'. Optional."),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe("Image shape. Defaults to landscape (1216x832).")
    },
    implementation: async ({ prompt, negative_prompt, aspect_ratio }, { status }) => {
      await ensureComfyUIReady(status);

      const ratio = aspect_ratio ?? "landscape";
      const { width, height } = ASPECT_RATIOS[ratio];
      const workflow = await loadWorkflow(QWEN_T2I_WORKFLOW_PATH);

      // Qwen t2i uses CLIPTextEncode (field `text`), not the `prompt` field applyPromptFields writes.
      workflow[POSITIVE_PROMPT_NODE_ID].inputs.text = prompt;
      workflow[NEGATIVE_PROMPT_NODE_ID].inputs.text = negative_prompt ?? "";
      workflow[LATENT_SIZE_NODE_ID].inputs.width = width;
      workflow[LATENT_SIZE_NODE_ID].inputs.height = height;
      workflow[SEED_NODE_ID].inputs.seed = Math.floor(Math.random() * 2 ** 32);

      return runWorkflowAndReturnMarkdown(workflow, ctl.getWorkingDirectory(), status, QWEN_TIMEOUT_MS);
    }
  });

  const qwenEditImage = tool({
    name: "qwen_edit_image",
    description:
      "Edit, restyle, or heavily transform an existing local image via ComfyUI (Qwen-Image-Edit 2511) — e.g. " +
      "turn a photo into a flat 2D cartoon / illustration / painting, change the background, or add/remove " +
      "an element, while keeping the same composition, people, and poses (~1-3 min). Give an exact file " +
      "path plus an instruction describing the change and what to preserve. " +
      MARKDOWN_REPLY_RULE,
    parameters: {
      image_path: z.string().describe("Absolute path to the existing image file to restyle."),
      prompt: z
        .string()
        .describe("Instruction: the target art style plus what to keep (people, poses, framing, background)."),
      negative_prompt: z
        .string()
        .optional()
        .describe("What to avoid, e.g. 'photorealistic, film grain, noise, 3d render'. Optional."),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe("Output shape hint. Defaults to landscape; the source image's own aspect is largely preserved.")
    },
    implementation: async ({ image_path, prompt, negative_prompt, aspect_ratio }, { status }) => {
      await ensureComfyUIReady(status);

      status("Uploading source image to ComfyUI...");
      const uploaded = await uploadImageToComfyUI(safeImagePath(image_path, ctl.getWorkingDirectory()));

      const workflow = await loadWorkflow(QWEN_EDIT_WORKFLOW_PATH);
      applyPromptFields(workflow, prompt, negative_prompt ?? "", aspect_ratio ?? "landscape");
      workflow[EDIT_LOAD_IMAGE_NODE_ID].inputs.image = comfyImageRef(uploaded);
      // Node 11 is FluxKontextImageScale (auto-sizes to a supported resolution keeping
      // aspect) — nothing to patch. Node 6 (EmptySD3LatentImage) that applyPromptFields
      // just wrote is unreachable here (latent comes from VAEEncode) and is ignored.

      return runWorkflowAndReturnMarkdown(workflow, ctl.getWorkingDirectory(), status, QWEN_TIMEOUT_MS);
    }
  });

  const qwenReferenceImage = tool({
    name: "qwen_reference_image",
    description:
      "Generate a NEW image guided by 1-3 existing reference images (exact file paths) plus a prompt " +
      "describing the new scene/composition — e.g. 'put the person from image 1 into the setting of image 2', " +
      "'the subject of image 1 in the art style of image 2'. Uses Qwen-Image-Edit 2511's multi-image " +
      "conditioning to keep a subject, character, or style consistent while generating a new composition " +
      "(~2-4 min) — different from qwen_edit_image, which modifies the source image itself. " +
      MARKDOWN_REPLY_RULE,
    parameters: {
      image_path: z.string().describe("Absolute path to the primary reference image."),
      image_path_2: z.string().optional().describe("Absolute path to a second reference image, if using more than one."),
      image_path_3: z.string().optional().describe("Absolute path to a third reference image, if using more than one."),
      prompt: z
        .string()
        .describe(
          "A detailed description of the new scene/composition, stating what carries over from each reference " +
            "(subject, style, palette, pose) and what changes."
        ),
      negative_prompt: z.string().optional().describe("What to avoid in the result. Optional."),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe("Image shape. Defaults to landscape.")
    },
    implementation: async (
      { image_path, image_path_2, image_path_3, prompt, negative_prompt, aspect_ratio },
      { status }
    ) => {
      await ensureComfyUIReady(status);

      status("Uploading reference image(s) to ComfyUI...");

      const referencePaths = [image_path, image_path_2, image_path_3];
      const workflow = await loadWorkflow(QWEN_REFERENCE_WORKFLOW_PATH);
      applyPromptFields(workflow, prompt, negative_prompt ?? "", aspect_ratio ?? "landscape");

      for (let i = 0; i < REFERENCE_LOAD_IMAGE_NODE_IDS.length; i++) {
        const path = referencePaths[i];
        const loadImageNodeId = REFERENCE_LOAD_IMAGE_NODE_IDS[i];
        const imageInputKey = `image${i + 1}`;

        if (path) {
          const uploaded = await uploadImageToComfyUI(safeImagePath(path, ctl.getWorkingDirectory()));
          workflow[loadImageNodeId].inputs.image = comfyImageRef(uploaded);
        } else {
          // Drop the unused image slot from BOTH text-encode nodes; the now-unreachable
          // LoadImage/FluxKontextImageScale nodes are pruned by ComfyUI.
          delete workflow[POSITIVE_PROMPT_NODE_ID].inputs[imageInputKey];
          delete workflow[NEGATIVE_PROMPT_NODE_ID].inputs[imageInputKey];
        }
      }

      return runWorkflowAndReturnMarkdown(workflow, ctl.getWorkingDirectory(), status, QWEN_TIMEOUT_MS);
    }
  });

  return [qwenGenerateImage, qwenEditImage, qwenReferenceImage];
}
