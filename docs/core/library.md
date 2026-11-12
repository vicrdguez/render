# The standard library

**Decided.** Render has one standard library beside the core. It holds `prose()` and `role()`. The core never imports it, and a workflow may skip it. If it grows enough, it can be split later.

**Proposed.** The shape of `role()`, and the rule for what enters the library.

[Prose](prose.md) covers `prose()`. This file covers `role()` and the entry rule.

## `role()`

A role's settings are pi-durable's `AgentChange` (measured, `src/harness/types.ts:499-517`). Render adds no settings type of its own.

```ts
type RoleSettings = AgentChange & {
	readonly model: ModelRef;
	readonly extensions: readonly Extension[];
};

declare function role(tx: Tx, settings: RoleSettings, ownership: ConversationOwnership): Promise<ConversationId>;
```

The body is three lines of pi-durable:

```ts
const { id } = await tx.createConversation({ ownership });
await configure(tx, id, settings);
return id;
```

`configure` writes the `pi.agent` document, so it is legal after the table write (measured, `src/harness/agent.ts:92-95`, P4, probe C).

### Why a helper for three lines

pi-durable already has this call for a host. `createConversation` on the Harness takes `agent`, and applies it in the commit that creates the conversation (measured, `src/harness/types.ts:550-555`). The one on a `Tx` takes only `ownership` (measured, `src/types.ts:1016`). `role()` is the missing form for code that runs inside a commit. When pi-durable gains it, `role()` is deleted.

It buys two things.

- **A conversation and its role land in one commit.** No conversation exists without its settings.
- **The type makes the caller name a model and an extension list.** An ownerless conversation starts with an empty agent. With no model its first run ends with `no_model`, and with no extension list it gets every installed extension (measured, `src/harness/agent.ts:204-215`, `src/harness/generation.ts:185-189`, `src/harness/types.ts:632-633`). One of the three walks left the model out, and the judge caught it.

The second point is the only thing `role()` adds to the two calls. A plain `AgentChange` is the alternative. It costs one type less and lets that mistake through.

### W1's roles on paper

```ts
const designer = {
	model: A,
	extensions: [CodingTools, W1],
	tools: [read, bash, publishDesign],
	instructions: designerProse,
} satisfies RoleSettings;

const implementer = (cwd: string) =>
	({
		model: A,
		extensions: [CodingTools, W1],
		tools: [read, write, edit, bash, publishBuild],
		instructions: implementerProse,
		cwd,
	}) satisfies RoleSettings;

const reviewer = {
	model: B,
	extensions: [W1],
	tools: [showDiff, showFile, publishReview],
	instructions: reviewerProse,
} satisfies RoleSettings;

export const entry = designer;
```

- The host creates the designer's conversation with `entry`. See "The host sets what a new conversation selects" in [Primitives](primitives.md).
- `w1.prepare` calls `role(tx, implementer(plan.path), { kind: "ownerless" })` (W1 row 9).
- `publish_build` calls `role(tx, reviewer, { kind: "ownerless" })` (W1 row 11).
- Each prose value comes from `prose()` when the module loads.
- Where the models A and B come from is open. See finding 13 in [the walk](walk.md).

W2 does not use `role()`. It creates no conversation, and its one agent gets its settings from `entry`.

### What `role()` leaves out

- **The first input.** `submit(tx, draft)` throws after the table write, so the workflow sends it in the next commit (measured, P4).
- **Waiting for a handoff.** That is the workflow's task or hook.
- **A registry of roles, a role file format, and a stored role name.** pi-durable has no place for a name, and nothing in the walk needed one.
- **Model fallback and login checks.** Those belong to host wiring.
- **Permissions.** A role selects tools. A designer with `bash` can still write files. Every tool checks the workflow's state itself.
- **Clearing inherited settings.** A task-owned conversation starts as a copy of its owner's agent (measured, `README.md:402`). `role()` replaces only the fields that the settings name. W1's conversations are all ownerless, so the walk did not need more.

The role's prose is in `instructions`, so it is fixed when the conversation is created. A fix to the prose reaches new conversations only. [Prose](prose.md) says when a section is the better slot.

### Why `role()` is not in the core

The owner ruled that a way to define roles is judged by checks 1 to 4 of the admission rule in the [README](README.md).

| Check | Result | Reason |
| --- | --- | --- |
| 1. A real failure | Pass | W1 needs three agents with different models and tools. |
| 2. pi-durable does not provide it | Fail | It provides both calls. Only the pairing is missing. |
| 3. An extension cannot keep the promise | Fail | A workflow can write the three lines. Nothing here guards who may act. |
| 4. Two unlike users | Fail | Only W1 uses it. No client reads a role. |

## What enters the standard library

The core's admission rule is too heavy for a helper, and no rule at all is how a shared folder fills up. This rule has four checks. A change that adds a part answers them in one paragraph and names the call sites. The owner's merge is the yes.

1. **It has callers today.** Two call sites in the proving workflows. They can be in one workflow.
2. **It adds no guarantee.** It uses only the public API of pi-durable and the core. A workflow that skips it and writes the same calls loses nothing.
3. **It owns nothing stored.** It has no document, entry kind, task, or extension of its own, and it makes no commit and starts no timer. It may write through the `tx` that its caller holds.
4. **It names no workflow concept.** A way to define roles passes. "The designer" does not.

A part goes back out when it has fewer than two call sites, or when pi-durable gains it.

| Part | 1. Callers | 2. No guarantee | 3. Nothing stored | 4. No workflow concept |
| --- | --- | --- | --- | --- |
| `prose()` | The prose files of W1 and W2 | It joins strings. | It reads files when the module loads. | It knows slots and names. |
| `role()` | W1 rows 9 and 11 | Three lines of pi-durable | It writes `pi.agent`, which pi-durable owns, through the caller's `tx`. | It knows settings, not which role they describe. |

`role()` passes check 1 with nothing to spare: two call sites, both in W1.

The three walks each wrote an entry rule. This one takes the callers test from candidate 2, because real call sites are better evidence than a second user who might come. It takes "owns nothing stored" from candidate 3. It drops candidate 1's ban on store access, which would exclude `role()` and names no failure.
