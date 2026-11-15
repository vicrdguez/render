{
  pkgs,
  checks,
  tau,
}:
pkgs.runCommand "tau-source-inputs" { } ''
  test -f ${checks.workspace.source}/README.md
  test -f ${checks.workspace.source}/flake.nix
  test -f ${checks.workspace.source}/tools/workspace.test.mjs

  for source in ${checks.core.source} ${checks.extension-w1.source} ${checks.extension-w2.source} ${checks.extension-websearch.source} ${checks.e2e.source}; do
    test -f "$source/core/src/server.ts"
    test -f "$source/core/tsconfig.json"
    test -f "$source/tsconfig.base.json"
    test -f "$source/tools/link-node-modules.mjs"
    test -f "$source/tools/tests.mjs"
    test ! -e "$source/README.md"
    test ! -e "$source/flake.nix"
    test ! -e "$source/tools/workspace.test.mjs"
  done

  test -f ${checks.core.source}/core/README.md
  test -f ${checks.core.source}/core/test/extension/fixtures/instructions.md
  test ! -e ${checks.core.source}/extensions/w2/src
  test ! -e ${checks.core.source}/e2e/test

  test -f ${checks.extension-w2.source}/extensions/w2/src/agent.md
  test -f ${checks.extension-w2.source}/extensions/w2/test/forecast.test.ts
  test ! -e ${checks.extension-w2.source}/extensions/w1/src
  test ! -e ${checks.extension-w2.source}/e2e/test

  test -f ${checks.e2e.source}/e2e/test/extensions.ts
  test -f ${checks.e2e.source}/extensions/w1/src/index.ts
  test -f ${checks.e2e.source}/extensions/w2/src/agent.md
  test -f ${checks.e2e.source}/extensions/websearch/src/index.ts
  test ! -e ${checks.e2e.source}/extensions/w2/test

  test -f ${checks.verify-build.source}/e2e/test/verify-build.ts
  test ! -e ${checks.verify-build.source}/README.md
  test ! -e ${checks.verify-build.source}/flake.nix
  test ! -e ${checks.verify-build.source}/core
  test ! -e ${checks.verify-build.source}/tools

  test -f ${tau.src}/core/src/server.ts
  test ! -e ${tau.src}/extensions
  test ! -e ${tau.src}/README.md
  test ! -e ${tau.src}/flake.nix
  touch "$out"
''
