# Pluggable kernel design research

Status is proposed design, with source review, design comparison, and adversarial corrections complete. Final document checks are recorded below. This is not an accepted implementation contract.

## Goal and scope

Allow each new Render project to select a workflow kernel. Define the kernel extension interface and the ledger responsibilities that make different workflows possible. Changing the kernel of an existing project, including hot-swapping, is out of scope. Implementation code remains unchanged.

The main proposal is [README.md](README.md). It contains Mermaid diagrams and a recommendation with alternatives.

## Investigation checklist

- [x] Route through the **how** skill. For motivation questions, also route through the **why** skill.
- [x] Throughput checkpoint stays one line: `throughput checkpoint: n/a, read-only investigation`.
- [x] Produce the `how`-shaped output (Overview / Key Concepts / How It Works / Where Things Live / Gotchas), or a recommendation with a tradeoffs table if the request is a decision between alternatives.
- [x] Apply the **unslop** skill to the reply.

throughput checkpoint: n/a, read-only investigation

## Source snapshots

- PR [#32](https://github.com/vicrdguez/render/pull/32), `proposal/render-v1`, at `3983eacad1be8196d7d67263f03ecdecb9558329`.
- PR [#79](https://github.com/vicrdguez/render/pull/79), `feature/kernel-effect-pilot`, at `994cbfbe9e97fd8443c01dc1d431bb9d0c81066d`.
- PR #79 describes a vertical Effect pilot, not a completed repository-wide migration.
- The current checkout is `main` and has unrelated edits. This investigation uses separate exported snapshots rather than checking out either branch.

## Design comparison checklist

- [x] Frame.
- [x] Fan out.
- [x] Cross-judge.
- [x] Pick.
- [x] Graft.
- [x] Verify.

The candidates get the same brief and independent output paths. The comparison uses these criteria.

1. Support genuinely different workflows without retaining built-in stage assumptions.
2. Preserve host authority, atomic acceptance, recovery, and explicit effect uncertainty.
3. Minimize what kernel authors and Ledger maintainers must learn or duplicate.
4. Fit the current Durable storage and incoming Effect decision contract.
5. Keep new-project selection and versioned history explicit without adding switching.

The parent read every candidate in full. The cross-judge used a different configured model family from the parent. One candidate used the same selector as the judge. Its disagreement with the parent is preserved in [comparison.md](comparison.md).

## Review plan

1. Trace kernel decisions and workflow assumptions at the PR #32 snapshot.
2. Trace ledger transactions, durable records, authority, and recovery at the PR #32 snapshot.
3. Trace PR #79 changes and the project creation and transport interfaces.
4. Compare independent interface designs against those constraints.
5. Challenge the recommendation for workflow coupling, durability, and Effect integration.
6. Verify citations and Mermaid syntax in the saved documents.

## Coverage matrix

| Slice | Required result |
| --- | --- |
| Kernel and workflow | Current decision interface, workflow-specific assumptions, shared guarantees. |
| Ledger and recovery | Authoritative records, transaction boundary, replay and reconciliation, extension implications. |
| Effect and project entry points | Pilot changes, schema strategy, project creation, transport and client coupling. |
| Competing designs | Concrete interfaces, two different workflows, alternatives, and tradeoffs. |
| Independent challenge | Specific objections and their dispositions, with remaining gaps stated. |

## Comparison and review results

Three source explorers used the configured `gpt-6.1-terra` selector. Independent design candidates used `claude-opus-5-5`, `gpt-6-astra`, and `gpt-6.1-sol`. The cross-judge used a fresh `claude-opus-5-5` agent. All candidates completed.

The parent selected the Sol starting model. The cross-judge preferred Opus. The [comparison](comparison.md) records the rubric, competing rationales, grafts, rejected ideas, and exact-release disagreement. The final proposal is parent-authored, not an agent report passed through unchanged.

Fresh ledger and runtime adversaries found one shared host-input gap and additional ordering, authority-path, scope-diagram, defect-policy, and route-naming ambiguities. The parent reproduced the probes and revised the proposal. [Review dispositions](reviews/README.md) preserve the original reports and explain the corrections. The no-comments pass found no comments in the sketches, so no deletions or suppressions were needed.

The ledger review reached its turn limit after writing its report. The work is a bounded design review, not an exhaustive audit. Model labels identify requested Agent selectors. The ledger report's different self-identification is not treated as verified provider metadata.

## Verification method and limits

- Read the actual saved proposal and support documents.
- Parse every Mermaid block with Mermaid 11.17.2 and a jsdom DOM. This checks syntax, not visual layout or runtime architecture.
- Resolve fixed-commit GitHub source paths against local Git objects and check cited line ranges.
- Check relative links, heading anchors, code fences, and prohibited long-dash characters.
- Compare the observed fingerprints of pre-existing tracked edits. No implementation files or accepted specifications belong to this change.
- Check the decision trail against the active session. Its missing defaults, trust-model, legacy-scope, and correction choices now have rows.

No product tests ran. No live ledger was opened. The small Effect 4.1.2 probe is recorded in [sources.md](sources.md). Neither kernel-free bootstrap nor generic execution extraction was prototyped or proven. The original design phase produced local documentation without a commit or PR. The later branch handoff does not change those evidence limits.

## Final document checks

The final saved proposal has SHA-256 `5752918dcc6e7e1de00eb24a4831337be125f3963f219a9588b23abefeea7215`.

- All six Mermaid diagrams in the proposal parsed. All 19 diagrams including archived alternatives parsed with Mermaid 11.17.2. Visual rendering was not performed.
- All 34 distinct fixed-commit source citations resolved with valid line ranges.
- All 42 local links and heading anchors resolved at the final artifact check.
- Code fences, trailing whitespace, long-dash checks, TSV structure, and `git diff --check` passed.
- The observed fingerprints of all nine pre-existing tracked working-tree edits were unchanged.
- At the original design handoff, the working tree remained on `main`. Only Markdown and the TSV decision trail were added under this design directory. No commit or PR was created in that phase.

A fresh post-correction reviewer found no remaining verified contradiction within its correction scope. Its attention notes prompted explicit defect replies, host-request scope, blocked-notice state, and the requirement for maintenance policy before production. These final clarifications received parent source checks and final artifact checks, not another full model review.

The two feasibility gates remain unproven. Exact pinning can trap a project on a deterministic defect. These are attention items for review and implementation authorization, not checked product capabilities.

## Branch handoff

The publication branch is `docs/pluggable-kernels-design`. It carries only this design dossier over the original `main` commit `fd270d7efa4f377d9bcaa84d92da81817c0059e8`.

Publication uses a separate worktree. The original working tree stays on `main`, with its unrelated edits untouched. No implementation changes, accepted specification changes, PR, or merge are part of this handoff.

Start with `docs/design/pluggable-kernels/README.md` after fetching the branch. The relative links reach the comparison, sources, alternatives, reviews, and decision trail.

## Observed constraints

The three source reviews are complete. All report coupling that a decision-function wrapper would miss. The reports distinguish source observations from design recommendations. No runtime tests ran during source exploration.

- There is no explicit project record in the inspected store model. Project creation must not be confused with `createWorkflow`.
- Current documents and immutable records commit together. Facts are not demonstrated to be a replay-complete event log.
- PR #79 interprets domain decisions synchronously and supplies no kernel service or Layer yet.
- Kernel selection must align decoding, decisions, durable state, runtime execution, and views.
- The accepted v1 specification excludes a generic plugin framework. This proposal is future scope, not a revision to the accepted v1 contract.

## Principles used

The canonical decision trail is [decisions.tsv](decisions.tsv). The following principles explain the design choices, rather than create an additional decision log.

- Laziness Protocol directs the design toward a small extension interface before a workflow language or plugin marketplace.
- Model the Domain and Foundational Thinking direct the proposal to distinguish kernel identity, project binding, workflow state, and host-owned durable work before choosing methods.
- Prove It Works directs verification toward fixed source snapshots, checked citations, and parsed diagrams. There is no claim of runtime proof for an unimplemented design.
- Boundary Discipline places parsing, provenance checks, and capability issuance in host-owned interfaces rather than scattered kernel conditionals.
- Type System Discipline gives project, workflow, evidence, and execution references distinct semantic types in the sketches. Implementation types must derive from the authoritative schemas.
- Make Operations Idempotent makes the creation receipt remember the first resolved default. Retrying creation cannot select a different kernel or create another project.
- Separate Before Serializing Shared State gives every researcher and design candidate its own output file. Only the parent writes this proposal.
- Redesign from First Principles requires the recommendation to account for decoding, persistence, dispatch, and views together, rather than bolt a selector onto `change`.
