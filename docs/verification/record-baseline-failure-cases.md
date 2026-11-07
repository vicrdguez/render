# Record baseline failure cases

Acceptance oracles for the `record-baseline` Slice. They are requirements, not run results. They were written, with
their checks, before the product change. Behavior rules B1–B4 and commitments A1–A4 are the Slice Contract's; spec §8
Record, §6.2.1, §9.3 and §13 I7–I9/I19 and V1/V6/V8 navigate them.

## Interface these cases name

A Record Slice (`record: true`) is bounded to explicit Record outputs. Each of its obligations is
`{id, kind:"record", output:"adr"|"principle"|"design", text, sources}`; no other Slice has a `record` obligation.
Every Record obligation cites its fidelity basis exactly as an architectural obligation does: an approved decision node,
or on a shortened path an existing-seam source the human Ground approved. Acceptance retains the fidelity review on the
accepted Slice (`review`).

The Record fidelity basis of a Slice is its acceptance's fidelity review plus every source its Record obligations cite
(and, for a cited node, that decision's manifest and the node's evidence). Every assignment on a Record Slice carries
its accepted Contract and that basis as exact inputs; the Contracts and Standards Audit and each Watchdog round receive
them too. Delivery is the ordinary pass: no new command, grant, publisher or ref write exists for Record.

## Cases

| Case | Trigger | Literal expected outcome | Rule | Seam |
|---|---|---|---|---|
| RB01 | Stage a Record Slice holding a `behavior` obligation; a non-Record Slice holding a `record` obligation; a Record obligation with output `readme`; one citing no source; one citing a source the Ground did not approve | each `invalid_content`; no draft | B1 | Kernel |
| RB02 | Stage, review and human-accept a Record Slice with one `adr` obligation citing the approved source | accepted; the Contract bytes carry the obligation with `output:"adr"` and the review; the accepted Slice names the review | B1/A2 | Kernel |
| RB03 | Host assigns the Record Slice with only its Contract as input | `stale_basis`; no assignment, Contract not consumed | B1 | Ledger |
| RB04 | Host assigns it with Contract, fidelity review and cited source | accepted; both Audit reviewers' and the Watchdog's inputs include the review and the source; the consumer `read-next` stays `dependency_blocked` | B1 | Ledger |
| RB05 | Human `assignTask` of the Record Slice; agent `acceptIntake` | `forbidden_principal` each | A1 | Kernel |
| RB06 | Consumer requested after: a human-saved document named like the ADR; the Record pass's Audit and handoff; a passing Watchdog; a planned intent plus an `applied` observation for an attempt never admitted | consumer `dependency_blocked` after each; the unadmitted observation is refused | B2 | Ledger |
| RB07 | Same Record pass admitted and its `applied` observation recorded | consumer assignment accepted | B2 | Ledger |
| RB08 | Record handoff reply lost: the same envelope replayed; then a Watchdog rework round and its successor | replay returns the identical receipt and one handoff; successor P2 opens; P2's Audit is a new Audit on A2, P1's Audit unchanged; completed reviews stay 1; reopen keeps two passes | B3 | Ledger |
| RB09 | Record Slices `record-a` (qualified) and `record-b` (not) both required by `fix`; supersede `record-b` | without a disposition `dependent_disposition_required`; with `fix → record-b2` accepted, `fix` still `dependency_blocked` (now on `record-b2`), `record-a` still qualified and its pass retained, `record-b` superseded with its dispositions in the retained acceptance record | B4 | Kernel |
| RB10 | Supersede the qualified `record-a` by `record-a2` | `record-a` is superseded, no longer counted as qualified, its pass retained; `fix` blocked on `record-a2` | B4 | Kernel |
| RB11 | The Record fidelity review bytes are corrupt or missing, and a human saved a newer document with the same text | Record assignment refuses `content_corrupt` / `missing_content` naming the exact review ref | B4/A2 | Ledger |
| RB12 | Reopen and export after RB07 | export complete; contains the Record Contract, the fidelity review and the integration observation; the consumer stays assignable after reopen | A2 | Ledger |

## Unsafe controls (must fail on their own assertion)

- `record-assignment-without-basis`: a Record assignment need not carry its fidelity basis (RB03).
- `record-unbounded-obligations`: a Record Slice may hold non-Record obligations (RB01).
- `record-document-clears-consumer`: a Record edge clears once the Record pass is handed off (RB06).

Composition (A4/T3): the accepted-intake and canonical-integration rows already exercise Record edges; this row adds
bounded Record obligations, the carried basis, per-pass Record delivery and retirement. Engine/Docker Record journeys,
publication, ready promotion and the human trial are not claimed here.
