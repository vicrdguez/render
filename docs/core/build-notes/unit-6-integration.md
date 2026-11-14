# Unit 6 integration

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Import map names | Literal names checked at startup, or names derived from modules. | Derive every key from `extension.name`, with an `ExtensionModule` record type. | The host also checks the names. There is no second list to update. |
| Journey setup | Reach into stores to make history, or send ordinary inputs. | W0 sends 56 exchanges over HTTP before restart and pages the actual gap from the phone. | This proves the gap rule without adding an extension or a storage shortcut. |
| Web search fixture endpoint | Widen the root export, expose an internal subpath and change boundaries, or intercept global fetch. | Export the existing `createSearchExtension` from the root. Keep the production import map on the normal extension. | The HTTP journey first failed because the constructor was not reachable. One export exposes the ordinary provider endpoint parameter without a transport fake, boundary exception or test flag. The existing module contract test now names that export. |
| SIGKILL boundary | Inspect storage commits, race a kill after the answer, or stop at an outside dependency. | A temporary Git executable pauses at the base-ref read. SIGKILL kills the server and its paused child as one process group. | The response proves the answer landed. The absent branch proves the continuation effect did not. No store handle, package internal or production switch is used. |
| Installed prose | Copy prose a second way, or reuse the asset copier already used by typecheck. | Include and run `tools/assets.mjs` in the package build. | The installed verifier first failed on missing designer prose. The existing copier preserves the module-relative layout. |
| Missing-code fixture | Add a synthetic extension, or remove W2 from the server map. | Use W2's real due task. | One journey proves both persisted tasks and options without faking another Tau package. |
| Installed verification command | Run Nix recursively from every default test, or run a retained verifier after `nix build`. | Compile `test/verify-build.ts` and run it explicitly against the installed executable. | The default tests run inside a Nix derivation without a daemon. The verifier also exercises `nix run` against the same server. |

## Checkpoints

W0 first failed with an empty extension list. The import map fixed that failure. The same test then passed in 253.737875 ms. It pairs two devices, reads the reply on a stream, leaves, restarts, pages the reconnect gap, compares all entry IDs, and continues with the phone. These are single test-run costs, not performance comparisons.

Search passed in 99.982875 ms after the constructor export. It uses real Webfox against local HTTP, sets options from a device, checks masked secrets, observes search in the bare agent default, reads content and redaction on the stream, and reopens options and history after restart. It checks replies, all three streams, model context and console logs for the key. No live provider runs.

W2 passed in 159.975209 ms. The missing extension journey passed in 55.619875 ms. W2 reads an overdue decision in the phone inbox after restart, scores it over HTTP, sees the timeline, defers seven days, revises the new open round and gets `not_open` for its old ID. The missing-code journey binds absent W2 without error, restores it, records a timer, restarts overdue without code, then restores code and sees the waiting timer run with its options intact.

W1 passed its three HTTP journeys in 317.407541, 177.112625 and 210.519708 ms. The SIGKILL journey passed in 1227.986541 ms. These samples share a test run and are not speed comparisons. The crash test pauses Git before the design continuation reads the base commit, after the answer's HTTP response. It kills the process group, restores the server and proves one preparation, one build and one handover. Its first assertion mistakenly counted both building events as one. W1 intentionally emits one on dispatch and one on publication. The corrected assertion counts the build entry instead.

The built verifier first failed on missing `w1/dist/src/designer.md`. After the existing asset copier was added to the Nix build, it started the installed executable on port 0, paired a phone, listed it through both the built command and `nix run .#tau -- device list`, loaded all three modules over HTTP and read all nine emitted prose files.

## Failure coverage

| Failure | Test | File |
| --- | --- | --- |
| An extension is absent from the command, or a bare conversation cannot reconnect and continue | W0 | `packages/tau/test/w0.test.ts` |
| A reconnect silently loses entries outside the stream window | W0 compares the gap-filled ID set with the complete HTTP history | `packages/tau/test/w0.test.ts` |
| Project defaults omit search, results lose content, options expose a key, or a stream or log leaks it | search | `packages/tau/test/search.test.ts` |
| An overdue timer is not resumed, the phone inbox misses it, scoring calls a model or computes the wrong score | W2 | `packages/tau/test/w2.test.ts` |
| Not yet uses the wrong deadline, revision leaves an open decision, or an old answer can score it | W2 | `packages/tau/test/w2.test.ts` |
| Missing code refuses bind, loses options, runs absent tasks or never runs them after restoration | missing extension | `packages/tau/test/w2.test.ts` |
| An approval annotation is lost, evidence names different SHAs, handover names no real reviewed commit or Tau merges | W1 annotated design to handover | `packages/tau/test/w1.test.ts` |
| A stale basis changes work | W1 annotated design to handover | `packages/tau/test/w1.test.ts` |
| Concurrent device answers overwrite each other, hide their winner, or duplicate work | W1 two devices and fault recovery | `packages/tau/test/w1.test.ts` |
| A faulted continuation is invisible or an equal resend cannot recover it | W1 two devices and fault recovery | `packages/tau/test/w1.test.ts` |
| A moved head is handed over without review | W1 row 19 | `packages/tau/test/w1.test.ts` |
| SIGKILL loses an answered decision or repeats its continuation effect | W1 SIGKILL | `packages/tau/test/crash.test.ts` |
| The installed command lacks extension code or prose, cannot pair or cannot list devices | installed verifier | `packages/tau/test/verify-build.ts` |

## Mutation evidence

Each mutation was applied alone, compiled with `nix develop -c typecheck`, tested with `nix develop -c node --test <file>`, and reverted. All three tests exited 1 on the intended assertion.

| Mutation | Emitted test file | Failure |
| --- | --- | --- |
| Remove W2 from the import map | `packages/tau/dist/test/w0.test.js` | Extensions lacked `[w2, true]`. One test failed. |
| Return a secret option value instead of `true` | `packages/tau/dist/test/search.test.js` | Actual apiKey was the fixture key. Expected `true`. One test failed. |
| Use subtraction instead of the Brier square | `packages/tau/dist/test/w2.test.js` | The score differed from 0.09. W2 failed and missing extension passed. |

`git diff` of the three mutated source files was empty after restoration. The package run after restoration passed all 14 tests. Node reported 4267.61525 ms. The whole focused command took 6.23 seconds. Each of the eight new journeys was below 1.4 seconds in that run. It includes a real child kill, SQLite restarts, local provider HTTP and Git. It makes no real model call. The machine had 12 CPUs and load averages 2.08, 2.24 and 2.52 before the run. These are single-run command costs, not speedup claims.

## Fixes outside the command package

| File | Failing check first | Change |
| --- | --- | --- |
| `packages/websearch/src/index.ts` | HTTP search asserted that the endpoint constructor was reachable. It failed before the export. | Export the existing provider constructor. No tool or production endpoint changes. |
| `packages/websearch/test/search.test.ts` | The module contract was changed before the export. | Accept the one added export while retaining the extension contract assertions. |
| `flake.nix` | The installed verifier failed with ENOENT on designer prose. | Include and run the existing asset copier during package build. |

## Cumulative check

`/usr/bin/time -p nix develop -c check` exited 0 after all mutations were restored. It passed 246 tests with no failures, cancellations, skips or TODOs. Node reported 10718.2985 ms. All six unchanged spike scripts passed. Whole-command wall time was 23.93 seconds. This is one command-cost sample, not a benchmark comparison. The fresh pushed-source gate and forced rebuild output are published with the PR after this evidence commit.

## Limits

No real model or live search service was called. No TLS proxy, real phone, remote machine, browser, Linux run, power loss or kill inside SQLite's write was tested. The two devices are separately paired tokens over localhost fetch. The SIGKILL test kills a paused Git read after the answer response, not the SQLite write. Search checks full fixture-key secrecy, not all possible short fragments; the websearch unit records that accepted limit. The installed verifier is an explicit post-build command, not part of the default unit-test command, because that command runs inside the Nix test derivation without a Nix daemon. The source-specific fresh gate runs after this evidence commit.
