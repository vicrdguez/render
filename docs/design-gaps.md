# Render v1 design gaps

Gaps found while implementing the remaining render-v1 Slices. Each entry is outside what the Contracts require. The shipped behavior fulfils the Contract without it, and the gap is kept here for separate design.

Each entry names the source (spec section, Contract or code), what is missing, what v1 does instead, and the decision it needs.

## G1. Cross-proposal "inclusion" is undefined

- Source: spec §11 (line 1128) and §3 I9; `human-merge-observation` B3.
- Missing: the spec allows a cross-proposal dependency to clear through "separately authorized/reviewed inclusion in the dependent proposal", but no section defines the authorization command, the Effects source operation that brings the prerequisite's commit into the dependent target, or the review point. Dependencies today are same-intake only (`src/kernel/intake.ts`).
- v1 behavior (operator decision): cross-proposal and main-delivery edges clear only on an observed human main merge. Inclusion reports as an unavailable capability that blocks visibly.
- Needs: a design for inclusion and for cross-workflow fact visibility under workflow-scoped device enrollment.

## G2. Machine GitHub identity provisioning

- Source: spec §9.3; `github-publication` A1.
- Missing: the spec leaves the credential type to operator provisioning.
- v1 behavior: one token from trusted host configuration, readable only by Effects and never by agents. Whose token it is remains the operator's choice. Render has no merge operation, so an observed merge to main is the human's and needs no actor-identity machinery. Render is single-user on a private Tailscale network.
- Needs: a decision on a separate bot identity or GitHub App only if Render becomes multi-user or reachable from outside the tailnet.

## G3. Duplicate proposal PR closure

- Source: `github-publication` B5 ("identifies/closes duplicates where applicable") against spec §9.2 (four fixed Forge requests) and the Contract's exclusion of arbitrary PR mutation.
- v1 behavior: best effort. Before creating the draft PR, Render looks for an open PR on the proposal branch and reuses it. If a rare race still yields two, Render shows them and the human closes one on GitHub. Forge gains no close request, and Render does not try to make the GitHub API exactly-once.
- Needs: nothing unless duplicates turn out to happen in practice.

## G4. Cancellation does not stop an already-running check

- Source: spec §6.3 (cancellation stops the whole assignment's environment) against `canonical-integration` B2.
- v1 behavior: cancellation fences new preparation, review and admission. A check of the prepared source that is already running finishes, and its result is refused. B2 holds because the fence holds; the cost is wasted compute.
- Needs: a decision on whether to stop in-flight checks early via Sandboxes.stop when a pass is canceled.

## G5. Forge outage is untested for integration

- Source: `canonical-integration` B5 ("Forge outage ... does not block otherwise eligible integration").
- v1 behavior: holds by construction, because integration never calls Forge. The test row is a placeholder.
- Needs: `github-publication` owns an executable outage check once Forge exists.

## G6. Pinned Webfox pulls a vulnerable zod

- Source: `npm audit` on `proposal/render-v1` (present before canonical-integration). `webfox` → `linkup-sdk`/`openai`/`exa-js`/`firecrawl` → `zod <4.6.6`, advisory "Zod can exhaust memory while validating oversized constrained collections". Seven high findings, one chain.
- v1 behavior: unchanged. A1 pins Webfox 4.8.0 "without silent upgrade", and the exposure is web-research responses parsed by these SDKs on a single-user tailnet host.
- Needs: an explicit operator decision to bump Webfox or override zod.

## G7. A Slice waiting behind another integration shows no reason

- Source: `canonical-integration` fix round (PR #65, `d3c71c7`).
- v1 behavior: the second passing Slice of a proposal waits while the first integration resolves, then integrates on its own. The view does not say why it is waiting.
- Needs: a visible "waiting for <slice> integration" reason in the snapshot.

## G8. fsync retry after EIO can report false durability

- Source: `canonical-integration` B3; Linux/macOS fsync semantics after an I/O error.
- v1 behavior: a failed fsync blocks qualification. A later successful fsync retry qualifies, even though the OS may already have dropped the dirty pages from the failed attempt.
- Needs: a decision on whether to treat any EIO on the private store as permanent until a human checks it. Rare on a healthy disk.

## Operator decisions that depart from the spec

- V3 extended crash jobs repeat each named kill point twice, not 100 times (spec §13 V3). The kill points are fixed barriers, so repetitions reach the same state. PR #66.

## Limitations carried from canonical-integration (PR #65)

- L1. V9 acknowledgement p95 measured 187 ms by the owner and 249 to 284 ms on a machine shared with other test runs, against a 250 ms target. Resolved for v1: `test:performance`, which includes the V9 workload, passed inside the final gates on an idle machine (368a5dc and 9916a70).
- L2. The fix round (`eff991a..a9030d4`) was verified by its owner only: gate green, 127/127 unsafe controls, 600 crash recoveries, both original probes. No independent rerun.
- L3. One run of the two-Slice concurrency probe timed out while other Docker tests ran beside it. Not reproduced alone.
- L4. A2 test-first order held only in part: the Engine journeys, crash tests and first controls were written after the product code. The failure-case doc says so.
- L5. T3 ran on the combined proposal: see Final verification below.
- L6. The skl ledger is not updated for this program's Slices, by operator decision. The work is delivered on `proposal/render-v1`.

## From existing-seam-change (PR #67)

- G9. An accepted implementer cannot file a structured escalation report. Discovered facts reach the redesign decision through a human Ground revision and the coordinator's Seams request, which satisfies B4's "facts and the required decision are visible".
- L7. No new seeded V1 schedules for the Seams blocking rule. ES04 exercises it directly; the existing intake orderings stay in `kernel-authority-schedules`.
- L8. The ≤2-minute human handover trial has not been run. It stays a human-only trial.

## From record-baseline (PR #68)

- G10. v1 has no workflow archive command, so supersession is the only Record retirement path. B4's archived-history retention holds for supersession.
- L9. The Kernel does not check that a design document was "expressly requested" or that output files exist. Fidelity review, Audit and Watchdog judge that.
- L10. There is no Engine/Docker Record journey, and V8 full and shortened journeys are not extended with a Record Slice. Record and integration edges share one qualification path, covered by CI15 and the V1 schedules.
- L11. A deleted fidelity entry is reported as `content_corrupt`, not `missing_content`, as the Ledger already classifies missing role inputs. It still blocks by exact ref.
- L12. Blocking ready promotion on unfinished Record work is left to `automatic-readiness`, since this build had no Forge.

## From performance-journey (PR #69)

- L13. No actual Linux run of a performance project workload. Comparisons are proven at the Ledger with scripted receipts; existing Linux receipt tests cover literal measurement retention.
- G11. The implementer's handoff is not checked against the performance target. Only the Watchdog's own measurement is, and integration requires that pass.
- G12. Controls written in the performance Ground are retained but not machine-checked. Platform, image, workload catalog line and check definitions are compared.
- L14. The live judgment trial and the ≤2-minute handover trial are human-only and not run.

## From verification-maintenance (PR #70)

- G13. Drift-versus-regression judgment is the model's (spec §8.2 step 5). The Kernel checks only the structure and evidence behind a classification.
- G14. Only the verification asset and its journey files can be corrected under maintenance. Drift in other harness files needs ordinary accepted work.
- G15. Ranks and Doctor section edits are not compared against the earlier classification. Row additions and removals are refused.
- L15. Cumulative execution evidence and live judgment quality are not verified for maintenance.

## From bug-journey (PR #72)

- G16. The workflow handover blocker does not show the `not-reproduced` reason. It is in the tool reply, the pass snapshot and the stored receipt.
- G17. A human ruling on an unresolved reproduction gap goes through Contract amend or supersede. There is no dedicated command.
- G18. "Red on the bug" is a literal match of the observed text in a failing check's output. A check that prints that text on a setup failure would count as red, so Audit and Watchdog judge adequacy.
- L16. Shared implementation fixtures moved from bug shape to change shape, which reduces bug-shaped Watchdog and integration composition coverage. BJ13 to BJ16 cover bug Audit and preparation.
- L17. The engine test fixture's 30 s waits can time out on a loaded machine.

## From github-publication (PR #73)

- G19. A rejected create other than "draft unsupported" stays rejected. There is no command to stage it again.
- G20. Remote divergence clears only when the remote returns to canonical history, and since PR #76 Render notices that only on the next integration or host restart, not by polling GitHub. There is no overwrite command, by B2's "never imports remote content".
- G21. An unknown summary update is not read back from GitHub. The next head replaces it.
- L18. No hard-kill crash test between forge admission and send, although the verification strategy names V3 admission, dispatch and reply crashes. Restart is covered by reopening the Ledger.
- L19. While an unknown create waits for a listing, Engine records one observation per retry interval.

## From automatic-readiness (PR #74)

- G22. (Resolved by the #74 fix round: a stale summary is restaged on the next reconcile.)
- G23. GitHub Enterprise's GraphQL mark-ready path is not handled.
- G24. A rejected promotion is not retried, and a PR a human moves back to draft is not promoted again.
- L20. An Engine restart mid-promotion is tested only through reopening the Ledger.
- L21. The merge package lists record references rather than the findings themselves.

## Gate observations under load

- L22. Per-slice gates ran on a machine shared with up to eight agents. #67's gate failed one protocol-experiments wait and #68's gate failed WR17, a Watchdog restart wait, in code neither PR touched. Neither failure recurred in the final gates on the combined proposal.

## From human-merge-observation (PR #75)

- G25. Cross-proposal inclusion is not built (operator decision G1). A request for it is refused as `capability_unavailable`.
- G26. No cycle check across proposals. A missing prerequisite proposal or Slice stays blocked.
- G27. Cross-proposal edges are not redirected when a prerequisite is superseded. A human amends the edge.
- G28. A merged duplicate PR that is not the associated one is ignored.
- G29. The live change stream does not push a dependent proposal's update when its prerequisite merges. Snapshots are correct.
- G30. A forge that reports no merge-observation capability is not gated. GitHub reports it.
- L23. The V8 handover check for merge observation is a Ledger snapshot, not a two-process journey. The 2-minute human trial is not run.

## From the final review of the combined proposal

- L24. The full design-shape V8 journey is not runnable end to end. Pieces exist (`test/intake-retention.test.ts` F4, `test/local-verification-prompt.test.ts`, `test/experiment-journey.integration.ts`). The shortened change-shape journey runs end to end through publication, ready promotion and the observed human merge (`test/github-publication.integration.ts` GP-E1, AR-E1, HM-E1). Bug (L16) and performance (L13) journeys are partial.
- L25. `github-publication` added some V1 matrix cases after the product code; its failure-case doc says so. Process deviation from A2, like L4.

## Final verification of the combined proposal

- `368a5dc` (all ten Slices): `verify:gate` passed in 843 s, `test:extended` (crash jobs at 2 repetitions) passed in 375 s, `verify:v9-budgets` passed. `verify:unsafe-controls` stopped at a control made stale by the merges.
- Final-review fixes, PR #76: the post-merge GitHub read loop, the coordinator's bug and first-asset intake keys, and stale docs.
- `9916a70` (PR #77, two stale controls repointed): `verify:unsafe-controls` detected 166 of 166, and `verify:gate` passed in 830 s.
