#!/bin/sh
# Native rune headless renders. These do not establish physical input timing or IME behavior.
set -eu
cd "$(dirname "$0")/.."
bin=${1:-target/debug/render-desktop}
out=${2:-.audit/native}
mkdir -p "$out"
for scene in brief review chat decision evidence slices proposals agents settings proposal operation local-prompt offline revoked unsupported readback; do
  for width in 1512 1200 1000 800; do
    name="$scene-$width"
    "$bin" --demo --scene "$scene" --size "${width}x982" --scale 1 \
      --store "$out/state/$name" --tree "$out/$name.json" --snap "$out/$name.png"
  done
done
python3 scripts/verify-layout.py "$out"/*.json --report "$out/layout-report.txt"
