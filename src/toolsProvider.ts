import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";

// workflow.json lives at the plugin root; this file runs from dist/ once built.
const WORKFLOW_PATH = join(__dirname, "..", "workflow.json");

const POSITIVE_PROMPT_NODE_ID = "4";
const NEGATIVE_PROMPT_NODE_ID = "5";
const LATENT_SIZE_NODE_ID = "6";
const SEED_NODE_ID = "7";

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

async function loadWorkflow(): Promise<any> {
  const raw = await readFile(WORKFLOW_PATH, "utf-8");
  return JSON.parse(raw);
}

async function sendPrompt(
  prompt: string,
  negativePrompt: string,
  aspectRatio: AspectRatio
): Promise<string> {
  const workflow = await loadWorkflow();
  const { width, height } = ASPECT_RATIOS[aspectRatio];

  workflow[POSITIVE_PROMPT_NODE_ID].inputs.prompt = prompt;
  workflow[NEGATIVE_PROMPT_NODE_ID].inputs.prompt = negativePrompt;
  workflow[LATENT_SIZE_NODE_ID].inputs.width = width;
  workflow[LATENT_SIZE_NODE_ID].inputs.height = height;
  workflow[SEED_NODE_ID].inputs.seed = Math.floor(Math.random() * 2 ** 32);

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

async function waitForImage(promptId: string, timeoutMs = 180_000): Promise<ComfyImageResult> {
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

export async function toolsProvider(ctl: ToolsProviderController): Promise<Tool[]> {
  const generateComfyUIImage = tool({
    name: "generate_comfyui_image",
    description:
      "Generate an image locally via ComfyUI (Z-Image Turbo). " +
      "Use this when the user asks to create, draw, or generate an image. " +
      "Always pass a single, richly detailed, natural-language English prompt " +
      "(subject, environment, mood, lighting, style) rather than a short tag list or the user's raw request. " +
      "The result includes a markdown image line — your reply after calling this tool must reproduce that " +
      "line verbatim so the image actually displays; do not just describe the image in words instead.",
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
      status("Sending prompt to ComfyUI...");

      const promptId = await sendPrompt(prompt, negative_prompt ?? "", aspect_ratio ?? "square");

      status("Waiting for ComfyUI image generation...");

      const image = await waitForImage(promptId);

      status("Downloading generated image into LM Studio working directory...");

      const imageUrl = buildComfyUIImageUrl(image);
      const workingDirectory = ctl.getWorkingDirectory();

      const lmStudioImagePath = await downloadImageToLmStudioWorkingDir(
        imageUrl,
        image.filename,
        workingDirectory
      );

      status("Image generated successfully.");

      const markdownImage = `![Generated image](${lmStudioImagePath})`;

      return (
        `Image generated successfully at ${lmStudioImagePath}. ` +
        `Reply with exactly this markdown line so the image displays, ` +
        `then optionally one short sentence — do not describe the image in prose instead of showing it:\n\n` +
        `${markdownImage}`
      );
    }
  });

  return [generateComfyUIImage];
}
