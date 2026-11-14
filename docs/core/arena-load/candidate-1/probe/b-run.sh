#!/usr/bin/env bash
# Probe B: the extension side's toolchain in the target shape, on the real W2.
# Run inside the temporary checkout's dev shell: nix develop -c bash b-run.sh
set -u
cd /tmp/c1-probe.kDWNfm/p/b
echo "## tsc -b extensions/w2 (noEmit leaf, allowImportingTsExtensions, erasableSyntaxOnly, references a composite surface)"
node node_modules/typescript/bin/tsc -b extensions/w2; echo "exit=$?"
echo "## files emitted under extensions/w2: $(find extensions/w2 \( -name '*.js' -o -name '*.d.ts' \) | wc -l | tr -d ' ')"
echo "## node --test from source, Node $(node --version)"
node --test extensions/w2/test/*.test.ts 2>&1 | tail -9
echo "## lines with 'warning' printed by a source run:"; node --test extensions/w2/test/forecast.test.ts 2>&1 | grep -ci "warning"
echo "## a type error in the leaf"
printf 'export const broken: number = "text";\n' > extensions/w2/src/broken.ts
node node_modules/typescript/bin/tsc -b extensions/w2; echo "exit=$?"; rm extensions/w2/src/broken.ts
echo "## an enum in the leaf"
printf 'export enum Mode { A, B }\n' > extensions/w2/src/mode.ts
node node_modules/typescript/bin/tsc -b extensions/w2; echo "exit=$?"; rm extensions/w2/src/mode.ts
echo "## a relative .js specifier left in the leaf"
cp extensions/w2/src/index.ts /tmp/c1-probe.kDWNfm/p/b/index.ts.keep
sed -i.bak 's#"./forecast.ts"#"./forecast.js"#' extensions/w2/src/index.ts
node node_modules/typescript/bin/tsc -b extensions/w2; echo "tsc exit=$?"
node --test extensions/w2/test/forecast.test.ts 2>&1 | grep -m1 -o "ERR_MODULE_NOT_FOUND"
cp /tmp/c1-probe.kDWNfm/p/b/index.ts.keep extensions/w2/src/index.ts; rm -f extensions/w2/src/index.ts.bak
