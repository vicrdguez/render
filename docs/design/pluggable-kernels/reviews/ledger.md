# Adversarial review of ledger, authority and recovery

The goal is a design for pluggable Render workflow kernels. Each kernel is selected only when a new project is created. Switching an existing project's kernel is out of scope. The work is design only. It is persisted with Mermaid diagrams and changes no implementation.

The scope was `README.md`, `sources.md`, `research.md` and `decisions.tsv` under `docs/design/pluggable-kernels/`. I checked them against the snapshots at `/tmp/render-kernel-design.d4hjii/{v1,effect}` and the active session transcript. Every check was structural or a source probe. None claims runtime proof.

## Confirmed document defects (6)

**D1. The ER diagram contradicts the scope rule.** This affects "The data model comes first".
Command: `grep -n 'WORKFLOW ||--o{ KERNEL_STATE\|WORKFLOW ||--o{ RETAINED_RECORD\|either project scope or workflow scope\|initialConfig: RetainedRef' README.md`
Output: `71: initialConfig: RetainedRef;`, `95: WORKFLOW ||--o{ KERNEL_STATE : scopes`, `96: WORKFLOW ||--o{ RETAINED_RECORD : scopes`, `102: ...either project scope or workflow scope...`
Required meaning: `||` makes every state envelope and every retained record belong to exactly one workflow. Project-scoped state and the binding's `initialConfig` exist before any workflow, so the diagram cannot hold them. Both edges need `|o--o{`.

**D2. `needs` depends on state it is supposed to plan.** This affects "The extension interface" and the acceptance sequence diagram.
Command: `grep -n 'needs(input\|ReadScopedState\|plan retained reads\|Resolve state, exact inputs' README.md`
Output: `137: needs(input: ReadPlanningInputs<State, Command>)`, `171: | ReadScopedState`, `269: L->>K: Decode command and plan retained reads`, `270: L->>L: Resolve state, exact inputs, and basis`
Required meaning: the read plan takes `State`, yet state is one of the planned reads and is resolved only after planning. The document never says which state is preloaded. It also never says whether the host or the kernel compares the command's expected basis against current revisions.

**D3. Kernel participation in host-initiated transitions has no interface surface.** This affects "Execution without a second authority" and "Extracting execution authority".
Command: `grep -nE '^\s+(initialize|needs|decide|present)\(' README.md` together with `grep -n 'rebinding live work\|re-evaluate legality' README.md`
Output: the module has four methods only (lines 136 to 139). Line 298 requires a kernel eligibility recheck "before dispatch". Line 306 requires rebind to pass "the kernel's domain checks in the same Ledger transaction".
Required meaning: rebind, dispatch-time eligibility and lifecycle observations start in the host. They are not kernel catalogue commands, and the seven-member `HostIntent` union has no rebind. The snapshot shows that rebind is currently a command carrying domain checks (`v1/src/kernel/roles.ts` 1381 to 1422, verified with `sed`). The interface therefore promises a guarantee it has no method to express.

**D4. Host-protection commands still live in today's kernel catalogue, and the extraction gate leaves them out.** This affects "Extracting execution authority is the other feasibility gate" and "Bootstrap is a feasibility gate".
Command: `grep -n 'recovery-maintenance\|enrollDevice\|revokeDevice\|recordStartup' effect/src/kernel/kernel.ts` and `grep -c 'enrollDevice\|revokeDevice\|recordStartup' README.md sources.md`
Output: `recordStartup: { family: "recovery-maintenance" }`, `enrollDevice`/`revokeDevice: { family: "local-admin" }` and `case "recordStartup":` at kernel.ts 510. The README and sources.md counts are both `0`.
Required meaning: the README says fencing and revocation are "unilateral host protections". Its sequence diagram, though, sends every command through `K`. The startup fence (`startup.ts` 178 to 188) and device revocation are kernel commands today. The design needs a host-command path and an inventory of these commands for extraction. The gate names only RoleWork and Engine branches.

**D5. Durability of the defect block is unspecified.** This affects "The extension interface" and "Failure traces".
Command: `grep -n 'pending diagnosis' README.md` and `grep -ciE 'unblock|clear(s|ed)? the block|diagnosis record|resume dispatch after' README.md`
Output: lines 190 and 398 say "Roll back acceptance and block project dispatch pending diagnosis". The second count is `0`.
Required meaning: the acceptance transaction is rolled back, so the document must say where the block is recorded. It must also say whether the block survives restart and who clears it. If the block is not durable, a restart silently re-dispatches. That contradicts "not permission to retry automatically".

**D6. The README names a creation route that does not exist.** This affects "New-project selection and reopen".
Command: `grep -rn 'local-owner' effect/src v1/src effect/docs v1/docs | wc -l` and `grep -rhno 'route: "[a-z-]*"' effect/src | sort | uniq -c`
Output: `0`. The existing routes are `local-admin`, `device`, `role` and `host`. The owner lock is `owner.lock` (startup.ts 57).
Required meaning: README line 206 should name `local-admin` or label the route as new.

## Unverified design risks

- R1. Today, `openLedger` writes `Meta.initialized` on every open of a new store (startup.ts 126 to 135). It also seeds kernel-specific `importCheckpointSettings` from `checkpoint-settings.json` (startup.ts 147 to 175). The proposed explicit creation must replace both. The README mentions neither, so a project could still be created implicitly. This is inferred from source and not demonstrated.
- R2. The receipt check comes before payload decoding (ledger.ts 336 to 340). It depends on `env.workflow` and `env.fingerprint` from a built-in envelope decoder (S8). A kernel-neutral envelope must carry scope and fingerprint at host level. The README does not define them.
- R3. The creation flowchart has no branch for a plain reopen of an uninitialized store. It treats "initialized" as "bound", but today's legacy stores are initialized and unbound.

## Decision trail against the transcript

The following were verified against the transcript.

- The user's scope message (18:09) excludes switching and requests Mermaid. The first `decisions.tsv` row matches it.
- The candidate models match the Agent calls: `claude-opus-5-5`, `gpt-6-astra` and `gpt-6.1-sol`.
- The Effect probe ran against `render-kernel-effect` at `994cbfb…` with `effect` 4.1.2. Its output matches sources.md. The v4 documentation fetch supports the async-continuation claim.
- Each principle that research.md cites has a matching leaf SKILL.md read in the transcript.
- `decisions.tsv` changed during this review. Rows at 18:39:23 now record the base pick, exact pinning and the feasibility gates.

The following are unsupported, stale or missing.

- research.md still shows Cross-judge, Pick, Graft and Verify unchecked. `reports/cross-judge.md` exists, and the trail records the pick. README line 439 says research.md "records review dispositions". That holds only if research.md is updated. Treat this as stale in-progress state. It does not show a falsely claimed checkpoint, since the final verification may be pending.
- These material choices have no trail row in the version I read: the trusted-code, no-sandbox model (transcript 18:22); one store as one project; the development kernel as default; and no conversion of legacy stores.
- research.md says "a different model family will cross-judge". The cross-judge ran on `claude-opus-5-5`, the same model as candidate `design-opus`. The parent model `gpt-6.1-sol` authored the selected base.

## Attention flags for the operator

1. D3 and D4 matter most. As written, rebind, dispatch eligibility, fencing and revocation have no defined kernel or host path. These are the authority guarantees the design exists to preserve.
2. Fix D1, D2 and D6 before review. They are mechanical.
3. Decide whether the defect block (D5) is a durable record.
4. The cross-judge shares a model with one candidate, and the parent shares a model with the chosen base. Self-preference is possible. Consider another review from a different model family.
5. Two items were not verified: Mermaid parsing, and whether the final verification checkpoint has run.

Model: claude-opus-4-5 (Claude Code sub-agent in pi).
