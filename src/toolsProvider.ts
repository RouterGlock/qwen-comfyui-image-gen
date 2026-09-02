import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, basename } from "node:path";

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
const GENERATE_WORKFLOW_PATH = join(__dirname, "..", "workflow.json");
const EDIT_WORKFLOW_PATH = join(__dirname, "..", "workflow-edit.json");
const REFERENCE_WORKFLOW_PATH = join(__dirname, "..", "workflow-reference.json");

const POSITIVE_PROMPT_NODE_ID = "4";
const NEGATIVE_PROMPT_NODE_ID = "5";
const LATENT_SIZE_NODE_ID = "6";
const SEED_NODE_ID = "7";

// workflow-edit.json: LoadImage -> ImageScale -> node 4's image1 input.
const EDIT_LOAD_IMAGE_NODE_ID = "10";
const EDIT_SCALE_NODE_ID = "11";

// workflow-reference.json: up to 3 (LoadImage -> ImageScale) pairs feeding node 4's image1/2/3 inputs.
const REFERENCE_LOAD_IMAGE_NODE_IDS = ["10", "14", "15"] as const;
const REFERENCE_SCALE_NODE_IDS = ["11", "12", "13"] as const;

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
  const response = await fetch(`${COMFYUI_URL}/history/${promptId}`);

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

  const safeFilename = `${Date.now()}-${basename(originalFilename)}`;
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
  const generateComfyUIImage = tool({
    name: "generate_comfyui_image",
    description:
      "Generate a brand-new image locally via ComfyUI (Z-Image Turbo), from a text description alone " +
      "(no existing image involved). Use this when the user asks to create, draw, or generate an image " +
      "from scratch. Always pass a single, richly detailed, natural-language English prompt (subject, " +
      "environment, mood, lighting, style) rather than a short tag list or the user's raw request. " +
      MARKDOWN_REPLY_RULE,
    parameters: {
      prompt: z.string().describe(
        "A detailed, natural-language English description of the desired image."
      ),
      negative_prompt: z
        .string()
        .optional()
        .describe("What to avoid in the image, e.g. 'blurry, watermark, text'. Optional."),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe("Image shape. Defaults to square (1024x1024).")
    },
    implementation: async ({ prompt, negative_prompt, aspect_ratio }, { status }) => {
      await ensureComfyUIReady(status);

      const workflow = await loadWorkflow(GENERATE_WORKFLOW_PATH);
      applyPromptFields(workflow, prompt, negative_prompt ?? "", aspect_ratio ?? "square");

      return runWorkflowAndReturnMarkdown(workflow, ctl.getWorkingDirectory(), status);
    }
  });

  const editComfyUIImage = tool({
    name: "edit_comfyui_image",
    description:
      "Edit an existing local image file, given its exact file path and an instruction describing the " +
      "change (e.g. 'change the background to a beach at sunset', 'make it black and white', 'add a hat'). " +
      "Uses ComfyUI (Z-Image Turbo's native edit conditioning). Use this when the user wants to modify a " +
      "specific image that already exists on disk — including a path this plugin returned earlier in the " +
      "chat — rather than create something new. " +
      MARKDOWN_REPLY_RULE,
    parameters: {
      image_path: z.string().describe("Absolute path to the existing image file to edit."),
      prompt: z.string().describe("A clear, natural-language description of the change to make to the image."),
      negative_prompt: z
        .string()
        .optional()
        .describe("What to avoid in the result, e.g. 'blurry, watermark, text'. Optional."),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe("Output shape. Defaults to square; pick the one matching the source image when known.")
    },
    implementation: async ({ image_path, prompt, negative_prompt, aspect_ratio }, { status }) => {
      await ensureComfyUIReady(status);

      status("Uploading source image to ComfyUI...");
      const uploaded = await uploadImageToComfyUI(image_path);

      const workflow = await loadWorkflow(EDIT_WORKFLOW_PATH);
      applyPromptFields(workflow, prompt, negative_prompt ?? "", aspect_ratio ?? "square");

      const { width, height } = ASPECT_RATIOS[aspect_ratio ?? "square"];
      workflow[EDIT_LOAD_IMAGE_NODE_ID].inputs.image = comfyImageRef(uploaded);
      workflow[EDIT_SCALE_NODE_ID].inputs.width = width;
      workflow[EDIT_SCALE_NODE_ID].inputs.height = height;

      return runWorkflowAndReturnMarkdown(workflow, ctl.getWorkingDirectory(), status);
    }
  });

  const referenceComfyUIImage = tool({
    name: "reference_comfyui_image",
    description:
      "Generate a NEW image guided by 1-3 existing reference images, given their exact file paths, plus a " +
      "prompt describing the new scene/composition (e.g. 'put this character on a beach at sunset', " +
      "'combine the subject of the first image with the style of the second'). Uses ComfyUI (Z-Image " +
      "Turbo's native reference conditioning) to keep a subject, character, or style consistent while " +
      "generating something new — this is different from edit_comfyui_image, which modifies the reference " +
      "image itself rather than creating a new composition inspired by it. " +
      MARKDOWN_REPLY_RULE,
    parameters: {
      image_path: z.string().describe("Absolute path to the primary reference image."),
      image_path_2: z
        .string()
        .optional()
        .describe("Absolute path to a second reference image, if using more than one."),
      image_path_3: z
        .string()
        .optional()
        .describe("Absolute path to a third reference image, if using more than one."),
      prompt: z.string().describe(
        "A detailed, natural-language description of the new scene/composition to generate, referencing " +
          "what to draw from the reference image(s)."
      ),
      negative_prompt: z
        .string()
        .optional()
        .describe("What to avoid in the result, e.g. 'blurry, watermark, text'. Optional."),
      aspect_ratio: z
        .enum(["square", "landscape", "portrait"])
        .optional()
        .describe("Image shape. Defaults to square (1024x1024).")
    },
    implementation: async (
      { image_path, image_path_2, image_path_3, prompt, negative_prompt, aspect_ratio },
      { status }
    ) => {
      await ensureComfyUIReady(status);

      status("Uploading reference image(s) to ComfyUI...");

      const referencePaths = [image_path, image_path_2, image_path_3];
      const imageCount = referencePaths.filter(Boolean).length;
      // Each extra reference image adds a real amount of per-step compute (encoding it into
      // reference latents, then attending over it at every sampling step) — one image stays
      // well within the 300s default, but two images alone was observed pushing past it.
      const timeoutMs = 300_000 + 200_000 * (imageCount - 1);
      const { width, height } = ASPECT_RATIOS[aspect_ratio ?? "square"];

      const workflow = await loadWorkflow(REFERENCE_WORKFLOW_PATH);
      applyPromptFields(workflow, prompt, negative_prompt ?? "", aspect_ratio ?? "square");

      for (let i = 0; i < REFERENCE_LOAD_IMAGE_NODE_IDS.length; i++) {
        const path = referencePaths[i];
        const loadImageNodeId = REFERENCE_LOAD_IMAGE_NODE_IDS[i];
        const scaleNodeId = REFERENCE_SCALE_NODE_IDS[i];
        const imageInputKey = `image${i + 1}`;

        if (path) {
          const uploaded = await uploadImageToComfyUI(path);
          workflow[loadImageNodeId].inputs.image = comfyImageRef(uploaded);
          workflow[scaleNodeId].inputs.width = width;
          workflow[scaleNodeId].inputs.height = height;
        } else {
          // Leaves the LoadImage/ImageScale nodes in place but disconnected; ComfyUI
          // only validates/executes nodes reachable from the SaveImage output, so an
          // unused, unfilled-in LoadImage node is silently ignored rather than erroring.
          delete workflow[POSITIVE_PROMPT_NODE_ID].inputs[imageInputKey];
        }
      }

      return runWorkflowAndReturnMarkdown(workflow, ctl.getWorkingDirectory(), status, timeoutMs);
    }
  });

  return [generateComfyUIImage, editComfyUIImage, referenceComfyUIImage];
}
