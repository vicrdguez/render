# Off-host protection: source-bound evidence

This directory records the initial implementation pass. Watchdog subsequently found unbounded automatic local package
retention; its correction and fresh source-bound checks are in [rework/README.md](rework/README.md). The historical
results below are retained, not rewritten as evidence for the corrected source.

## Source and ordering

- Contract: accepted `render-v1/offhost-protection` intent/behavior/plan/tasks at workflow source `33d449908b20a1758423c0ece48f210a89fc35b1`; specification authority `768f43c13b0675fae553f4ad09ec754f799a19fb`.
- Freshly fetched integrated target/fixed point: `416ba6e737e001282df87add877d33e1f9230d1d`. Late target merge reported already up to date; no conflict or direct-ref shortcut.
- Failure cases, literal expectations, executable off-host/rehearsal rows and unsafe controls precede product code in `2bf2a93`. `preimplementation-red.txt` shows absent operational behavior, not an import error.
- Product implementation: `667d148`; final product source is unchanged by later verifier/report commits. `reader-extension-red.txt` and `config-red.txt` precede their respective reader/config repairs. `full-gate.txt` retains the initial red cumulative gate (two superseded capability-absence assertions); `135ec6d` corrected those expectations while retaining explicit unconfigured/null-cutoff checks.
- Audit candidate: `135ec6d3b123694c0fb37bdca1bf5894345438d6`. `integrated-full-gate.txt` is the green input gate at that candidate. Inspection reported this head, the fixed target above, and full review scope. Serial Standards then Contracts fallback was used because no subagent tool was available; no independent-review claim is made.
- Post-audit verifier: `b4dd1db` added malformed backup-state and exact receiver-barrier/publication evidence. `post-audit-full-gate.txt` passed. `extended-repeat-red.txt` retains the subsequent extended-check failure: repeated fixture command IDs deduplicated instead of creating fresh admissions. It was a verifier defect, not erased or reported as a product crash failure.
- Final source/verifier revision: `d74dca515902c256c17a2a90a427ffe1bc3c864a`. Fresh command IDs/document names make every repeated crash an actual new admission. `final-full-gate.txt`, `v3-offhost-extended.txt`, `manual-recovery.txt` and `final-unsafe-controls.txt` ran on this revision. Later commits in this pass contain evidence/documents only, not source/verifier changes.

Raw logs are retained exactly, including diagnostic whitespace. Source-only `git diff --check` is separate from raw console logs.

## Commands and outcomes

All commands ran from the slice worktree on darwin-arm64 / Node 24.21.0. Each process/storage fixture is owned and temporary; no live user services, real remote destination, sandbox provisioning or skl tests were used.

| Evidence | Command / executed consequence | Result |
|---|---|---|
| `final-full-gate.txt` | `npm test && npm run typecheck && npm run lint` | 89 tests passed, 0 failed/skipped; suite 90.503 s; typecheck/lint exit 0. Lint reports 55 warnings and 8 infos, not warning-free. |
| `v3-offhost-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:offhost-exposure-cutoff` | 3 tests passed, 66.690 s; 100 actual receiver SIGKILLs before and 100 after publication, barrier acknowledgements asserted. Corrupted input, copy-only receipt, ordinary outage, preserved prior cutoff and eventual recovery also pass. |
| `manual-recovery.txt` | `npm run verify:manual-recovery-rehearsal` | 1 passed; measured owned restore/repair/read rehearsal 423.7 ms, cutoff 4, originals removed. Missing post-cutoff progress stays unknown; affected writes remain fenced. Not an RTO. |
| `final-unsafe-controls.txt` | `npm run verify:unsafe-controls` | 25/25 detected, every baseline passed, zero setup/other failures. New controls detect unsupported retained backup state, copy-only receipt acceptance and local-package-as-protection. |
| `v2-extended.txt` | `npm run verify:sqlite-command-atomicity` at `135ec6d` | 256 real-SQLite schedules, 22 test bodies passed, 25.672 s. Affected source/verifier files unchanged afterward. |
| `v3-command-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:command-crash-recovery` at `135ec6d` | 100 at each before/after commit barrier; 3 tests passed including real disk-full, 146.087 s. Affected source/verifier unchanged afterward. |
| `v3-repair-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:repair-crash` at `135ec6d` | 100 at each before/after repair commit barrier, passed, 122.010 s. Later package-file edits extend separate semantic-corruption cases; repair-crash body/source unchanged. |
| `v3-role-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:durable-tool-replay` at `135ec6d` | 202 test bodies passed, 159.935 s; affected source/verifier unchanged afterward. |
| `history-load.txt` | `npm run verify:history-command-load` at `135ec6d` | Passed; 300/1200 message export 7.069/19.990 ms; concurrent-history acknowledgement p95 50.207 ms. Affected source/verifier unchanged afterward. |

The final gate executes V1's 10,000 seeded schedules, sampled V2, owner lock, recovery/history/export and role regression bodies together. Final V4 local reattach: 130 ms. Final early V9 saves-only workload: 100 workflows, 400 saves, acknowledgement p95 96.180 ms, snapshot p95 2.243 ms. The whole smoke suite is under five minutes. Healthy prompt protection measured 573.8 ms of snapshot/validation/transfer/publication plus one second controlled coalescing in that gate; the extended off-host run measured 972.1 ms plus coalescing. Neither is an arbitrary-store latency guarantee.

## Audit disposition (no second same-pass Audit)

- **F1 / Contracts / HARD / fixed:** extend the existing real-package corruption table with unsupported backup version and impossible cutoff, plus direct-copy startup refusal. The new unsafe validator-removal control fails on the intended `backup-schema semantics must be validated beyond checksums` assertion. Final gate and 25-control run pass.
- **F2 / Contracts / HARD / fixed:** assert actual before/after receiver barrier signals, the complete unclaimed cutoff-8 package after publication, absence of a cutoff-7 package before publication, and unchanged protected cutoff 4. The extended verifier asserts exactly 100 signals at each stage. Final focused/gate/extended checks pass.

Standards: 0 HARD, 0 JUDGEMENT; no issue identified. Contracts at Audit: 2 HARD, 0 JUDGEMENT; both fixed by verification improvements, no unresolved findings. Final Full Gate: PASS. Preserve the original axis reports rather than rewriting their findings.

## Obligation mapping and limits

- **B1/B3:** offhost-exposure-cutoff, malformed-package validation and controls distinguish scheduled/configured/local-copy from durable verified generations, retain the last good generation under failures and restart, and keep saves acknowledged. Local/admin/remote authority remains under existing Ledger authentication/fencing.
- **B2:** prompt saves/current delegation hooks, 60-second periodic/retry budgets, measured whole-path window/overrun, zero idle exposure; clocks represent scheduling variability, not fake transfer bytes/results. Original legacy acknowledgement times remain unknown rather than invented.
- **B4:** owned destination-only manual-recovery-rehearsal, exact bytes/cutoff and explicit missing receipt; operations guide covers prerequisites, stopping writers, validation, clean restore, credential repair, uncertain effects and safe restricted resume.
- **A1–A3:** five-module ownership and interfaces retained; no generic provider framework, synchronous remote acknowledgement, vendor selection, automatic recovery exit or deployment provisioning. Dependency pins and lockfile unchanged. Ledger reuses snapshot-rooted complete-package validation; unsupported nonempty role/source/effect state refuses rather than being omitted.
- **A4/T1:** preimplementation commit and red evidence; real source/storage seams; detected unsafe controls. Later audit assertions strengthen existing cases. Backup state is package-validated and carried in snapshots/admin/history/export/standalone reader; historical record selection is not misrepresented as a past backup attestation.
- **A5/T2/T3:** final combined-source suite/types/lint and applicable extended checks above; verification asset and operational docs extended. No future capability is reported passed.

Real SSH host independence, remote account/key provisioning, remote filesystem semantics and physical power-loss behavior were not exercised. The external SSH fixture executes the real receiving process against a separate local owned directory. The operator must provision a distinct host and compatible receiver. Transfer buffers encoded input with a 256 MiB accepted-input bound; large histories may overrun and warn. No automatic generation pruning is added.

Nonempty role/runtime work still cannot be packaged because restored execution/effect reconciliation is unavailable; local work continues with a warning. Source Git/Effects coverage remains unavailable rather than falsely covered by empty roots. Full V5 Linux containment/source transport, V6 Git/Forge integration, V8 design/delivery/quality journeys and full V9 100 active Slices plus four transcript/tool-result streams are not delivered here. Current command/history/role/backup/recovery journeys are covered, not the later full playbooks. No human/model/search trial or physical second-device observation was performed. No manual acceptance check is required by this slice; deployment and real disaster recovery remain human operations.
