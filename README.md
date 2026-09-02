# qwen-comfyui-image-gen

An LM Studio plugin that lets a local model (tested with Qwen) generate images
by calling ComfyUI directly, no server or bridge process in between. Ask for
an image in an LM Studio chat; the model expands your request into a
detailed prompt and calls a tool that submits it to ComfyUI, waits for the
render, and drops the result back into the chat.

Bundled to generate with **[Z-Image Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)**
(a fast, distilled text-to-image model) using its Qwen3-4B text encoder, but
the workflow is a plain ComfyUI API-format JSON file — swap in your own to
target a different checkpoint (see [Using a different model](#using-a-different-model)).

## How it works

- `src/toolsProvider.ts` registers a `generate_comfyui_image` tool. When
  called, it loads `workflow.json`, patches in your prompt/negative
  prompt/resolution, POSTs it to ComfyUI's `/prompt` endpoint, polls
  `/history/{id}` until the render finishes, downloads the image from
  ComfyUI's `/view` endpoint into LM Studio's working directory, and returns
  a markdown image reference so it renders inline in the chat.
- The **system prompt** is what actually makes this feel good to use: an
  LM model asked for an image tends to pass your raw one-liner straight
  through, which most image models render poorly. A short system prompt (see
  [Recommended system prompt](#recommended-system-prompt)) gets the model to
  expand your request into the kind of detailed, natural-language prompt
  Z-Image-style models respond to, before it calls the tool.

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

In LM Studio, enable the `generate_comfyui_image` tool for your chat/model.
Once you've confirmed it works, switch its tool-call permission to **Auto**
so it doesn't ask for confirmation on every image.

## Recommended system prompt

Pair this plugin with a system prompt (an LM Studio preset) that teaches the
model to expand requests before calling the tool — otherwise it tends to pass
your raw wording straight through, which produces flat, generic results.
Something like:

> Before calling `generate_comfyui_image`, expand the user's request into a
> single richly detailed, natural-language English prompt covering: subject,
> setting/environment, mood/lighting, and style/execution. Use
> `negative_prompt` only when something specific should be excluded. Pick
> `aspect_ratio` (`square`/`landscape`/`portrait`) to match the subject.

## Using a different model

`workflow.json` is a normal ComfyUI **API-format** export (Settings → enable
Dev Mode → canvas menu → *Export (API)*, not the regular *Save*). To target a
different checkpoint:

1. Build and test the workflow manually in ComfyUI's own UI first.
2. Export it in API format.
3. Replace `workflow.json` with your export.
4. Update the node IDs at the top of `src/toolsProvider.ts`
   (`POSITIVE_PROMPT_NODE_ID`, `NEGATIVE_PROMPT_NODE_ID`,
   `LATENT_SIZE_NODE_ID`, `SEED_NODE_ID`) to match your graph — these are
   just the numeric keys ComfyUI assigned your nodes on export.
5. Adjust `ASPECT_RATIOS` in the same file to sane sizes/step for your
   model's native resolution.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `ComfyUI /prompt failed: ... node_errors` | `workflow.json` doesn't match the models actually installed in ComfyUI, or the node IDs in `toolsProvider.ts` don't match the workflow. |
| Tool call hangs, then times out after 3 minutes | ComfyUI isn't reachable at `COMFYUI_URL`, or the model is still loading on first run. |
| Image never appears in chat | Check LM Studio's working directory is writable; the returned markdown path must point somewhere LM Studio can read. |

## License

MIT
