# Extensions

An extension is a folder whose `index.ts` exports a pi-durable `extension`. Add tools, tasks, hooks, and other pi-durable extension members to give agents work to do. A module with an `entry` export is a workflow. A client can create a conversation for it.

The extension name must match its folder. `entry` supplies settings for a new conversation. See the [module type and options](host.md#options) and [project calls](host.md).

## Imports and helpers

Import Tau's author API from `tau`, `tau/durable`, `tau/schema`, and `tau/chord`. Tests can also import `tau/testing`. The [core package export tables](../core/README.md) list every name and its origin. Some names re-export pi packages to give extensions one import surface and one version. Re-exports do not shield extensions from changes in pi-durable behavior.

```ts
function options<T extends JsonObject>(extension: string, schema: Schema<T>): {
	readonly schema: Schema<T>;
	get(tx: Tx): Promise<Partial<T>>;
	set(tx: Tx, value: Partial<T>): Promise<void>;
	read(tx: Tx): Promise<T>;
};
function modelRef(value: string): ModelRef;
function prose<const S extends readonly string[]>(
	directory: string, file: string, slots: S,
): (facts: { [K in S[number]]: string }) => string;
function role(
	tx: Tx, settings: RoleSettings, ownership: ConversationOwnership,
): Promise<ConversationId>;
```

`options` defines a project session document named `<extension>.options`. `get` returns the set values, `set` replaces them, and `read` merges defaults and validates the result. `read` throws if values are invalid or incomplete. Export the returned object as `options` for clients. Use a closed object schema with flat properties. Mark a model string with `format: "model"`. `modelRef` splits at the first slash and does not validate its input.

Call `prose` at module scope to read and check the template before rendering a section. Its declared slots must match the `{{name}}` placeholders in the file. The returned function substitutes each placeholder once without escaping or interpreting inserted text. `role` creates and configures a conversation in the caller's transaction. Its settings require a model and an extension selection. Supplied settings do not clear inherited settings in task-owned conversations.

Mark a secret string with `format: "secret"`. The host returns `true` for a set secret instead of its value. The project store and its backups contain the secret in plain text. Read it when needed and keep it out of tool results, entries, events, sections, errors, and logs.

## Agent selection

The project default contains `coding-tools` and available project extensions without `entry`. A workflow is not part of the default.

| Agent selection | Extensions received |
| --- | --- |
| No selection | Project default |
| Open role with `{ add, remove }` | Project default adjusted by the role |
| Closed role with an exact list | Exactly the listed extensions |

An open role follows changes to the default on its next model request. An in-flight request keeps its selection. A closed role does not acquire extensions added to the project. A role whose promise depends on excluded tools must select both extensions and tools exactly. An open role must remove the other roles' tools from its own extension by name. A prompt section must check its intended audience because a tool filter does not hide sections.

## Author rules

- Use TypeScript that needs no build, with erasable syntax. The server loads source files.
- End relative imports with `.ts` so the source can resolve them.
- Declare `callers: ["model"]` and `executionMode: "sequential"` on a tool that publishes outside state. Nested tool calls do not obey the sequential setting.
- Declare `replay: "safe"` on a publishing tool, read a receipt keyed by `api.taskId`, write it atomically with the publication, and return its saved result on replay because a restart can replay the tool.
- Deduplicate continuation effects by decision ID and check that the workflow still expects that decision, because a replacement `then` task has a new task ID.
- Offer an ending choice on every decision because stopping a conversation does not withdraw its open decisions.
- Commit cancellation before stopping agents because a crash between stops can leave work partly cancelled.
- Validate workflow state inside tools because prompts and role tool lists are not a sandbox.
- Build submissions from stored causes and use the cause ID as `requestId` because a rerun must not submit different or duplicate input.
- Persist a plan before an external effect, inspect the state, and stop on mismatch because a rerun must not repeat an effect or destroy work it cannot prove is its own.
- Read external state inside a publishing tool because the model can name stale state.
- Review published immutable state rather than working files because the review must cover what will be handed over.
- Commit a changed checkpoint before waiting in memory because repeated interruptions without durable progress can fault a task.
- Read options at use and persist values that external effects depend on because options can change between phases.
- Reconfigure existing roles from current options before submitting to them because changing options does not update their stored settings.
- Name a newly dispatched conversation in its event because clients need its ID to join the agent.
- Give added options defaults because existing tasks can otherwise fault when `read` finds an incomplete options document.
- Use background tasks for work that waits beyond an agent run. A conversation can become idle while the work waits.
- Create and configure a conversation in one commit, then submit its first input in a later commit. Submission cannot follow the conversation table write in the same commit.
- Keep top-level code free of durable writes and external side effects. The server runs it on load and reload, including a reload that it later refuses.

## Write a workflow

This module defines a closed workflow and a task suitable for the `then` field of a [Decision](primitives.md). Replace the task body with the work that handles the answer. The model must be available on the server.

```ts
import { type DecisionInput } from "tau";
import { defineExtension, defineTask, type AgentChange } from "tau/durable";

export const afterAnswer = defineTask<DecisionInput<string>, { phase: "act" }, null>({
	name: "example.after_answer",
	version: 1,
	initial: () => ({ phase: "act" }),
	phases: {
		act: (_task, runtime, context) => runtime.commit(() => ({
			status: "terminal",
			outcome: { status: "completed", result: null },
		}), context),
	},
	abort: (_task, runtime, context) => runtime.commit(() => ({
		status: "terminal", outcome: { status: "aborted" },
	}), context),
});
export const extension = defineExtension({ name: "example", tasks: [afterAnswer] });
export const entry: AgentChange = {
	model: { provider: "faux", modelId: "faux-1" },
	extensions: [extension],
};
```

A task or tool can call `request` in a transaction with `then: afterAnswer`. The answer creates the continuation task. For an open role and separate closed roles, see [W1](../extensions/w1/README.md).

The connected [W2 workflow](../extensions/w2/src/index.ts) shows the other operations. Its [book](../extensions/w2/src/book.ts) uses `defineDoc` for state and `defineEntry` for forecast and event types. Its [forecast tools](../extensions/w2/src/forecast.ts) use `defineTool` and schemas from `tau/schema` to append an entry, save a receipt, create a background task, and call `emit` in one commit. Its [tasks](../extensions/w2/src/tasks.ts) use `defineTask`, `request`, and `emit` to ask and process the answer. `api.now()` and `runtime.now()` supply request and event times.

A timer phase calls `runtime.sleepUntil(deadline, nextCheckpoint, context)` and returns immediately. Create the task with `{ ownership: { kind: "conversation" }, conversationId, background: true }` so it survives a stop. A versioned task can provide `migrate(input, checkpoint, fromVersion)` returning `{ input, checkpoint }`.

## Test without a server

Create a registry with `createRegistry()` and install the extension with `registry.install(extension)`. Create `faux = fauxProvider()` and `models = createModels()`, then call `models.setProvider(faux.provider)`. Pass `new MemoryStorage()`, `{ registry, models }`, and `BACKGROUND_CONTEXT` from `tau/chord` to `openStore`. Use `store.harness` to configure the conversation. Call `store.harness.resume()` before waiting for independently scheduled tasks. `fauxAnswer` supplies the human answer in tests and is not available to loaded extensions. The [W2 harness](../extensions/w2/test/harness.ts) has the complete setup and uses this answer step:

```ts
const d = await read(id);
assert.ok(d);
const result = await fauxAnswer(
	store,
	id,
	{ basis: d.basis, choice, annotations: [] },
	context,
);
assert.equal(result.kind, "answered", JSON.stringify(result));
```

## Load and reload

The server scans `~/.tau/extensions/` at start. Each visible entry other than `node_modules` must resolve to a distinct folder with `index.ts`. The loader rejects JavaScript files outside `node_modules`, bad imports, invalid module shapes, mismatched names, invalid options, and conflicting tasks. An extension supplies its own npm dependencies. The loader aliases Tau imports to the server's package.

The server reports each failure on standard error as `tau: extension NAME [STAGE]: MESSAGE`, with an optional path after the name. A failed extension does not prevent the server or other extensions from starting. An extension is trusted code and is not sandboxed.

Run `tau extension reload` against a running server after changing an extension. Reload follows this order:

1. Scan and import the folders and combine them with the current catalogue. A missing folder keeps its loaded extension.
2. Check the proposed catalogue in a scratch registry and check task compatibility.
3. Refuse the entire reload if a load or compatibility check fails. A refused reload changes nothing.
4. Publish the catalogue to open projects and rebuild their defaults, then return extensions, task warnings, and skipped projects.

Reload refuses duplicate task names, dropped task kinds, lower task versions, and phases removed without a version increase. An in-flight tool call or task phase finishes with its old code. A waiting task uses new code when it wakes. An existing conversation keeps its stored instructions. New conversations use the new instructions.

A task with a higher installed version uses `migrate` when next reserved. Without a migration it blocks. Task warnings name the project, task, kind, conversation, stored and installed versions, and blocked or migration-needed status. Reservation failures print `migration_failed` or `task_outdated`. Missing task definitions do not appear in migration warnings; inspect the project's `missing` list. Withdraw open decisions before an incompatible upgrade because their stored continuation may depend on the old task. If publication fails partway, the server requires a restart rather than rolling back.

The command prints `added`, `replaced`, or `kept` for each extension, task warnings, skipped projects, and totals. Exit status 0 means applied, 3 means applied with warnings, 1 means refused, restart required, or an error reaching the server, and 2 means invalid usage. Changes to the server itself require a restart.

## Install an extension

For an extension from another repository, place or symlink its folder at `~/.tau/extensions/<name>/`, with `index.ts` and its dependencies at the folder root. The name must match `^[a-z0-9][a-z0-9-]{0,62}$` and cannot be `coding-tools`.

The repository installer handles the samples. From the development shell, run:

```sh
install-extension --home /tmp/tau-docs2c-example/.tau
```

The command lists the samples. Pass a sample name to install it into the same home that the server uses. Omit `--home` to use `~/.tau`. The installer builds a source snapshot and links it at `<home>/extensions/<name>`. The link is a Nix garbage-collection root. The snapshot prevents unfinished source edits from reaching a running server. The flake sees only tracked files, so add new extension files to Git before installing them.

If a server runs on that home, the installer requests a reload. If the server refuses, the installer restores the previous link or removes the new link. Without a server, the extension loads at the next start.
