#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
node src/render.mjs
rsvg-convert -w 1024 -h 1024 src/entry.svg -o entry.png
node tools/quantize.mjs entry.png entry.png
