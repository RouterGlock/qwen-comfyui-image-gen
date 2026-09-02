# qwen-comfyui-image-gen

[![GitHub repo](https://img.shields.io/badge/GitHub-qwen--comfyui--image--gen-blue?logo=github)](https://github.com/RouterGlock/qwen-comfyui-image-gen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An LM Studio plugin that lets a local model (tested with Qwen) generate,
edit, and reference-guide images by calling ComfyUI directly, no server or
bridge process in between. Ask for an image in an LM Studio chat; the model
expands your request into a detailed prompt and calls a tool that submits it
to ComfyUI, waits for the render, and drops the result back into the chat.

Three tools, three presets:

| Tool | Preset | Does |
|---|---|---|
| `qwen_generate_image` | Image Director (Qwen-Image ComfyUI) | Text-to-image, from scratch |
| `qwen_edit_image` | Image Restyle (Qwen-Image-Edit ComfyUI) | Edit / restyle / transform an existing image file, holding composition |
| `qwen_reference_image` | Image Reference (Qwen-Image-Edit ComfyUI) | Generate a new image guided by 1-3 reference images |

Bundled to generate with **[Qwen-Image](https://huggingface.co/Qwen/Qwen-Image)**
for text-to-image and **[Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)**
for the edit and reference tools (both as GGUF quants, with the matching
Lightning LoRAs for 4-8 step sampling), sharing a Qwen2.5-VL text encoder.
The edit and reference tools use Qwen-Image-Edit's native multi-image
conditioning (`TextEncodeQwenImageEditPlus` +
`FluxKontextMultiReferenceLatentMethod`), not a classic img2img/denoise
pipeline. The workflows are plain ComfyUI API-format JSON files — swap in
your own to target a different checkpoint (see
[Using a different model](#using-a-different-model)).

> **Earlier Z-Image Turbo build:** this plugin previously shipped a parallel
> trio of tools (`generate_comfyui_image` / `edit_comfyui_image` /
> `reference_comfyui_image`) backed by Z-Image Turbo. Those were removed in
> favour of Qwen-Image, which is slower but noticeably more stable and higher
> quality. The old workflow files are kept, unused, in `z-image-archive/` if
> you want the fast path back.

![Example output: a small red robot watering a bonsai tree on a sunlit windowsill](docs/example.png)

*`qwen_generate_image` — "a small red robot watering a bonsai tree on a
sunlit windowsill", prompt expanded by the LLM, rendered by Qwen-Image via
ComfyUI, returned straight to the chat.*

![Example edit: the same robot now wearing a blue wizard hat](docs/edit-example.png)

*The image above, run through `qwen_edit_image` with "add a small blue
wizard hat, keep everything else identical" — same scene, pose, and lighting,
only the requested change.*

![Example reference: the same robot on a rain-soaked neon-lit city street at night](docs/reference-example.png)

*The first image used as a reference for `qwen_reference_image` with "the
robot from the reference image, now on a rain-soaked neon-lit city street at
night" — same robot, brand-new scene.*

## Companion plugin

**[minimax-h3-comfyui-video](https://github.com/RouterGlock/minimax-h3-comfyui-video)**
is the same idea for video: a local model writes the prompt and calls ComfyUI +
**MiniMax H3** to generate short 3–5 s clips (with the audio H3 generates in the
same pass) straight into the chat. Same three-tool / three-preset shape —
`minimax_generate_video` (text → clip), `minimax_animate_image` (image → clip),
and `minimax_reference_video` (reference image + prompt → new scene).

## Video demo

*Coming soon — a short screen recording of the full flow (asking for an
image in LM Studio chat through to it rendering back in) will go here.*

## How it works

- `src/toolsProvider.ts` registers three tools — `qwen_generate_image`,
  `qwen_edit_image`, and `qwen_reference_image`. Each loads its own workflow
  file (`workflow-qwen-t2i.json`, `workflow-qwen-edit.json`,
  `workflow-qwen-reference.json`), patches in your prompt/negative
  prompt/resolution (and, for edit/reference, uploads your source image(s)
  to ComfyUI's `/upload/image` endpoint first), POSTs it to ComfyUI's
  `/prompt` endpoint, polls `/history/{id}` until the render finishes,
  downloads the image from ComfyUI's `/view` endpoint into LM Studio's
  working directory, and returns a markdown image reference so it renders
  inline in the chat.
- Edit and reference feed the source image(s) into Qwen-Image-Edit-2511's
  `TextEncodeQwenImageEditPlus` conditioning (alongside the text prompt) and
  combine them with `FluxKontextMultiReferenceLatentMethod` — the model's
  native way of doing image-guided generation. Source images pass through a
  `FluxKontextImageScale` node, which auto-sizes to a supported resolution
  while keeping aspect, so there's no explicit width/height to patch.
- Cold Qwen runs (GGUF load + dequant + Qwen2.5-VL encode + sampling) can
  take a few minutes, so all three tools pass an explicit 900s timeout
  (`QWEN_TIMEOUT_MS`) rather than the 300s default.
- The **system prompt** is what actually makes this feel good to use: an
  LM model asked for an image tends to pass your raw one-liner straight
  through, which most image models render poorly. A short system prompt per
  tool (see [Recommended system prompts](#recommended-system-prompts)) gets
  the model to expand your request into the kind of detailed, natural-language
  prompt Qwen-Image responds to, before it calls the tool — and to reproduce
  the tool's returned markdown image line exactly, rather than describing the
  image in prose instead.

## Prerequisites

- [LM Studio](https://lmstudio.ai/) with the `lms` CLI (bundled with the app).
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally and
  reachable (default `http://127.0.0.1:8188`), with the **ComfyUI-GGUF**
  custom node installed (for `UnetLoaderGGUF`).
- The model files the bundled workflows expect, in your ComfyUI model
  folders:
  - `diffusion_models/Qwen_Image-Q5_K_M.gguf` (text-to-image)
  - `diffusion_models/qwen-image-edit-2511-Q5_K_M.gguf` (edit + reference)
  - `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors`
  - `vae/qwen_image_vae.safetensors`
  - `loras/Qwen-Image-Lightning-8steps-V1.0.safetensors` (t2i)
  - `loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` (edit + reference)

  If you're targeting a different checkpoint instead, see
  [Using a different model](#using-a-different-model) — you don't need these
  exact files.

## Tested configuration (Apple Silicon)

This was built and verified on an **Apple Silicon Mac with 64GB unified
memory** (M1 Max), running Qwen-Image / Qwen-Image-Edit-2511 (GGUF) plus a
Qwen2.5-VL text encoder in ComfyUI, and a ~35B-parameter MoE model
(`qwen3.6-35b-a3b-fable-holo3.1-qwepus-kat-coder-c-qx86-hi-mlx`, MLX quant)
loaded in LM Studio for prompt writing. It's not tied to that exact setup,
but a few things matter if you're replicating it:

- **Unified memory budget:** LM Studio's LLM and ComfyUI's image model share
  the same pool of RAM on Apple Silicon (no discrete VRAM). 64GB comfortably
  holds a ~35B MoE model (a handful of GB active per token thanks to MoE
  sparsity) alongside a Q5 Qwen-Image quant. On 32GB or less, prefer a
  smaller/quantized LLM (7B–14B range), a smaller Qwen-Image quant, or unload
  one side between uses.
- **LLM tier for prompt-writing:** you don't need a huge model just to
  expand a one-line request into a good image prompt — a modern ~7B–30B
  model handles this well. Bigger helps mainly with following the structured
  prompt-format instructions in the system prompt more consistently.
- **ComfyUI on Metal:** if you launch ComfyUI yourself rather than through
  Comfy Desktop, these env vars avoid the two most common Apple Silicon
  failure modes — a missing-Metal-kernel crash on a brand-new architecture,
  and an early out-of-memory abort on a large allocation the machine could
  actually still handle:
  ```bash
  export PYTORCH_ENABLE_MPS_FALLBACK=1        # fall back to CPU for ops Metal hasn't implemented yet
  export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 # remove PyTorch's MPS allocation ceiling
  export PYTORCH_MPS_LOW_WATERMARK_RATIO=0.0
  ```
  Qwen-Image is heavier than a distilled turbo model — on Metal these are
  effectively required, not optional, to avoid an OOM abort mid-render.

## Install

```bash
git clone <this-repo-url>
cd qwen-comfyui-image-gen
npm install
lms dev -i -y   # builds and installs the plugin into LM Studio
```

If ComfyUI runs somewhere other than `127.0.0.1:8188`, set `COMFYUI_URL`
before starting LM Studio (or export it in the shell `lms dev` runs from):

```bash
export COMFYUI_URL="http://127.0.0.1:8188"
```

### Where source images are read from

`qwen_edit_image` / `qwen_reference_image` only read an `image_path` that is an image
file inside the LM Studio working directory, `~/Desktop`, `~/Downloads`, `~/Pictures`,
`~/Documents`, or a `:`-separated directory listed in `QWEN_ALLOWED_IMAGE_DIRS`. This
stops a prompt-injected model from pointing the tool at an arbitrary local file and
having it uploaded to ComfyUI.

```bash
export QWEN_ALLOWED_IMAGE_DIRS="$HOME/renders:$HOME/work/assets"
```

In LM Studio, enable whichever of the three tools you want
(`qwen_generate_image`, `qwen_edit_image`, `qwen_reference_image`) for your
chat/model. Once you've confirmed each works, switch its tool-call
permission to **Auto** so it doesn't ask for confirmation on every image.

Optionally, copy the matching preset(s) from `presets/` into LM Studio's
preset folder so the recommended system prompt (below) is one click away
instead of pasted in by hand:

```bash
cp presets/*.preset.json ~/.lmstudio/config-presets/
```

Then pick e.g. "Image Director (Qwen-Image ComfyUI)" from LM Studio's preset
selector for a chat with `qwen_generate_image` enabled.

## Recommended system prompts

Pair each tool with its own system prompt (an LM Studio preset) that teaches
the model how to use it well — otherwise it tends to pass your raw wording
straight through (flat, generic results) or narrate the tool's output in
prose instead of actually showing the image. Something like:

**For `qwen_generate_image`:**

> Before calling `qwen_generate_image`, expand the user's request into a
> single richly detailed, natural-language English prompt covering: subject,
> setting/environment, mood/lighting, and style/execution. Use
> `negative_prompt` only when something specific should be excluded. Pick
> `aspect_ratio` (`square`/`landscape`/`portrait`) to match the subject. The
> tool's result is a single markdown image line — reproduce it exactly as
> the start of your reply, then optionally one short sentence. Never
> describe the image in prose instead of showing it.

**For `qwen_edit_image`:**

> Get an exact file path to an existing image before calling
> `qwen_edit_image` — reuse one from earlier in the chat if there is one,
> otherwise ask. Describe the change itself (e.g. "add a hat", "turn it into
> a watercolour painting") and what to preserve (people, poses, framing)
> rather than re-describing the whole image. As with generation, reproduce
> the tool's returned markdown image line exactly.

**For `qwen_reference_image`:**

> Get at least one exact file path to a reference image before calling
> `qwen_reference_image`. Describe the new scene/composition to generate,
> and be explicit about what should carry over from each reference (subject,
> style, palette) versus what should change. As with generation, reproduce
> the tool's returned markdown image line exactly.

This repo's `Image Director`/`Image Restyle`/`Image Reference` presets (one
per tool) implement these in full, plus a lower temperature than LM Studio's
default — literal reproduction of the markdown line is more reliable at
lower temperature, since it leaves less room for the model to paraphrase the
tool's result instead of copying it.

## Using a different model

`workflow-qwen-t2i.json` (and `workflow-qwen-edit.json` /
`workflow-qwen-reference.json`) are normal ComfyUI **API-format** exports
(Settings → enable Dev Mode → canvas menu → *Export (API)*, not the regular
*Save*). To target a different checkpoint:

1. Build and test the workflow manually in ComfyUI's own UI first, including
   the image-conditioning path if your model supports edit/reference in a
   similar way (or wire up classic img2img via `VAEEncode` + a `denoise` <
   1.0 on `KSampler` if it doesn't).
2. Export it in API format, once per tool you want to support.
3. Replace `workflow-qwen-t2i.json` / `workflow-qwen-edit.json` /
   `workflow-qwen-reference.json` with your exports.
4. Update the node ID constants at the top of `src/toolsProvider.ts`
   (`POSITIVE_PROMPT_NODE_ID`, `NEGATIVE_PROMPT_NODE_ID`,
   `LATENT_SIZE_NODE_ID`, `SEED_NODE_ID`, and for edit/reference
   `EDIT_LOAD_IMAGE_NODE_ID` / `REFERENCE_LOAD_IMAGE_NODE_IDS`) to match your
   graph — these are just the numeric keys ComfyUI assigned your nodes on
   export.
5. Adjust `ASPECT_RATIOS` in the same file to sane sizes for your model's
   native resolution — keep them multiples of 16, not just 8.

The removed Z-Image Turbo workflows are still in `z-image-archive/` as a
reference for the shape of a distilled-turbo, `TextEncodeZImageOmni`-based
pipeline.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ComfyUI /prompt failed: ... node_errors` | A workflow file doesn't match the models actually installed in ComfyUI (missing GGUF/LoRA/VAE), the **ComfyUI-GGUF** node isn't installed, or the node IDs in `toolsProvider.ts` don't match the workflow. |
| Tool call hangs, then times out (~15 min) | ComfyUI isn't reachable at `COMFYUI_URL`, or the model is still loading on first run. Cold Qwen-Image loads (GGUF dequant + Qwen2.5-VL encode) are slow; the tools already pass a 900s timeout. On slower hardware, raise `QWEN_TIMEOUT_MS` in `src/toolsProvider.ts`. ComfyUI itself keeps rendering even after the plugin's wait times out — it isn't wasted work, just a result the tool call didn't wait around for. |
| Render aborts with an MPS out-of-memory error | Set the three `PYTORCH_MPS_*` / `PYTORCH_ENABLE_MPS_FALLBACK` env vars above before launching ComfyUI, use a smaller Qwen-Image quant, and/or unload the LM Studio model while rendering. |
| Image never appears in chat | Check LM Studio's working directory is writable; the returned markdown path must point somewhere LM Studio can read. |
| Reply shows a bare `(path/to/image.png)`, or a parenthetical summary like `(Done — a robot on a windowsill. The image is at ` /path` .)`, instead of the image | The model reworded the tool's markdown result instead of copying it verbatim — a model-following issue, not a plugin bug (the tool's return value is nothing but the markdown line already). This repo's presets already carry an explicit "do not wrap it in parentheses/backticks" rule with a real worked wrong-vs-right example and a fairly low temperature (0.4); if it still happens, lower the preset's temperature further, confirm the right preset is actually loaded for that chat, and note this is more likely on smaller/quantized local models than on larger ones. |

## License

MIT
