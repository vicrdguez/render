# Automatic readiness failure cases

Acceptance oracles for the `automatic-readiness` Slice. They are requirements, not run results. Behavior rules B1–B5
and commitments A1–A3 are the Slice Contract's; spec §3 I10, §§9.1–9.3, §11 (Forge outage, uncertain ready promotion)
and §13 V1/V3/V6/V8 navigate them. Operator decisions: GitHub is best effort, with no exactly-once machinery beyond the
Contract; the token stays in trusted host configuration, readable only by Effects; Render never merges main.

Chronology, kept as it happened: AR01–AR08 and AF01–AF03 were written, committed and run failing (unknown `mark-ready`
kind, no `readiness` view, no `markReady` operation) before the product change. AR-E1 was committed with them but not run
before the Engine change; it could not pass without the `mark-ready` kind. GF01 and GP16 change only their literal
`markProposalReady` capability, because the GitHub adapter now offers it. After implementation one test-only correction
followed: AR03's first assertion gained its own message so `readiness-ignores-record` is detected by it.

## Interface these cases name (new in this Slice)

- `stageForgeOperation {kind:"mark-ready"}` (host Effects only): intent `{schema:1, kind:"mark-ready", proposal, pr,
  canonical, published}` for the associated PR and the current canonical R, which must equal the published head.
  Refused `stale_basis` with the exact gaps while ineligible, `capability_unavailable` when the forge reported no
  `markProposalReady`, `ownership_conflict` while a promotion on the same canonical basis is planned, admitted or
  unknown, and `stale_basis` when one on that basis is already `applied` or `satisfied`.
- `admitForgeOperation` for a mark-ready needs current eligibility on the op's basis and a reconcile observation, recorded
  after staging, that lists the associated PR open, draft and on the op's canonical head.
- A reconcile observation listing the associated PR open, ready and on the op's head records `satisfied` (no claim that
  the attempt caused it). After an unknown dispatch, a complete listing with the PR still draft on that head records
  `unapplied`; a fresh promotion then needs a new stage (eligibility recomputed) and a new pre-admission observation.
  Marking ready sets a state and creates nothing, so this is the operation-specific safe retry. An incomplete listing,
  a changed head or a closed/merged PR leaves the op `unknown`.
- Effects `perform({type:"markReady", repository, proposal, pr, attempt})` sends GitHub's GraphQL
  `markPullRequestReadyForReview` for the PR's node id: `applied`, `rejected` (GraphQL error or 4xx) or `unknown` (lost
  reply, 5xx). Capabilities report `markProposalReady: true`.
- Workflow view `publication.readiness`: `{eligible, gaps, promotion, observed, package, advisory, uncertain}`.
  `gaps` in order: `<slice>: not yet integrated` or `<slice>: Record not yet integrated` for each accepted Slice without
  recorded qualifying integration of its current Contract; `no qualifying integration`; then
  `divergence: published <head> is outside canonical lineage` or `awaiting publication: <canonical>`; then
  `unresolved duplicate PR risk`, `no associated proposal PR` or `associated PR <id> is <state>`. `promotion` is the
  latest mark-ready `{operation, status, canonical, pr}` or `null`; `observed` is `draft|ready|closed|merged|null` from
  the latest listing of the associated PR; `package` maps each integrated Slice to its pass, Audit A and record,
  handoff B, preparation, prepared tree, Watchdog round and report, integration and R; `uncertain` lists unknown or
  admitted forge operations.
- The host-owned summary gains `- Ready promotion: eligible; the forge ready state is observed separately` or
  `- Ready promotion: not eligible: <gaps joined by "; ">`.

## Cases

| Case | Rule | Trigger | Literal expected outcome | Seam |
|---|---|---|---|---|
| AR01 | A1 | stage `mark-ready` by local admin, scheduling host, implementer agent | `forbidden_principal`; no operation retained | Ledger |
| AR02 | B1 | read-fix qualified R1, published, PR associated; read-next unfinished, then merely passing, then integrated R2, then R2 published | gaps `["read-next: not yet integrated"]` and stage `stale_basis` while unfinished or passing; read-next still integrates; gaps `["awaiting publication: R2"]`; then `eligible:true, gaps:[]`, `blocked` without `ready-promotion` | Ledger/Kernel |
| AR03 | B1 | Record fixture (read-fix is the Record Slice), before and after its integration | gaps `["read-fix: Record not yet integrated", "read-next: not yet integrated", "no qualifying integration"]`; after R1 `["read-next: not yet integrated", "awaiting publication: R1", "no associated proposal PR"]` | Ledger/Kernel |
| AR04 | B2 | eligible at R2 with no local prompt requested; stage; admit; reobserve stale head R1; reobserve draft on R2; admit; second stage; dispatch `applied`; observe ready | summary line `- Ready promotion: eligible; ...`; intent `{schema:1, kind:"mark-ready", proposal, pr:"github:pr:7:n", canonical:R2, published:R2}`; admit `stale_basis` twice; then `forge-attempt:<n>` on the current epoch; second stage `ownership_conflict`; op `applied`; `observed:"ready"`; stage again `stale_basis` | Ledger/Kernel |
| AR05 | B2 | eligible; observation capabilities `markProposalReady:false` | `unsupported` contains `markProposalReady`; stage `capability_unavailable`; readiness `eligible:true`, `promotion:null`, `observed:"draft"` | Kernel |
| AR06 | B3 | admitted promotion; dispatch `unknown`; then a listing with the PR ready on R2 | op `unknown`, status `uncertain`, `uncertain` lists it; then op `satisfied`, `observed:"ready"`, one attempt. Separately: ready on head R1, incomplete listing without the PR, and the PR closed each keep `unknown`; closed adds gap `associated PR github:pr:7:n is closed` | Ledger/Kernel |
| AR07 | B4 | admitted promotion; reopen (new epoch); old dispatch report; readmit; incomplete listing still draft; stage again; complete listing still draft; stage; admit | `stale_executor`; `stale_basis`; op stays `unknown`; `ownership_conflict`; op `unapplied`; new op `planned`; admit `stale_basis` until reobserved; first op has one attempt; one create op; reopen keeps the view; export holds the intents and observations | Ledger |
| AR08 | B5 | pure Kernel: one Slice at R1, promotion admitted; Slice b accepted; b integrates R2; old dispatch `applied`; summary; R2 published and listed ready; stage | gaps `["b: not yet integrated"]`, then `["awaiting publication: R2"]`; old op `applied` with canonical R1 and `observed:"ready"` while ineligible; stage `stale_basis`; summary line `- Ready promotion: not eligible: awaiting publication: R2`; after publication the new op becomes `satisfied` with zero attempts; forge kinds stay `publish-source, create-proposal, update-summary, mark-ready` | Kernel |
| AF01 | B2/A1 | GitHub adapter: capabilities; markReady on a created draft; same attempt again | `markProposalReady:true`; one POST `/graphql` naming `markPullRequestReadyForReview` with `variables {id:"PR_node1"}` and the Bearer token; `{outcome:"applied", reason:null, created:null, head:null}`; listing `draft:false`; second dispatch throws `already consumed`; no result carries the token | Effects |
| AF02 | B3 | fake applies ready then drops the reply | `unknown`; listing `draft:false`; one GraphQL POST | Effects |
| AF03 | B3 | ready on a closed PR | `rejected` reason `graphql: UNPROCESSABLE`; the PR stays closed and draft | Effects |
| AR-E1 | B2/B3/V8 | GP-E1 continued: after recovery both Slices are integrated and R2 published; the fake drops the ready reply | the Engine promotes with no human command: one GraphQL POST, op `unknown` then `satisfied`, the fake PR ready, still one create POST, no merge request | Engine/Effects/Ledger (Docker) |

## Unsafe controls (must fail on their own assertion)

- `readiness-ignores-unfinished-slice`: an unintegrated Slice is not a gap (AR02).
- `readiness-ignores-record`: an unfinished Record Slice is not a gap (AR03).
- `readiness-ignores-publication`: an unpublished canonical head is not a gap (AR02).
- `ready-admits-without-reobservation`: a planned promotion is admitted without the pre-admission observation (AR04).
- `ready-lost-reply-any-ready`: any ready listing satisfies an unknown promotion, whatever its head (AR06).
- `ready-partial-draft-resends`: an incomplete listing that still says draft settles the unknown promotion (AR07).
- `ready-flag-certifies-new-source`: an observed ready PR makes the proposal eligible (AR08).

Scripted Watchdog verdicts and the fake GitHub are fixture data. No live GitHub call is made or authorized. Main-merge
observation belongs to a later Slice. Run narratives and raw output stay outside the source tree.
