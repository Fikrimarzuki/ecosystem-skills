#!/usr/bin/env bash
# export-png.sh <file.svg> <out.png> [dpi=192] [timeout_s=60]
# Exports an SVG with the Inkscape CLI under a timeout (the CLI has hung before), then prints size and alpha.
# Refuses to overwrite an existing output file unless OVERWRITE=1.
set -euo pipefail
svg=${1:?usage: export-png.sh <file.svg> <out.png> [dpi] [timeout_s]}; out=${2:?missing <out.png>}; dpi=${3:-192}; limit=${4:-60}
# Inkscape: $INKSCAPE, else `inkscape` on PATH, else the standard macOS app bundle location.
INKSCAPE=${INKSCAPE:-$(command -v inkscape || echo /Applications/Inkscape.app/Contents/MacOS/inkscape)}
[ -x "$INKSCAPE" ] || { echo "ERROR: Inkscape not found at $INKSCAPE (set INKSCAPE=...)"; exit 2; }
[ -f "$svg" ] || { echo "ERROR: no such file $svg"; exit 2; }
if [ -e "$out" ] && [ "${OVERWRITE:-0}" != 1 ]; then echo "ERROR: $out exists (set OVERWRITE=1 to replace)"; exit 2; fi

# Inkscape 1.x on this Mac often writes the PNG and then never exits, so "done" = process exited, or the output
# file exists with a stable size for 1 s; the lingering process is then killed (it ignores SIGTERM).
"$INKSCAPE" "$svg" --export-type=png --export-dpi="$dpi" --export-background-opacity=0 --export-filename="$out" >/dev/null 2>&1 &
pid=$!
last=-1 stable=0
for ((i = 0; i < limit * 4; i++)); do
  kill -0 "$pid" 2>/dev/null || break
  size=$(stat -f %z "$out" 2>/dev/null || echo 0)
  if [ "$size" -gt 0 ] && [ "$size" = "$last" ]; then stable=$((stable + 1)); else stable=0; fi
  last=$size
  [ "$stable" -ge 4 ] && break
  sleep 0.25
done
if kill -0 "$pid" 2>/dev/null; then
  { kill -9 "$pid"; wait "$pid"; } 2>/dev/null || true
  [ "$stable" -ge 4 ] || { echo "ERROR: Inkscape timed out after ${limit}s without a complete output"; exit 1; }
else
  wait "$pid" || { echo "ERROR: Inkscape exited with an error"; exit 1; }
fi
[ -s "$out" ] || { echo "ERROR: no output written"; exit 1; }
sips -g pixelWidth -g pixelHeight -g hasAlpha "$out" 2>/dev/null | awk -v f="$out" 'NR>1{v[$1]=$2} END{print f": "v["pixelWidth:"]"x"v["pixelHeight:"]" alpha "v["hasAlpha:"]}'
