# Watchdog review and rework failure cases

Acceptance oracles for this Slice. These are requirements, not run results. Behavior rules B1–B5 and commitments A1–A3
are the `watchdog-rework` Contract's; spec §3 I8/I19, §6.2/§6.4/§6.5, §9.4 and §11 navigate them.

Chronology, kept as it happened: WR01–WR18 and WR21–WR22 were written before the first product change, and their
Ledger/Kernel tests came first. WR19, WR20, WR23, WR24, the WR21 cancel case and the WR17 SIGKILL journey were added
after that code, so they are not test-first evidence. WR25–WR27 were written for the first Watchdog round's rework
(findings W1, W2, W4), and their regressions failed on the reviewed head before each repair. WR28–WR29 were written
for the second round's rework (findings W5, W6) and failed on the reviewed head `8f3e055` before either repair.

Interface these cases name (new in this Slice):

- An accepted implementer packet may carry exactly one `watchdog` request beside its two Audit requests. It is frozen
  into the pass configuration at acceptance like the Audit reviewers: read-only, no verifier/investigation/experiment, no
  nested requests, `family === requiredFamily`. Without one, a checked pass stays visibly `awaiting_watchdog` and no
  Watchdog is invented.
- `requestWatchdogReview` (host Effects only): `{assignment, generation, attempt, preparation, target}` names the
  handed-off owner, its latest preparation record and the target commit the host re-observed immediately before launch.
- `recordReviewChecks` (host Effects only): the Watchdog's own Linux catalog receipt on exact X, with literal X source.
- A bound Watchdog submits `submit_role_result` with JSON `{schema:1, verdict, passRef, handoff, source, prepared,
  target, ...}` and a `verification` assessment.
- Completed-review count for a Slice: submitted `watchdog` Assignments on it. Limit: the workflow's current
  `completedReviewLimit`.

| Case | Trigger | Literal expected outcome | Seam |
|---|---|---|---|
| WR01 | Checked X1/T0, host re-observes T0 and requests a review | one new Watchdog Assignment: fresh conversation, `parent:null`, role `watchdog`, `execution:"read-only"`, frozen model/family, `requests:[]`; binding names pass P1, handoff, B, preparation, X1 commit/tree, T0, X1 verifier digest; required inputs include the Contract, pass record, handoff, B, A, Audit record and both Audit reports and the preparation record; count still 0 | Ledger/Kernel |
| WR02 | Review requested by scheduling, recovery, a human or the implementer agent | `forbidden_principal`, no Assignment | Ledger/Kernel |
| WR03 | Request naming a non-latest preparation, a `conflict`/`check-failure` record, a target other than the record's, or a record under a superseded policy binding | `stale_basis` (other preparation/target/policy) or `forbidden_scope` (not checked); no Assignment, no count | Ledger/Kernel |
| WR04 | Second request while a review of the same X is open or completed | `role_already_requested`; the first review is unchanged | Ledger/Kernel |
| WR05 | Pass without a configured Watchdog | request refused `capability_unavailable`; Engine leaves an `awaiting_watchdog` blocker naming the missing configuration | Ledger/Engine |
| WR06 | Watchdog submits before its own checks are retained | `missing_content`; count unchanged | Ledger/Kernel |
| WR07 | Checks receipt from another role, scope, prepared commit/tree, verifier or with a changed result tree | `recordReviewChecks` refuses `stale_basis`/`invalid_content`; a pass verdict over a `source_changed` or failed receipt refuses `missing_content` | Ledger/Kernel |
| WR08 | Verdict naming another pass, handoff, B, X or T, or malformed | `invalid_content`; Assignment stays running; count unchanged | Ledger/Kernel |
| WR09 | Watchdog agent tries to capture/record source, request Audit or hand off | refused (`forbidden_scope`/`forbidden_principal`/`missing_content`); Engine gives Watchdog no `implementation_*` or `experiment_run` tool; Linux checks run on a scratch copy and a changed tree is `source_changed`, never a pass | Kernel/Engine/Sandboxes |
| WR10 | Valid pass, rework and needs-human submissions | each increments the count by exactly one (results report `reviews`); duplicate command id returns the identical receipt; a different command id from the settled Assignment refuses `assignment_not_running` | Ledger/Kernel |
| WR11 | Two passing drift rounds on X1/T0 then X2/T1, then a rework round on X3/T2, each with duplicate retries | count 3, not 1; at default limit 2 `openSuccessorPass` refuses `human_direction_required`; earlier reviews stay retained and visible | Ledger/Kernel |
| WR12 | Limit 0, initial review | the review is still requested and completes; a pass verdict is eligible (qualification has no gap); a rework verdict refuses automatic return `human_direction_required` | Ledger/Kernel/Engine |
| WR13 | Needs-human verdict at count 1, limit 2 | automatic return refuses `human_direction_required` immediately for every cause; Engine leaves a `needs_human` blocker; no successor | Ledger/Kernel/Engine |
| WR14 | Cap stop, then human `adoptPolicy` to a larger limit, then `retryPreparation` | retry re-settles the retained verdict (no new preparation); successor P2 opens with `watchdog-rework` cause from X; count and the earlier reports unchanged; P2 handoff without its own fresh Audit refuses `missing_content`; P1's Audit cannot satisfy P2 | Ledger/Kernel/Engine |
| WR15 | Target moves after a passing review completes (stale qualification) | qualification refuses `stale_basis` naming both targets; the completed review stays counted and visible; Engine prepares the current target under the same pass (no new pass or Audit) and requests a new round | Kernel/Engine |
| WR16 | Policy adopted after a passing review | qualification refuses `stale_basis`; count retained | Kernel |
| WR17 | Watchdog review interrupted by host restart before submission, including SIGKILL while its own checks run | same Assignment resumes; count 0 until it submits; checks retained once are not rerun; an interrupted check runtime is stopped and the checks run again under the recovering executor and are recorded once | Engine/Ledger/Sandboxes |
| WR24 | A scheduler `assignTask` of a `watchdog` packet on accepted work | `forbidden_scope`; only host-launched rounds exist, count and appear as prior context | Ledger/Kernel |
| WR18 | Restart and export after reviews | bindings, checks receipts, reports, count and preparation records survive reopen; export contains each Watchdog packet, checks receipt and report | Ledger |
| WR19 | Engine journey (real Docker): P1 handed off and checked → Watchdog launched automatically on exact X1/T0 runs its own catalog in Linux → scripted rework → P2 opens from X1 with fresh Audit → P2 checked → fresh Watchdog Assignment and conversation → scripted pass → `awaiting_integration` blocker; count 2 | Engine/Ledger/Effects/Sandboxes |
| WR20 | Engine journey: target moves between the check and review launch | no review of the stale X; preparation runs again on the current target and its review binds the new T | Engine/Effects |
| WR21 | Retry while a review is open | `retryPreparation` refuses `stale_basis`; no second preparation | Ledger/Kernel |
| WR22 | Missing prior Watchdog report bytes when rendering a new round | prior material is shown as unavailable and the instructions require a full review; the count is unaffected | Engine render |
| WR23 | 10,000 seeded schedules of rounds on one handoff over limits 0–3 with pass, rework, Needs Human, duplicate submission and larger-limit adoption | every accepted submission reports `reviews` equal to the oracle's count; automatic rework opens exactly when no Needs Human verdict is on the handoff and count < current limit, otherwise `human_direction_required` with no write; passes are accepted above the cap; Kernel never mutates its inputs | Kernel (V1) |


Rework of the first Watchdog round (new interface: `directRework`, human only, `{assignment, generation, attempt,
review, text}` naming the handed-off owner and the exact stopped round, with the human's direction text):

| Case | Trigger | Literal expected outcome | Seam |
|---|---|---|---|
| WR25 | Rework verdict opens P2; P2's agent reads the cited report and its prompt is rendered | P2's packet inputs name the exact report; its own agent read returns the report bytes (not `not_found`); the rendered prompt contains the finding text; with the report bytes damaged, rendering P2 refuses on that exact input instead of starting without its direction | Ledger/Engine render |
| WR26 | Needs Human stop (count 1, limit 2), then `directRework` by scheduling, the Effects host, the owner agent or the Watchdog agent | `forbidden_principal`; no direction, no successor | Ledger/Kernel |
| WR26 | `directRework` by a human naming a round that passed, a round of another X, a stale Generation, an unsettled handoff, or empty text | `forbidden_scope` (pass), `stale_basis` (other round or unsettled), `stale_assignment`, `invalid_content`; nothing retained | Ledger/Kernel |
| WR26 | Human `directRework` on the Needs Human round | direction retained as its own document, readable by the human; the handoff settles again; a host `human-direction` return citing it opens P2 from X with count still 1; P2's inputs carry the report and the direction, both readable by P2's agent; P2 handoff without its own Audit refuses `missing_content`; a second direction refuses; a `human-direction` return citing no recorded direction refuses `human_direction_required`, and so do cap adoption plus retry alone | Ledger/Kernel |
| WR26 | Cap stop at limit 0 (rework verdict) then human `directRework` | same successor path without adopting a larger limit; count unchanged | Ledger/Kernel |
| WR26 | Engine journey (real Docker): Needs Human → `needs_human` blocker → human `directRework` → P2 from X whose scripted implementer takes its edit only from the direction in its rendered inputs → fresh Audit → fresh round passes → `awaiting_integration`, count 2 | Engine/Ledger/Effects/Sandboxes |
| WR28 | Rework verdict at count 1, default limit 2 (no stop, no recorded direction); host `human-direction` return citing the Watchdog report, or another revision, as its direction | `human_direction_required`; no pass opens; the same round's `watchdog-rework` return then opens P2 with cause `watchdog-rework`, count still 1 | Ledger/Kernel |
| WR29 | Engine journey of WR26 continued: the fresh round reviewing directed P2 | its binding's prior context names the recorded direction, and its rendered prompt holds the exact direction text read in its own scope (not `not_found`); its instructions name human directions; unavailable direction bytes fall back to WR22's full review, never a guessed direction | Engine/Ledger render |
| WR27 | Human cancels a Watchdog while its own check runtime runs (parked at `before-review-check`) | the owned check container is stopped before quiescence: once the round is `canceled` with `executing:false`, `docker inspect` reports it not running and no checks receipt is retained; a failed or unconfirmed stop leaves a visible `watchdog_check_quiescence_unconfirmed` blocker and keeps the slot (inspection only: no fault injection makes a Docker stop fail) | Engine/Sandboxes/Ledger |

Unsafe controls (must fail on their own assertion):

- `watchdog-count-resets-per-pass`: counting only the current pass's reviews lets WR11's third non-pass return automatically.
- `watchdog-drift-exempt`: qualification ignoring the target lets WR15's stale passing review qualify.
- `watchdog-changed-source-passes`: a `source_changed` receipt accepted as passing evidence (WR07).
- `watchdog-source-edit`: a Watchdog round given the `implementation_*` source-writing tools (WR09/WR19).
- `watchdog-resume-abandons-check-runtime`: recovery resumes an interrupted round without stopping its check runtime (WR17).
- `watchdog-successor-blind`: a rework successor not given the cited report lets WR25 start without its findings.
- `watchdog-direction-bypass`: a `human-direction` return admitted without a recorded human direction (WR26).
- `watchdog-direction-unbound`: a `human-direction` return below the cap admitted without its recorded direction (WR28).
- `watchdog-reviewer-direction-blind`: the next round's prior context omits the human direction (WR29).
- `watchdog-cancel-abandons-check-runtime`: cancellation records quiescence without stopping the check runtime (WR27).

Scripted provider fixtures exercise lifecycle and literal bytes, not semantic review quality. Canonical CAS/integration,
readiness and publication are later Slices: `awaiting_integration` is a visible capability gap, not a qualification.
Run narratives and raw output belong outside the source tree.
