# Fast developer feedback evidence

## Source and environment

- Baseline source: `306c80192daedc5a678ee190cb46c4fb0adeff3a`, the integrated proposal target with both prerequisites.
- Candidate logs ran at `f57bd94d4ddf31967f118337b9d5b64e3554652e`. Later commits add only this evidence and failure-case wording; they change no source, test or script.
- Darwin arm64, 12 CPUs, 36 GB, Node 24.21.0, Docker 29.8.2 linux/arm64 with a local `node:24-alpine`. No live services.
- Method: `/usr/bin/time -p` wall time, runs in sequence with no other test workload. Baseline run 1 ran in the slice worktree with source reading alongside it; runs 2 and 3 ran from a clean extract of the baseline source. Single-machine observations, not a benchmark distribution.

## Before and after

| Selection | Source | Command | Cases | Wall seconds |
|---|---|---|---:|---:|
| Former default | baseline | serial `npm test` | 217 | 226.6, 231.5, 229.9 |
| Fast default | candidate | `npm test`, four file workers | 121 | 14.71, 14.66, 14.23, 14.18, 14.28 |
| Integration | candidate | `npm run test:integration` | 95 | 165.4, 174.8 |
| Performance | candidate | `npm run test:performance` | 2 | 19.2, 19.6 |
| Cumulative | candidate | `npm run test:full` | 218 | 216.4, 214.8 |
| Extended host | candidate | `npm run test:extended:host` | see log | 689 (one run) |
| Extended containers | candidate | `npm run test:extended:containers` | 8 tests, 100 repetitions per cut | 1,827 (one run) |
| Unsafe controls | candidate | `npm run verify:unsafe-controls` | 55 of 55 detected | 138 (one run) |
| Disk-full file | baseline → candidate | `node --test <file>` | 3 | 13.09, 13.08, 13.10 → 3.78, 3.73, 3.72 |

The default run met the 15-second objective on this machine, by under a second. These selections overlap the cumulative run and are not additive slice costs. Cumulative time fell only about 6%: most of the former default was real work, which moved rather than disappeared.

Latency in the performance runs: V9 acknowledgement p95 132.9 and 129.4 ms, snapshot p95 3.3 and 3.4 ms; stalled-observer acknowledgement p95 11.1 and 11.4 ms.

## Residual cost

- More workers stop helping: earlier selections took 17.5 s at four workers, 17.0 at six and 16.9 at eight. On a RAM volume `TMPDIR`, the final selection took 4.44, 4.39 and 4.39 s with the same 121 passes. About 10 of the 14 seconds is therefore `F_FULLFSYNC` waiting on the device, which real commits require. No command uses a RAM volume; it was a measurement only.
- Largest fast files, serial: `web-evidence-retention` 4.1 s, `child-replacement` 2.8, `scoped-web-research` 2.6, `policy-adoption` 2.4, `sqlite-command-atomicity` 2.3, `native-compaction-history` 2.2. Total 26.4 s of case time. Further cuts would remove real journeys from the edit loop.
- Node sorts test files, so the file order is not tunable without renames.
- Retained fixed waits are observations: R10's settle and idle windows, its blocked-owner 150 ms, the web no-request 200 ms and the real 1 s working-cache expiry.

## Remediation inventory

| Finding | Disposition |
|---|---|
| Losing disk-full deadline | Confirmed and fixed. Deadline cleared after the race; `storage-failure-host-stays-up` shows a host that keeps running still fails. |
| 1,500-commit stalled socket | Moved unchanged to `test/stalled-observer.performance.ts` with its real socket, commit count and p95. |
| Fixed completion sleeps | Stalled observer now awaits the observed close, 5 s deadline; B3-06 polls the observed commit. `slow-consumer-kept` still detected. |
| Local command load | Moved unchanged to performance. |
| Role idle and 32-child load | Inspected, kept. The 500 ms settle and 500 ms observation are what establish zero idle WAL writes, so they are meaningful waiting, not waste. Moved unchanged to integration; the separate-process watchdog stays. |
| R11 eight unclean terminations | Kept. All eight kills in both modes moved unchanged to integration; no ordinary-restart substitute. |
| Off-host repeated retry and crash work | Inspected, kept. Twelve failed attempts, four bursts and repeated sender kills are the literal O8 and O10 triggers. Moved unchanged to integration. |
| Serial files and overlapping commands | Fast runs four file workers; broader selections stay serial. Guidance says to run the union of affected files once. Named rows keep their overlap as stable row definitions. |
| Recovery semantic variants | All 15 now run in-process on real SQLite in `test/recovery-package-semantics.test.ts`, each with the validator's own reason and `invalid_recovery_package` at repair. Three stay at the restore CLI and direct-copy host. Fixture no-ops were replaced by assertions that the damaged record exists. |
| Web status classification | Status matrix, indistinguishable refusals, refused fallback, page failure, deadlines and unsettled timeout moved to `research` with the real root and owned HTTP. Empty success, retained fallback, cancellation, missing credentials and required support stay as registered-tool journeys; crash cuts are in `test/web-crash.integration.ts`. |
| Docker for Git-only refusals | `gitSourceFixture` has no container dependency. `npm test` passes with no docker on `PATH` (121 of 121, 14.84 s), while container checks fail with `spawnSync docker ENOENT`. |
| Pure Kernel schedule count | Inexpensive and unchanged at 10,000 (0.66 s). |
| Same-family review | Now requires the parent to continue past a `capability_unavailable` refusal naming human direction. Control `same-family-request-admitted`. |
| Capability refusal | Literal blocker per row; zero provider calls only where a provider is installed. Control `capability-wrong-blocker`. |
| Web host configuration | Asserts tool validation names each forbidden property. Control `web-forbidden-argument-ignored`. |
| Parent-process flag | Removed. The durable pending record is the observation. |
| Unused backup copy | Removed; title and catalog no longer imply rollback. |
| Pending-policy title | Renamed to what it establishes; `completed Watchdog` retains the other claim. |
| V1 generated decisions | Each step compared with a decision derived from the literal matrix and test-owned model. Control `kernel-eligible-refused`. |
| Workflow-task-survival R02 | Rewritten: accepted scoped submission, duplicate returns the same receipt, new call refused `assignment_not_running`, another Attempt `unauthorized`, refused call retains no receipt. Control `role-new-call-not-rechecked`. |
| Historical 402 fallback failures | Already fixed by `scoped-web-research` on this source. No action. |

## Coverage accounting

Baseline and candidate case names differ only by five intended renames (one policy-adoption title, four task-version-recovery titles), the new process-witness case and one grouping suite. Fast plus integration plus performance equals the 218 cumulative cases. A full-gate run left no new `render-*` temp entries and no `render` containers.

`outside-fast-failure.log`: with the slow-consumer rule disabled in a temporary copy, `npm test` passed 121 of 121 and exited 0, while `npm run test:performance` exited 1 naming B3-05. `verify:gate` runs the same case through `test:full`.

## Not run or not established

- `verify:complete` was run as its parts, listed in `summary.txt`, not as one command.
- Named `verify:*` rows that are subsets of `test:full` were not run separately except where listed.
- No Linux host, deployed off-host, live provider or physical power-loss claim. Docker runs on this macOS host. The B2-09 disk-full case and its control need `hdiutil`.
- Concurrency at four workers was repeated on this machine only.
- Biome warnings went from 297 to 301, all `noNonNullAssertion` in moved test code; errors stayed at zero.
