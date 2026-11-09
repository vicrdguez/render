# Workflow-owned execution skills and host-wide project storage

Status is a completed proposed revision for review. This revision responds to the user's instruction-rendering clarification and [issue #59](https://github.com/vicrdguez/render/issues/59). It changes the proposed design only. It does not change implementation, accepted specifications, Contracts, or live data.

## Goal

Model a workflow as the owner of its roles, procedures, reusable guidance, deterministic task preparation, and rendered execution skills. Separate that definition from project knowledge. Use one authoritative host database with logical project isolation and explicit knowledge sharing unless source evidence establishes a reason to choose otherwise.

## Investigation checklist

- [x] Route through the **how** skill. For motivation questions, also route through the **why** skill.
- [x] Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
- [x] Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
- [x] Apply the **unslop** skill to the reply.

throughput checkpoint: n/a, read-only investigation

skip: the conditional why route was not used. This task asks for a redesigned model and tradeoff recommendation, not a historical motivation investigation. The how route was completed.

## Coverage

| Slice | Evidence and expected result |
| --- | --- |
| Issue intent | Read issue #59 in full, including its content-format, principles, preview, provenance, evaluation, and amendment requirements. |
| Current instruction path | Trace retained inputs, inline prose, roles, provider context, continuation, and existing test seams. |
| Host storage | Trace actual database and Durable record scoping, plus project identity and authorization implications. |
| Prior art | Read the linked `skl` prose model and composition code at its cited revision. Do not inspect or run `skl` tests. |
| Revised domain | Distinguish workflow definition, run, procedure, craft, project guidance, resolved task, execution skill, and effective provider context. |
| Alternatives | Compare renderer ownership, authoring formats, and database placement. Keep product preferences separate from unrun behavioral questions. |
| Independent challenge | Review the proposed responsibility split, required-content handling, sharing semantics, and shared-host compatibility gates. |
| Handoff | Validate the saved artifacts and publish a documentation-only update to the existing design branch. |

## Fixed sources

- Issue #59 was read in full. Its retrieved `updatedAt` is `2026-11-05T09:10:38Z`. It had no comments when read.
- Current `proposal/render-v1` is `eea2a7cb047f55683c4bf83658315b41129be62a` for this revision.
- PR #79 is merged. Its recorded head is `2519fd22013aa179f1848fd560affa96db60279b`. The old design's Effect-pilot snapshot remains historical evidence.
- Linked `skl` prose sources are at `480179ce60db591a62562a94b27bf35a32b7505f`.
- The existing design branch starts at `1b800cb00f3d0826967fd2a1c2d5bdd0375b2499`.

## Principles shaping the revision

- Model the Domain separates workflow-owned procedures and craft from project knowledge and from an assignment's rendered result.
- Redesign from First Principles replaces the one-project-per-store premise rather than patching sharing around it.
- Boundary Discipline keeps authenticated facts, grants, and effect admission outside authored prose.
- Type System Discipline distinguishes workflow meaning, content revisions, project scope, and assignment basis in the interface sketches.
- Make Operations Idempotent keeps creation retries tied to the original request and resolved defaults, before current defaults are reconsidered.
- Separate Before Serializing Shared State gives each reader and reviewer an independent report and leaves only the parent writing the design branch.
- Laziness Protocol requires comparison against ordinary authored files and explicit code composition before adding a language or compiler.
- Prove It Works distinguishes source inspection, document checks, proposed evaluations, and actual model-execution evidence.

## Design synthesis

Two source explorers used the configured `gpt-6.1-terra` selector for current rendering and storage. One independent how-explainer used `claude-opus-5-5` to compare rendering seams and synthesize the reports. These calls used high reasoning, one level below the configured xhigh starting budget. The comment-only check used low reasoning. Its completed report reached its turn limit; it is input to this design, not a runtime verdict. The parent read it in full and wrote the proposal.

The shared-composition seam is the main agreement. The workflow owns selection and content. The host reuses mechanical composition and provenance without acquiring workflow policy. The storage recommendation follows the user's clarified host model and the current shared-session source, not an assumption that file count defines authority.

The parent rejected or refined these consultant suggestions.

| Suggestion | Disposition and reason |
| --- | --- |
| Reuse the first rendered bytes for every continuation forever. | Reject. Current continuation gains accepted child results and other legitimate facts. Pin authored sources, but retain a new skill revision when the authorized basis changes. |
| Treat reusable craft as universally Render-owned. | Refine. Each workflow owns or explicitly imports its craft. pstack and a financial workflow need not inherit development Testing prose. |
| Claim metadata makes principle relevance complete and deterministic. | Reject. Metadata can resolve declared applicability and citations. Semantic relevance and completeness still require judgment. |
| Require all statements inline as a new universal condition. | Reject strengthening. Preserve required inclusion and the accepted explicit blockage or staged-read policy. |
| Treat a render preview as the entire provider context. | Reject. Inspect the exact skill and separately correlate real context, runtime instructions, tools, history, and refresh. |
| Keep a permanent project-wide implementation digest gate. | Supersede. Separate selected workflow meaning, compatible instruction releases, and exact execution provenance. Existing-project meaning migration is still excluded. |

## Decisions and verification

The append-only [decision trail](decisions.tsv) records changes to the original proposal. The current documents are [README.md](README.md), [execution-skills.md](execution-skills.md), [storage-and-knowledge.md](storage-and-knowledge.md), and the proposed [glossary](CONTEXT.md). The [source register and issue matrix](sources/revision-2.md) map the requirements to those documents.

Fresh adversarial review is complete. The [review dispositions](reviews/revision-2.md) preserve findings, corrections, and remaining attention. The parent reproduced the source and text probes before accepting corrections. A final [scoped confirmation](reviews/revision-2-confirmation.md), using `gpt-6.1-terra` with medium reasoning, found no confirmed contradiction in the specified corrections. Wording-only follow-ups were checked by the parent, not another full model review.

The final artifact check covers the saved diagrams, links, citations, captured issue, scope of changed files, and preservation of existing edits. Its recorded result follows below.

The decision rows are records of design choices, not independent behavioral evidence. Issue #59 and the current source register provide the external requirements and observations behind them. No product tests, live database probes, model format comparisons, or implementation work have run.

## Final artifact verification

The current proposal's SHA-256 is `1edbb45811bd6c8dd67b2135670674aeeff095fb665c81cb4950f54ca6556ffb`.

- All eight diagrams in the current main, execution-skill, and storage documents parsed with Mermaid 11.17.2. All 21 diagrams including historical alternatives parsed. This is syntax validation, not visual-layout review.
- All 56 distinct pinned Render and `skl` source citations resolved with valid line ranges. The first pass caught one overlong current catalogue citation; it was corrected before the final pass.
- All 61 relative links and heading anchors resolved.
- The saved issue #59 body and comments matched the retrieved source exactly. Its extra fields identify source and capture time.
- Markdown fences, whitespace, long-dash checks, TSV structure, and `git diff --check` passed.
- The observed fingerprints of all nine pre-existing tracked edits in the original working tree remained unchanged.

The draft stays documentation-only. The new JSON file is an issue evidence snapshot, not executable code or product configuration. No accepted specification or Contract was changed. Publication updates the existing design branch rather than merge product work or close issue #59.
