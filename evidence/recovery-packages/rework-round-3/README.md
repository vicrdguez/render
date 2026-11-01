# Durable-role-work integration evidence

Observed target cutoff: `0c36b60aad07c6e67846396832739434c370dc56`, freshly fetched from origin/proposal/render-v1.
Tests/failure matrix first: `603d3d5`. Integrated product/verifier: `2156fc1`; inherited capability assertions corrected
in `92b356e`; dropped npm control entry restored in `791bee2cd0f07f33b67d2780e5f68a059fe79e5f`.
Audited source: `d33f3159d6c4dfedd209668d88346d10e6c69954` (only Markdown table/section boundary changes after 791bee2).
Previous reviewed ancestor: `3f249c1e26e5ae70632b04671cd6a6dd19574997`.
Comparison: `git diff 3f249c1...HEAD`; unchanged target implementation excluded, composition effects included.
Only a human merges the pull request. The local target merge is required integration, not a readiness verdict.

## Accepted scope and explicit refusal

Empty role indexes remain packageable. Nonempty role work, role bindings, tasks/submissions and role-provenance revisions
explicitly refuse generation/import/repair. No task migration or current-world process/effect reconciliation exists.
Prior good packages and live stores are preserved. A marked unsupported direct copy remains diagnostic-only: admin
packet history/export retains bytes/provenance/uncertainty; assignment-agent authority and both Engine resume hooks
are fenced. Restricted starts rotate executorEpoch without rebinding. A supported older package repairs without
authorizing its newer-world agent. This is the accepted cover-or-explicitly-refuse alternative, not full role restore.

## Executed commands and exact-source binding

Compressed `.txt.gz` files are exact original output bytes; inspect with `gzip -dc <file>`.
No normalization of warning output, assertion text or timings was performed.

At **d33f315**:
- `npm test && npm run typecheck && npm run lint`: PASS; 85/85, 0 failed/skipped/cancelled; tests 82.712 s;
  types clean; Biome 52 files, exit 0, 54 nonfatal warnings, no errors. `audit-full-gate.txt.gz`.
- `skl implement inspect ... --target 0c36b60...`: `audit-inspection.txt.gz`.
- One logical Audit, sequential Standards then Contracts fallback because Agent discovery returned no tools.
  Both reports retained below, HARD 0 / JUDGEMENT 0. Not fresh-context independent review.

At **791bee2** (identical product/verifier/config as d33f315):
- `npm test && npm run typecheck && npm run lint`: PASS, 85/85; `audited-full-gate.txt.gz`.
- Eleven named suites, each via `npm run verify:<name>`: package-clean-restore, package-origin-auth-fence,
  package-validation, restore-newer-world, repair-crash, history-cutoff-export, independent-export-reader,
  durable-tool-replay, workflow-task-survival, role-capability-refusal, cancellation-capacity.
  All PASS: `audited-named-checks.txt.gz`. Catalog discovery is not counted as execution.
- `npm run verify:unsafe-controls`: 22/22 detected, all baselines passed, zero failedOtherwise:
  `candidate-unsafe-controls.txt.gz`. All 17 earlier controls and all three role-target controls retained;
  two new controls distinguish empty signing-key fallback and restricted role resume.
- `npm run verify:sqlite-command-atomicity`: 256 SQLite schedules, 22 tests PASS, 25.863 s.
- `RENDER_V3_REPETITIONS=100 npm run verify:command-crash-recovery`: 100 at each commit barrier plus real disk exhaustion,
  three tests PASS, 142.143 s.
- `RENDER_V3_REPETITIONS=100 npm run verify:repair-crash`: 100 at each repair barrier, aggregate PASS, 118.613 s.
- `RENDER_V3_REPETITIONS=100 npm run verify:durable-tool-replay`: 100 at each role commit barrier plus ancestor refusals,
  202 tests PASS, 160.952 s.
- `npm run verify:history-command-load`: PASS, 8.392 s; 300/1200 messages export in 5.966/17.899 ms;
  concurrent-history acknowledgement p95 43.532 ms. A bounded workload, not arbitrary-store/full-V9 certification.

Final-head gate/named/control/inspection reruns are recorded in the submitted implementation report and result directory;
this evidence-only commit cannot contain logs produced after its own identity was assigned.

## Regression provenance and setup limits

`integration-red.txt.gz`: tests from 603d3d5 over textual merge resolution before accepting empty role indexes;
both new/old packaging paths fail on rejected empty render.role-work, the intended composition regression.
`role-provenance-red.txt.gz`: added working-tree corruption case before its validator guard; managed restore wrongly
accepts role provenance, intended assertion fails. Not a clean-head full gate.
`focused.txt.gz`: before capability fix, the new workflow-view assertion fails on delivered local recovery still
advertised unavailable. Other focused rows pass. W6 omission is distinguished by the retained unsafe-control run.
Initial typecheck failures from composing the packaged reply union and later TS inference corrections are setup fixes,
not product detections. `full-gate.txt.gz` shows 83/85 at 2156fc1: two inherited assertions still expected local
recovery to be unavailable; corrected without weakening off-host absence. `unsafe-controls.txt.gz` shows a missing
npm script after textual conflict resolution, corrected in 791bee2; it is not an intended mutation detection.
All these failures were resolved before Audit. No post-Audit functional/verifier edits or second Audit.

## Limits and cleanup

Darwin-arm64, Node 24.21.0, Pi 1.4.0; real owned SQLite/storage/processes, loopback HTTP and owner sockets.
No live provider/Forge/user service or skl tests used. Helpers stop owned processes, remove temporary stores and detach
owned disk-full volumes. No debug instrumentation retained. Source/package input remains operator-controlled.
Checksums establish integrity, not malicious-author authenticity. Legacy messages remain unverified when original
metadata is absent. No automatic recovery exit, restored task replay, arbitrary unmarked rollback detection, off-host
availability, physical zero-loss or RTO claim. V5/V6, full V8 and the four-concurrent-transcript V9 workload remain
unavailable/unrun, not fabricated passes. Current role four-slot/wait/restart and early two-client V9 checks do run.
No M<n> human check is required by this slice; no physical-device/human usability or judgment trial was performed.
