#!/usr/bin/env node
/**
 * Render the three Xtudio triptych clips on this machine through ComfyUI +
 * MiniMax H3 (text-to-video), using the same workflow as the
 * minimax-h3-comfyui-video LM Studio plugin.
 *
 *   node render.mjs                 # all three clips, native 480x864
 *   node render.mjs --only 2        # just clip 2
 *   node render.mjs --hd            # 704x1248 render (much slower, ~2.2x the pixels)
 *   node render.mjs --force         # re-render clips that already exist
 *   node render.mjs --seed-offset 1 # new takes of every clip (different seeds)
 *
 * Env: COMFYUI_URL (default http://127.0.0.1:8188)
 *      H3_WORKFLOW  path to workflow-h3-t2v.json (default: looks next to this
 *                   repo for minimax-h3-comfyui-video, then uses a built-in copy)
 *
 * Clips land in ./renders/<id>.mp4. Then run ./compose.sh.
 * No npm install needed: Node 18+ only.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const COMFY = (process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, '');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

// H3 wants each side a multiple of 32. Native is the plugin's proven 0.4 MP
// portrait size; --hd is ~0.9 MP and needs far more memory and time.
const SIZE = flag('--hd') ? { width: 704, height: 1248 } : { width: 480, height: 864 };
const SECONDS = 5;
const TIMEOUT_MIN = Number(opt('--timeout-min') ?? (flag('--hd') ? 120 : 60));
const only = opt('--only');
const seedOffset = Number(opt('--seed-offset') ?? 0);

/** Seconds -> frame count on H3's "17k + 5" grid (same formula as the plugin). */
const durationToLength = (s) => { const n = Math.max(5, Math.round(s * 24)); return n + ((((5 - (n % 17)) % 17) + 17) % 17); };

// Built-in copy of the plugin's workflow-h3-t2v.json, used if the file isn't found.
const BUILTIN_WORKFLOW = {
  1: { class_type: 'H3ModelLoaderAny', inputs: { model_name: 'MiniMax-H3-fl2va-curve-Q8_0.gguf' } },
  2: { class_type: 'H3ClipLoaderAny', inputs: { clip_name: 'MiniMax-H3-encoder-Q5_K_M.gguf', type: 'minimax', mmproj_name: '(auto)' } },
  3: { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_video_vae_fp16.safetensors' } },
  4: { class_type: 'VAELoader', inputs: { vae_name: 'minimax_h3_audio_vae_fp32.safetensors' } },
  10: { class_type: 'LoraLoaderModelOnly', inputs: { model: ['1', 0], lora_name: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', strength_model: 1.0 } },
  20: { class_type: 'MiniMaxH3ImageToVideo', inputs: { clip: ['2', 0], vae: ['3', 0], prompt: '', width: 864, height: 480, length: 124 } },
  30: { class_type: 'RandomNoise', inputs: { noise_seed: 0 } },
  31: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
  32: { class_type: 'BasicScheduler', inputs: { model: ['10', 0], scheduler: 'simple', steps: 8, denoise: 1.0 } },
  33: { class_type: 'BasicGuider', inputs: { model: ['10', 0], conditioning: ['20', 0] } },
  34: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['30', 0], guider: ['33', 0], sampler: ['31', 0], sigmas: ['32', 0], latent_image: ['20', 1] } },
  40: { class_type: 'VAEDecode', inputs: { samples: ['34', 0], vae: ['3', 0] } },
  41: { class_type: 'VAEDecodeAudio', inputs: { samples: ['34', 0], vae: ['4', 0] } },
  50: { class_type: 'CreateVideo', inputs: { images: ['40', 0], fps: 24, audio: ['41', 0], bit_depth: 8 } },
  51: { class_type: 'SaveVideo', inputs: { video: ['50', 0], filename_prefix: 'video/H3_t2v', format: 'auto', codec: 'auto' } },
};

const exists = (p) => access(p).then(() => true, () => false);

async function loadWorkflow() {
  const candidates = [
    process.env.H3_WORKFLOW,
    resolve(here, '../../../minimax-h3-comfyui-video/workflow-h3-t2v.json'),
    join(homedir(), 'minimax-h3-comfyui-video/workflow-h3-t2v.json'),
    join(homedir(), 'Documents/GitHub/minimax-h3-comfyui-video/workflow-h3-t2v.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (await exists(p)) {
      console.log(`Using workflow: ${p}`);
      return JSON.parse(await readFile(p, 'utf8'));
    }
  }
  console.log('Using built-in copy of workflow-h3-t2v.json (set H3_WORKFLOW to use yours).');
  return structuredClone(BUILTIN_WORKFLOW);
}

async function comfy(path, init) {
  const res = await fetch(`${COMFY}${path}`, init);
  if (!res.ok) throw new Error(`ComfyUI ${path} -> ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 800)}`);
  return res;
}

async function waitForVideo(promptId, label) {
  const started = Date.now();
  let lastLog = 0;
  for (;;) {
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed > TIMEOUT_MIN * 60) throw new Error(`Timed out after ${TIMEOUT_MIN} min`);
    const hist = await (await comfy(`/history/${encodeURIComponent(promptId)}`)).json();
    const entry = hist[promptId];
    if (entry?.status?.status_str === 'error') {
      throw new Error(`ComfyUI error: ${JSON.stringify(entry.status.messages ?? entry.status).slice(0, 1500)}`);
    }
    for (const out of Object.values(entry?.outputs ?? {})) {
      for (const key of ['videos', 'gifs', 'images']) {
        const hit = (out[key] ?? []).find((f) => /\.(mp4|webm|mov|mkv)$/i.test(f?.filename ?? ''));
        if (hit) return hit;
      }
    }
    if (elapsed - lastLog >= 60) {
      lastLog = elapsed;
      console.log(`  ${label}: rendering... ${Math.round(elapsed / 60)} min`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function main() {
  try {
    await comfy('/system_stats');
  } catch {
    console.error(`ComfyUI isn't reachable at ${COMFY}. Start it first (on the Mac: ~/ComfyUI-Installs/run-comfyui-optimized.sh).`);
    process.exit(1);
  }

  const { clips } = JSON.parse(await readFile(join(here, 'prompts.json'), 'utf8'));
  const base = await loadWorkflow();
  const outDir = join(here, 'renders');
  await mkdir(outDir, { recursive: true });

  const selected = clips.filter((_, i) => !only || String(i + 1) === only);
  console.log(`Rendering ${selected.length} clip(s) at ${SIZE.width}x${SIZE.height}, ${SECONDS}s, ${durationToLength(SECONDS)} frames.`);
  console.log('H3 on Apple Silicon takes several minutes to tens of minutes per clip. Leave it running.\n');

  for (const clip of selected) {
    const dest = join(outDir, `${clip.id}.mp4`);
    if (!flag('--force') && (await exists(dest))) {
      console.log(`- ${clip.id}: already rendered, skipping (use --force to redo)`);
      continue;
    }
    const wf = structuredClone(base);
    const core = Object.values(wf).find((n) => /^MiniMaxH3.*ToVideo$/.test(n.class_type));
    const noise = Object.values(wf).find((n) => n.class_type === 'RandomNoise');
    const save = Object.values(wf).find((n) => n.class_type === 'SaveVideo');
    if (!core || !noise) throw new Error('Workflow is missing the MiniMaxH3 video node or RandomNoise node.');
    Object.assign(core.inputs, { prompt: clip.prompt, width: SIZE.width, height: SIZE.height, length: durationToLength(SECONDS) });
    noise.inputs.noise_seed = clip.seed + seedOffset;
    if (save) save.inputs.filename_prefix = `video/xtudio_${clip.id}`;

    console.log(`- ${clip.id} (${clip.title}), seed ${clip.seed + seedOffset}`);
    const t0 = Date.now();
    const { prompt_id } = await (await comfy('/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: randomUUID() }),
    })).json();
    const ref = await waitForVideo(prompt_id, clip.id);
    const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder ?? '', type: ref.type ?? 'output' });
    await writeFile(dest, new Uint8Array(await (await comfy(`/view?${q}`)).arrayBuffer()));
    console.log(`  saved ${dest} (${Math.round((Date.now() - t0) / 60000)} min)\n`);
  }
  console.log('Done. Next: ./compose.sh');
}

main().catch((err) => { console.error(`\nFailed: ${err.message}`); process.exit(1); });
