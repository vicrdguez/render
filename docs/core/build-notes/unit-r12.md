# Unit R12

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

The split gate passed all nine checks, then was pushed at e9f4b45. Its log is /tmp/r12-split-gate.log. The core check runs 197 tests with no author-package source. The syntax-error proof passed core and failed extension-w1. Removing both extensions and extension-package passed core and failed both owning checks with TS5083. Logs are /tmp/r12-core-syntax.log, /tmp/r12-w1-syntax.log, /tmp/r12-core-absent.log, and /tmp/r12-owners-absent.log.

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

## Failure inventory

Moves can break module-relative prose, child process URLs, installed paths, workspace links, lock metadata, compiler references, test discovery, or the journey import boundary. Existing tests protect the move. New policy cases will pin journeys to tau/server, refuse extension imports, and hold the real policy and compiler references.

Split checks can accidentally include another side's code, skip a workspace, or run all typechecks for a selected test. Source closure probes and command selection regressions will exercise these cases.

An installer can lose the only GC root of its previous store output before reload refuses it. The installer test will observe that a temporary root exists while the replacement link is installed, and that it is removed at completion.

Journeys can mistake a first child message for readiness, wait for elapsed time rather than persisted work, or spend their entire test budget starting a loaded child. The load pass will preserve crash and persistence assertions and bound the events they need without retries.
