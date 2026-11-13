#!/usr/bin/env bash
# Checks the sketch as a real repository: copy it, install from npm (pi-durable 1.5.2 and the pinned tools), then run
# the gate's commands on it: tsc (one program), biome (format, lint, and the boundary rules), node --test (the failure
# lists as test.todo, and the type tests), and the bin. Prints what each one said.
# Run from anywhere. Writes only under this directory (.scratch/).
set -u
here="$(cd "$(dirname "$0")" && pwd)"
sketch="$here/../../sketch"
tree="$here/.scratch/tree"
mkdir -p "$tree"
# Fresh copy of the sketch's files, keeping an existing node_modules to save the install.
find "$tree" -type f ! -path '*/node_modules/*' -delete
(cd "$sketch" && find . -type f ! -path './node_modules/*' -print0 | while IFS= read -r -d '' f; do mkdir -p "$tree/$(dirname "$f")"; cp "$f" "$tree/$f"; done)
cd "$tree"
echo "== npm install"
npm install --ignore-scripts --no-audit --no-fund 2>&1 | tail -1
echo "== versions: node $(node --version), $(npx tsc -v), biome $(npx biome --version | sed 's/Version: //')"
echo "== tsc -p ."
start=$(node -e 'console.log(Date.now())')
npx tsc -p . && echo "   pass in $(( $(node -e 'console.log(Date.now())') - start )) ms, npx start included"
echo "== biome check ."
npx biome check . 2>&1 | tail -3
echo "== npm test"
npm test 2>&1 | grep -E "^ℹ (tests|suites|pass|fail|cancelled|skipped|todo)|^✖|not ok" | head -40
echo "== the bin"
./node_modules/.bin/tau --help; echo "   exit $?"
