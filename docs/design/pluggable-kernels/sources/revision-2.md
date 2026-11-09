# Revision 2 source register and issue coverage

This register separates observed sources from the proposed workflow and project model. Earlier citations in [sources.md](../sources.md) describe revision 1's snapshots and remain historical.

## Fixed sources

| Label | Source | Identity and scope |
| --- | --- | --- |
| R2 | [Current proposal](https://github.com/vicrdguez/render/pull/32). | `eea2a7cb047f55683c4bf83658315b41129be62a`. Exported for read-only inspection. |
| I59 | [Issue #59](https://github.com/vicrdguez/render/issues/59). | Body retrieved with `updatedAt` `2026-11-05T09:10:38Z`, with no comments. Complete [captured JSON](issue-59.json) preserves the source text and capture time. |
| SKL | Linked prose prior art. | `480179ce60db591a62562a94b27bf35a32b7505f`. Only the prose model, composition code, and Implement body were read. No `skl` tests were inspected or run. |
| WIP | Sampled project work. | `f7aba19314d312416a882fc6215f3de7f5fd5224`, committed `usable/projects` work, not merged project tenancy. The remote branch later pointed to `9c61234f42250619062e92766ca795d9f818e7cc`; that later tree was not inspected for this report. |

PR #79 is now merged. Its recorded head is `2519fd22013aa179f1848fd560affa96db60279b`. The original pilot snapshot is not the current source baseline. The current package still pins Effect 4.1.2 and Durable 1.4.0.

Six critical exported files were checked against their R2 Git blob identities. The source readers' PASS labels mean source access and trace completion, not passing product tests.

## Current rendering and content ownership

The [role contract](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/kernel/roles.ts#L55-L91) defines a fixed role vocabulary and packet fields including instructions and principles references. [Packet reference collection](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/kernel/roles.ts#L313-L327) loads selected references. Those fields are not evidence of automatic principle discovery, complete relevance selection, or named-citation resolution.

[Engine rendering](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/engine/runtime.ts#L1233-L1412) combines retained input resolution, current assignment checks, task facts, and conditional instruction strings. [Configured instructions and tools](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/engine/runtime.ts#L1205-L1227) add another part of the worker context. The [role-packet system section](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/engine/runtime.ts#L704-L716) is a real existing seam, not a new proposed feature.

[Provider admission](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/engine/runtime.ts#L220-L296) checks more than standalone rendered text. It uses current identity, transcript, tools, model, and budgets. The current packet check is containment, not equality of the whole instruction section. [Continuation](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/engine/runtime.ts#L881-L969) consumes child results and preserves assignment lifecycle. Freezing all rendered facts forever would change that behavior. The [accepted refresh policy](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/docs/spec.md#L708-L723) also covers compaction, reset, and authorized model changes.

The [accepted packet and role requirements](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/docs/spec.md#L584-L608) require exact provenance, all project principle statements, relevant full principles, and no silent dropping of mandatory material for budget. The [code-playbook guidance](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/docs/spec.md#L866-L883) excludes a generic v1 DSL or plugin system. The redesign requires approved ownership and scope amendments, not an assertion that the original spec says nothing about rendering.

[Verification authoring craft and catalogue selection](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/engine/catalog.ts#L1-L97) are different kinds of material. One gives reusable authoring guidance. The other selects exact repository checks and evidence expectations.

Relevant tests were located but not executed. They include [missing or oversized required inputs](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/test/role-capability-refusal.test.ts#L20-L72), [constraint refresh after compaction](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/test/native-compaction-history.test.ts#L43-L118), and [fresh replacement versus continuation](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/test/context-continuation-independence.test.ts#L23-L72). Their existence is not proof of prose quality or complete project isolation.

## Current storage and scope

The [record definitions](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/ledger/records.ts#L18-L99) put shared metadata and workflow records in one Durable session. A workflow record has no project field. A Durable session is not a product project; a conversation is not an authorization boundary by itself.

The [command transaction](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/ledger/ledger.ts#L321-L365) rechecks workflow-based device and assignment scope and receipt identity. The [history protocol](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/ledger/history.ts#L25-L156) binds scoped queries and cursors. Project ownership must be added consistently rather than inferred from storage locality.

[Startup](https://github.com/vicrdguez/render/blob/eea2a7cb047f55683c4bf83658315b41129be62a/src/ledger/startup.ts#L61-L160) operates on the shared store and retained definitions before dispatch. Project-local compatibility failure without unsafe execution is a new target to prove, not already established isolation.

The sampled WIP has an explicit [project model](https://github.com/vicrdguez/render/blob/f7aba19314d312416a882fc6215f3de7f5fd5224/src/kernel/projects.ts#L1-L101) and [project storage](https://github.com/vicrdguez/render/blob/f7aba19314d312416a882fc6215f3de7f5fd5224/src/ledger/records.ts#L156-L170). This supports reusing a compatible identity direction. It does not establish complete tenancy, sharing, or merged functionality.

[SQLite's WAL documentation](https://sqlite.org/wal.html) describes reader and writer concurrency, a single writer at a time per database, and the lack of whole-group atomicity across attached WAL databases. Those are architectural properties, not a measured Render performance comparison.

## Prose prior art

The linked [agent prose model](https://github.com/vicrdguez/skills/blob/480179ce60db591a62562a94b27bf35a32b7505f/docs/agent-prose.md#L7-L52) distinguishes procedure from craft and explains explicit composition. The [catalogue and packet builder](https://github.com/vicrdguez/skills/blob/480179ce60db591a62562a94b27bf35a32b7505f/catalog.go#L154-L231) select invocation-specific procedures and reusable craft. The [Implement body](https://github.com/vicrdguez/skills/blob/480179ce60db591a62562a94b27bf35a32b7505f/prose/procedures/implement.md#L1-L77) demonstrates authored prose with bound facts.

This is prior art for locality and composition. Its delivery order is not Render's accepted workflow. No old `skl` procedure or test is adopted as Render's behavioral authority.

## Issue #59 coverage

| Requirement | Revised design location |
| --- | --- |
| Authored prose independent of Engine. | `execution-skills.md`, module interface and authoring alternatives. |
| Procedure, reusable craft, and discoverable composition. | `execution-skills.md`, content examples and explicit catalogue. |
| JSON, Markdown, and structured authoring candidates. | `execution-skills.md`, authoring comparison. |
| Authoring, internal representation, and worker format separated. | `execution-skills.md`, format layers and unrun evaluation. |
| Project principles, statements, full bodies, and Forbidden citations. | `execution-skills.md`, consumer-project principles and failure behavior. |
| Required material not silently dropped for budget. | `execution-skills.md`, validation and explicit blockers or staged reads. |
| Exact source and version provenance across continuation. | `execution-skills.md`, manifests and skill revisions. |
| Preview distinguished from effective provider context. | `execution-skills.md`, preview and admission correlation. |
| Compiler optional; generated output not hand-maintained. | `execution-skills.md`, minimal authoring and packaging choice. |
| Rendered prose cannot grant authority. | Root interface and `storage-and-knowledge.md`, scope and sharing. |
| Behavioral quality not inferred from syntax or snapshots. | `execution-skills.md`, proposed evaluation marked unrun. |
| Accepted-spec and Contract changes explicitly identified. | Root adoption section. No accepted text or Contract was edited. |
| Related #8 and #28 not silently redefined. | Root scope and adoption section. |

## Evidence limits

No product tests, model task evaluations, authoring experiments, runtime extraction probes, or live-ledger operations ran. Source review and document checks can support a pre-design, not establish behavioral quality or working isolation. The JSON capture is external source evidence, not an instruction library or product configuration.
