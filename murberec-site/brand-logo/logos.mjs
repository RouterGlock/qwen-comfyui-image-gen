#!/usr/bin/env node
/**
 * Render MURBEREC logo concepts with Qwen-Image through your local ComfyUI,
 * using this repo's workflow-qwen-t2i.json, then write a contact sheet.
 *
 *   node logos.mjs              # every concept x 4 seeds (20 images)
 *   node logos.mjs --takes 8    # more variations per concept
 *   node logos.mjs --only 2     # just concept 2
 *   node logos.mjs --force      # redo images that already exist
 *
 * Env: COMFYUI_URL (default http://127.0.0.1:8188)
 *      COMFYUI_LAUNCHER (default ~/ComfyUI-Installs/run-comfyui-optimized.sh; started if ComfyUI is down)
 * Output: ./out/<concept>-<n>.png and ./out/index.html (opens when done on a Mac)
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const COMFY = (process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, '');
const LAUNCHER = process.env.COMFYUI_LAUNCHER ?? join(homedir(), 'ComfyUI-Installs/run-comfyui-optimized.sh');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const TAKES = Number(opt('--takes') ?? 4);
const only = opt('--only');
const force = args.includes('--force');
const SIZE = { width: 1024, height: 1024 };
const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function comfy(path, init) {
  const res = await fetch(`${COMFY}${path}`, init);
  if (!res.ok) throw new Error(`ComfyUI ${path} -> ${res.status}: ${(await res.text()).slice(0, 800)}`);
  return res;
}
const up = () => fetch(`${COMFY}/system_stats`).then((r) => r.ok, () => false);

async function ensureComfy() {
  if (await up()) return;
  if (!(await exists(LAUNCHER))) throw new Error(`ComfyUI isn't running at ${COMFY}. Start it, then re-run.`);
  console.log('Starting ComfyUI...');
  spawn('/bin/zsh', [LAUNCHER], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 120; i++) { if (await up()) return; await sleep(2000); }
  throw new Error('ComfyUI did not come up within 4 minutes.');
}

async function waitForImage(id) {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > 20 * 60_000) throw new Error('Timed out after 20 min');
    const entry = (await (await comfy(`/history/${encodeURIComponent(id)}`)).json())[id];
    if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status.messages ?? entry.status).slice(0, 1200));
    for (const out of Object.values(entry?.outputs ?? {})) {
      const img = (out.images ?? []).find((f) => /\.(png|jpe?g|webp)$/i.test(f.filename));
      if (img) return img;
    }
    await sleep(1500);
  }
}

async function main() {
  await ensureComfy();
  const { concepts, negative } = JSON.parse(await readFile(join(here, 'prompts.json'), 'utf8'));
  const workflow = JSON.parse(await readFile(resolve(here, '../../workflow-qwen-t2i.json'), 'utf8'));
  const outDir = join(here, 'out');
  await mkdir(outDir, { recursive: true });
  const selected = concepts.filter((_, i) => !only || String(i + 1) === only);
  console.log(`Qwen-Image: ${selected.length} concept(s) x ${TAKES} take(s) at ${SIZE.width}x${SIZE.height}\n`);

  for (const [ci, c] of selected.entries()) {
    console.log(`${c.name}`);
    for (let n = 1; n <= TAKES; n++) {
      const file = join(outDir, `${c.id}-${n}.png`);
      if (!force && (await exists(file))) { console.log(`  ${n}: exists, skipping`); continue; }
      const wf = structuredClone(workflow);
      wf['4'].inputs.text = c.prompt;
      wf['5'].inputs.text = negative;
      Object.assign(wf['6'].inputs, SIZE);
      wf['7'].inputs.seed = 1000 * (ci + 1) + n * 7919; // fixed seeds: re-runs are reproducible
      wf['14'].inputs.filename_prefix = `murberec-logo/${c.id}`;
      const t0 = Date.now();
      const { prompt_id } = await (await comfy('/prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: wf, client_id: randomUUID() }),
      })).json();
      const ref = await waitForImage(prompt_id);
      const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder ?? '', type: ref.type ?? 'output' });
      await writeFile(file, new Uint8Array(await (await comfy(`/view?${q}`)).arrayBuffer()));
      console.log(`  ${n}: saved (${Math.round((Date.now() - t0) / 1000)}s)`);
    }
  }

  // Small JPEG previews (pushed to git so the takes can be reviewed remotely;
  // the full PNGs stay local).
  const ffmpeg = [process.env.FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'].filter(Boolean);
  await mkdir(join(outDir, 'preview'), { recursive: true });
  for (const f of (await import('node:fs')).readdirSync(outDir).filter((f) => f.endsWith('.png'))) {
    const dest = join(outDir, 'preview', f.replace(/\.png$/, '.jpg'));
    if (!force && (await exists(dest))) continue;
    for (const bin of ffmpeg) {
      const ok = await new Promise((r) => spawn(bin, ['-y', '-loglevel', 'error', '-i', join(outDir, f), '-vf', 'scale=512:-1', '-q:v', '4', dest]).on('exit', (c) => r(c === 0)).on('error', () => r(false)));
      if (ok) break;
    }
  }

  // Contact sheet: every take, grouped by concept, on light and dark backgrounds.
  const all = JSON.parse(await readFile(join(here, 'prompts.json'), 'utf8')).concepts;
  const rows = [];
  for (const c of all) {
    const imgs = [];
    for (let n = 1; n <= 32; n++) if (await exists(join(outDir, `${c.id}-${n}.png`))) imgs.push(`${c.id}-${n}.png`);
    if (imgs.length) rows.push(`<section><h2>${c.name}</h2><p>${c.idea}</p><div class="g">${imgs.map((f) =>
      `<figure><img src="${f}" alt=""><figcaption>${f}</figcaption><img class="inv" src="${f}" alt=""></figure>`).join('')}</div></section>`);
  }
  await writeFile(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>MURBEREC logo concepts</title>
<style>body{margin:0;padding:32px;background:#111113;color:#faf9f5;font:15px system-ui}h1{margin:0 0 8px}h2{margin:40px 0 4px}p{color:#a1a1aa;margin:0 0 16px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}figure{margin:0;background:#1c1c20;padding:8px;border-radius:6px}
img{width:100%;display:block;border-radius:4px}.inv{margin-top:8px;filter:invert(1) hue-rotate(180deg)}figcaption{font:12px monospace;color:#a1a1aa;margin:6px 0 0}</style>
<h1>MURBEREC logo concepts</h1><p>Each take shown as rendered (top) and inverted for the dark site (bottom). Note the file name of any favourite.</p>${rows.join('')}`);
  console.log(`\nContact sheet: ${join(outDir, 'index.html')}`);
  if (process.platform === 'darwin') spawn('open', [join(outDir, 'index.html')], { stdio: 'ignore' });
}

main().catch((e) => { console.error(`\nFailed: ${e.message}`); process.exit(1); });
