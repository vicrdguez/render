#!/usr/bin/env bash
# The boundary rules of the sketch, on the sketch's own layout. Each case writes one file (or one line) that breaks a
# boundary in the copy that run.sh made, runs the gate's tools, prints which refused it and how, and undoes the change.
# Run run.sh first.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here/.scratch/tree"
mkdir -p ../out

first() { grep -m1 -E "$2" "$1" | sed -e 's/^[[:space:]]*//' | cut -c1-150; }

gate() {
	npx tsc -p . >../out/tsc.txt 2>&1 && t=pass || t=FAIL
	npx biome check . >../out/biome.txt 2>&1 && b=pass || b=FAIL
	echo "   tsc=$t biome=$b"
	[ "$t" = FAIL ] && echo "   tsc:   $(first ../out/tsc.txt 'error TS')"
	[ "$b" = FAIL ] && echo "   biome: $(first ../out/biome.txt 'lint/|×')"
	return 0
}

case_() {
	echo "== $1"
	echo "   $2: $3"
	printf '%s\n' "$3" >"$2"
	gate
	rm "$2"
}

echo "== the sketch as it is"
gate

case_ "S1 an extension imports a core internal by package name" extensions/w2/src/bad.ts \
	'export { answer } from "tau-core/src/store/decision.ts";'
case_ "S2 an extension reaches a core internal by a relative path" extensions/w2/src/bad.ts \
	'export { answer } from "../../../packages/core/src/store/decision.ts";'
case_ "S3 an extension imports the host entry" extensions/w2/src/bad.ts \
	'export { openHost } from "tau-core/host";'
case_ "S4 the kit imports the host entry" packages/kit/src/bad.ts \
	'export { openHost } from "tau-core/host";'
case_ "S5 the core imports the kit" packages/core/src/bad.ts \
	'export { options } from "tau-kit";'
case_ "S6 the core imports an extension" packages/core/src/host/bad.ts \
	'export { extension } from "tau-w2";'
case_ "S7 the store layer imports the host layer" packages/core/src/store/bad.ts \
	'export { openHost } from "../host/host.ts";'
case_ "S8b an extension's code imports one of its devDependencies (test-only)" extensions/w2/src/bad.ts \
	'export { fauxProvider } from "@earendil-works/pi-ai/providers/faux";'
case_ "S8 an extension's test drives a real host (allowed)" extensions/w2/test/host.test.ts \
	'export { openHost } from "tau-core/host";'

echo "== S9 src/index.ts gives extensions answer"
cp packages/core/src/index.ts ../out/index.ts.bak
printf 'export { answer } from "./store/decision.ts";\n' >>packages/core/src/index.ts
gate
node --test packages/core/test/exports.test.ts 2>&1 | grep -E "^(✔|✖)" | head -3
cp ../out/index.ts.bak packages/core/src/index.ts

echo "== S10 a module in the import map without an extension member"
cp apps/tau/src/extensions.ts ../out/extensions.ts.bak
sed -i '' 's/\[websearch, w2, w1\]/[websearch, w2, w1, { options: undefined }]/' apps/tau/src/extensions.ts
gate
cp ../out/extensions.ts.bak apps/tau/src/extensions.ts

echo "== the sketch again"
gate
