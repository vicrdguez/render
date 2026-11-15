# Unit R12

## Verifier repair

The takeover merged origin/render-core at 1a859c7 without rebasing. The owner asked for caller-relative command selection, restoration of the W1 fixture, two load-sensitive core tests, and an explicit record of the unresolved sandbox failure.

The selection data remains the existing workspace directory and manifest records. The shared shell wrapper was overwriting TAU_INVOCATION_DIR when test called typecheck and when check called test. It now preserves the original caller. File selections already consulted that variable. Existing paths are now required before a path selects a package, and directory selections run the tests below that directory.

Before the fix, from core, `nix develop -c env test test/store/decision.test.ts` exited 1 with `Error: no package selected by test/store/decision.test.ts`. The selection table's directory row failed with `no tests selected by test`; its missing-path row failed with `Missing expected exception`. Relative-file and parent-path rows passed at the JavaScript boundary, which exposed the shell wrapper as the first failing boundary.

After the fix, the four selection rows pass. All 24 real command runs below were performed with `/nix/var/nix/profiles/default/bin/nix develop -c`. Each cell gives the actual exit status and test total where applicable. Full output is in /tmp/r12-real-runs.log.

| Caller | Selection | env test | typecheck | check |
| --- | --- | --- | --- | --- |
| core | test/store/decision.test.ts | 0, 24 passed | 0 | 0, 24 passed |
| core | ../extensions/w2/test/forecast.test.ts | 0, 11 passed | 0 | 0, 11 passed |
| core | test/store | 0, 43 passed | 0 | 0, 43 passed |
| core | test/store/absent.test.ts | 1, refused | 1, refused | 1, refused |
| extensions/w2 | test/forecast.test.ts | 0, 11 passed | 0 | 0, 11 passed |
| extensions/w2 | ../../core/test/store/decision.test.ts | 0, 24 passed | 0 | 0, 24 passed |
| extensions/w2 | test | 0, 17 passed | 0 | 0, 17 passed |
| extensions/w2 | test/absent.test.ts | 1, refused | 1, refused | 1, refused |

Three restored mutations each exited 1. Overwriting the caller again broke the real core-relative CLI run. Removing the existence check broke the missing-path row. Removing descendant test selection broke the directory row. Logs are /tmp/r12-finish-mutant-1.log through /tmp/r12-finish-mutant-3.log.

The W1 test now checks the last model message, the show_file result, rather than searching the whole request where show_diff could satisfy the assertion. It also asserts that the build modifies export.js instead of adding it. This strengthened journey failed before the fixture fix, then all three W1 journeys passed. Both the starting file and show_file path are export.js again. The complete comparison of every pre-move core/test/journeys file with journeys/test found only two other non-import .js to .ts changes: the crash-server and journey-server child-process URLs. Both correctly target source files now. No other fixture filename, Git path, or assertion needed repair. The comparison is /tmp/r12-js-comparison.log. The loader and command tests moved from host and command also retain their fixture names.

The failure-list links now name core/test/store/types.test.ts and core/test/store/exports.test.ts.

Controlled scheduling delays reproduced the core test failures before the timing fix. Holding the queued reload for 5100 ms exceeded its 5000 ms bound. Delaying the sleeping-task inspection by 1100 ms let the task complete under version 1 and broke both migration cases. With a 180000 ms reload bound and an injected clock advanced only after sleeping-state inspection, all three tests passed with those same delays. The temporary delays were then removed so the normal suite pays no extra waiting cost. No assertion or retry was removed or added. Logs are /tmp/r12-timing-red.log and /tmp/r12-timing-green.log.

At a load average of 50 to 60, the independent verifier saw three W1 journeys fail with `fetch failed ... ECONNRESET` after 17 to 36 seconds, inside the sandboxed check and well within the new bounds. At a load average of 36 to 45 they passed. The cause was not found. This repair adds no retry and does not claim to fix those resets.

A new baseline from origin/render-core passed 505 tests with exit 0. The repaired tree passed 529 tests with exit 0, no failures, cancellations, or skips. The top-level inventories contain 436 names before and 456 after. The complete name diff retains the five named replacements and two duplicate removals documented below, and adds the four selection subtests relative file, parent path, directory, and missing path. No other old name is absent. There are 26 new tests in the unit apart from the five renamed tests. The full outputs and inventories are /tmp/r12-finish-before.log, /tmp/r12-finish-after.log, /tmp/r12-finish-before.txt, /tmp/r12-finish-after.txt, and /tmp/r12-finish-inventory.log. The full repaired suite took 18902.453 ms on this run; this is verification time, not a performance claim.

Fresh-checkout and sequential forced-check results for the pushed repair head are recorded in the PR 116 evidence comment. The earlier sections below describe the original implementation evidence, not a new verification of that earlier head.

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Delivery checkpoints

1. Capture the existing tests. Move the sides with git mv. Pass the five existing checks and push.
2. Add policy and command regressions before implementation. Split the checks. Prove source isolation and push.
3. Protect the previous installer output. Replace timing assumptions with bounded event waits. Run journeys three times beside a full gate and push.
4. Verify a fresh checkout and force every check. Compare all test names and open the PR.

The moved tree passed all five old checks and all 505 tests, then was pushed at cfdc702. The move gate log is /tmp/r12-moves-gate.log.

The baseline passed 505 tests. The full output is /tmp/r12-before.log and the required name list is /tmp/r12-before.txt.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Gate lint | Keep a separate lint check or include it in workspace. | Include it in workspace. Keep lint as a command. | One check owns root policy and formatting. |
| Command selection | Invent side flags or accept the existing positional selection. | Accept side, package name, or test file as positional arguments. | Existing callers already use positional names. |
| Core loader tests | Fake the author package or move the integration tests. | Move the real-loader tests and two command journeys to journeys. Keep missing-author-package and empty-server checks in core. | Core must pass without author code. No test is skipped. |
| Loader identity | Forbid every author-package import from journeys or allow identity comparisons. | Allow tau-extension's root in journey tests only. | It is the author package, not extension source. The test compares the loader's actual function objects. Core imports remain limited to tau/server. |
| Shared dependency cache | Depend on workspace source manifests or use their locked metadata. | Materialize workspace manifests from the existing lock only inside the shared npm dependency build. | Deleting extension directories must not prevent the core dependency cache from building. Workspace checks still compare every real manifest with the lock. There is no second lock. |
| Check source evidence | Infer the closure from a build log or expose the input path. | Each check has a source passthru. | A verifier can inspect exactly the files copied into that check. |
| Retired names | Keep dead package names in negative fixtures or use a current private workspace fixture. | Rename tau-kit fixtures to tau-private and test private facade subpaths in the real-policy table. | The removed package is no longer a dependency capability. |

## Split evidence

The split gate passed all nine checks, then was pushed at e9f4b45. Its log is /tmp/r12-split-gate.log. The core check runs 186 tests with no author-package source. The syntax-error proof passed core and failed extension-w1. Removing both extensions and extension-package passed core and failed both owning checks with TS5083. Logs are /tmp/r12-core-syntax.log, /tmp/r12-w1-syntax.log, /tmp/r12-core-absent.log, and /tmp/r12-owners-absent.log.

## Journey waits

| Wait | Before | Event and bound now |
| --- | --- | --- |
| W0 journey | 20 seconds for two process starts and 57 replies. | 180 second outer budget. Each reply, history page and reconnect still has its existing assertions. |
| W1 crash, W1 workflow, search and W2 journeys | 15 seconds for the whole journey. | 180 second outer budget. No assertion, crash or restart is removed. |
| until helper | Poll a named condition for 10 seconds. | Poll the same condition for 60 seconds. It covers SSE snapshots, persisted replies, inbox decisions, score and revision events, workflow stages, and the paused Git marker. It never retries an operation. |
| Child readiness | Treat the first IPC message as the address, with no local bound. | Wait for the listening address for at most 60 seconds. A resumed model request is not readiness. An early exit or process error fails the wait. Listeners are removed on every outcome. |
| Child termination | Wait for close or exit with no local bound. | Wait for close or exit with a 60 second abort signal. SIGKILL assertions remain. |
| HTTP calls | Fetch with no local deadline. | A 60 second abort signal bounds each request. |
| Command journey readiness | 500 ten millisecond polls. | Wait for its listening-address output with the 60 second until helper. |
| Installed verifier readiness and shutdown | 10 second readiness bound and unbounded exit. | 60 seconds for listening output and 60 seconds for exit. |

Three concurrent journey runs passed while a full flake gate built beside them. Each ran 74 tests with zero failures. Node reported 6300.977 ms, 6308.588 ms and 6286.204 ms. These include concurrent startup, assertions and cleanup. They are verification durations, not a performance comparison. Logs are /tmp/r12-load-1.log through /tmp/r12-load-3.log. /tmp/r12-load-gate.log shows all nine checks passing.

The readiness regression runs a real child that sends a model request before its listening address. The old first-message implementation failed that test. The other new cases cover exit before readiness and deadline cleanup. The readiness suite passed in 165 ms after the change.

The installer now roots a previous Nix store output before replacing its link and drops the temporary root on completion or handled signals. Three new tests failed before the change and pass after it. They observe the root during applied and refused reloads, cleanup after each, and refusal to replace the old link when root registration fails. The warning case now asserts the future-block wording and absence of migration_failed. Installer logs are /tmp/r12-installer-red.log and /tmp/r12-installer-green.log.

## Test inventory

The final full run passed 525 tests, with zero failures, skips or cancellations. Node reported 17336.691 ms. The baseline passed 505 tests. The required top-level inventories hold 436 names before and 456 after. The complete inventories also preserve all nested names and three suite headings.

Two duplicate tests were removed as instructed. The names extension manifests reject core store without an import and extension manifests reject core host without an import are both covered by extension manifests reject tau without an import. All three checked the same tau dependency in the same four manifest fields.

Five names have replacements. No other existing name is absent.

| Before | After | Reason |
| --- | --- | --- |
| extension imports reject tau-kit even when declared and permitted | extension imports reject tau-private even when declared and permitted | Keep a forbidden workspace fixture without naming a removed package. |
| extension manifests reject tau-kit without an import | extension manifests reject tau-private without an import | Same manifest capability, current fixture name. |
| tau-websearch test import of tau-kit is forbidden | tau-websearch test import of tau-extension/private is forbidden | Pin a private author entry instead of a removed package. |
| tau-w2 test import of tau-kit is forbidden | tau-w2 test import of tau-extension/private is forbidden | Same private-entry rule for W2. |
| tau-websearch src import of tau-kit is forbidden | tau-websearch src import of tau-extension/testing is forbidden | Pin the actual test-only capability in source. |

There are 22 new names, apart from those replacements.

- every source workspace references its emitted dependency.
- journeys reject relative JavaScript and direct extension source imports.
- side selection runs extension tests without unrelated packages.
- tau-extension src import of tau/server is forbidden.
- tau-journeys test import of tau is forbidden.
- tau-journeys test import of tau/testing is forbidden.
- tau-journeys test import of tau/server is allowed.
- tau-journeys test import of tau-w1 is forbidden.
- tau-websearch src import of tau is forbidden.
- tau-w2 src import of tau is forbidden.
- tau-w1 src import of tau is forbidden.
- tau-websearch test import of tau is forbidden.
- tau-w1 test import of tau is forbidden.
- tau-websearch test import of tau/testing is forbidden.
- tau-w2 test import of tau/testing is forbidden.
- tau-w1 test import of tau/testing is forbidden.
- install-extension roots the previous store output during applied reload and removes the temporary root.
- install-extension roots the previous store output during refused reload and removes the temporary root.
- install-extension preserves the old store link if its temporary root cannot be registered.
- journey readiness ignores a resumed model request before the listening address.
- journey readiness fails when the child exits before listening.
- journey readiness has a bound and removes its listeners on expiry.

The added readiness suite takes about 165 ms. Installer coverage adds two real child-process install simulations and one registration-failure case. All 21 installer tests take about 10.9 seconds in isolation. No new infrastructure or model call is used.

## Mutation and command evidence

Each mutation was restored before the next. All nine implementation mutations exited 1.

| Mutated line | Failure |
| --- | --- |
| Remove journeys from the source-specifier rule. | Relative JavaScript regression fails. |
| Remove side-directory selection. | extensions selects no package. |
| Remove package-name selection. | tau selects no package. |
| Do not allocate the previous store root. | No protection exists during reload. |
| Omit the previous root from cleanup. | A temporary link remains. |
| Root the new target instead of the previous target. | The previous output has no temporary root. |
| Accept a child message without a port. | A model request resolves readiness. |
| Resolve readiness on early exit. | Expected rejection is missing. |
| Leave the exit listener after readiness. | Listener count remains one. |

Widening the real tau-extension policy to tau/server fails its new table row. Removing W1's real compiler reference fails the source-workspace reference assertion. Logs are /tmp/r12-mutant-*.log.

With a syntax error in W1, typecheck core and test tau-w2 passed. check extensions failed. After restoring W1, check extensions passed. The no-argument test command passed all 525 tests.

The real installer listed w1, w2 and websearch, installed W2 twice into /tmp/r12-install.lL9nlW, and then marked w2 as installed. Nix printed the temporary previous root on the second install. Only the final w2 link remains. nix-store --gc --print-roots confirms that link roots /nix/store/50nzb443kayda9m00cinjfx8dhx8lxlp-tau-extension-w2. No garbage collection was requested.

## Limits

Only aarch64-darwin was executed. Linux, real providers, and an actual garbage collection during reload were not tested. The tests observe the root during the vulnerable interval and the real installer confirms root registration.

Sequence work into verifiable units shaped the three green pushes. Model the Domain kept side selection on directory and manifest records shared by the tools. Laziness Protocol kept lint inside workspace and reused the existing lock and test runner.

## Failure inventory

Moves can break module-relative prose, child process URLs, installed paths, workspace links, lock metadata, compiler references, test discovery, or the journey import boundary. Existing tests protect the move. New policy cases will pin journeys to tau/server, refuse extension imports, and hold the real policy and compiler references.

Split checks can accidentally include another side's code, skip a workspace, or run all typechecks for a selected test. Source closure probes and command selection regressions will exercise these cases.

An installer can lose the only GC root of its previous store output before reload refuses it. The installer test will observe that a temporary root exists while the replacement link is installed, and that it is removed at completion.

Journeys can mistake a first child message for readiness, wait for elapsed time rather than persisted work, or spend their entire test budget starting a loaded child. The load pass will preserve crash and persistence assertions and bound the events they need without retries.
