# Review: runtime instruction tools amendment

Reviewer selector: `claude-opus-5-5`. Goal under review: let a workflow define native agent tools for instructions needed during a run, next to the core execution skill. The amendment is documentation only.

## Verdict

The amendment is sound with two corrections. It does let workflows own their tools. The catalogue lists name, description asset, schemas, handler or handler factory, and callers (`runtime-instruction-tools.md`, "Workflows own their tools"). The README says the same and adds `readonly tools: WorkflowToolCatalogue`. Instruction tools stay read-only for progression. Action tools go through the checked command path. Neither grants authority. The system-section and tool-result split matches Durable 1.4.0. `ToolControl` has only `addTools`, `terminate` and `handoff`, with no section field (`types.d.ts:92-97`). Sections render before each request (`types.d.ts:288-294`).

## Confirmed contradictions

1. **Handoff discards outcome guidance and promotes tool text to user role.** Severity medium-high. The README says "An action tool ... can return the applicable next-step guidance from the accepted result." The current accepted `request_role`, `submit_role_result` and `request_own_stop` set `control.handoff` (`runtime.ts:337-343`). In `generation.js:546-562`, a handoff appends a `ResetEntry` with `head: "self"` and a `role: "user"` message, then ends the run. The tool result therefore leaves active context at once. The handoff string also enters as a user message, which ranks above a tool result. The doc only says handoff must not count as completion or a role change. It should also say three things. Guidance after a handoff transition reaches the next turn through trusted staging. Handoff text belongs to the host adapter, not to workflow handlers. A handoff resets context, so it falls under the mandatory-read refresh rule.

2. **`addTools` changes which tools are enabled as well as which are offered.** Severity medium-low. The doc says deferred offering and `addTools` "affect visibility, not authority." `agent.js:67-84` also appends names to the `tools` enabled array. Render sets an explicit array that leaves out `implementation_*` without `passRef` (`runtime.ts:1231-1233`). One `addTools` could enable those tools. The doc's requirement that the adapter "restrict changes to the already admitted tool set" covers this. Change "visibility" to "enablement and offering."

3. **The nested-caller sentence names the wrong control.** Severity medium. "It cannot be achieved safely by changing `modelTools` alone" implies that nested calls are off by default in Pi. Pi's `callers` defaults to both model and tools (`types.d.ts:258-263`). Only Render's `#identity` refuses calls that did not come from the model (`runtime.ts:3131`, `unsafe_ancestor`). Workflow-owned handlers might not call `#identity`. The adapter should set `callers: ["model"]` by default or route every workflow tool through the model-origin check.

## Challenged and holding

- **Required versus optional reads.** The transport table keeps requirement separate from transport, and the host enforces reads. One gap is small. The doc does not say where required later material goes when staged retrieval is not permitted. The likely answer is the trusted section.
- **Replay and stale bindings.** "Resolve the recorded delivery", "stale binding fails explicitly" and "not exactly-once" match `tool.js:104-110` and the `stale_assignment` check in `#identity`.
- **Compaction.** The claims match the source report (`compaction.js:11,314-349`). Sections re-render after compaction. Tool results are cut to 2,000 characters in the summary. The parent read `types.d.ts` itself. The citations for `tool.js` and `compaction.js` come from `source.md`, and the doc does not claim the parent read them.
- **Resource scope.** No path, project, role or version arguments. Identity comes from the binding. This is consistent.

## Decisions and transcript

The three newest `decisions.tsv` rows are supported by the README diff, the new doc and the pinned `runtime.ts`. The "authority" row's evidence names only `runtime.ts`, but its claim also depends on Durable `types.d.ts`. "Durable1.4.0" is missing a space. I did not verify the claim in row 1 that staged retrieval "had been implicit". The user turn (entry `6bb210d5`) asked to consider tools on top of the design. The assistant restated the goal and kept the work design-only. Its summary (`977eb7e6`) matches the doc. I found no unsupported claim in this task's turns.

## No-comments check

Pass. The added `tools` field and the Mermaid block contain no comments.

## Attention flags

- Contradiction 1 changes a README sentence and the doc's action-tool section. Fix it before publication.
- Contradictions 2 and 3 need one wording fix each.

## Coverage limits

- I reviewed only `runtime-instruction-tools.md`, the README interface and tool paragraphs, `source.md`, the three newest `decisions.tsv` rows and the transcript from entry `6bb210d5` onward.
- I did not review CONTEXT.md, execution-skills.md or revision-2.md.
- I did not validate diagrams, links or line anchors in GitHub URLs.
- I did not check whether Durable re-renders sections after a handoff reset.
- Nothing was executed.
