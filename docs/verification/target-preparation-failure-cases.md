# Target preparation failure cases

Acceptance oracles written before product changes. These are requirements, not run results.

| Case | Trigger | Literal expected outcome | Seam |
|---|---|---|---|
| TP01 | Diverged B and T1, disjoint edits | clean X contains `implementation=B` and `target=T1`; exact B/T0/T1 retained; deterministic rooted commit after reopening | Effects.perform/reconcile |
| TP02 | T1 already included in B, unrelated recorded T0 | operational error; no ancestry bypass | Effects.perform |
| TP03 | Rewritten T1 not descending from T0 | operational error | Effects.perform |
| TP04 | Changed retained manifest/format, missing object or blob input | operational error, never conflict | Effects.perform |
| TP05 | Both sides change `common` | conflict, `conflicts=[common]`, rooted result, unchanged originals | Effects.perform/reconcile |
| TP06 | Exit 1 with empty stdout | operational error retaining stderr; no authorized conflict return | Effects.perform |
| TP07 | Truncated framing or exit 0 with conflict messages | operational error | Effects.perform |
| TP08 | Git aborts | operational error including SIGABRT and stderr | Effects.perform |
| TP09 | HOME-only / XDG-only hostile default union attributes | production still reports conflict; each unsafe control changes it to clean and fails the intended assertion | Effects.perform, unsafe controls |
| TP10 | Authorized conflict return | exactly one successor based on T1, original B/T0/T1 evidence read-only; new Audit required, zero added Watchdog completions | Engine/Ledger/Sandboxes |
| TP11 | Clean X whose required behavior check fails | non-pass; recorded actual X verifier/results; repair opens successor, no old-pass edits or Watchdog completion | Engine/Ledger/Sandboxes |
| TP12 | Operational verification failure or unchanged-source retry | retain B/pass/Audit; operational blockage and explicit safe retry | Engine/Ledger |
| TP13 | T2 arrives between verification and review launch | prepare/recheck T2; no stale Watchdog launch, no new pass or Audit | Engine/Effects |
| TP14 | Pause/restart/agent failure after retained preparation | exact immutable records/export and scoped continuation, no duplicate transitions | Ledger/Engine |
| TP15 | First observation of a proposal with no canonical ref | Effects creates the host-private `refs/render/proposals/<sha256(proposal)>` at the host-configured base, expected-absent; a later different initial cannot rebind it | Effects.perform observe |
| TP16 | Host moves the canonical ref; an upstream/forge branch moves | observation returns the host ref's rooted commit; upstream branches never become T | Effects.perform observe |
| TP17 | Canonical ref names a blob | operational error, no target | Effects.perform observe |
| TP18 | Preparation record from scheduling/agent principal, before handoff, out of order, other lineage, malformed or after a successor | refused without pass changes; one record per attempt; replay returns the same receipt | Ledger/Kernel |
| TP19 | Operational record, then retry | blocker retained; retry is human-only, only while settled, keeps pass/B/Audit and stages one new preparation; no retry after a successor | Ledger/Kernel |
| TP20 | Retained records after reopen/export | records exported and readable by the successor owner, not by its fresh reviewers | Ledger |
| TP21 | Clean P1 whose B already includes the canonical T | fast path X=B after validation; actual Linux checks on X; reobserved unchanged T leaves a visible awaiting-Watchdog blocker; zero Watchdog Assignments | Engine/Effects/Sandboxes/Ledger |
| TP22 | X's own verifier redefines a required row as `generated` (discovery) while the real suite fails | `verifier-defect` record with no checks and a reason naming the row; never `checked`/`passed`; successor `prepared-verifier-defect` from X; no Audit, Watchdog or fabricated exit | Engine/Ledger/Kernel |
| TP23 | X's verifier renames/removes a required row or is absent | same `verifier-defect` → explicit `prepared-verifier-defect` successor from X with fresh Audit; operational retry no longer strands it; Kernel refuses an empty/oversized defect, fabricated failed rows or another recorded base | Engine/Ledger/Kernel |
| TP24 | Authorized conflict return | observation `baseCommit` is the recorded T0 (not B's capture parent A); successor inputs include the exact conflict record (Git stdout, B/T0/T1 ids); writable T1 workspace plus read-only `/candidates/implementation` (B), `/candidates/base` (T0), `/candidates/target` (T1) | Kernel/Engine/Sandboxes |
| TP25 | A live `render.implementation-preparation` v1 task admitted by the prior release | startup accepts the store; the retained v1 handler drains it with its original blocker and no invented attempt; an explicit retry stages the new `render.target-preparation` task | Ledger startup/Engine |
| TP27 | Workflow policy minimum `tests`; another integration lowers X's selected behavioral journey to the weaker `static` rank while every check still succeeds | `verifier-defect` record with no checks and a reason naming `behavior`, `static` and the minimum `tests`; never `checked`/`passed` or `awaiting_watchdog`; successor `prepared-verifier-defect` from X; no Audit, Watchdog or fabricated exit. A policy minimum absent from X's ladder is likewise a verifier defect | Engine/Ledger/Kernel |
| TP28 | While X's checks run under the workflow binding with minimum `tests`, a human publishes and adopts a policy with minimum `live`; X's behavioral journey stays `tests` | no record qualified under the superseded binding is retained; the one retained attempt names the adopted binding, its revision and minimum `live`, is `verifier-defect` with no checks and a reason naming `behavior`, `tests` and `live`; never `checked`/`passed` or `awaiting_watchdog`; successor `prepared-verifier-defect` from X; no Audit or Watchdog. Kernel refuses a record without a policy basis (`invalid_content`) or naming a superseded binding or another minimum (`stale_basis`) | Engine/Ledger/Kernel |
| TP29 | The retained bytes of the workflow's current policy revision are removed before preparation; the cached policy still says `tests` | Ledger refuses the preparation record `missing_content`; the pass shows an operational blocker naming the missing policy, retains no record and is never `awaiting_watchdog`; no Watchdog. After the exact bytes are restored, an explicit retry keeps pass/B/Audit and retains one `checked` record naming the current binding, revision and minimum `tests` | Engine/Ledger |

TP26's catalog-registration assertion is retired. It checked the configured command and rank, not execution through the product verifier.

Effects-only cases do not establish Engine orchestration, Ledger acceptance, actual Linux checks, review judgments, or full V8/V9. Those remain explicit coverage obligations until their real seams are exercised. Watchdog launch, its final pre-launch reobservation and the canonical CAS belong to later Slices; TP13 here covers reobservation after X checks. Interface they consume: the canonical proposal ref is `refs/render/proposals/<sha256(workflow id)>` in Effects' host-private store for the repository, bound once at the host-configured profile commit; a pass is ready for Watchdog when its latest preparation record is `checked` and its handoff blocker starts `awaiting_watchdog`. Run narratives and raw output belong outside the source tree.
