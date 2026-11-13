#!/usr/bin/env bash
# The `spikes` command of the sketch's package.json, run against the sketch's own node_modules (pi-durable 1.5.2 as the
# workspace installs it). The spikes are read from the repository and not changed. TMPDIR keeps their stores here.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
export TMPDIR="$here/.scratch/tmp"
export PI_MODULES="$here/.scratch/tree/node_modules/@earendil-works"
for spike in /Users/vr-osxs/dev/render-core/docs/core/spikes/*.mjs; do
	echo "== $(basename "$spike")"
	start=$(date +%s)
	node "$spike" 2>&1 | tail -1
	echo "   $(( $(date +%s) - start )) s"
done
