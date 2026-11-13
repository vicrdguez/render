#!/usr/bin/env bash
# How TypeScript runs in this layout. A workspace of four packages shaped like the sketch: tau-core (exports "." and
# "./host"), tau-kit, one extension (tau-demo), and the composition root (tau, a bin that is a .ts file). It uses the
# real pi-durable 1.5.2 from npm. Everything runs from source with Node's own type stripping; tsc only checks.
#   T0  tsc typechecks every package in one program, across package names, against pi-durable 1.5.2's .d.ts.
#   T1  node runs a .ts entry point, and prints nothing on stderr.
#   T2  the same tree under a node_modules path is refused by Node.
#   T3  node --test runs .ts tests in two packages; the extension's test imports tau-core by name.
#   T4  a child process runs a .ts file, and a child killed with SIGKILL reports the signal.
#   T5  pi-durable's SQLite storage opens on node:sqlite with no warning.
#   T6  the bin (node_modules/.bin/tau, a symlink to apps/tau/src/main.ts) runs.
# Run from this directory after `npm install --ignore-scripts`.
set -u
cd "$(dirname "$0")"
mkdir -p .scratch

echo "== versions: node $(node --version), $(npx tsc -v), biome $(npx biome --version | sed 's/Version: //')"

echo "== T0 tsc -p . (one program, every package)"
npx tsc -p . && echo "   pass"

echo "== T1 a .ts entry point"
node apps/tau/src/main.ts 2>.scratch/t1.err
echo "   stderr bytes: $(wc -c <.scratch/t1.err | tr -d ' ')"

echo "== T2 the same tree under a node_modules path"
NM=.scratch/t2/node_modules/tau-tree
mkdir -p "$NM"
cp -R apps packages extensions package.json "$NM/"
[ -e "$NM/node_modules" ] || ln -s "$PWD/node_modules" "$NM/node_modules"
node "$NM/apps/tau/src/main.ts" 2>&1 | grep -m1 -o "ERR_[A-Z_]*\|tau probe.*"

echo "== T3 node --test, explicit globs"
node --test 'packages/*/test/**/*.test.ts' 'extensions/*/test/**/*.test.ts' 2>&1 | grep -E "^(✔|✖|ℹ (tests|pass|fail))"

echo "== T3b node --test with no globs also runs any .ts under a test/ directory"
printf 'export const helper = 1;\n' >packages/core/test/helper.ts
node --test 2>&1 | grep -E "helper|^ℹ tests"
rm packages/core/test/helper.ts

echo "== T4 child processes"
node -e '
const { spawnSync } = require("node:child_process");
const killed = spawnSync(process.execPath, ["-e", "process.kill(process.pid, \"SIGKILL\")"]);
const ts = spawnSync(process.execPath, ["apps/tau/src/main.ts"], { encoding: "utf8" });
console.log("   killed child signal:", killed.signal, "| .ts child:", ts.stdout.trim(), "| status", ts.status);'

echo "== T5 pi-durable SQLite storage on node:sqlite"
cat >packages/core/test/sqlite-open.probe.ts <<'EOF'
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
const storage = await openNodeSqliteStorage(process.argv[2] ?? ":memory:");
console.log(`   opened: ${typeof storage}`);
EOF
node packages/core/test/sqlite-open.probe.ts .scratch/t5.sqlite 2>.scratch/t5.err
echo "   stderr bytes: $(wc -c <.scratch/t5.err | tr -d ' ')"
rm packages/core/test/sqlite-open.probe.ts

echo "== T6 the bin"
./node_modules/.bin/tau
