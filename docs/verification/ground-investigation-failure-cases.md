# Ground / read-only investigation — preimplementation oracles

Recorded before product changes for B1–B3, A1–A4 and T1–T3. Human decision at ledger
81ebd7ddb9d88df64c66cda53dbee8e79f7e278a separates normal execution durability from disaster recovery.
Do not change recovery validators, source-root packaging or runtime retention to obtain a package.

## Owned seams and chosen representation

Use existing human `saveDocument` Ground revisions, scoped coordinator packets, host source observations,
role reports and real Durable tasks. Optional `packet.investigation` selects the ordinary investigation
playbook, pins human Ground and exact repository/commit/paths. It cannot request delivery or children.
Ground is structured JSON inside the existing immutable human document; old prose Ground stays readable.
Classifier-origin shape is not consent until explicitly confirmed in a human revision. Human-origin shape
needs no confirmation flag. A finding/report is a model claim, never an execution receipt.

The source reader reuses Effects.resolve, not a coding shell. It retains the selected complete UTF-8 files
(including literal symlink target text), exact commit/tree/blob identities and assignment provenance before
provider work. Source/context/ADR/principle/verifier selection is explicit; it cannot prove semantic relevance.
Required oversized, absent, damaged or unsupported inputs block, with no truncation or newer-byte fallback.

## Failure matrix and independent expectations

| Case | Observable expected result | Seam |
|---|---|---|
| G01 explicit human investigation | `accepted` assignment, no second shape vote, delivery false, only coordinator | Kernel + Ledger |
| G02 classifier suggestion only | `shape_confirmation_required`, zero assignments; confirmed human revision permits start | Kernel + Ledger |
| G03 missing, malformed or agent-authored Ground | refuse, no scheduled work; original acknowledged bytes still retrievable | Ledger |
| G04 writer, delivery, child role or replacement widening | `forbidden_scope`; Ground never becomes implementation authorization | Kernel + Ledger |
| G05 exact source/context reading | actual Git literal bytes reach scoped packet, host source attribution distinct from model report; upstream refs/files unchanged | Engine/Effects/Ledger |
| G06 finding | cited facts, independent done predicate, uncertainty and limits retained; submitted report, one assignment, no delivery/publication | Engine/Durable/Ledger |
| G07 unsupported experiment/design/change | cited report retained, assignment blocked with precise playbook and human question; no child work; rebind cannot erase blocker | Kernel + Ledger |
| G08 fabricated/missing/out-of-scope citation or uncited prose | `invalid_content` or `missing_content`; no report or settlement | Kernel + Ledger |
| G09 missing source capability/path or invalid/binary source | visible actionable blocker, ownership retained, no model assertion substituted for observation | Engine |
| G10 normal reopen/history/export | exact Ground/source/report bytes, principal and assignment refs survive; fixed-cutoff export unchanged | Ledger |
| G11 missing/corrupt cited bytes | exact restoration ref in refusal/export; later source or Ground cannot replace it | Ledger + Engine |
| G12 result before/after-commit SIGKILL | recover zero partial report, exactly one accepted report/receipt, same ownership; current epoch fences old execution | Real subprocess/Durable/SQLite |
| G13 retained execution | normal history/export/restart remain independent of deferred disaster recovery | ground-investigation and defer-disaster-recovery checks |
| G14 fresh client handover | commitment = investigation only; owner, evidence, blocker, next human action obtainable without chat | Ledger snapshot/artifacts |
| G15 scope and stale authority | foreign workflow input, stale generation and agent shape-approval refuse before disclosure/commit | Existing role checks + new focused cases |

Preregistration amendments: after the first implementation, G08 gained a direct host-runner-substitution
assertion; it failed with `accepted` before the corresponding refusal was added. Audit F2 later exposed
an invalid-packet throw: a literal delivery=true/missing-packet check failed on that exception before the
guard ordering was corrected. These additions are not represented as part of the initial test commit.
The existing V1 matrix was updated for the newly available host source command. Formatting and initial
fixture type/provenance-field corrections do not establish regression sensitivity.

Unsafe controls are written before implementation: automatically accepting unconfirmed classifier shape must
fail G02's named assertion; admitting a delivery owner for investigation must fail G04's named assertion.
A third control accepting uncited results must fail G08. Setup/import failures do not count as detection.

Focused selection: `node --test test/ground-investigation.test.ts` (real SQLite/Git, scripted provider only).
Process fault selection: `node --test test/investigation-crash.integration.ts`, once per named barrier.
Existing role retention, replay, authority schedules, source and recovery tests remain cumulative coverage.
Full Gate is `npm run verify:gate`; the historical source-mutation runner has been removed. Measure new
checks; no live model/search/human judgment, full delivery journey or full V9 claim follows from these fixtures.
