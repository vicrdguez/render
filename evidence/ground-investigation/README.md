# Ground investigation verification evidence

Initial executable cases and targeted unsafe controls were committed as `f15261f` before product code
(`cdd072d`). The initial Kernel negative assertion exposed automatic acceptance of an unconfirmed shape;
Ledger cases refused the unimplemented packet field. Neither import/setup failure nor a model claim is
reported as execution evidence. Later test amendments are disclosed in the failure-case document.

Integrated Audit candidate A: `69932ee807fbfa388fa182449410e84129f393f0`.
Observed target cutoff: `f9fe9de73ed3bd7912173b13dbea251e4c0f023c`, freshly fetched once.
Merge conflicts were additive investigation/catalog changes: both validation paths, facts, retained refs,
blocker diagnostics and all controls were retained. The catalog row is `executed`, consistent with the
new target's convention for command-backed scripted journeys.

## Results on A (historical, not final-source substitution)

- `npm run verify:gate`: typecheck and lint exit 0 (363 warnings); full selection **243 passed, 0 failed,
  0 skipped**, **263470.187125 ms**. Includes real Linux containers, SQLite, Git, subprocess faults,
  two-client reattachment, real owner lock, persistence/recovery and existing V9 partial workload.
- V1: **10,000 seeded schedules** in the Full Gate.
- `npm run verify:sqlite-command-atomicity`: **256 schedules**, **22 tests passed**, **25481.267625 ms**.
- `RENDER_V3_REPETITIONS=100 npm run verify:investigation-crash`: **200 tests passed**, **201043.62725 ms**,
  actual before/after-result-commit SIGKILL and replay; one exact retained report/receipt/assignment.
- `npm run verify:unsafe-controls`: **61 detected, 0 undetected**, every baseline passed and mutation
  failed on its own named assertion. Three investigation controls cover automatic shape consent,
  investigation delivery ownership and uncited settlement.
- Existing V9 early workload on A: p95 ack **108.94375000000002 ms**, p95 snapshot **2.689208000000235 ms**;
  this is 100 workflows/document saves, **not** full 100-Slice/four-stream source-delivery load.
- New fast investigation file on the first isolated run: **3667.274583 ms** (including exposed failures),
  corrected focused+crash run **4022.579416 ms**; successful combined focused run after target integration
  **4287.742792 ms** for 21 tests, not an isolated runtime budget claim.

## Review and limits

[audit.md](audit.md) retains both axis reports, actual A, findings and same-pass dispositions.
The final source and its rerun results are in the submitted implementation report; nothing here relabels
A's results as a later source. No second same-pass Audit was run. Independent Watchdog is still required.

No live model/search, human comprehension/two-minute handover trial, private deployment, physical durability,
full V8 future delivery or full V9 claim. Old extended fault jobs remain runnable separately; the complete
extended host/container mega-selection is not represented as executed by this Slice. The applicable new
result-crash boundary received 100 repetitions per point. Source/role package refusal is preserved under
the explicit human decision; exact normal restart/history/export is separate from disaster recovery (#47).
