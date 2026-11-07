# Canonical integration failure cases

Acceptance oracles for the `canonical-integration` Slice. They are requirements, not run results.

Chronology, kept as it happened: CI01–CI17 and CI21 and their Ledger, Effects and V1 schedule checks were written and
failed (`capability_unavailable`, unknown Effects operations) before the first product change. The CI18–CI20 Engine
journeys and the seven unsafe controls were written after the Engine change, so they are not test-first evidence. The
CI22 workload was written before the scheduling-frame change and first measured p95 acknowledgement 1435 ms and snapshot
1656 ms: every queued task rebuilt a full snapshot on each commit. Sharing one frame per committed sequence fixed that
without weakening persistence. In fix round 1, CI23–CI26 and the CI05 receipt assertion were each committed failing
before their product change; the three controls added then and the extra CI20 cuts were written after it. Behavior rules B1–B6 and commitments A1–A3 are the Slice Contract's; spec §3 I9/I10/I16/I17, §§9.1,
9.3–9.4, §10 and §13 V1/V3/V6/V9 navigate them.

## Interface these cases name (new in this Slice)

The operation is one Effects-owned proposal integration of a handed-off pass. Only host Effects (`source-effect`
family) stages, admits or records it. No human approval, grant, project setting or checkpoint setting exists for it.

- `stageOperation {assignment, generation, attempt, text}`: the closed intent JSON
  `{schema:1, kind:"proposal-integration", proposal, ref, slice, contract, passRef, handoff, source, captureA, audit,
  reports, preparation, prepared, tree, target, review, report, result:{commit, tree, parent, message}, policy,
  assignment, generation, attempt, unresolved:[]}`. It pins the pass, B, Audit A and both reports (dispositions are in
  the handoff record), the latest checked preparation X/T, the bound passing Watchdog round and report, squash R
  (tree exactly X's tree, parent exactly T, fixed metadata), the Contract, the current policy basis, the owner
  generation and the empty unresolved canonical-risk basis. Accepted intent is `planned`: it permits nothing.
- `admitEffect {assignment, generation, attempt, operation}`: rechecks current eligibility and commits one attempt
  `integration-attempt:<sequence>` bound to the current `executorEpoch`. The operation becomes `admitted`. The attempt is
  the one-use permit; it is never returned to models or device clients.
- `recordIntegration {assignment, generation, attempt, operation, text}`: the closed observation JSON
  `{schema:1, operation, attempt, mode:"dispatch"|"reconcile", dispatch:"applied"|"refused"|null, ref,
  observed:{commit, tree, parents}|null, lock}`. Kernel, not the caller, derives the outcome:
  `applied` (ref is R, tree X, parents exactly [T], no lock) qualifies once; `stale` (the dispatching executor's own CAS
  refused, ref neither R nor locked) returns to preparation; `unapplied` (reconciliation sees exactly T, no lock) needs a
  fresh current admission; anything else is `divergent` and blocks.
- Human `cancelWork` on a handed-off, unqualified owner fences its generation and records the attempts still in flight;
  its receipt carries `inFlight` (the count) and `inFlight0..n` (each attempt's identity).
- Effects: `perform({type:"squash"})` roots R; `perform({type:"integrate"})` performs the expected-old canonical-ref
  CAS T→R as one `git update-ref --stdin` transaction that commits only after `prepare: ok`, then observes;
  `reconcile({type:"integration"})` observes without dispatching. Every observation first removes a ref lock whose
  mtime predates this Effects instance (a dead executor's; Effects is the only writer of private Git), then fsyncs the
  store, then reads the ref, R's tree/parents and any remaining lock. A failed fsync reports no observation, so nothing
  qualifies until a later observation's barrier succeeds. It never rolls back or rewrites the ref.
- Engine: a staging or admission refused `ownership_conflict` waits on committed state until no operation of the
  proposal is unresolved, then re-evaluates the same pass; it records no blocker.

## Cases

| Case | Trigger | Literal expected outcome | Seam |
|---|---|---|---|
| CI01 | Passing bound round on checked X1/T0; host stages the exact intent, then admits | `planned` operation whose ref is the retained intent with identical bytes; admission returns `integration-attempt:<n>` bound to the Ledger's current executorEpoch; status `admitted`. Default all-human checkpoint settings and no grant are involved | Ledger/Kernel |
| CI02 | Stage/admit/record by a human device, local admin, assignment agent, scheduling or recovery host; `approveIntegration`/`grantIntegration` | `forbidden_principal`; unknown grant commands `unknown_command`; nothing retained | Ledger/Kernel |
| CI03 | Stage naming a rework or Needs Human round (`forbidden_scope`), a non-latest preparation or other pass/handoff/B/A/report/generation (`stale_basis`), another target than the record's (`stale_basis`), a policy adopted after review (`stale_basis`), R tree ≠ X tree or R parent ≠ T (`invalid_content`), a superseded Contract (`contract_superseded`), malformed JSON (`invalid_content`) | refused with that code; no operation, no retained intent | Kernel |
| CI04 | Human `cancelWork` on the handed-off owner, then `admitEffect` | cancel accepted, generation 2, `canceled.inFlight` `[]`; admission `assignment_closed` with no attempt; a new stage also `assignment_closed` | Ledger/Kernel |
| CI05 | Admission first, then human cancel, then the attempt's dispatch observation | cancel accepted listing `inFlight:[attempt]`; its receipt (and the exported receipt record) has `inFlight` 1 and `inFlight0` the attempt; the in-flight observation is still accepted and, being `applied`, qualifies | Ledger/Kernel |
| CI06 | `admitEffect` replayed with the same command id; another admission while admitted | duplicate returns the identical receipt and the same single attempt; the second command `stale_basis`; one attempt | Ledger |
| CI07 | Attempt admitted under epoch e1; a `dispatch` observation recorded under another epoch | `stale_executor`: only the dispatching executor reports a dispatch | Kernel |
| CI08 | Effects squash + CAS on real private Git, ref at T | R's tree equals X's tree, parents exactly [T], message fixed, same id when constructed twice; ref reads R; `refs/render/sources/<R>` roots it; `fsck --strict` clean | Effects |
| CI09 | Canonical ref moved to T′ before the CAS | Effects reports `refused` with observed T′ and the ref still T′; Kernel records `stale`; the completed review stays counted and visible; a new stage on the same preparation `stale_basis` | Effects/Kernel |
| CI10 | Effects asked to CAS an R whose tree/parent differ from the request, or to dispatch the same attempt twice in one process | refuses before any ref change; ref unchanged | Effects |
| CI11 | Slice A admitted and unresolved (or divergent); host stages/admits Slice B of the same proposal | `ownership_conflict` (serialized); after A qualifies, B stages | Kernel |
| CI12 | Ref already R (crash after CAS before SQL); reconciliation observes R/X tree/[T]; then the same record replayed, then another record | `applied`, qualified once; replay returns the same receipt; another observation `assignment_closed`; dependents clear once | Ledger/Kernel |
| CI13 | Crash after admission before dispatch; reconciliation observes exactly T, no lock | `unapplied`; not qualified; dependents stay blocked; a fresh `admitEffect` gives a new attempt under the current epoch | Ledger/Kernel |
| CI14 | Reconciliation observes another commit, or a ref lock written since this executor began | `divergent`; owner blocker starts `integration_divergent`; proposal serialized; ref untouched (no rollback); a human `retryPreparation` reconciles again; ref restored to T then gives `unapplied` | Ledger/Kernel/Effects |
| CI15 | Dependent Slice `next` requires `read-fix` (integration and record kinds) | passing Watchdog without recorded qualification: `assignTask(next)` `dependency_blocked`, view blocker `dependency_blocked`; staged/admitted: still blocked; after `applied`: accepted, view no longer names the dependency | Ledger/Kernel |
| CI16 | No Forge capability configured, or the forge is out (executable in `github-publication` G5 and GP-E1) | integration and the dependent assignment proceed; no publication operation is awaited | Engine/Ledger |
| CI17 | Reopen and export after qualification | intent, observations, attempts and qualification survive reopen; export contains intent and observation documents; the owner reads them | Ledger |
| CI18 | Engine journey (real Docker): P1 handoff → X checks → Watchdog pass | automatic stage/admit/CAS/readback/qualification with no human command after assignment; canonical ref = R, tree = X tree, parent = T; owner blocker empty; dependent assignable | Engine/Ledger/Effects/Sandboxes |
| CI19 | Engine journey: target advanced while parked before the CAS | CAS refused `stale`; same pass re-prepared on T′ (no new pass or Audit); a fresh round passes and integrates onto T′; 2 completed reviews; the stale operation stays in history | Engine/Effects |
| CI20 | SIGKILL at `before-integration-admission`, `after-integration-admission` (with the dead host's ref lock left behind), `before-integration-cas`, `after-integration-cas` (also the cut before readback), `after-integration-readback` (also the cut before SQL qualification) and `after-integration-qualification` | restart: before admission, one fresh admission under the new epoch dispatches; after admission or before the CAS, the old attempt is reconciled `unapplied` by the new epoch (the stale lock removed first) and a fresh admission dispatches; after the CAS or readback, the original attempt is reconciled `applied` with no second CAS; after qualification, nothing reruns. One qualification each, no role reruns | Engine/Ledger/Effects (V3) |
| CI21 | 10,000 seeded Kernel schedules: stage/admit/cancel/observations/adoption/target moves/duplicates/dependent assignment | ≤1 qualification per handoff; no admission after cancel or beside another unresolved operation in the proposal; qualification only from an `applied` observation of an admitted attempt with exact R/X/T; dependent assignment iff the required Slice qualified; Kernel never mutates input | Kernel (V1) |
| CI23 | Effects on real private Git: fsync of the canonical-ref directory fails (EIO) after the CAS moved the ref to R | the dispatch and every reconciliation reject with no observation while it fails; once fsync succeeds, reconciliation reads R. In Engine the attempt stays `admitted` behind `preparation_operational_error` until a retry reconciles after a successful barrier | Effects |
| CI24 | Engine journey: two independent passing Slices of one proposal; the first CAS meets a live writer's ref lock and stays `divergent` while the second passes review | the second is refused `ownership_conflict`, records no blocker and waits; after a human removes the lock and retries the first, both qualify with no command for the second; the later one integrates onto the earlier one's R after preparing and reviewing again | Engine/Ledger/Effects |
| CI25 | Effects restarted after a ref lock was left; then a lock written after the restart | the old lock is removed and reconciliation reports T unlocked; the new lock is reported held and stays | Effects |
| CI26 | Engine journey: human cancels a handed-off pass while X's checks run | the checks finish, their record is refused for the fenced generation, nothing is retained and the blocker still starts `canceled:` | Engine/Ledger |
| CI22 | Full V9 workload | 100 active Slices, two HTTP clients, four executing attempts with four concurrent Durable transcript/tool-result streams on effective WAL/FULL/fullfsync: p95 ack < 250 ms, snapshot < 1 s; cheap V1 + sampled V2 < 60 s; subprocess smoke < 5 min. Results name source, settings, workload and gaps | process (V9) |

## Unsafe controls (must fail on their own assertion)

- `integration-requires-grant`: staging requires a human grant, so CI01 refuses the intent.
- `integration-ignores-cancellation`: admission ignores both of cancellation's fences, the `canceled` guard and the
  generation bump the staged intent pins, so CI04 admits after cancellation. Removing only the guard still refuses.
- `integration-unserialized`: staging ignores another unresolved operation in the proposal (CI11).
- `integration-infers-success`: reconciliation treats an observed T as applied (CI13).
- `integration-adopts-old-permit`: recovery dispatches an attempt admitted by a prior executor epoch (CI20).
- `integration-dependency-before-qualification`: a prepared, reviewed handoff clears same-proposal dependents without
  recorded qualification (CI15).
- `integration-blind-cas`: the CAS omits the expected old value (CI09).
- `integration-observes-without-durability`: an observation is reported without fsyncing the store first (CI23).
- `integration-blocks-behind-serialization`: `ownership_conflict` becomes a permanent blocker again (CI24).
- `integration-removes-live-lock`: reconciliation removes any ref lock, including one a live writer may hold (CI25).

Scripted verdicts are fixture data, not review quality. Publication, draft PR, ready promotion and main-merge
observation are later Slices. Run narratives and raw output belong outside the source tree.
