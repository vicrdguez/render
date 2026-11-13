#!/usr/bin/env bash
# Each case writes one file that breaks a boundary, runs the three tools of the gate on it, records which of them
# refused it and with what, and removes the file. The good tree must pass all three before and after.
# Run from this directory after `npm install --ignore-scripts`.
set -u
cd "$(dirname "$0")"

mkdir -p .scratch
gate() {
	local tsc node biome
	npx tsc -p . >.scratch/tsc.txt 2>&1 && tsc=pass || tsc=FAIL
	npx biome check . >.scratch/biome.txt 2>&1 && biome=pass || biome=FAIL
	echo "tsc=$tsc biome=$biome"
}

first() { grep -m1 -E "$2" "$1" | sed -e 's/^[[:space:]]*//' | cut -c1-170; }

case_() {
	local name="$1" file="$2" body="$3" run="${4:-}"
	mkdir -p "$(dirname "$file")"
	printf '%s\n' "$body" >"$file"
	echo "== $name"
	echo "   file: $file"
	echo "   $(gate)"
	echo "   tsc:   $(first .scratch/tsc.txt 'error TS')"
	echo "   biome: $(first .scratch/biome.txt 'lint/|×')"
	if [ -n "$run" ]; then
		node "$run" >.scratch/node.txt 2>&1 && echo "   node:  pass" || echo "   node:  FAIL $(first .scratch/node.txt 'Error|ERR_')"
	fi
	rm -f "$file"
}

echo "== the good tree"
echo "   $(gate)"

case_ "B1 an extension deep-imports a core internal by package name" \
	extensions/demo/src/bad-deep.ts \
	'export { answer } from "tau-core/src/store/decision.ts";' \
	extensions/demo/src/bad-deep.ts

case_ "B2 an extension reaches a core internal by a relative path" \
	extensions/demo/src/bad-relative.ts \
	'export { answer } from "../../../packages/core/src/store/decision.ts";' \
	extensions/demo/src/bad-relative.ts

case_ "B3 an extension imports the host entry" \
	extensions/demo/src/bad-host.ts \
	'export { openHost } from "tau-core/host";' \
	extensions/demo/src/bad-host.ts

case_ "B4 the core imports the kit" \
	packages/core/src/bad-kit.ts \
	'export { modelRef } from "tau-kit";' \
	packages/core/src/bad-kit.ts

case_ "B5 the store layer imports the host layer" \
	packages/core/src/store/bad-up.ts \
	'export { openHost } from "../host/index.ts";'

case_ "B6 syntax that Node cannot strip" \
	packages/core/src/bad-enum.ts \
	'export enum Status { Open, Answered }' \
	packages/core/src/bad-enum.ts

case_ "B7 an extension imports a package it does not declare" \
	extensions/demo/src/bad-undeclared.ts \
	'export { openHost } from "tau";'

case_ "B8 a test of an extension imports the host entry (allowed)" \
	extensions/demo/test/host-ok.test.ts \
	'export { openHost } from "tau-core/host";'

echo "== the good tree again"
echo "   $(gate)"
