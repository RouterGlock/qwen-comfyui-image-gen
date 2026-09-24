# Xtudio® triptych: "Content That Inspires Action"

Three 5-second portrait clips, rendered locally with MiniMax H3 through
ComfyUI, stacked side by side ( | | | ) with the Xtudio logo on top.

| # | Clip | Discipline | What you see |
|---|---|---|---|
| 1 | **Learn** | eLearning & LXD | A learner at night in cyan screen light; the idea lands and she smiles |
| 2 | **Think** | The neuroscience lens | Macro of a human eye; reflected light connects like neurons firing, then a blink |
| 3 | **Lead** | Brand storytelling & leadership | A team leader speaks, her team leans in; slow dolly past their shoulders |

All three share one look (low-key, deep blacks, cyan brand light, warm skin)
so they read as a set. Full prompts are in `prompts.json`; edit them there.

## Licence

MiniMax H3 licence use for this project has been confirmed by the owner.

## Run it on your Mac

You need ComfyUI with the MiniMax H3 setup from the
[minimax-h3-comfyui-video](https://github.com/RouterGlock/minimax-h3-comfyui-video)
README, plus ffmpeg (`brew install ffmpeg`).

```sh
~/ComfyUI-Installs/run-comfyui-optimized.sh     # start ComfyUI, leave it running

cd murberec-site/xtudio-reel
node render.mjs          # renders all 3 clips into renders/  (expect tens of minutes total)
./compose.sh             # upscales, builds the triptych, copies web files into the site
```

Useful options:

```sh
node render.mjs --only 2          # redo just one clip
node render.mjs --only 2 --force --seed-offset 1   # a different take of clip 2
node render.mjs --hd              # render at 704x1248 instead of 480x864 (far slower, more memory)
LOGO=~/Desktop/xtudio-logo.png ./compose.sh         # use Marc's real logo
LOGO_Y=0.5 ./compose.sh           # logo in the middle instead of the lower third
TRIPTYCH_AUDIO=1 ./compose.sh     # keep sound in the triptych (off by default)
```

`render.mjs` uses your plugin's `workflow-h3-t2v.json` if it finds the
minimax-h3-comfyui-video folder next to this repo or in your home folder
(or set `H3_WORKFLOW=/path/to/workflow-h3-t2v.json`), so it matches your
model files exactly. Clips that are already rendered are skipped, so it's
safe to stop and restart.

## What you get

| File | What it is |
|---|---|
| `out/xtudio-triptych.mp4` | 3288×1920, 5 s, the three clips side by side with the logo fading in on top. For socials, decks and anywhere outside the website |
| `out/hd/clip-*.mp4` | Each clip at 1080×1920 with the sound H3 generated |
| `../public/xtudio/` | Muted 720×1280 MP4 + WebM loops, poster frames and the logo, for the website |

After `compose.sh`, rebuild the site (`npm run build`, or `npm run dev` to
look). The Xtudio page grows a **"Content that inspires action"** section with
the three clips playing side by side and the logo over them. The section
stays hidden until the files exist. The clips autoplay muted, pause when
scrolled off screen, stay still for visitors who turn motion off, and have a
Pause button.

**Resolution note:** H3 renders at 480×864 on this setup. `compose.sh`
upscales to 1080×1920 with Lanczos and light sharpening, which looks clean at
web sizes but can't add detail the model didn't render. For true HD detail,
use `--hd` (if your Mac has the memory) or run the clips through an AI
upscaler before `compose.sh`.

**Logo:** `xtudio-logo.png` is a redraw of the Xtudio™ by Murberec® logo in
the brand yellow (#EFEB02), set in Knewave and Oswald (both SIL Open Font
License). Swap in an original file any time with `LOGO=...`.
