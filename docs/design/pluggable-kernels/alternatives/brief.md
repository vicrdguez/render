# Design task

The user wants Render to support multiple workflow kernels, with one kernel selected when a NEW project is created. Each kernel can define a genuinely different workflow. Kernel switching for any existing project and hot swapping are excluded. Deliver design and ideation only. No implementation changes, no accepted spec edits, no commits, and no live ledger changes. The final proposal must contain Mermaid diagrams and source-backed reasoning.

## Grounding

Read the three explorer reports in `/tmp/render-kernel-design.d4hjii/reports/`. They partition current kernel/workflow coupling, ledger/recovery, and Effect/project/transport. Original snapshots are `/tmp/render-kernel-design.d4hjii/v1` at PR #32 SHA `3983eacad1be8196d7d67263f03ecdecb9558329`, and `/tmp/render-kernel-design.d4hjii/effect` at PR #79 SHA `994cbfbe9e97fd8443c01dc1d431bb9d0c81066d`. Check specific source sections when a report leaves ambiguity. Do not redo the whole exploration.

The accepted v1 spec explicitly excludes a generic plugin framework. This is a future proposal requested by the user, not a retroactive change to accepted v1 scope. PR #79 is a vertical Effect pilot, not a completed repository-wide migration.

Source findings constrain the design.

- A selector around `change` alone cannot work. Command catalogues, decoding, state, fact resolution, writes, views, Engine roles and task definitions are workflow-specific.
- The host composes one Ledger and one Engine per data directory. `Meta` has no project ID or kernel identity. A workflow lives inside that authority. Do not treat `createWorkflow` as project creation.
- Ledger commits accepted state, immutable records, receipt, handoff and runtime task staging atomically. Current state plus retained records is authoritative. Render's facts are not demonstrated to be a replay-complete event store.
- Ledger owns principal establishment, current authorization checks, sequence/ID allocation, deduplication and visibility. Runtime fences and quiescence remain real requirements. External work has admitted intents and observations, including unresolved outcomes. Plugins cannot gain authority by returning a payload.
- Effect-TS decisions currently run through `Effect.runSync`, which cannot support arbitrary async work inside the decision. `Effect<A,E,never>` does not guarantee synchrony. A trusted deterministic decision contract needs stronger discipline than that type alone.
- The existing workflow's Seams, Modules, Contracts, Audit and Watchdog are product policy with valuable accepted guarantees. Do not call these universal merely because the current kernel has them. Conversely, do not make human attribution, exact basis, source evidence and permissions optional through a generic payload.
- Existing history/export supports a bounded set of records and omission declarations. It is not a backup or a complete event archive. Unknown kernel code must not prevent safe host-level inspection or allow work to run under another default.

## Design requirements

Begin with the data shapes and ownership. Distinguish kernel identity, resolved immutable project binding, workflow instance/state and host-owned execution/authorization facts. Choose the smallest organizing structure that supports real variation.

Produce one coherent recommendation. Consider at least a state transition module with host intents, an Effect-composed plugin bundle, and a declarative workflow graph before choosing. Describe why you reject the others. You may choose a fourth approach when justified. Do not invent a workflow language, migration engine, marketplace, dependency solver, arbitrary plugin SQL, or untrusted-code sandbox without a concrete current need.

The interface is everything authors must know, including ordering, authority, codecs, version support, failure modes and runtime integration. A module hides substantial behavior. A seam is the location where an adapter can change behavior without changing callers. Compare leverage, locality and interface burden, not just method count.

Cover all of these.

1. Host guarantees versus kernel policy. Be explicit about capability issuance, effect admission and who establishes evidence and principals.
2. New-project creation and reopen. State where project identity belongs, atomic binding, default resolution, missing or mismatched implementation, configuration meaning, retries, and safe read-only access. Do not introduce switching or grandfather old stores silently.
3. Concrete TypeScript-like documentation sketches for the extension interface and bounded outputs, clearly unimplemented. If using Effect, explain what belongs in Context/Layer and what must be deterministic or synchronous. Do not return live fibers or capabilities as persisted values.
4. Ledger ownership and record layout using the existing Durable document/entry facilities. Avoid assuming application SQL tables or full event sourcing. Define kernel-private state, host references, atomic intents, schema/read codecs, and unknown-code inspection. Justify any shared entity vocabulary rather than merely renaming Slices.
5. Engine/runtime, task definition versioning, role instructions, external execution and presentation. A plugin author cannot have to fork the Ledger or replace host authority. Define what extension capability remains limited in a first release.
6. Demonstrate two genuinely different workflows. Use the full Render v1 workflow and a smaller investigation-only kernel without proposal integration, Audit or Watchdog. Explain exactly how shared host facilities support both without hardcoding the v1 graph. Do not only draw renamed stages.
7. Explain failure traces for duplicate create/command, stale command, unknown kernel/schema, crash after acceptance before execution, stale worker after restart and uncertain external effect.
8. Provide meaningful alternatives and tradeoffs, open decisions, phased implementation order with verification cases specified before implementation, and explicit non-goals. There is no runtime proof for an unimplemented interface.

Write a reviewable candidate document with a short baseline explanation using Overview, Key Concepts, How It Works, Where Things Live and Gotchas where useful. Include Mermaid diagrams. Keep about 2200 to 3000 words. Use source paths with the correct snapshot SHA and line ranges for current-state claims. Distinguish observed source, design recommendation and unverified assumption. Report PASS, ISSUES or BLOCKED. End with a short rationale listing rejected alternatives and one risk to your own recommendation.

Write only to the output path supplied by the caller. Do not modify shared source, documents, snapshots or other candidates. Read `/Users/vr-osxs/dev/render/.agents/skills/unslop/SKILL.md` and `/Users/vr-osxs/dev/render/.agents/skills/technical-writing/SKILL.md`. Prose uses short sentences, no long dash, and no mid-sentence colon. Code snippets are design only. No implementation code files.
