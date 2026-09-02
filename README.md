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
| `generate_comfyui_image` | Image Director | Text-to-image, from scratch |
| `edit_comfyui_image` | Image Editor | Modify an existing image file in place |
| `reference_comfyui_image` | Image Reference | Generate a new image guided by 1-3 reference images |

Bundled to generate with **[Z-Image Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)**
(a fast, distilled text-to-image model) using its Qwen3-4B text encoder and
its native `TextEncodeZImageOmni` conditioning node, which is what powers the
edit and reference tools (no classic img2img/denoise pipeline needed). The
workflows are plain ComfyUI API-format JSON files — swap in your own to
target a different checkpoint (see [Using a different model](#using-a-different-model)).

![Example output: a small red robot watering a bonsai tree on a sunlit windowsill](docs/example.png)

*Generated with `generate_comfyui_image` — prompt expanded by the LLM,
rendered by Z-Image Turbo via ComfyUI, returned straight to the chat.*

![Example edit: the same robot now wearing a blue hat](docs/edit-example.png)

*The image above, edited with `edit_comfyui_image` and the instruction "add a
blue wizard hat" — same scene and pose, only the requested change applied.*

## Video demo

*Coming soon — a short screen recording of the full flow (asking for an
image in LM Studio chat through to it rendering back in) will go here.*

## How it works

- `src/toolsProvider.ts` registers three tools — `generate_comfyui_image`,
  `edit_comfyui_image`, and `reference_comfyui_image`. Each loads its own
  workflow file (`workflow.json`, `workflow-edit.json`,
  `workflow-reference.json`), patches in your prompt/negative
  prompt/resolution (and, for edit/reference, uploads your source image(s)
  to ComfyUI's `/upload/image` endpoint first), POSTs it to ComfyUI's
  `/prompt` endpoint, polls `/history/{id}` until the render finishes,
  downloads the image from ComfyUI's `/view` endpoint into LM Studio's
  working directory, and returns a markdown image reference so it renders
  inline in the chat.
- **Autostart:** before doing any of that, each tool pings ComfyUI's
  `/system_stats`. If it's unreachable *and* `COMFYUI_URL` is a local
  address, the plugin spawns the launcher script (detached, so the server
  keeps running for later images) and waits up to 240s for it to come up,
  then proceeds. So you don't have to start ComfyUI yourself — a cold
  machine just means the first image takes a couple minutes longer. See
  [Autostart](#autostart) for the knobs and [Troubleshooting](#troubleshooting)
  for what its failure modes look like.
- Edit and reference both work by feeding the source image(s) directly into
  Z-Image Turbo's `TextEncodeZImageOmni` conditioning node (alongside the
  text prompt) rather than through a classic img2img/denoise pipeline — this
  is the model's native way of doing image-guided generation. Each source
  image is pre-resized with an explicit `ImageScale` node before that (with
  the omni node's own `auto_resize_images` turned off) because letting the
  omni node do the resizing itself can land on an odd internal latent size
  and crash the sampler — see [Troubleshooting](#troubleshooting).
- The **system prompt** is what actually makes this feel good to use: an
  LM model asked for an image tends to pass your raw one-liner straight
  through, which most image models render poorly. A short system prompt per
  tool (see [Recommended system prompts](#recommended-system-prompts)) gets
  the model to expand your request into the kind of detailed, natural-language
  prompt Z-Image-style models respond to, before it calls the tool — and to
  reproduce the tool's returned markdown image line exactly, rather than
  describing the image in prose instead.

## Prerequisites

- [LM Studio](https://lmstudio.ai/) with the `lms` CLI (bundled with the app).
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally and
  reachable (default `http://127.0.0.1:8188`).
- The model files the bundled workflow expects, in your ComfyUI model
  folders:
  - `diffusion_models/z_image_turbo_bf16.safetensors`
  - `text_encoders/qwen_3_4b.safetensors`
  - `vae/ae.safetensors`

  If you're targeting a different checkpoint instead, see
  [Using a different model](#using-a-different-model) — you don't need these
  exact files.

## Tested configuration (Apple Silicon)

This was built and verified on an **Apple Silicon Mac with 64GB unified
memory** (M1 Max), running Z-Image Turbo + its Qwen3-4B text encoder in
ComfyUI, and a ~35B-parameter MoE model
(`qwen3.6-35b-a3b-fable-holo3.1-qwepus-kat-coder-c-qx86-hi-mlx`, MLX quant)
loaded in LM Studio for prompt writing. It's not tied to that exact setup,
but a few things matter if you're replicating it:

- **Unified memory budget:** LM Studio's LLM and ComfyUI's image model share
  the same pool of RAM on Apple Silicon (no discrete VRAM). 64GB comfortably
  holds a ~35B MoE model (a handful of GB active per token thanks to MoE
  sparsity) alongside Z-Image Turbo's bf16 weights. On 32GB or less, prefer a
  smaller/quantized LLM (7B–14B range) or unload one side between uses.
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
  Z-Image Turbo is a small, fast model — none of this is required to run it,
  but it removes the two failure modes above if you later swap in something
  larger (see [Using a different model](#using-a-different-model)).

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

### Autostart

If ComfyUI isn't running when a tool fires, the plugin starts it for you
instead of failing with `fetch failed`. This only happens when:

- `COMFYUI_URL` points at a local address (`127.0.0.1`, `localhost`,
  `0.0.0.0`, `[::1]`) — a remote ComfyUI is never touched; and
- the launcher script exists. It defaults to
  `~/ComfyUI-Installs/run-comfyui-optimized.sh`; override with
  `COMFYUI_LAUNCHER=/path/to/your/launch-script.sh`.

The plugin spawns the launcher detached (so the server outlives the tool
call and serves subsequent images), polls `/system_stats` for up to 240s,
then continues with the render. Startup output is appended to
`<ComfyUI-Installs>/ComfyUI/logs/plugin-autostart.log`. When neither
condition holds, the tool just proceeds and you get the original
connection error.

To turn autostart off, point `COMFYUI_LAUNCHER` at a path that doesn't
exist.

In LM Studio, enable whichever of the three tools you want
(`generate_comfyui_image`, `edit_comfyui_image`, `reference_comfyui_image`)
for your chat/model. Once you've confirmed each works, switch its tool-call
permission to **Auto** so it doesn't ask for confirmation on every image.

Optionally, copy the matching preset(s) from `presets/` into LM Studio's
preset folder so the recommended system prompt (below) is one click away
instead of pasted in by hand:

```bash
cp presets/*.preset.json ~/.lmstudio/config-presets/
```

Then pick e.g. "Image Director (Z-Image ComfyUI)" from LM Studio's preset
selector for a chat with `generate_comfyui_image` enabled.

## Recommended system prompts

Pair each tool with its own system prompt (an LM Studio preset) that teaches
the model how to use it well — otherwise it tends to pass your raw wording
straight through (flat, generic results) or narrate the tool's output in
prose instead of actually showing the image. Something like:

**For `generate_comfyui_image`:**

> Before calling `generate_comfyui_image`, expand the user's request into a
> single richly detailed, natural-language English prompt covering: subject,
> setting/environment, mood/lighting, and style/execution. Use
> `negative_prompt` only when something specific should be excluded. Pick
> `aspect_ratio` (`square`/`landscape`/`portrait`) to match the subject. The
> tool's result is a single markdown image line — reproduce it exactly as
> the start of your reply, then optionally one short sentence. Never
> describe the image in prose instead of showing it.

**For `edit_comfyui_image`:**

> Get an exact file path to an existing image before calling
> `edit_comfyui_image` — reuse one from earlier in the chat if there is one,
> otherwise ask. Describe the change itself (e.g. "add a hat", "make it
> black and white") rather than re-describing the whole image. As with
> generation, reproduce the tool's returned markdown image line exactly.

**For `reference_comfyui_image`:**

> Get at least one exact file path to a reference image before calling
> `reference_comfyui_image`. Describe the new scene/composition to
> generate, and be explicit about what should carry over from each
> reference (subject, style, palette) versus what should change. As with
> generation, reproduce the tool's returned markdown image line exactly.

This repo's `Image Director`/`Image Editor`/`Image Reference` presets
(one per tool) implement these in full, plus a lower temperature than
LM Studio's default — literal reproduction of the markdown line is more
reliable at lower temperature, since it leaves less room for the model to
paraphrase the tool's result instead of copying it.

## Using a different model

`workflow.json` (and `workflow-edit.json`/`workflow-reference.json`) are
normal ComfyUI **API-format** exports (Settings → enable Dev Mode → canvas
menu → *Export (API)*, not the regular *Save*). To target a different
checkpoint:

1. Build and test the workflow manually in ComfyUI's own UI first, including
   the image-conditioning path if your model supports edit/reference in a
   similar way (or wire up classic img2img via `VAEEncode` + a `denoise` <
   1.0 on `KSampler` if it doesn't).
2. Export it in API format, once per tool you want to support.
3. Replace `workflow.json`/`workflow-edit.json`/`workflow-reference.json`
   with your exports.
4. Update the node ID constants at the top of `src/toolsProvider.ts`
   (`POSITIVE_PROMPT_NODE_ID`, `NEGATIVE_PROMPT_NODE_ID`,
   `LATENT_SIZE_NODE_ID`, `SEED_NODE_ID`, and for edit/reference
   `EDIT_LOAD_IMAGE_NODE_ID`/`EDIT_SCALE_NODE_ID`/
   `REFERENCE_LOAD_IMAGE_NODE_IDS`/`REFERENCE_SCALE_NODE_IDS`) to match your
   graph — these are just the numeric keys ComfyUI assigned your nodes on
   export.
5. Adjust `ASPECT_RATIOS` in the same file to sane sizes/step for your
   model's native resolution — keep them multiples of 16, not just 8 (see
   Troubleshooting below for why).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ComfyUI /prompt failed: ... node_errors` | A workflow file doesn't match the models actually installed in ComfyUI, or the node IDs in `toolsProvider.ts` don't match the workflow. |
| First image after a reboot sits on `Waiting for ComfyUI to finish starting...` for a minute or two | Expected — [autostart](#autostart) is cold-starting ComfyUI for you. A fully cold start (evicted disk cache + ComfyUI-Manager's registry fetch + first model load) has been seen to take past two minutes on Apple Silicon; a warm restart is a few seconds. It proceeds to the render automatically once the server answers. |
| Tool call fails fast with `Launched ComfyUI via <path> but it was still not reachable at <url> after 240s` | The cold start ran past autostart's wait window. The server is almost certainly up by now — just call the tool again. If it recurs, check `<ComfyUI-Installs>/ComfyUI/logs/plugin-autostart.log` for a startup error (bad launcher, port already taken by a wedged process, missing custom node), and if the machine is simply slow, raise the `240_000` budget in `startComfyUIOnce` in `src/toolsProvider.ts`. |
| Still get a bare `fetch failed` with no `starting it...` status | Autostart didn't engage: either `COMFYUI_URL` isn't a recognized local address, or the launcher script doesn't exist. Point `COMFYUI_LAUNCHER` at a real script, or start ComfyUI yourself. See [Autostart](#autostart). |
| Tool call hangs, then times out (5 min for generate/edit; 5-9 min for reference, scaling with reference image count) | The render itself is taking longer than the plugin's wait. ComfyUI is reachable (autostart got that far or it was already up) but the model may still be loading on first run, or the hardware is slow. Each reference image adds real per-step compute (it's encoded into conditioning and attended to at every sampling step), which is why `reference_comfyui_image` scales its timeout up automatically as more `image_path_*` params are used. On slower hardware even that may not be enough — raise the base `300_000`/`200_000` constants in the `generateComfyUIImage`/`editComfyUIImage`/`referenceComfyUIImage` implementations in `src/toolsProvider.ts` if so. Note ComfyUI itself keeps rendering even after the plugin's own wait times out — it isn't wasted work, just a result the tool call didn't wait around for. |
| Image never appears in chat | Check LM Studio's working directory is writable; the returned markdown path must point somewhere LM Studio can read. |
| Reply shows a bare `(path/to/image.png)`, or a parenthetical summary like `(Done — a robot on a windowsill. The image is at ` /path` .)`, instead of the image | The model reworded the tool's markdown result instead of copying it verbatim — a model-following issue, not a plugin bug (the tool's return value is nothing but the markdown line already). This repo's presets already carry an explicit "do not wrap it in parentheses/backticks" rule with a real worked wrong-vs-right example and a fairly low temperature (0.4); if it still happens, lower the preset's temperature further, confirm the right preset is actually loaded for that chat, and note this is more likely on smaller/quantized local models than on larger ones. |
| `edit_comfyui_image`/`reference_comfyui_image` crash with a `RuntimeError: shape '[...]' is invalid for input of size ...` | Z-Image Turbo's own image-resizing (`auto_resize_images` on `TextEncodeZImageOmni`) can round a source image to a latent size that isn't evenly divisible into its 2×2 patches. Both bundled workflows work around this by resizing with an explicit `ImageScale` node to dimensions that are multiples of 16 first, with `auto_resize_images` turned off — if you build your own edit/reference workflow, keep that pattern. |

## License

MIT
