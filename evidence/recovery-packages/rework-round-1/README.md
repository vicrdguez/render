# Recovery-packages rework after completed Watchdog review 1

These are original execution outputs, not inferred passes. Prior pass evidence one directory above remains unchanged.

## Source binding and commands

- `rework-red.txt`: tests/failure cases committed as `98fafa0` against unchanged product at reviewed `31c00fb`. Invocation: `node --test --test-name-pattern='restore-newer-world|nonclean refusal' test/recovery-packages.test.ts`. Exit 1; both assertions reproduce W1 (404 vs 409) and W2 (admission-disabled vs active), not setup failures.
- `full-gate.txt`: exact audited candidate `12a7a2174ce21b83ad374ff11051b23bcfe46466`; `npm test && npm run typecheck && npm run lint` exit 0; 51 tests pass, none fail/skip/cancel, 53.997 s tests, Biome 28 files clean.
- `named-checks.txt`: same candidate; `npm run verify:package-clean-restore`, `npm run verify:package-origin-auth-fence`, `npm run verify:package-validation`, `npm run verify:restore-newer-world`, each exit 0. Repair is separately below and in Full Gate smoke.
- `v2-extended.txt`: same candidate; `npm run verify:sqlite-command-atomicity` exit 0, 256 real-SQLite schedules, 22 tests pass, 29.824 s.
- `v3-command-extended.txt`: same candidate; `RENDER_V3_REPETITIONS=100 npm run verify:command-crash-recovery` exit 0, 100 SIGKILLs at each before/after commit barrier, plus actual disk-full; 143.018 s.
- `v3-repair-extended.txt`: same candidate; `RENDER_V3_REPETITIONS=100 npm run verify:repair-crash` exit 0, 100 SIGKILLs at each repair barrier; 112.108 s. The aggregate test count is one; repetitions come from this invocation and the retained test loop.
- `unsafe-controls.txt`: same candidate; `npm run verify:unsafe-controls` exit 0, 15/15 detected, all baselines passed, zero failedOtherwise. The first runner attempt after the receipt repair stopped on its outdated source match (not a detection); `12a7a21` retargets that existing mutation without changing its intended wrong behavior/assertion, then this full run passed.
- `audit-input-inspection.txt`: inspection reports exact audited source/target. `audit-standards.md` was completed before `audit-contracts.md`, the prescribed sequential fallback because Agent/subagent tools were unavailable. This Audit is not independent Watchdog review.
- `audit-f1-red.txt`: literal CLI guidance assertion ran before its wording repair on the audited product. Exit 1 on the misleading unconditional disabled-state claim, not setup.
- `post-audit-focused.txt`: `0c016d4657dffa4327ca8499d9773a51fd890db1`, `npm run verify:package-validation` exit 0; all three tests passed after F1 repair. The final Full Gate is rerun after this evidence-only commit; final-source results are recorded in the submitted implementation report, not retroactively substituted in these original logs.

## Findings

| Finding | Resolving commit | Distinguishing evidence |
|---|---|---|
| W1 BLOCK | `4e8ee03d2b3dc11d1a14ad7deab9f828bd41d10c` | Restored scoped device's hidden workflow/admin receipts and all-workflow device's hidden admin receipt have the same status and literal body as absent IDs; absent IDs still carry uncertainty. Reported 404/409 leak is red before fix, green afterwards. |
| W2 BLOCK | `4e8ee03d2b3dc11d1a14ad7deab9f828bd41d10c` | Nonclean CLI restore refuses with unchanged DB bytes; restart is active with same authority/credentials, exact receipt/artifact reads, successful save and packaging. Clean malformed imports remain fenced. |
| W3 NOTE | `4e8ee03d2b3dc11d1a14ad7deab9f828bd41d10c` | Source diff separates literal escape sequences into intended Markdown bullets/lines in `.render/verify.md` and `docs/operations.md`. |
| F1 Contracts JUDGEMENT | `0c016d4657dffa4327ca8499d9773a51fd890db1` | Nonclean-refusal test checks accurate literal CLI guidance; `audit-f1-red.txt` vs `post-audit-focused.txt`. Fixed, no debt. |

## Limits and cleanup

Current Full Gate includes V1 10,000 schedules, sampled V2, two-process owner lock, command/repair V3 smoke, V4 and V7 plus early V9 (400 saves, two clients, 100 workflows). At audited source reattach was 153 ms; early V9 p95 acknowledgement 114.380 ms, p95 snapshot 2.865 ms. Not a four-executing-stream V9 result. V5/V6, full V8, full executing V9 and separately authorized human/model/live-service trials remain unavailable/unrun. No source/effect/task owner or historical-export owner exists in the target; explicit empty roots and blocked mutation/replay are not fabricated reconciliation.

Local supported recovery only: no off-host availability, arbitrary unmarked rollback detection, physical zero-loss or RTO claim. Integrity checksums are not authenticity against a malicious package author. Operator-controlled package/storage and separately provisioned off-host destination remain prerequisites. No automatic recovery exit or effect/task replay. No manual acceptance trial required; only humans merge.

Checks use real test-owned local SQLite, subprocesses, loopback HTTP/owner sockets and SIGKILL on darwin-arm64/Node 24.21.0. Helpers terminate owned hosts/remove temporary directories; disk-full checks detach their owned volume. No skl tests or user live services were used. No debug instrumentation was added. No further functional edit or merge follows the post-Audit CLI guidance fix.
