# Post-correction review of the pluggable kernel design

Goal. The user wants a persisted Mermaid design for pluggable Render kernels that are selected only for new projects, with no implementation changes. This review checks narrowly whether the six documented corrections cohere. Reviewer selector is the configured `claude-opus-5-5`.

## Verdict

No remaining verified document contradiction within this correction scope.

## Checks

1. **Project-scoped ER cardinality.** Checked the README `erDiagram` structurally. `PROJECT ||--o{` owns KERNEL_STATE, RETAINED_RECORD, OPERATION and RECEIPT. `WORKFLOW |o--o{` gives state and retained records zero or one workflow. EXECUTION alone requires a workflow. OPERATION has no execution edge. This matches the dispositions row and the `ProjectScope | WorkflowScope` sketch.
2. **Base state before read planning.** The extension interface bullet, the sequence diagram ("preload base state" before "Plan additional retained reads") and implementation step 3 agree. `needs` has one bounded round, and basis comparison follows resolution.
3. **KernelInput union.** Three variants. Host-owned codecs decode notices and requests. "Trusted adapters mint these host inputs" agrees with the execution section's "Reserved host routes".
4. **Matching authorization outputs.** `work.rebind` pairs with `AuthorizeRebind` and `operation.admit` pairs with `AuthorizeOperation`. Each is valid only for its preflighted request. The execution section and the rebind gate repeat the same rule.
5. **Host-only path.** "without calling `decide`" in the text agrees with the separate `alt` branch and step 3. Source check confirmed. In v1 `src/kernel/kernel.ts`, `enrollDevice`, `revokeDevice` and `recordStartup` sit in the kernel catalogue (lines 230, 231, 272) with handlers at 450 to 469. That supports S9's extraction claim.
6. **Fail-stop.** The README, the failure-trace row, the decision defaults, `decisions.tsv` (simplify row) and the dispositions all claim no quarantine and no automatic restart. Source check confirmed that v1 `Ledger.command` (`src/ledger/ledger.ts` lines 289 to 298) sends any non-`Abort` throw inside the commit to `#fail`, and from there to `onFatal` in `src/host/main.ts`, which exits.

**Observation and notice story.** The observation commits in a host transaction before any kernel call. Notice refusal "cannot erase the fact or authorize dependent work". Dependent work needs a kernel acceptance or a matching authorization output. I found no path that grants authority or discards the observation.

**Trail.** `decisions.tsv` now has defaults, trust, legacy-scope, review and simplify rows. `research.md` and `comparison.md` both state that the cross-judge preferred Opus over the parent's Sol choice.

## Operator attention

- **The existing fatal path mislabels defects.** This is source-observed. v1 answers any non-`Abort` throw with `outcome_unknown`, says "Storage failed", and tells the client to retry the same command ID. The design separates defects from storage uncertainty but does not specify a defect reply. Implementation must add one, or clients will retry a deterministic defect.
- **A deterministic defect can trap a project.** This is inferred. A defect while handling a staged notice task recurs on every restart. Swapping in patched code changes the digest, which blocks writes under exact pinning. With no quarantine and no upgrade policy, such a project ends up crash-looping or read-only. The cross-judge's semantic-compatibility preference bears directly on this case.
- **`operation.admit` has no defined base workflow.** OPERATION has no workflow edge, so "the envelope's target workflow cells" is undefined for admission. The kernel must use `ReadAdditionalScopedState`. This is underspecified, not contradictory.
- **"Progression blocker" storage is unstated.** A refused notice accepts nothing, so the blocker presumably comes from durable task outcome state. Clearing it is unspecified.
- **Research checklist.** "Verify" is still unchecked in `research.md`.

## Coverage limit

I read the README, `reviews/README.md`, `decisions.tsv` and `research.md` in full. I grepped `comparison.md` and `sources.md` S9, and spot-checked v1 `kernel.ts`, `ledger.ts` and `main.ts`. I did not read `ledger.md`, `runtime.md`, the alternatives or the Effect snapshot. Mermaid parsing and link checks are left to the parent. I read no principle leaf skills, so I cite none.
