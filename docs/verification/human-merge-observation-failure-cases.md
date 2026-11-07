# Human merge observation failure cases

Acceptance oracles for the `human-merge-observation` Slice. They are requirements, not run results. Behavior rules B1–B4
and commitments A1–A4 are the Slice Contract's; spec §3 I9/I10, §§9.2–9.3 and §13 V1/V6/V8 navigate them. Operator
decision G1 (`docs/design-gaps.md`): main-delivery and cross-proposal Dependencies clear only on an observed human merge
to main. Separately authorized or reviewed inclusion is not built; asking for it is a visible `capability_unavailable`.
Render has no merge operation, so a merge the forge reports into main is the human's.

## Interface these cases name (new in this Slice)

- Forge listing items gain `merge`: `{main, commit}` when GitHub reports the PR merged with a merge commit, else `null`.
  `main` is whether the PR's base is the repository's configured main branch; `commit` is the merge commit on it. The
  item's `head` is the source actually merged. Capability `mergeObservation` becomes `true`.
- Publication state gains `main` (`{pr, source, commit, observation}`, set once) and `mainUnknown` (why the latest
  observation of a merged associated PR could not verify main mapping). Only a complete listing whose associated item is
  `merged` with `merge.main` and a head records `main`.
- Publication view gains `main` (`{pr, source, commit, observation, canonical, uncovered}` or `null`) and `mainUnknown`.
  `uncovered` lists the Slices whose qualifying integration the merged source does not contain. While `mainUnknown` is
  set and nothing is recorded, `choices` includes `recheck`.
- Dependency gains the external edge `{slice, requires, kind: "main", workflow}`, declared only by human
  `amendDependencies`: `workflow` is the prerequisite's proposal (its own for a main-delivery edge, another for a
  cross-proposal edge). It clears only when that proposal's recorded `main` covers `requires`. `kind: "inclusion"` is
  refused `capability_unavailable`. Intake manifests keep same-intake edges only.
- A device must have scope over the prerequisite proposal to declare an edge on it. A dependent proposal's view shows the
  edge and whether it blocks, nothing else of the prerequisite proposal.

## Cases

| Case | Rule | Trigger | Literal expected outcome | Seam |
|---|---|---|---|---|
| HM01 | A1 | merged listing recorded by local admin or the implementer agent; main edge amended by host Effects, scheduling host or an agent; a device scoped to workflow:3 declares an edge on workflow:2 | `forbidden_principal` for each; device `forbidden_scope`; view `main:null`, dependencies unchanged | Ledger/Kernel |
| HM02 | B1/B3 | main-delivery edge read-next ← workflow:2/read-fix; read-fix privately qualified as R1 with a passing Watchdog, published, associated, PR not draft and its body says "merged" | `assignTask read-next` `dependency_blocked`; view blocker `dependency_blocked`; then a complete listing with the associated PR `merged`, `merge {main:true, commit:M}`, head R1 → view `main {pr, source:R1, commit:M, canonical:R1, uncovered:[]}` and `assignTask read-next` accepted, with no ready promotion | Ledger/Kernel |
| HM03 | B1/B4 | associated PR `merged` in an incomplete listing; then `merge.main:false`; then `merge:null`; then an open, non-draft PR | `main` stays `null`; `mainUnknown` names each reason; `choices` includes `recheck`; main edge stays `dependency_blocked` | Ledger/Kernel |
| HM04 | B2 | read-next integrates as R2 while R1 is published; the human merges the PR at R1; separately a merge of a head outside canonical lineage | view `main {source:R1, canonical:R2, uncovered:["read-next"]}`; foreign head: `uncovered:["read-fix","read-next"]`; no advisory or human-check gap appears | Ledger/Kernel |
| HM05 | B3 | cross-proposal edge workflow:3/cross ← workflow:2/read-fix; read-fix privately qualified with a passing review; then the merge recorded in workflow:2 | `assignTask cross` in workflow:3 `dependency_blocked` before; accepted after; a workflow:3 device sees its edge and blocker but no workflow:2 commit or PR id; `kind:"inclusion"` amendment `capability_unavailable` | Ledger/Kernel |
| HM06 | B4 | merge observation's reply lost: the same envelope resent; a second complete merge observation with another commit; then an incomplete listing | resend returns the first receipt (`duplicate`); `main` keeps the first `observation` and `commit`; an incomplete listing leaves `main` unchanged; the dependent stays assignable | Ledger |
| HM07 | A2/V8 | reopen the store after HM02; export workflow:2; fresh snapshot | view `main` identical after reopen; export contains the merge observation revision with its literal text; handover fields commitment `accepted`, owner the dependent's assignment, evidence non-empty, `blocker` and `nextHumanAction` present | Ledger |
| HF01 | B1 | fake GitHub: human merges the draft PR into `main` (real Git squash commit); another PR merged into `release`; a closed unmerged PR; an open PR whose body says it merged | items: merged `{state:"merged", head:R1, merge:{main:true, commit:<main head>}}`; `release` merge `main:false`; closed unmerged `merge:null`, state `closed`; open `merge:null`; capabilities `mergeObservation:true`; no observation carries the token | Effects |
| HM-E1 | B1 | GP-E1 journey continues: the human merges the PR on the fake | Engine keeps reconciling the open PR and records `main` with `source` equal to the published head and `commit` the fake's main head; no merge request is ever sent by Render | Engine/Effects/Ledger (Docker) |

## Unsafe controls (must fail on their own assertion)

- `merge-label-integrates`: a merged label in an incomplete or non-main observation records main (HM03).
- `main-edge-clears-on-private-ref`: a main or cross-proposal edge clears on recorded qualifying integration (HM05).
- `merge-older-source-relabels`: an older merged source covers every qualified Slice (HM04).
- `merge-observation-overwrites`: a later observation replaces the recorded mapping (HM06).
- `forge-closed-is-merged`: the adapter reports a closed unmerged PR as merged (HF01).

The fake GitHub and scripted verdicts are fixture data. No live GitHub call is made. Ready promotion is not required.
Run narratives and raw output stay outside the source tree.
