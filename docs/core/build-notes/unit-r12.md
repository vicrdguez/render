# Unit R12

Tau makes delegated work trustworthy enough that you can leave, reconnect elsewhere, and continue.

## Delivery checkpoints

1. Capture the existing tests. Move the sides with git mv. Pass the five existing checks and push.
2. Add policy and command regressions before implementation. Split the checks. Prove source isolation and push.
3. Protect the previous installer output. Replace timing assumptions with bounded event waits. Run journeys three times beside a full gate and push.
4. Verify a fresh checkout and force every check. Compare all test names and open the PR.

The baseline passed 505 tests. The full output is /tmp/r12-before.log and the required name list is /tmp/r12-before.txt.

## Choices

| Where | Readings | Taken | Why |
| --- | --- | --- | --- |
| Gate lint | Keep a separate lint check or include it in workspace. | Include it in workspace. Keep lint as a command. | One check owns root policy and formatting. |
| Command selection | Invent side flags or accept the existing positional selection. | Accept side, package name, or test file as positional arguments. | Existing callers already use positional names. |

## Failure inventory

Moves can break module-relative prose, child process URLs, installed paths, workspace links, lock metadata, compiler references, test discovery, or the journey import boundary. Existing tests protect the move. New policy cases will pin journeys to tau/server, refuse extension imports, and hold the real policy and compiler references.

Split checks can accidentally include another side's code, skip a workspace, or run all typechecks for a selected test. Source closure probes and command selection regressions will exercise these cases.

An installer can lose the only GC root of its previous store output before reload refuses it. The installer test will observe that a temporary root exists while the replacement link is installed, and that it is removed at completion.

Journeys can mistake a first child message for readiness, wait for elapsed time rather than persisted work, or spend their entire test budget starting a loaded child. The load pass will preserve crash and persistence assertions and bound the events they need without retries.
