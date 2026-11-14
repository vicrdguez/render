# Unit 6 integration

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Import map names | Literal names checked at startup, or names derived from modules. | Derive every key from `extension.name`, with an `ExtensionModule` record type. | The host also checks the names. There is no second list to update. |
| Journey setup | Reach into stores to make history, or send ordinary inputs. | W0 sends 56 exchanges over HTTP before restart and pages the actual gap from the phone. | This proves the gap rule without adding an extension or a storage shortcut. |
| Web search fixture endpoint | A root export or a test-only subpath. | The fix round moves `createSearchExtension` to `tau-websearch/testing`. Only Tau tests get that subpath in `boundaries.json`. | The root keeps the locked extension contract. The boundary checker already supports subpaths in `testOnly`, so it needs no change. |
| SIGKILL boundary | Inspect storage commits, race a kill after the answer, or stop at an outside dependency. | A temporary Git executable pauses at the base-ref read. SIGKILL kills the server and its paused child as one process group. | The response proves the answer landed. The absent branch proves the continuation effect did not. No store handle, package internal or production switch is used. |
| Installed prose | Copy prose a second way, or reuse the asset copier already used by typecheck. | Include and run `tools/assets.mjs` in the package build. | The installed verifier first failed on missing designer prose. The existing copier preserves the module-relative layout. |
| Missing-code fixture | Add a synthetic extension, or remove W2 from the server map. | Use W2's real due task. | One journey proves both persisted tasks and options without faking another Tau package. |
| Installed verification command | A separate manual verifier or a check that depends on the package. | `verify-build` runs the installed verifier without recursive Nix. Both `check` and the flake gate include it. | The gate now protects package assembly, real model discovery and clean CLI shutdown. macOS permits local networking for this check. |

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

No real model or live search service was called. No TLS proxy, real phone, remote machine, browser, Linux run, power loss or kill inside SQLite's write was tested. The two devices are separately paired tokens over localhost fetch. The SIGKILL test kills a paused Git read after the answer response, not the SQLite write. Search checks full fixture-key secrecy, not all possible short fragments; the websearch unit records that accepted limit. The installed verifier runs in its own flake check, outside the unit-test command, and in `check`. It needs no Nix daemon inside the check. The source-specific fresh gates run after the fix-round evidence commit.

## Fix round

The branch first merged `origin/render-core` at `5623f15`. The initial flake gate passed 254 tests. The host fixes and the pi lock tests remain in place.

### Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| B1, concurrent auth operations | Cache reads or queue operations by file. | Queue by the resolved auth path inside the process. Every operation still acquires pi's file lock and rereads the file. | Forty-five reads must not exhaust lock retries against each other. No cached credential can hide another process's login or logout. Refresh keeps the lock throughout its callback and write. |
| B2, import-map coverage | Test a replacement module or retain the real map entry. | The child search server spreads `modules.websearch` and replaces only its extension to set the local provider endpoint. The extensions test has literal expected schemas for all three entries. | Dropping options must break both discovery and use. The expected schemas do not come from the code being checked. |
| F2, repeated names | Computed object keys or a checked list. | Build the map from a list and throw on a repeated name before serving. | No module may silently overwrite another. |
| F3 and F4, child journeys | Graceful in-process reopen or real process death. | W0, W2 and search use a child server with a real faux provider. IPC supplies model responses only. Each restart kills the child with SIGKILL and asserts the exit signal. Stop waits for closed output pipes. | The tests retain real HTTP, SQLite, device tokens and extension code. Search scans captured stdout and stderr, including after both children stop. |
| F6, isolating the reviewed-candidate check | Move the Git head or prepare a mismatched candidate. | The W1 test changes the candidate SHA in a committed fixture after review. The approved SHA and branch head stay equal. | The head check cannot hide a missing candidate check. Only W1 tests change; production W1 source does not. |

### Red and green evidence

All commands below ran through `/nix/var/nix/profiles/default/bin/nix develop -c`. Mutations were applied one at a time and restored. Evidence logs live under `/tmp/u6-*.log` for this session.

| Point | Failing evidence | Passing evidence |
| --- | --- | --- |
| B1 | `env test packages/tau/test/credentials.test.ts packages/tau/test/command.test.ts` failed two tests. Forty-five reads raised `ELOCKED`. Real `models` returned HTTP 500 with `storage_failed`. | The same command passed all 14 tests in 5038.608375 ms. Forty-five reads took 16.752 ms. The command made three successful HTTP model-list calls. Existing stale-lock, compromised-lock, refresh and alias tests still passed. |
| B2 | Removing websearch options failed both the literal schema assertion and search with `bad_options`. The final child-server version also fails both, with 2 failures among 3 selected tests. | The restored map passed discovery and the child search journey. |
| B3 | `nix build --no-link -L .#checks.aarch64-darwin.verify-build` failed with `ENOENT` for installed `designer.md` when the asset-copy invocation was removed. | Restoring it passed. The installed verifier printed `models HTTP 200`, listed `phone`, found all prose and printed `SIGTERM exit 0`. |
| F1 | The websearch root contract failed because `createSearchExtension` was still exported. | The search and websearch selection passed all 23 tests after the constructor moved to the test-only subpath. No boundary checker change was needed. |
| F2 | The new map test failed before the name-checking constructor existed. | The test now accepts one W2 module and refuses two separate entries named W2. |
| F3 | Emitting the fixture key on child stdout failed search. Emitting it on child stderr failed search too. | Both mutations were restored. Search passes while scanning replies, frames, model requests and both output pipes. |
| F4 | Replacing the child's SIGKILL with SIGTERM failed W0 and W2 on the observed exit signal. | Both journeys pass with SIGKILL. W2 crosses two separate deaths, including its seven-day deferral. |
| F5 | Forcing every answer's `by` to `phone` failed the direct laptop assertion, without relying on the race. | The phone alone approves the design. The laptop alone approves final handover. Both responses and persisted decision reads identify the right device. All three W1 HTTP tests passed. |
| F6 | Deleting only `sha === candidate?.sha` failed the new W1 test because it emitted `handed_over`. Seventeen other tests in that file passed. | Restored source passed all 18 W1 failure tests in 2235.851708 ms. The W1 source diff is empty. |

### Cumulative fix-round evidence

`env test tau` passed all 24 tests in 4901.0935 ms. Search took 590.841709 ms, W0 took 1080.987041 ms, and W2 took 869.820125 ms. The other five journeys were also below 1.5 seconds each. The whole package, including command and credential tests, is below the ninety-second journey budget. These are single-run costs, not benchmark comparisons.

`/usr/bin/time -p nix develop -c check` passed all 259 tests, all six unchanged spike scripts, and the new installed-command verifier. Test duration was 11287.115167 ms. Whole-command wall time was 32.74 seconds. A first check stopped on two unsorted imports in new fixtures; those imports were sorted before this passing run. Existing lint warnings remain warnings.

The independent verifier's unchanged `/tmp/v6.QzYv/bb/drive.mjs` ran against `/nix/store/986vwsbmgy83vzzqcw6x4apbc4vxg8qx-tau-0.0.0`. It exited 0. All three `models` calls returned HTTP 200 and listed the two DeepSeek models enabled by its local model stand-in. W0 filled nine pages to the same 113 history entries and continued from the phone after SIGKILL. W2 reached the phone inbox overdue and scored 0.09000000000000002 without a model call. W1 handed over the reviewed commit with main unchanged. The key appeared in zero of 216 replies, zero of 39 stream frames and zero of two server output chunks. The model key was absent from server output. Its `nix run .#tau -- device list` also listed both devices.

Fresh pushed-head gates and forced rebuilds from two simultaneous fresh checkouts are reported on PR 99 after this commit. No merge or force-push is performed.
