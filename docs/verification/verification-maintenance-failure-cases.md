# Verification maintenance failure cases

Acceptance oracles for the `verification-maintenance` Slice (Contract B1–B4, A1–A4). They were written, with their
failing checks, before any product change. Spec §8.1 (verify-maintain as bounded work, no new delivery shape), §8.2
step 5 and §13 V5/V8 navigate them. "Change-triggered" means bounded maintenance work requested under an accepted
change; there is no scheduler or daemon.

## Interface these cases name

No new module, interface method, role or command type. Maintenance reuses the selected catalog, the owned Linux
catalog runner and `submitRoleResult`:

- `verification.maintenance: {basis: null | "<assignment>"}` on a role packet's selection marks maintenance. Its
  `rows` list every row of the selected asset; `behavioralRows` is empty.
- A Linux-writer packet with it is the existing owned runner. It runs every executed row, every journey's steps and
  independent sanity, and generated discovery. A row whose definition no longer resolves (its command cell or journey
  path) is not a whole-asset refusal: it is retained as that row's `invalid` result with the reason.
- A read-only packet with it is the classifier. It cites runner receipts in `verification.receipts` and submits report
  text `{"schema":1,"maintenance":{"<row>":{"status","reason","cause"?,"compared"?}}}`.
  `status` is `clean | changed | blocked`. `changed` is proven harness drift. `blocked` needs `cause`
  `product` (a product regression, a finding for separate accepted work) or `prerequisite`. A generated row names the
  dependent rows it was compared with in `compared`. Human rows are never classified.
- With `basis` null the classification is pre-edit: `changed` proposes a correction. With `basis` naming a retained
  pre-edit classification it is the corrected-run outcome on a different commit, citing the basis receipt and the
  corrected receipt.

## Literal observations

Fixture asset (real Git, real owned Linux runner): `discover` generated `ls checks`; `full-suite`, `typecheck`, `lint`
pass; `stale` runs the renamed `checks/old-name.sh`; `product` runs `checks/product.sh`, which prints `5` where the
expectation is `4`; `fixture` journey steps print `STEP OK` and its sanity needs the absent `render-golden-fixture`;
`moved` names the missing `.render/journeys/moved.md`; `human` is advisory.

- VM01 (B1): the maintenance runner retains a result for every non-human row: `discover` completed with stdout
  `add.sh\nproduct.sh\nsuite.sh\n`, `stale` and `product` failed, `fixture` steps exit 0 and sanity `unrun` (127),
  `moved` `invalid` with no steps, `human` advisory. Receipt status `non-pass`; nothing refuses the whole asset.
- VM02 (B1): a classification that omits a non-human row, names an unknown row, classifies `human`, omits `compared` on
  `discover` or names a non-row in it, or cites no maintenance receipt for exact commit/digest refuses
  `invalid_content`/`missing_content`. A row that did not execute successfully (`stale`, `product`, `fixture`,
  `moved`) classified `clean` refuses. `blocked` without `product|prerequisite` refuses.
- VM03 (B1/B2): the honest pre-edit classification is accepted: `discover`, `full-suite`, `typecheck`, `lint` clean;
  `stale` and `moved` changed; `product` blocked/product; `fixture` blocked/prerequisite. The assignment retains exactly
  these statuses before any corrected source exists.
- VM04 (B2): corrected commit C1 changes only the asset (`stale` runs `checks/add.sh`, `moved` names the existing
  fixture journey). Outcome on C1 citing the basis: `stale` changed is accepted only after its corrected run printed
  `ADD OK` and exited 0.
- VM05 (B2): commit C2 lowers the `product` row (Run `true`, Expectations `exits zero`) along with the corrections.
  Any outcome citing the basis refuses: a row not classified `changed` cannot change its definition.
- VM06 (B2): commit C3 corrects the asset and also edits `product.js` so `product` passes. Any outcome refuses: a
  maintenance correction changes only the selected asset and its journey files, never product code.
- VM07 (B2): a basis-`changed` row may change only Run/Channel; changing its Expectations or Rank refuses (C2 also
  covers the `stale` row's Expectations staying literal in C1).
- VM08 (B3): in C1 `moved` now names the fixture journey whose sanity still needs the absent fixture. Claiming it
  `changed` refuses; `blocked`/`prerequisite` is accepted and the retained outcome shows `moved` blocked with the
  attempted change. `product` stays blocked/product.
- VM09 (B3): an outcome claiming `changed` for a row the basis did not classify `changed` refuses; an outcome without
  the basis receipt, or with a basis that is not a retained pre-edit classification, refuses.
- VM10 (B4): an outcome on the basis's own commit (findings without edits) cannot claim any `changed` row. A runner
  whose command modifies source yields `source_changed`, and a classification citing it refuses. Maintenance reports
  open no implementation pass, handoff or integration. Post-handoff verifier repair opening a successor pass with its
  own fresh Audit is the existing `implementation-successor` behavior (TP23, "P1 reports cannot satisfy P2"), run by
  `verify:verification-maintenance`.
- VM11 (A1): the classification is assignment-agent work. The human local-admin and the host scheduling principal
  submitting it refuse before any report is retained.
- VM12 (A2): runner receipts and classification reports are ordinary retained role reports: export holds their exact
  bytes and they read back identically after reopen, with the retained per-row statuses still on the assignments.

## Unsafe controls

Each removes one guard and must fail the named assertion, not setup: `maintenance-clean-failed-row` (VM02),
`maintenance-unchanged-definition` (VM05), `maintenance-product-code` (VM06), `maintenance-unsubstantiated-change`
(VM08).

## Limits

The judgment that a failure is drift rather than a product regression is the model's; Render checks the structure and
evidence a classification rests on. Adding or removing rows changes expectations and stays ordinary accepted work.
Scripted fixtures do not establish classification quality.
