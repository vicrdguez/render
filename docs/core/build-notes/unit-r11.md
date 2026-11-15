# Unit R11

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Testing entry | The base design lists watchOpen. The kickoff names fauxAnswer and openStore. | Export only fauxAnswer and openStore as values. | The kickoff fixes the three entry lists. Existing tests use watchOpen through a private relative import. |
| Module type | Put ExtensionModule on the server entry or on the root. | Export its type from the root. | The kickoff assigns module types to the root. |
| Biome configuration | Keep separate identical host and store configurations or keep one in core. | Move one to core and remove the duplicate. | Both had the same noThenProperty rule. No runtime or test rule changes. |
| Generated files | The root ignore rule covers packages, not core. | Add core/.gitignore. | Core emits to dist. Generated files must stay out of the source checkout. An initial push included them. The next commit removes them without a force push. |
| Loader lookup | Add a fixed walk for the new layout or keep the existing upward search. | Keep the existing search. | It already finds node_modules/tau-extension above the loader. The installed command verification proves the new location. |
| Manifest boundary cases | Three old package names now denote one dependency. | Keep three cases labeled core store, core host, and tau. | All three reject the tau workspace dependency. No existing test is dropped. |
| Directory journeys | Put the loader's real-extension journey with command tests or journeys. | Move it with the journey helpers. | It starts a real server and depends on the three extensions. |
| Scope of the package derivation | Split core and facade derivations now or retain the existing assembly. | Build core and packages/extension in the existing derivation. | R12 owns the split checks. Core declares no facade dependency. |

## Delivery checkpoints

The first package build and test push was 7b54d26. The generated output correction was 204d415.
The all-green flake checkpoint was 360942a. The final checkout gate and forced checks are reported in the PR and coordinator report.

## Test net

The required command wrote /tmp/r11-before.txt and /tmp/r11-after.txt.
It captures only unindented names. There are 433 before and 436 after.
The complete names are /tmp/r11-before-all.txt and /tmp/r11-after-all.txt.
They include three suite headings. There are 502 tests before and 505 after.
A multiset comparison maps every original name to its replacement and adds exactly the three new names below. It has no unmatched name.
There are 39 renamed names. All others are unchanged.
The reason for each rename is the move from the old core package capability to the new tau entry.
The three export assertions now pin the new public entries instead of privileged store entries.
CommonJS probes still exercise the same escape forms.

### Named replacements

| Before | After |
| --- | --- |
| boundaries reject CommonJS escape in src: const r = process.getBuiltinModule("module")["create" + "Require"]; r(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in src: const r = process.getBuiltinModule("module")["create" + "Require"]; r(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in src: import * as m from "module"; m.createRequire(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in src: import * as m from "module"; m.createRequire(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in src: import m from "node:module"; const { createRequire: r } = m; r(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in src: import m from "node:module"; const { createRequire: r } = m; r(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in src: import m from "node:module"; m.createRequire(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in src: import m from "node:module"; m.createRequire(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in src: import m from "node:module"; m["createRequire"](import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in src: import m from "node:module"; m["createRequire"](import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in src: import { createRequire as load } from "node:module"; load(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in src: import { createRequire as load } from "node:module"; load(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in test: const r = process.getBuiltinModule("module")["create" + "Require"]; r(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in test: const r = process.getBuiltinModule("module")["create" + "Require"]; r(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in test: import * as m from "module"; m.createRequire(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in test: import * as m from "module"; m.createRequire(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in test: import m from "node:module"; const { createRequire: r } = m; r(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in test: import m from "node:module"; const { createRequire: r } = m; r(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in test: import m from "node:module"; m.createRequire(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in test: import m from "node:module"; m.createRequire(import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in test: import m from "node:module"; m["createRequire"](import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in test: import m from "node:module"; m["createRequire"](import.meta.url)("tau/server"); |
| boundaries reject CommonJS escape in test: import { createRequire as load } from "node:module"; load(import.meta.url)("tau-store/host"); | boundaries reject CommonJS escape in test: import { createRequire as load } from "node:module"; load(import.meta.url)("tau/server"); |
| extension imports reject tau-host even when declared and permitted | extension imports reject tau/server even when declared and permitted |
| extension imports reject tau-store even when declared and permitted | extension imports reject tau/testing even when declared and permitted |
| extension imports reject tau-store/testing even when declared and permitted | extension imports reject tau/dist/src/store/decisions.js even when declared and permitted |
| extension manifests reject tau-host without an import | extension manifests reject core host without an import |
| extension manifests reject tau-store without an import | extension manifests reject core store without an import |
| linking removes the stale managed workspace link tau-store | linking removes the stale managed workspace link tau |
| tau src cannot import tau-extension | tau command src cannot import tau-extension |
| tau test cannot import tau-extension | tau command test cannot import tau-extension |
| tau-host src cannot import tau-extension | tau host src cannot import tau-extension |
| tau-host test cannot import tau-extension | tau host test cannot import tau-extension |
| tau-store src cannot import tau-extension | tau store src cannot import tau-extension |
| tau-store src relative import of test helper is forbidden | tau src relative import of test helper is forbidden |
| tau-store test cannot import tau-extension | tau store test cannot import tau-extension |
| tau-store test relative import of test helper is allowed | tau test relative import of test helper is allowed |
| tau-w1 src import of tau-store/host is forbidden | tau-w1 src import of tau/server is forbidden |
| tau-w1 src import of tau-store/testing is forbidden | tau-w1 src import of tau/testing is forbidden |
| tau-w1 test import of tau-store/host is forbidden | tau-w1 test import of tau/server is forbidden |
| tau-w2 src import of tau-store/host is forbidden | tau-w2 src import of tau/server is forbidden |
| tau-w2 src import of tau-store/testing is forbidden | tau-w2 src import of tau/testing is forbidden |
| tau-w2 test import of tau-host is forbidden | tau-w2 test import of tau is forbidden |
| tau-w2 test import of tau-store/host is forbidden | tau-w2 test import of tau/server is forbidden |
| tau-websearch src import of tau-store/host is forbidden | tau-websearch src import of tau/server is forbidden |
| tau-websearch src import of tau-store/testing is forbidden | tau-websearch src import of tau/testing is forbidden |
| tau-websearch test import of tau-store/host is forbidden | tau-websearch test import of tau/server is forbidden |
| the host entry exports openStore, answer, and watchOpen | the server entry exports only startServer, fromDirectory, and requestAdmin |
| the store exposes exactly the root, host, and testing entries | the core exposes exactly the root, server, and testing entries |
| the testing entry exports only fauxAnswer and the same openStore | the testing entry exports only fauxAnswer and openStore |

### New tests

- core host cannot import upper layers.
- core store cannot import upper layers.
- tau-extension cannot import tau/server.

The existing extension-import test of tau already rejects an extension importing the core. Its name stays unchanged.

## Evidence before the final checkout gate

Baseline command was nix develop -c env test.

```text
ℹ tests 502
ℹ suites 3
ℹ pass 502
ℹ fail 0
ℹ duration_ms 19081.055
```

The post-move full run produced the following output.

```text
ℹ tests 505
ℹ suites 3
ℹ pass 505
ℹ fail 0
ℹ duration_ms 20494.365292
```

The focused boundary run took 194.775625 ms including process startup and four tests.
The focused export run took 188.049458 ms including process startup and four tests.
These are verification runtimes, not a performance claim.

The layer tests were committed before implementation in 319b5fa.
Before the checker change both failed because check returned no forbidden-layer error.
The initial log is /tmp/r11-red.log.
The extended store case for relative server entry imports failed before that checker change.
Its log is /tmp/r11-layer-alias-red.log.
The updated tau/testing guidance assertion failed before its diagnostic change.
Its log is /tmp/r11-guidance-red.log.
All four focused boundary tests now pass in /tmp/r11-boundaries-green.log.

Three checker mutations each returned exit 1.
Restricting workspace discovery to packages omitted the core and failed both layer tests.
Disabling the store rule failed the store test.
Disabling the host rule failed the host test.
The logs are /tmp/r11-mutation-discovery.log, /tmp/r11-mutation-store.log, and /tmp/r11-mutation-host.log.

Three more mutations exported answer from the root, server, and testing entries, one at a time.
Each failed the matching emitted entry assertion.
Their logs are /tmp/r11-mutation-export-root.log, /tmp/r11-mutation-export-server.log, and /tmp/r11-mutation-export-testing.log.
All mutations were restored. The four export tests pass in /tmp/r11-exports-green.log.

The emitted package printed the following names.

```text
tau decision, emit, eventLog, request, withdraw
tau/server fromDirectory, requestAdmin, startServer
tau/testing fauxAnswer, openStore
private path ERR_PACKAGE_PATH_NOT_EXPORTED
```

grep -rn "answer" core/dist/src/index.d.ts core/dist/src/server.d.ts produced no output and exited 1.

The temporary workspace proof uses the real boundary policy.

```text
packages/extension/src/access.ts: tau/server: forbidden workspace capability
packages/w2/src/access.ts: tau: forbidden extension import; use tau-extension
```

git log --follow -- core/src/store/decisions.ts reaches the pre-move store history.

```text
7b54d26 refactor: merge store host and command into core
1dcc4dc refactor(store): use an exact then task type
cbbf6c0 fix: require a pi-durable task as then and keep wider choices
f108a96 fix(store): accept a then task that takes every offered choice
62b160e feat(store): implement Decision and Event over pi-durable documents
```

nix flake check -L at checkpoint 360942a passed lint, typecheck, test, spikes, and verify-build.
The installed command produced the following output.

```text
added w1; projects: none
added w2; projects: none
added websearch; projects: none
replaced w1; projects: none
replaced w2; projects: p
replaced websearch; projects: p
models HTTP 200; paired device listed
SIGTERM exit 0
extension source and Markdown installed
```

## Limits

Verification runs on aarch64-darwin. Linux checks and real model calls are not run.
R12 owns the final extension and journey directories and split checks.
No design spike changes.
