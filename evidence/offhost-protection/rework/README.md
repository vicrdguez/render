# Off-host protection rework: bounded automatic local storage

## Exact source and sequence

- Accepted Contract supplied by `skl implement resume` at workflow commit `ee6f7efa8035da832c855aead5d3250689c06e98`; spec authority `768f43c13b0675fae553f4ad09ec754f799a19fb` (unchanged bytes).
- Previously reviewed source / incremental Audit fixed point: `c42ab7022a1097e372f11da15f2e343a7304aba1`.
- Pre-fix regression commit: `337f721`. `rework-red.txt` ran its new checks against the reviewed product code: failed attempt left one local package (expected none); second sender SIGKILL left two snapshots (expected one). Both failures are intended behavioral assertions, not setup failures.
- Fix and complete tested source/verifier: **`5898b99149dc8b4090be88d6074957fe8eefd7b8`**. Source tree `55cef13faef6b2779a07c3d73e2f92976ed45fc3`; test tree `1047632759f788e1e1e14801c620b1fa4d86e3d4`.
- Target freshly fetched after focused checks: `416ba6e737e001282df87add877d33e1f9230d1d`. Merge reported already up to date; no conflicts or history rewrite.
- Inspection confirmed the tested source and incremental scope. Full Gate ran at that source before Audit. Standards then Contracts ran once using the permitted serial fallback because no Agent tool was exposed. This is not fresh-context independent review. Original reports are retained here.
- After Audit, all extended/control/load/cheap/manual checks below ran on the same source/verifier. No functional edits followed Audit. The evidence commit changes neither source nor verifier.

## Findings and correction

**W1 / BLOCK / fixed in 5898b99.** Automatic backups previously reused operator-retained `recovery-packages`, accumulating a full store on every retry or success. They now own one disposable `.offhost-scratch` directory. Under the existing owner lock and serialized scheduler, an attempt removes stale scratch before taking another snapshot and removes its own scratch after transfer, including failure. A process crash may leave one snapshot until the next attempt. Cleanup failure prevents allocation of another snapshot. Explicit operator packages retain their existing lifetime.

Tests at actual host/SQLite/package/receiver seams verify twelve outage retries without intervening commands, four successful save bursts, four sender SIGKILL/restarts at snapshot/pre-publication barriers, and failed/corrupt/receiver-killed transfers. Completed attempts leave zero automatic local copies; crashed senders leave one. Explicit operator package bytes survive unchanged. The extended receiver case adds 100 actual SIGKILLs on each side of remote publication and checks local copies every time. The sender-crash addition uses two repetitions per local barrier, not 100.

**W2 / NOTE / debt acknowledged in 5898b99.** Synchronous snapshot work can delay acknowledgements at larger stores; code marker and operations guide require configured-backup measurement before the full workload or off-event-loop snapshots. No latency fix or large-store pass claimed.

**W3 / NOTE / fixed in 5898b99.** Operations guide now states approximately one full store copy per protected save burst, periodic additions, and explicit operator remote retention/space planning. Documentation inspection is the distinguishing check; no remote pruning is introduced.

**W4 / NOTE / debt acknowledged in 5898b99.** The precise role-work-unpackageable backup-status scenario remains untested. A self-contained marker beside the warning records the gap. Existing direct package refusal/restricted role recovery tests still pass; they are not substituted for that missing backup-status witness.

Prior **F1 / Contracts / HARD / fixed** (`b4dd1db`): semantic backup schema/cutoff corruption and direct-copy refusal, independently red on removed validation. Prior **F2 / Contracts / HARD / fixed** (`b4dd1db`, corrected repeated IDs `d74dca5`): exact receiver barrier signals, published cutoff 8 versus absent cutoff 7, retained cutoff 4. Both remain green in this pass. Current Standards: HARD 0/JUDGEMENT 0. Current Contracts: HARD 0/JUDGEMENT 0. No new findings.

## Commands and results

All logs below ran at 5898b99 from this worktree, Darwin arm64, Node 24.21.0. Fixtures own their directories/processes; no live services or skl tests were used. Logs preserve original console whitespace.

| Log | Command | Result |
| --- | --- | --- |
| `rework-focused.txt` | `npm run verify:offhost-exposure-cutoff` | 5 passed; 15.364 s. |
| `rework-full-gate.txt` | `npm test`; `npm run typecheck`; `npm run lint` | 91 passed, 0 failed/skipped; 101.600 s suite. Typecheck/lint exit 0; 55 warnings/8 infos, not warning-free. |
| `rework-unsafe-controls.txt` | `npm run verify:unsafe-controls` | 25/25 detected; all baselines passed; zero setup/other failures. |
| `rework-offhost-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:offhost-exposure-cutoff` | 5 passed; 83.525 s; 100 receiver kills before and 100 after remote publication. New storage assertions stay green through all attempts. |
| `rework-v1.txt` | `npm run verify:kernel-authority-schedules` | 10,000 seeded schedules; 5 test bodies passed; 0.690 s. |
| `rework-v2-extended.txt` | `npm run verify:sqlite-command-atomicity` | 256 real-SQLite schedules; 22 bodies passed; 26.010 s. |
| `rework-command-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:command-crash-recovery` | 100 per before/after command barrier; 3 tests pass including real disk-full; 150.902 s. |
| `rework-repair-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:repair-crash` | 100 per before/after repair barrier; pass; 122.050 s. |
| `rework-role-extended.txt` | `RENDER_V3_REPETITIONS=100 npm run verify:durable-tool-replay` | 202 bodies passed; 161.592 s. |
| `rework-history-load.txt` | `npm run verify:history-command-load` | Pass; 300/1200 messages export in 5.721/19.401 ms; concurrent-history acknowledgement p95 48.072 ms. |
| `rework-cheap-v1-v2.txt` | `RENDER_V1_SCHEDULES=10000 RENDER_V2_SCHEDULES=32 node --test --test-concurrency=1 test/kernel-authority-schedules.test.ts test/sqlite-command-atomicity.test.ts` | 27 bodies passed; 7.406 s (<60 s). |
| `rework-manual-recovery.txt` | `npm run verify:manual-recovery-rehearsal` | Pass; originals deleted, destination-only cutoff 4, credential repair/missing progress/restricted resume. Owned rehearsal 420.3 ms, not an RTO. |

Full Gate measured local reattach 133 ms and early saves-only V9 acknowledgement p95 92.058 ms / snapshot p95 2.543 ms (100 workflows, 400 saves). Backup is unconfigured for that early V9 check. Healthy small-fixture backup measured 969.4 ms actual snapshot/transfer/publication plus 1,000 ms controlled coalescing. Manual rehearsal within that gate measured 412.7 ms. These numbers are bounded observations, not physical durability, deployed destination, general-store latency or disaster recovery guarantees.

## Whole-contract coverage and limits

B1: verified receipts only, exact integrity/cutoff, prior generation under failure. B2: prompt/periodic whole path, retained overrun, no invented idle exposure. B3: warnings/accepted saves, last-good state/restart and now bounded automatic local storage. B4: destination-only restore and explicit prerequisites/uncertainty. A1–A3: authority, five interfaces, module ownership and exact runtime pins unchanged. A4/T1: preimplementation cases/red tests, real seams, retained state/history/export/package validation. A5/T2/T3: applicable combined-source suite and named extended checks above; catalog/operations updated. No new retained schema or recovery migration.

Old copies already accumulated under `recovery-packages` cannot be distinguished from operator-created copies and are not automatically deleted; the operations guide requires explicit inspection with writers stopped. Local provisioned space must still accommodate the live database, one snapshot and SQLite temporary working space. Cleanup errors were source-inspected, not separately permission-fault-injected.

Remote retention remains operator-owned. Actual distinct-host SSH/network/filesystem durability, physical power failure, real disaster access and credential/effect reconciliation were not exercised. Encoded transfers remain memory-buffered and bounded at 256 MiB. Nonempty role/runtime state still refuses packages pending compatible recovery reconciliation. Full source Git/Effects coverage, V5 Linux containment, V6 Git/Forge integration, V8 full playbooks/judgment trials and V9 four concurrent transcript/tool-result streams are absent, not passed. No human/model/search trial, physical second device or additional manual acceptance gate is claimed.
