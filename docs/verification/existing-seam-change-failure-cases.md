# Existing-seam change: preimplementation failure cases

Acceptance oracles for the `existing-seam-change` Slice, written before product changes. Rules B1–B5 and commitments
A1–A4 are the Slice Contract's; spec §§8.1 (Change row, Ground, Proposal, Record), 9.3 and 13 (V1/V6/V8) navigate them.
Accepted-intake, amendment, supersession and Record/integration qualification already exist (`accepted-contracts`,
`canonical-integration`); this Slice reuses them unchanged and maps them here. New cases are ES01, ES04, ES05 and ES06.

| Case | Trigger | Independent expected outcome | Rules | Check |
|---|---|---|---|---|
| ES01 | Shortened (bug/performance/change) intake on human Ground missing its goal, done predicate, constraints or facts | `stageIntake` refuses `invalid_content` "Shortened intake requires human Ground with a goal, an independent done predicate, constraints and facts."; nothing is staged. The same Ground with all four stages | B1 | `accepted-contracts.test.ts` ES01 |
| ES02 | Change Ground with confirmed human shape, two bounded Slices and an explicit Record edge, accepted through fresh fidelity and exact human acceptance | Two accepted Contracts (`read-fix` Record, `read-next`) and the edge `{slice:"read-next",requires:"read-fix",kind:"record"}` are retained with no Seams/Modules checkpoint request | B1/A1 | `existing-seam-change.test.ts` ES02 |
| I06/I12 | Classifier shape unconfirmed; change without breakdown; source not approved in Ground | Refused (existing) | B1 | `accepted-contracts.test.ts` |
| I04–I07 | Agent acceptance, stale basis, fidelity finding | Only exact-basis human acceptance after fresh independent fidelity commits (existing) | B2/A1 | `accepted-contracts.test.ts` |
| CI15/I11 | Record Slice's document exists, its pass hands off and its Watchdog passes | Consumer stays `dependency_blocked`; only recorded qualifying integration clears it (existing) | B2 | `canonical-integration.test.ts`, `accepted-contracts.test.ts` |
| I09/I10 | Assigned Slice released, changed obligations requested | `amendContract` refuses `contract_frozen`; supersession needs explicit dependent dispositions and retains the original acceptance (existing) | B3 | `accepted-contracts.test.ts` |
| ES04 | During change-shape implementation a human Ground revision records the discovered facts and the coordinator requests a revised Seams checkpoint | The running `read-fix` owner becomes `blocked` with `seams_decision_required`; assigning the unrelated accepted `read-next` refuses `seams_required`; the view's blocker is `seams_decision_required` and next human action is `reviewCheckpoint` on that request; both Contracts stay `accepted` with original refs and `read-fix` stays `everAssigned`; the Ground facts are readable; the same answers hold after reopen and in export. Cancelling the request makes `read-next` assignable again | B4/A1/A2 | `existing-seam-change.test.ts` ES04 |
| ES04 | An implementer or coordinator agent saves Ground, amends or supersedes a Contract; an implementer requests a checkpoint | `forbidden_principal` for human routes; `forbidden_scope` for a non-coordinator checkpoint request | A1 | `existing-seam-change.test.ts` ES04 |
| ES05 | `read-fix` qualifies; the original clients go away; the host reopens; a fresh device attaches | From its scoped snapshot: commitment `accepted` with both Contracts, `integrated: ["read-fix"]` (partial delivery), the qualified pass's handoff source and qualification, the Watchdog report among evidence, no active owner, blocker `null` (no blocker exists), next human action `none`. Before qualification the blocker literally names the Record edge and `integrated` is `[]`. A device scoped elsewhere sees no workflow | B5/A1 | `existing-seam-change.test.ts` ES05 |
| ES06 | A pending Seams revision while `read-fix` has a handed-off pass and a passing Watchdog round | Staging its integration and admitting a staged operation both refuse `seams_required`; each succeeds once the request is cancelled; an operation admitted before a later revision still records its observation and qualifies (admitted effects are reconciled, never retracted) | B4 | `existing-seam-change.test.ts` ES06 |
| ES05 | `read-next`'s Contract bytes are corrupt after reopen | Reading it refuses `content_corrupt`, export is incomplete without it; no newer bytes substitute | B5/A2 | `existing-seam-change.test.ts` ES05 |

The historical source-mutation runner was removed. ES01, ES04 and ES05 remain direct product checks for missing Ground predicates, revised Seams and partial delivery.

Limits. Scripted coordinator, fidelity and Watchdog reports are not model judgment. The ≤2-minute human handover
trial is separately authorized and unrun. Full V8 delivery composition remains partial: Forge publication, ready
promotion and human-merge mapping are later Slices.
