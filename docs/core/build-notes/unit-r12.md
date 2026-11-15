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

## Failure inventory

Moves can break module-relative prose, child process URLs, installed paths, workspace links, lock metadata, compiler references, test discovery, or the journey import boundary. Existing tests protect the move. New policy cases will pin journeys to tau/server, refuse extension imports, and hold the real policy and compiler references.

Split checks can accidentally include another side's code, skip a workspace, or run all typechecks for a selected test. Source closure probes and command selection regressions will exercise these cases.

An installer can lose the only GC root of its previous store output before reload refuses it. The installer test will observe that a temporary root exists while the replacement link is installed, and that it is removed at completion.

Journeys can mistake a first child message for readiness, wait for elapsed time rather than persisted work, or spend their entire test budget starting a loaded child. The load pass will preserve crash and persistence assertions and bound the events they need without retries.
