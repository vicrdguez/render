# GitHub publication failure cases

Acceptance oracles for the `github-publication` Slice. They are requirements, not run results. Behavior rules B1–B6
and commitments A1–A3 are the Slice Contract's; spec §3 I10/I16/I17, §§9.1–9.3, §10, §11 (Forge outage, unknown create)
and §13 V3/V6 navigate them. Operator decisions (design gaps G2, G3, G5): one GitHub token from trusted host
configuration, readable only by Effects; Render never merges main; before creating the draft PR Render reuses an open
PR on the proposal branch, and a rare second PR is shown for the human to close (Forge has no close request).

Chronology, kept as it happened: GP01–GP16, G5, GF01–GF07 and GP-E1 were written and failed (`capability_unavailable`,
unknown Effects operations) before the first product change. Afterwards three test-only corrections followed: GF03 selected
Git-transport POSTs as the create request (now narrowed to the pulls endpoint), four assertions gained their own messages so
each unsafe control is detected by its intended assertion, and the V1 literal command matrix gained the five new commands.

## Interface these cases name (new in this Slice)

Publication is proposal-scoped state on the workflow. Kernel derives every payload from current state; the caller
names only the kind. Only host Effects (`source-effect`) stages, admits or records; only a human authorizes a reissue or
resolves a risk.

- `stageForgeOperation {kind}`: `publish-source` (intent `{schema:1, kind, proposal, canonical, expected}`: canonical is
  the latest qualified R, expected the last observed published head, `null` when absent), `create-proposal` (intent
  `{schema:1, kind, proposal, marker, title, head, body}`: marker `render-proposal:<workflow>:<operation>`, head the
  published commit, body the marker comment plus the host-owned summary) or `update-summary` (intent
  `{schema:1, kind, proposal, pr, canonical, published, summary}`). Retained as `forge-intent/<sequence>`; `planned`.
- `admitForgeOperation {operation}`: commits attempt `forge-attempt:<sequence>` bound to the current executorEpoch.
- `recordForgeObservation {text}`: the closed observation `{schema:1, operation, attempt, mode, outcome, reason,
  created, head, proposals, capabilities, observedAt}`; `mode` `dispatch` (outcome `applied|rejected|unknown`, only the
  admitting epoch) or `reconcile` (outcome `null`); `head` `{commit}` or `null` when unobserved; `proposals`
  `{complete, items:[{id, state, draft, head, marker, actor}]}` or `null`; `capabilities` the seven §9.2 booleans or
  `null`. Retained as `forge-observation/<sequence>`.
- Human `authorizeForgeReissue {operation}` and `resolveForgeRisk {operation, pr, text}`.
- Effects: `perform({type:"publish"|"createProposal"|"updateSummary", ..., attempt})` and
  `reconcile({type:"publication", repository, proposal})` through the internal Forge (GitHub adapter over Node fetch and
  trusted Git push with an expected-old lease). Opaque PR ids are `github:pr:<number>:<node_id>`; domain code never parses
  them.
- Workflow view `publication`: `{status, canonical, published, divergence, association, duplicates, risk, unsupported,
  operations, blocked, choices}`.

## Cases

| Case | Rule | Trigger | Literal expected outcome | Seam |
|---|---|---|---|---|
| GP01 | A1 | stage/admit/record by local admin, scheduling host or assignment agent; reissue/resolve by host Effects or agent | `forbidden_principal`; nothing retained | Ledger/Kernel |
| GP02 | B3 | `stageForgeOperation publish-source` before any qualifying integration | `stale_basis`; view `status:"awaiting-integration"`, `canonical:null` | Kernel |
| GP03 | B2 | after R1 qualifies: reconcile observes head absent; stage publish | intent `{canonical:R1, expected:null}`; dispatch `applied` with head R1 → op `applied`, view `published:R1`, `status:"published"` | Ledger/Kernel |
| GP04 | B2 | remote head observed as a commit outside the canonical lineage | view `divergence:{head, canonical}`, `status:"blocked"`; stage publish `stale_basis`; next Slice stages, admits and qualifies its integration and the dependent `assignTask` is accepted | Ledger/Kernel |
| GP05 | B3 | stage create before the head is published | `stale_basis` | Kernel |
| GP06 | B3/G3 | create staged; second create stage | first `planned` with marker `render-proposal:workflow:2:<op>` and body naming outcome, integrated scope, canonical/published mapping, evidence, remaining work and advisory checks; second `role_already_requested` | Kernel |
| GP07 | G3 | admit create with no pre-create listing; listing with one open PR on the branch; listing with two | `stale_basis`; one: association `{pr, by:"reused"}`, op `applied`, no attempt; two: `duplicates` both ids, admission `stale_basis` | Kernel |
| GP08 | B3 | R2 qualifies after association; publish R2; stage summary twice before admission | create count stays 1; first summary `superseded`, second `planned` with `pr` = associated id and `canonical:R2` | Kernel |
| GP09 | B4 | admitted create; dispatch `unknown`; admit it again | op `unknown`; admission `stale_basis`; one attempt | Kernel |
| GP10 | B4 | reopen; reconcile with complete zero items, incomplete items, one item with another marker | op stays `unknown` each time; `association:null`; view choices include `recheck` and `authorizeForgeReissue` | Ledger |
| GP11 | B4 | reconcile with one verified item (own marker, actor) | association `{by:"reconciled"}`, op `applied` | Kernel |
| GP12 | B4 | reconcile with two verified items | `duplicates` both, op `unknown`, no association | Kernel |
| GP13 | B5 | human reissue on unknown create; admit; dispatch `applied` with created id; reconcile with one verified item | second attempt; `risk.attempts` both attempt ids; no association after either; summary stage `stale_basis`; next Slice integration still qualifies | Ledger/Kernel |
| GP14 | B5 | `resolveForgeRisk` naming an unseen id; then a seen id | `stale_basis`; then association `{by:"resolved"}`, `duplicates` the other ids, `risk.resolved` with statement ref and both attempts | Kernel |
| GP15 | B6 | summary dispatch `unknown` | op `unknown`; view keeps `published` and `canonical` local facts, `status` reports the uncertain summary; reopen and export keep every intent and observation | Ledger |
| GP16 | B1 | observation capabilities `draftProposalPR:false`; create dispatch `rejected` reason `draft-unsupported` | create stage `capability_unavailable`; rejected create → `unsupported:["draftProposalPR"]`, no further create | Kernel |
| GF01 | B1 | GitHub adapter capabilities and first reconcile against the fake | literal capabilities; head `null`; proposals `{complete:true, items:[]}`; `observedAt` ISO | Effects |
| GF02 | B2 | publish R with expected `null`, then R2 expected R; remote moved to F, publish R3 expected R2 | `applied`, remote head R then R2; third `rejected` reason `stale-expected`, remote still F, observation head F | Effects |
| GF03 | B3/B1 | create draft; fake answers 422 draft unsupported | POST carries `draft:true`, marker and summary section; `applied` with `github:pr:` id; unsupported → `rejected` `draft-unsupported`, no non-draft POST | Effects |
| GF04 | B4 | fake applies create but drops the reply, listing lags; same attempt dispatched twice | `unknown`; listing complete with zero items; second dispatch throws before any request; after lag the item has the marker and `actor:true`; POST count 1 | Effects |
| GF05 | B1 | 101 PRs, second page 500 | `proposals.complete:false` | Effects |
| GF06 | B6 | summary update with human text outside the host section; reply dropped | only the host section changes; dropped reply → `unknown` | Effects |
| GF07 | A1/G2 | every request | REST and Git requests carry the token; no observation or error contains it | Effects |
| GP-E1 | B3/B4/G5 | Engine journey: first integration with the fake dropping the create reply and lagging the listing; forge down while the dependent Slice integrates; forge back | exactly one POST; association by reconciliation; dependent assigned and integrated during the outage while view says `lagging`; recovery pushes the new head and PATCHes the same PR summary | Engine/Effects/Ledger (Docker) |

## Unsafe controls (must fail on their own assertion)

- `publication-retries-unknown-create`: admission accepts an `unknown` create (GP09).
- `publication-negative-listing-absent`: a complete empty listing re-plans the unknown create (GP10).
- `publication-transient-listing-clears-risk`: a unique verified listing associates despite sticky risk (GP13).
- `publication-overwrites-divergence`: publish ignores divergence and stages over a foreign head (GP04).
- `publication-blind-push`: the push omits the expected-old lease (GF02).
- `publication-non-draft-fallback`: draft-unsupported retries without `draft` (GF03).

Scripted Watchdog verdicts and the fake GitHub are fixture data. No live GitHub call is made or authorized. Ready
promotion (`markProposalReady`) and main-merge observation belong to later Slices. Run narratives and raw output stay
outside the source tree.
