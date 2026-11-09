# Review of revision 2 instruction and rendering model

Reviewer selector: claude-opus-5-5 (configured "judgment and prose" role). Read-only. No edits except this file.

**Goal restated.** The user wants a documentation-only redesign where each workflow owns its tailored execution skills, roles, procedures and craft. Project knowledge stays a separate input, isolated within one host database and shareable only by explicit grant. Issue #59 is the detailed requirement.

**Principles applied.** Prove It Works made every finding below carry a rerunnable grep against the docs or the export at eea2a7cb. Build the Lever: the probes are those commands. Guard the Context Window kept the transcript check to user turns and tool-call summaries after line 226.

## Verdict

The model holds up in most areas. Case selection lives in workflow decision code. Guidance stays separate from evidence. Composition is pure. Content release is separate from workflow meaning. Continuation re-renders on a new basis. Preview is kept apart from provider context. I found one real contradiction with the accepted spec, one wording contradiction, and one unsupported checklist claim.

## Proven findings

### F1. Staged reads are dropped in two places (contradiction, medium)

Spec section 6.1 allows visible blockage **or** explicit staged reading. revision-2.md says that policy is preserved. The README readiness flowchart has only a block branch. execution-skills.md validation says oversized required material blocks before dispatch, unconditionally. That is the strengthening revision-2.md says it rejected.

Command (in the docs dir, C=current export):
```
grep -n -o 'inability to fit them ... staged reading' $C/docs/spec.md; grep -n -o -E '<block rule|flowchart edges|disposition>' README.md execution-skills.md revision-2.md
```
Output:
```
590:inability to fit them is visible blockage or explicit staged reading
README.md:160:Ready -->|"No"| Block["Visible preparation or rendering blocker"]
README.md:161:Ready -->|"Yes"| Retain
execution-skills.md:218:Missing or oversized required material blocks before dispatch.
revision-2.md:60:Preserve required inclusion and the accepted explicit blockage or staged-read policy
staged branches in README flowchart: 2 edges, 0 staged
```
Fix direction: add a staged-read outcome to the README flowchart and say "blocks unless explicitly staged under accepted policy" in the validation list.

### F2. storage-and-knowledge.md gives each workflow "rendering" (wording contradiction, low to medium)

execution-skills.md rejects an opaque per-workflow `render(task)` callback and recommends shared pure composition. storage-and-knowledge.md says each definition supplies its own rendering. A reader can take this as the rejected seam.

```
57:Each registered definition supplies its own decisions, roles, procedures, craft composition, rendering, and result contracts
87:Opaque per-workflow `render(task)` callback
90:Recommend the second seam
```
Fix direction: say "render plans and content" instead of "rendering".

### F3. The why-skill checkbox is marked done without evidence (unsupported claim, low)

revision-2.md ticks "Route through the how skill. For motivation questions, also route through the why skill." The transcript never reads the why skill. If the why route did not apply, the checkbox should say so rather than imply it ran.

```
11:[x] Route through the **how** skill. For motivation questions, also route through the **why** skill.
why/SKILL.md reads in transcript: 0
   3 2026-11-09T16:49:18Z	docs/design/pluggable-kernels/execution-skills.md
   2 2026-11-09T16:49:18Z	docs/design/pluggable-kernels/storage-and-knowledge.md
```
The last block also shows that all five new decision rows share one timestamp and cite only the proposal's own files as evidence. They record decisions but give no independent evidence. Only the storage row's "user clarified" matches a transcript turn (user message at line 243).

## Source claims I confirmed

- Provider admission checks containment, not equality: `263:activePacket?.includes(JSON.stringify(a.packet))`.
- sources/issue-59.json has the same body as the captured issue. It adds `capturedAt` and `source`. updatedAt is 2026-11-05T09:10:38Z and comments is empty.
- PR #79 MERGED with head 2519fd22, and proposal head eea2a7cb. Both come from the transcript gh output at line 245.
- `packetRefs` (roles.ts 313-327) loads `principles` and `instructions` refs. Engine.render passes child `results`, so the claim that continuation refreshes facts holds. Current implementer prose asks the model to branch on `implementation.opening`. That supports the doc's case-selection motivation.

## Speculative risks (not proven failures)

1. **Procedure-case authority is spread across three places.** Typed code selects the case. The catalogue owns composition references. A release "declares its supported procedure cases". Nothing says what happens when the selected case is missing from the pinned release. A blocker is the likely intent, but the docs do not state it.
2. **Issue #59 Q3 is only partly answered.** The docs never say whether adding a procedure case under existing mechanics is a content release or a change to workflow meaning. Workflow meaning cannot change for existing projects.
3. **No one is named to judge compatibility.** "Compatibility needs review and representative behavioral evidence", but no role owns that judgment. Product review is flagged for adoption rights only.
4. **prepareTask purity is unclear.** The README says prepareTask "uses actual host facilities". execution-skills.md puts I/O outside the pure functions. The phrase may mean facts about those facilities, but the docs do not say.
5. **"Pinned facts" conflicts with skill revisions.** The README says each prepared assignment pins exact facts. The docs also allow a new skill revision with new facts inside the same assignment. The term needs a revision qualifier.
6. **Model changes on refresh are not covered.** Spec 723 requires refresh or staged reads after a model change. The skill pins model configuration but has no rule for a model change during refresh.
7. **Knowledge relevance has no owner.** Treating unknown relevance as a "preparation obligation" names no role that decides it. Nothing prevents the immutable skill from being retained before relevance is settled.

## Hidden or understated choices

- Subagents ran at thinking "high". The configured roles are xhigh. revision-2.md calls them "configured selector" without the level. The skill's model rules allow one step lower for judgment, so this is acceptable but undisclosed.
- The domain-design consultant hit its turn limit. revision-2.md discloses this.
- Project-admin selection of a compatible release is a proposed permission rule. The README lists it for product review, so it is disclosed.

## Pending, not claimed

revision-2.md correctly says independent challenge and final artifact checks are pending. This review is one of three running challenges (transcript line 300). Its "Produce how-shaped output" and "unslop" checkboxes stay unchecked. No final document check ran in this review.

## Attention flags for the operator

- Fix F1 before publishing. As written, the README contradicts accepted spec 6.1 and the doc's own stated disposition.
- Reword F2. Correct or annotate the F3 checkbox.
- Decide who certifies instruction-release compatibility. Decide whether a new procedure case is a content release or a change of meaning.
- The decision-trail evidence column cites only its own docs. Treat those rows as records of choices, not proof.
