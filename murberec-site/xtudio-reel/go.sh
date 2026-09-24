#!/usr/bin/env bash
# One-shot: find your H3 workflow, make sure ComfyUI is up, render the three
# clips, compose the triptych, open it. Safe to re-run: finished clips are
# skipped. Extra arguments go to render.mjs (e.g. --only 2 --force).
set -euo pipefail
cd "$(dirname "$0")"

COMFYUI_URL="${COMFYUI_URL:-http://127.0.0.1:8188}"
LAUNCHER="${COMFYUI_LAUNCHER:-$HOME/ComfyUI-Installs/run-comfyui-optimized.sh}"
say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

# 1. Your MiniMax H3 text-to-video workflow (so model file names match your install).
if [[ -z "${H3_WORKFLOW:-}" ]]; then
  say "Looking for your workflow-h3-t2v.json..."
  H3_WORKFLOW="$(find "$HOME" -maxdepth 6 -name workflow-h3-t2v.json \
    -not -path '*/node_modules/*' -not -path '*/Library/*' -not -path '*/.Trash/*' \
    -not -path '*/murberec-build/*' 2>/dev/null | head -1 || true)"
fi
if [[ -n "${H3_WORKFLOW:-}" ]]; then
  echo "Using $H3_WORKFLOW"; export H3_WORKFLOW
else
  echo "Not found; using the built-in copy of the plugin's workflow."
fi

# 2. ffmpeg (Homebrew puts it outside PATH for some shells).
for p in "${FFMPEG:-}" /opt/homebrew/bin/ffmpeg /usr/local/bin/ffmpeg "$(command -v ffmpeg || true)"; do
  [[ -n "$p" && -x "$p" ]] && { export FFMPEG="$p"; break; }
done
[[ -n "${FFMPEG:-}" ]] || { echo "ffmpeg is missing. Install it with: brew install ffmpeg"; exit 1; }

# 3. ComfyUI: start it in the background if it isn't answering.
if ! curl -fsS -m 3 "$COMFYUI_URL/system_stats" >/dev/null 2>&1; then
  [[ -x "$LAUNCHER" || -f "$LAUNCHER" ]] || { echo "ComfyUI isn't running at $COMFYUI_URL and $LAUNCHER wasn't found. Start ComfyUI, then re-run."; exit 1; }
  LOG="${TMPDIR:-/tmp}/comfyui-xtudio.log"
  say "Starting ComfyUI (log: $LOG)..."
  nohup /bin/zsh "$LAUNCHER" >"$LOG" 2>&1 &
  for i in $(seq 1 120); do
    curl -fsS -m 2 "$COMFYUI_URL/system_stats" >/dev/null 2>&1 && break
    [[ $i == 120 ]] && { echo "ComfyUI didn't come up after 4 minutes. See $LOG"; exit 1; }
    sleep 2
  done
fi
echo "ComfyUI is up at $COMFYUI_URL"

# 4. Render (keeping the Mac awake), then compose.
say "Rendering 3 clips with MiniMax H3. This takes a while; leave the lid open."
if command -v caffeinate >/dev/null; then caffeinate -dims node render.mjs "$@"; else node render.mjs "$@"; fi

say "Stacking the clips and adding the Xtudio logo..."
./compose.sh

say "Done. Triptych: $(pwd)/out/xtudio-triptych.mp4"
command -v open >/dev/null && open out/xtudio-triptych.mp4 || true
