# Runtime and interface adversarial review

The goal is an elegant, Ledger-backed workflow kernel selected only when a new project is created. Existing-project switching is excluded. This review challenges only `docs/design/pluggable-kernels/README.md` and `sources.md`, using the supplied v1 and Effect snapshots.

Throughput checkpoint is not applicable to this read-only investigation. Prove It Works shaped the review by requiring a structural or source probe for the retained finding. No implementation, edits to the design, or subagents were used.

## One verified missing contract

### Medium. The host-to-kernel decision input is unspecified

Affected headings are **The extension interface**, **Execution without a second authority**, and **Ledger layout and transaction contract**.

The document defines kernel commands, command codecs, `needs`, and `decide`. It separately requires reserved host routes for lifecycle notices and trusted observations. It also requires a fresh kernel eligibility decision before external dispatch. It does not specify whether those host inputs belong to the kernel's `Command` type, enter a separate host-owned input union, or use an adapter declared by the kernel.

This is a missing protocol contract, not proof that implementation is impossible. `DecisionInputs` is a sketch and could eventually contain that union. However, two implementers can currently choose incompatible interpretations of the same interface. A host notice cannot write private state directly, while the only documented post-initialization state-changing entry point accepts the unspecified command-oriented input. The proposal needs to connect those statements.

The snapshots demonstrate why this is more than a naming preference. Engine submits `admitEffect`, and the current kernel handles that command by rechecking domain eligibility. A pluggable host must retain an explicit way to request that decision without knowing development-specific command names.

Exact probe command, run successfully:

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('/Users/vr-osxs/dev/render/docs/design/pluggable-kernels/README.md')
s = p.read_text()
a = s.index('interface WorkflowKernel<')
b = s.index('\n}', a)
print('DECLARED KERNEL ENTRY POINTS')
for line in s[a:b].splitlines():
    if '(input:' in line: print(line.strip())
print('HOST ROUTING CONTRACT')
for line in s.splitlines():
    if line.startswith('Role submissions pass') or line.startswith('An operation request is not'): print(line)
for version in ('v1', 'effect'):
    root = Path('/tmp/render-kernel-design.d4hjii') / version
    print(version)
    for file, needle in [('src/engine/runtime.ts', 'type: "admitEffect"'), ('src/kernel/integration.ts', 'c.type === "admitEffect"'), ('src/kernel/integration.ts', 'eligibility(state, work, a, pass, intent, facts, format, op.operation)')]:
        for n, line in enumerate((root / file).read_text().splitlines(), 1):
            if needle in line: print(f'{file}:{n}: {line.strip()}')
PY
```

Actual output:

```text
DECLARED KERNEL ENTRY POINTS
initialize(input: InitialInputs<Config>): InitialState<State>;
needs(input: ReadPlanningInputs<State, Command>): readonly HostRead[];
decide(input: DecisionInputs<State, Command>): Decision<State>;
present(input: VisibleInputs<State>): KernelView;
HOST ROUTING CONTRACT
Role submissions pass through Ledger as their actual assignment principal. Host lifecycle notices and trusted execution observations use reserved host routes. Their stable task-result identities supply deduplication keys. Neither can write private state directly.
An operation request is not a dispatch permit. Before dispatch, Ledger rechecks current authority, cancellation, exact source and target where relevant, and kernel eligibility. If the relevant domain basis changed, it must re-evaluate legality. The host issues the attempt-bound permit and records observations. Unresolved external outcomes require reconciliation, not a new blind attempt.
v1
src/engine/runtime.ts:2041: type: "admitEffect",
src/kernel/integration.ts:334: if (c.type === "admitEffect") {
src/kernel/integration.ts:340: const gap = eligibility(state, work, a, pass, intent, facts, format, op.operation);
effect
src/engine/runtime.ts:2041: type: "admitEffect",
src/kernel/integration.ts:355: if (c.type === "admitEffect") {
src/kernel/integration.ts:362: yield* eligibility(state, work, a, pass, intent, facts, format, op.operation);
```

Required meaning is a documented host-owned input contract or explicit host-command mapping. It must identify how lifecycle results and admission requests reach `needs` and `decide`, which schemas decode them, and which route prevents clients from impersonating them. The existing stable-result deduplication rule can remain. No additional service or callback is required by this finding.

This is separate from the execution-extraction feasibility gate. The gate asks whether existing guarantees can survive extraction. This finding asks what protocol the proposed interface actually exposes.

## Challenges not retained as findings

- Crash scheduling is explicitly durable. The transaction includes staged work, and notifications are expressly not the queue. Restart requires compatibility checks and fencing. No contrary proposed contract was found.
- Projection excludes project-private state from workflow-scoped viewers before `present`. The document expressly rejects redacting arbitrary returned JSON afterward. An information leak would be speculative without an implementation.
- Effect synchrony is a trusted-code obligation, not a claimed type-system guarantee. `sources.md` S6 acknowledges asynchronous continuation after synchronous interpretation fails. The design keeps I/O outside acceptance.
- Tasks pin both host-definition version and kernel recipe meaning. Exact instructions and packets are retained before execution. No upgrade or reinterpretation promise contradicts that rule.
- The development and investigation workflows have different domain state and authority. The investigation workflow excludes delivery, source mutation, and publication.
- Extension limits are explicit. Host intents are closed, facilities are finite, new executors require host changes, and arbitrary task registration is prohibited. Presentation also disclaims a universal rich client.
- Both stated feasibility gates remain unproven. Their unproven status is not a finding.

No runtime failure is claimed. Product tests and live Ledger execution were not run. The supplied directories are exported snapshots rather than Git worktrees, so their HEADs could not be independently queried with `git rev-parse`.
