# Bug journey failure cases

Acceptance oracles written before product changes. These are requirements, not run results.

A bug's Ground is human JSON: `shape:{value:"bug",origin,confirmed}`, `goal`, `constraints`, `approvedSources`,
`reproduction:{trigger,observed}` and the independent `expected` correction. The compact intake manifest carries
`reproduction:{obligation,observed,expected}`: the behavior obligation that is the reproduction, with Ground's observed
wrong behavior and expected correction verbatim. The implementer records a reproduction with
`recordImplementationSource` kind `reproduction`: the owned Linux catalog run of the pre-fix source, before Audit A.

| Case | Rule | Trigger | Literal expected outcome | Seam |
|---|---|---|---|---|
| BJ01 | B1 | Human-supplied bug shape with `confirmed:false`, reproduction and expected correction | intake stages; no shape confirmation is asked | Kernel intake |
| BJ02 | B1 | Classifier-proposed bug shape, unconfirmed | `invalid_content` "Use exact human Ground with a confirmed matching task shape." | Kernel intake |
| BJ03 | B1 | Bug Ground missing `reproduction.trigger`, `reproduction.observed` or `expected` | `invalid_content` "Bug intake needs human Ground with the reproduction trigger, observed wrong behavior and independent expected correction." | Kernel intake |
| BJ04 | B2 | Bug manifest without `reproduction`, with observed or expected differing from Ground, or naming an architecture/unknown obligation | `invalid_content` "Bug intake carries human Ground's observed wrong behavior and expected correction verbatim in manifest reproduction:{obligation,observed,expected}, naming one behavior obligation." | Kernel intake |
| BJ05 | B2 | Bug intake with two Slices; bug intake with no Seams/Modules decisions | two Slices: `invalid_content` "Compact bug/performance intake has one bounded Slice."; no decisions: stages, fresh fidelity and human acceptance still required | Kernel intake |
| BJ06 | B1/A2 | Human saves bug Ground; reopen the store | no intake, Slice or assignment exists after the save; the reopened Ground and the accepted Contract's manifest return the exact reproduction and expected bytes | Ledger over SQLite |
| BJ07 | B3 | Pre-fix catalog run: regression row `read` exits 1 with stdout containing the observed wrong behavior | accepted, `reproduction:"red"`; Audit source A is then captured and the Audit admitted | Ledger/Kernel |
| BJ08 | B3 | Regression row exits 127 (`sh: node: not found`) | accepted, `reproduction:"not-reproduced"`, reason "Regression row read did not run (exit 127): a missing prerequisite is not red-on-the-bug proof."; capturing Audit source A refused `missing_content` naming that reason | Ledger/Kernel |
| BJ09 | B3 | Regression row exits 1 with `Cannot find module 'left-pad'` and no observed text | `not-reproduced`, reason starts "Regression row read failed without the reported wrong behavior"; A capture refused | Ledger/Kernel |
| BJ10 | B3 | Regression row passes on pre-fix source | `not-reproduced`, "Regression row read passed: the reported wrong behavior was not reproduced."; A capture refused | Ledger/Kernel |
| BJ11 | B3 | Bug pass captures Audit source A with no reproduction | `missing_content` "Bug correction needs red-on-the-bug reproduction before Audit: record the regression check failing on the reported wrong behavior before product code." | Ledger/Kernel |
| BJ12 | B3 | Reproduction recorded after Audit A; reproduction on a change Contract | after A: `assignment_closed` "Reproduction precedes product code: record it before Audit source A."; change: `invalid_content` "Only a bug Contract records a reproduction." | Ledger/Kernel |
| BJ13 | B4 | Bug pass with red reproduction; Audit finding `needsHuman` (a new seam) | handoff refused `capability_unavailable` "Unresolved product/Contract questions require human resolution."; handoff before Audit refused `missing_content` | Ledger/Kernel |
| BJ14 | B4 | Bug pass handed off, prepared X check fails, successor opens | successor's own Audit is required (`missing_content` handoff without it); P1's red reproduction satisfies the reproduction rule; P1's Audit is not reused | Ledger/Kernel |
| BJ15 | A2 | Reproduction retained, store reopened, history exported | the reproduction source document and its receipt result (`red`) are in the export; after reopen the pass keeps `reproduction.red` | Ledger over SQLite |
| BJ16 | B3/V8 | Real Linux: scripted implementer adds a regression check calling a missing tool, reproduces, repairs the setup, reproduces again, fixes, Audit, handoff, preparation | first reproduction `not-reproduced` with exit 127 and A capture refused; second `red` with the observed text from actual Linux output; prepared X checks pass with the correction | Engine/Sandboxes/Effects/Ledger |

The red-on-the-bug decision is mechanical evidence, not judgment: a failing regression row whose own output shows the
observed wrong behavior. Audit and Watchdog still judge whether the regression check is adequate. A material unresolved
reproduction gap keeps Audit source A refused; human direction on it uses the existing Contract amendment path.
