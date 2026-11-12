# The standard library

**Decided.** Render has one standard library beside the core. It holds `prose()` and `role()`. The core never imports it, and a workflow may skip it. If it grows enough, it can be split later. The owner also asked for one function here that defines and reads a workflow's options, and that stores them per project by itself.

**Proposed.** The shapes of `role()` and `options()`, and the rule for what enters the library.

**Open.** `options()` defines a document, and the entry rule as first written forbids that. See "What enters the standard library".

[Prose](prose.md) covers `prose()`. This file covers `role()`, `options()`, and the entry rule.

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
const designer = (model: ModelRef) =>
	({
		model,
		extensions: [CodingTools, W1],
		tools: [read, bash, publishDesign],
		instructions: designerProse,
	}) satisfies RoleSettings;

const implementer = (model: ModelRef, cwd: string) =>
	({
		model,
		extensions: [CodingTools, W1],
		tools: [read, write, edit, bash, publishBuild],
		instructions: implementerProse,
		cwd,
	}) satisfies RoleSettings;

const reviewer = (model: ModelRef) =>
	({
		model,
		extensions: [W1],
		tools: [showDiff, showFile, publishReview],
		instructions: reviewerProse,
	}) satisfies RoleSettings;

export const entry = async (tx: Tx) => designer(modelRef((await W1Options.read(tx)).designer));
```

- The host creates the designer's conversation with `entry`, and adds the project's working directory as `cwd`. See "Options per project" in [Host](host.md).
- `w1.prepare` calls `role(tx, implementer(modelRef(o.implementer), plan.path), { kind: "ownerless" })` (W1 row 9).
- `publish_build` calls `role(tx, reviewer(modelRef(o.reviewer)), { kind: "ownerless" })` (W1 row 11).
- In both, `o` is `await W1Options.read(tx)` in the same commit. See `options()` below.
- Each prose value comes from `prose()` when the module loads.

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

## `options()`

The owner asked for this in these words: "a simple function or something like that to define configurations and to read configurations. So the workflow doesn't need to think about where to store the file."

```ts
declare function options<T extends JsonObject>(
	workflow: string, // the extension's name
	schema: Schema<T>, // a closed pi-schema object, one top-level key per option
): {
	readonly schema: Schema<T>;
	get(tx: Tx): Promise<Partial<T>>; // the keys that are set
	set(tx: Tx, value: Partial<T>): Promise<void>; // replaces the keys that are set
	read(tx: Tx): Promise<T>; // the set keys over the schema's defaults, checked
};

declare function modelRef(value: string): ModelRef; // "provider/modelId", cut at the first "/"
```

The call defines one session document, named `<workflow>.options`, in the store of whichever project the `tx` belongs to. The document is the set keys and nothing else. So the values are per project, and the author names no place.

- **A workflow calls `read(tx)`** in the commit that uses a value. It throws when the value does not fit the schema, for example when a key with no default is unset.
- **The host uses `schema`, `get`, and `set`.** The workflow's module exports the returned object as its `options`, and the host shows, checks, and writes the values for a client through those three members. [Host](host.md) has that contract. The host does not import this function, and a workflow can write the three members by hand.
- **A model is a string with the format `model`.** The host checks that the server has it, and a client can show a picker for it. pi-schema checks a format only on a string (measured, `packages/schema/src/types.ts:9-19`). `modelRef()` turns the string into the value that `configure` takes.

W1 and W2 on paper:

```ts
export const W1Options = options(
	"w1",
	obj({
		designer: str({ format: "model" }),
		implementer: str({ format: "model" }),
		reviewer: str({ format: "model" }),
		base: str({ minLength: 1, default: "main" }),
	}),
);

export const W2Options = options("w2", obj({ model: str({ format: "model" }) }));
```

A model has no default, because a workflow cannot know which models a server has.

A stand-in with this shape ran: one call defined the document, a host commit merged and checked a patch through `get` and `set`, and a later commit read the values with their defaults (measured, H2 and H3 of `spikes/host.mjs`).

### What `options()` leaves out

- **The check of what a client sends.** That is the host's, at the boundary where the value enters.
- **Telling running work about a change.** A workflow reads at use. See "When a change reaches work" in [Host](host.md).
- **Old values after an upgrade.** If a new version adds a key with no default, `read` throws until the owner sets it, and a task that reads it faults. New options ship with a default.
- **Nested options.** One flat object. A client can then set one key at a time.

### Why `options()` is not in the core

| Check | Result | Reason |
| --- | --- | --- |
| 1. A real failure | Pass | W1 has no source for a model or a base branch. That is finding 13 of the walk. |
| 2. pi-durable does not provide it | Fail | It provides session documents. |
| 3. An extension cannot keep the promise | Fail | A workflow can define the document and write the three members. What it cannot do is hear a client, and that part is the host's. |
| 4. Two unlike users | Pass | W1 and W2. |

Two of the three designs in the host arena put the stored values in the core. The judge was right that check 3 does not allow it: the third design showed that the host can call a contract on the module and store nothing.

## What enters the standard library

The core's admission rule is too heavy for a helper, and no rule at all is how a shared folder fills up. This rule has four checks. A change that adds a part answers them in one paragraph and names the call sites. The owner's merge is the yes.

1. **It has callers today.** Two call sites in the proving workflows. They can be in one workflow.
2. **It adds no guarantee.** It uses only the public API of pi-durable and the core. A workflow that skips it and writes the same calls loses nothing.
3. **It owns no stored name.** It has no document, entry kind, task, or extension under a name of its own, and it makes no commit and starts no timer. It may write through the `tx` that its caller holds. It may define a document for its caller, when the caller's name is the document's name and the document holds only the caller's data.
4. **It names no workflow concept.** A way to define roles passes. "The designer" does not.

A part goes back out when it has fewer than two call sites, or when pi-durable gains it.

| Part | 1. Callers | 2. No guarantee | 3. Nothing stored | 4. No workflow concept |
| --- | --- | --- | --- | --- |
| `prose()` | The prose files of W1 and W2 | It joins strings. | It reads files when the module loads. | It knows slots and names. |
| `role()` | W1 rows 9 and 11 | Three lines of pi-durable | It writes `pi.agent`, which pi-durable owns, through the caller's `tx`. | It knows settings, not which role they describe. |
| `options()` | W1's `entry` and rows 4, 8, 9, 11, 12, 14, and 16. W2's `entry`. | A document, a spread, and a check. The host's check is the guarantee. | It defines `<workflow>.options` for its caller. See below. | It knows a schema, not what a key means. |
| `modelRef()` | The same call sites | It cuts a string. | Nothing | It knows a model, which is pi-durable's. |

`role()` passes check 1 with nothing to spare: two call sites, both in W1.

### Check 3 and `options()`

**Open.** The last sentence of check 3 is new, and it is there for `options()`.

As first written, check 3 said that a library part "has no document". `options()` defines one. The owner asked for a single function that stores the values by itself, and a helper cannot do that without defining the place.

What check 3 guards against is a library part that becomes a subsystem: a stored name that the core or a client must know, and a stored format that the library must migrate. `options()` has neither. The document's name is the workflow's, the document holds the set keys with no wrapper, and nothing but the workflow's own module reads it.

The other way out keeps the old wording. The workflow defines the document itself and hands it to the helper. One design in the host arena did that, and the judge counted it against the owner's request, because the author is back to choosing a kind, a version, and a first value. That is one statement per workflow. If the owner prefers the old wording, this is the fallback.

The three walks each wrote an entry rule. This one takes the callers test from candidate 2, because real call sites are better evidence than a second user who might come. It takes "owns nothing stored" from candidate 3, which the host arena then narrowed to "owns no stored name". It drops candidate 1's ban on store access, which would exclude `role()` and names no failure.
