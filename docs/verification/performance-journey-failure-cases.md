# Performance journey failure cases

Acceptance oracles for the `performance-journey` Slice, written with failing checks before any product change. They
are requirements, not run results. Behavior rules B1–B4 and commitments A1–A4 are the Slice Contract's; spec §8.1
(Performance row, Ground, Proposal), §9.3–9.4 and §13 V8 navigate them.

Baseline on the base source (`ce17cdf`, before any change): `npm test` 324 pass, 64.5 s wall on the shared host. On that
source PJ01, PJ03, PJ05, PJ06 and PJ08–PJ14 failed on their own assertions; PJ02, PJ04 and PJ07 already held through the
existing intake rules and stay as regressions for the performance shape.

## Interface these cases name

No command, principal, record kind or module is added. A performance commitment is content inside records that already
exist:

- Human Ground (`saveDocument` `ground`) with `shape.value: "performance"` carries
  `performance: {scenario, row, metric, better: "lower"|"higher", method, controls[], limitations[], uncertainty[],
  baseline: <ref>|null, target: <number>|null}`. `row` names the project catalog row that measures the scenario; the
  measurement is the number under `metric` in the JSON object on the last non-empty stdout line of that row's final
  step.
- `baseline` cites a trusted catalog-check receipt (`owned-check/<assignment>`, recorded by host Effects) on actual
  source, and the intake cites it among its approved `sources`.
- The accepted Contract document retains `performance`: the Ground fields plus the baseline measurement
  `{receipt, repository, commit, verifier, platform, image, workload, value, rows}`, where `workload` is the measured
  row's literal catalog line and `rows` the literal line of every baseline row.
- A Watchdog round of a performance Slice compares its own receipt on exact X with that baseline. Its result carries
  `performance` (`met | not-met | mismatch | regressed`), `performanceReason` and `performanceValue`. Only `met` admits
  a passing assessment; a refused pass names the outcome in `refs.performance`.

## Cases

| Case | Rule | Trigger | Literal expected outcome | Seam |
|---|---|---|---|---|
| PJ01 | B1/B2 | Human performance Ground with trusted baseline (p95_ms 200) and target 180; one compact Slice, no Seams/Modules; fresh fidelity; human `acceptIntake` | accepted; Contract `performance` retains scenario, method, controls, limitations, uncertainty, target 180 and baseline `{receipt, commit, verifier, platform {os:"linux",cpu:"owned"}, image "owned", workload <bench literal>, value 200}` | Ledger/Kernel |
| PJ02 | B1 | Same Ground but classifier-proposed shape, unconfirmed | `stageIntake` `invalid_content`; after the human saves `confirmed:true` the same intake stages | Ledger/Kernel |
| PJ03 | B1 | Ground target `null`, intake lists no unresolved question | `stageIntake` `invalid_content` naming the missing target; nothing staged | Ledger/Kernel |
| PJ04 | B1 | Ground target `null`, intake lists the target as an unresolved product question | staged; Ground bytes keep the baseline ref and uncertainty; next human action `reviewIntake`; human `acceptIntake` `decision_required`; no Contract | Ledger/Kernel |
| PJ05 | B1 | Ground baseline `null` (missing prerequisite), no unresolved question | `stageIntake` `invalid_content` | Ledger/Kernel |
| PJ06 | B1/B3 | Baseline cites a human-saved document with receipt-shaped bytes; or a trusted receipt whose bench row failed; or a receipt not cited in intake sources | `stageIntake` `invalid_content` each | Ledger/Kernel |
| PJ07 | B2/A1 | Performance intake with two Slices; assignment agent sends `acceptIntake` | `invalid_content`; `forbidden_principal`, no Contract | Ledger/Kernel |
| PJ08 | B3/B4 | Watchdog's own receipt on X: same bench literal, platform and rows, p95_ms 150 | pass accepted; result `performance:"met"`, `performanceValue:150` | Ledger/Kernel |
| PJ09 | B3 | X receipt faster (p95_ms 90) but the bench row's literal changed (different workload) | pass `missing_content`, `refs.performance:"mismatch"`; a rework verdict is accepted with `performance:"mismatch"` | Ledger/Kernel |
| PJ10 | B3 | X receipt faster on another CPU/image | pass refused, `refs.performance:"mismatch"` | Ledger/Kernel |
| PJ11 | B3/B4 | X receipt faster but the full-suite row's literal changed (silently weakened behavior) | pass refused, `refs.performance:"regressed"`; a needs-human verdict is accepted with `performance:"regressed"` | Ledger/Kernel |
| PJ12 | B3 | X receipt comparable but p95_ms 190 | pass refused, `refs.performance:"not-met"`, value 190 | Ledger/Kernel |
| PJ13 | B4 | Implementer's B handoff passed; the Watchdog's X receipt has no bench result | pass refused, `refs.performance:"mismatch"`; the handoff's evidence is never inherited | Ledger/Kernel |
| PJ14 | A2 | After PJ08, reopen and export | Contract `performance` and the round's receipt result `performance:"met"` survive reopen and are in the complete export | Ledger |

## Unsafe controls

- `performance-target-invented`: stage a performance intake whose Ground lacks a target without an unresolved question.
  PJ03 must fail.
- `performance-workload-ignored`: compare without the workload literal. PJ09 must fail.
- `performance-regression-ignored`: compare without baseline row literals. PJ11 must fail.

## Limits

Scripted receipts at the Ledger seam stand in for actual Linux execution; the existing `verification-catalog` and
`watchdog-rework` rows prove that real Docker runs retain these literal results. No live model or human judgment, no
second performance project and no Render V9 claim. The Contract's target is the project's, never Render's V9 targets.
