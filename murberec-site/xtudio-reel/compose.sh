#!/usr/bin/env bash
# Turn the three rendered clips into:
#   out/hd/<id>.mp4            each clip, exactly 5.0 s, upscaled to 1080x1920, with its H3 audio
#   out/xtudio-triptych.mp4    the three side by side ( | | | ) with the Xtudio logo on top
#   ../public/xtudio/          web copies for the site (muted 720x1280 MP4 + WebM loops, poster frames, logo)
#
# Usage: ./compose.sh
# Env:   LOGO=/path/to/xtudio-logo.png  (default: ./xtudio-logo.png; transparent PNG works best)
#        LOGO_WIDTH=0.42                (logo width as a fraction of the triptych width)
#        LOGO_Y=0.74                    (logo centre, as a fraction of the height; 0.5 = middle)
#        GAP=24                         (px of gap between clips, in the brand's near-black)
#        TRIPTYCH_AUDIO=0               (1 = mix all three soundtracks into the triptych)
#        FFMPEG=ffmpeg
set -euo pipefail
cd "$(dirname "$0")"

FFMPEG="${FFMPEG:-ffmpeg}"
LOGO="${LOGO:-./xtudio-logo.png}"
LOGO_WIDTH="${LOGO_WIDTH:-0.42}"
LOGO_Y="${LOGO_Y:-0.74}"
GAP="${GAP:-24}"
TRIPTYCH_AUDIO="${TRIPTYCH_AUDIO:-0}"
BG="0x09090b"
IDS=(clip-1-learn clip-2-think clip-3-lead)
W=1080; H=1920; SECS=5

command -v "$FFMPEG" >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)"; exit 1; }
for id in "${IDS[@]}"; do
  [[ -f "renders/$id.mp4" ]] || { echo "Missing renders/$id.mp4. Run: node render.mjs"; exit 1; }
done
[[ -f "$LOGO" ]] || { echo "Logo not found: $LOGO"; exit 1; }

WEB=../public/xtudio
mkdir -p out/hd "$WEB"
ff() { "$FFMPEG" -hide_banner -loglevel error -y "$@"; }

# Lanczos upscale + light sharpening. This enlarges the 480x864 render to full
# HD; it can't invent detail the model didn't produce, but it looks clean at
# the sizes these play on a web page.
UPSCALE="scale=${W}:${H}:flags=lanczos,unsharp=5:5:0.6:5:5:0.0,setsar=1,fps=24,format=yuv420p"

for id in "${IDS[@]}"; do
  echo "- $id"
  has_audio=$("${FFPROBE:-${FFMPEG%ffmpeg}ffprobe}" -v error -select_streams a -show_entries stream=index -of csv=p=0 "renders/$id.mp4" 2>/dev/null | head -1 || true)
  audio_args=(-an)
  [[ -n "$has_audio" ]] && audio_args=(-c:a aac -b:a 192k -af "afade=t=out:st=$((SECS-1)).6:d=0.4")
  # 1) HD master: exact 5 s, 1080x1920, keeps H3's audio (faded out at the end).
  ff -i "renders/$id.mp4" -t $SECS -vf "$UPSCALE" \
     -c:v libx264 -preset slow -crf 16 -profile:v high -movflags +faststart "${audio_args[@]}" "out/hd/$id.mp4"
  # 2) Web loop: muted, 720x1280, small enough to autoplay on phones.
  ff -i "out/hd/$id.mp4" -an -vf "scale=720:1280:flags=lanczos" \
     -c:v libx264 -preset slow -crf 24 -maxrate 2.2M -bufsize 4.4M -profile:v high -pix_fmt yuv420p \
     -movflags +faststart "$WEB/$id.mp4"
  # 2b) Same loop as WebM/VP9: smaller, and the site offers it first.
  ff -i "out/hd/$id.mp4" -an -vf "scale=720:1280:flags=lanczos" \
     -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -deadline good -cpu-used 2 "$WEB/$id.webm"
  # 3) Poster frame (shown before the video loads and when motion is reduced).
  ff -ss 2.5 -i "out/hd/$id.mp4" -frames:v 1 -vf "scale=720:1280" -q:v 3 "$WEB/$id.jpg"
done

echo "- triptych"
TW=$((W * 3 + GAP * 2))
LW=$(awk -v tw="$TW" -v f="$LOGO_WIDTH" 'BEGIN { printf "%d", int(tw * f / 2) * 2 }')
# Pad the first two clips on the right with the gap colour, stack, then add a
# soft dark gradient behind the logo so it stays legible over any footage.
FILTER="[0:v]pad=$((W+GAP)):${H}:0:0:color=${BG}[a];\
[1:v]pad=$((W+GAP)):${H}:0:0:color=${BG}[b];\
[a][b][2:v]hstack=inputs=3,format=yuv420p[stack];\
[stack]geq=lum='lum(X,Y)*(1-0.45*exp(-pow((Y/H-${LOGO_Y})/0.12,2)))':cb='cb(X,Y)':cr='cr(X,Y)'[shade];\
[3:v]scale=${LW}:-1:flags=lanczos,format=rgba,fade=t=in:st=0.3:d=0.9:alpha=1[logo];\
[shade][logo]overlay=x=(W-w)/2:y=H*${LOGO_Y}-h/2:shortest=1[v]"

AUDIO_MAP=(-an)
if [[ "$TRIPTYCH_AUDIO" == "1" ]]; then
  FILTER="$FILTER;[0:a][1:a][2:a]amix=inputs=3:normalize=1[aout]"
  AUDIO_MAP=(-map "[aout]" -c:a aac -b:a 192k)
fi

ff -i out/hd/clip-1-learn.mp4 -i out/hd/clip-2-think.mp4 -i out/hd/clip-3-lead.mp4 -loop 1 -t $SECS -i "$LOGO" \
   -filter_complex "$FILTER" -map "[v]" "${AUDIO_MAP[@]}" -t $SECS \
   -c:v libx264 -preset slow -crf 17 -profile:v high -level 5.1 -movflags +faststart out/xtudio-triptych.mp4

# The site overlays the logo with CSS, so it needs its own copy.
cp "$LOGO" "$WEB/xtudio-logo.png"

echo
echo "Done:"
echo "  out/xtudio-triptych.mp4   (${TW}x${H}, logo on top)"
echo "  out/hd/*.mp4              (1080x1920 masters with audio)"
echo "  ../public/xtudio/         (web loops + posters; the Xtudio page shows them on the next build)"
