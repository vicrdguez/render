# Extensions

An extension is a folder whose `index.ts` exports a pi-durable `extension`. Add tools, tasks, hooks, and other pi-durable extension members to give agents work to do. A module with an `entry` export is a workflow. A client can create a conversation for it.

```ts
type ExtensionModule = {
	readonly extension: Extension;
	readonly options?: {
		schema: JsonSchema;
		get(tx: Tx): Promise<JsonObject>;
		set(tx: Tx, value: JsonObject): Promise<void>;
	};
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
};
```

The extension name must match its folder. `entry` supplies settings for a new conversation. See [Host](host.md) for project selection and client calls.

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

`options` defines a project session document named `<extension>.options`. `get` returns the set values, `set` replaces them, and `read` merges defaults and validates the result. Export the returned object as `options` for clients. Use a closed object schema with flat properties. Mark a model string with `format: "model"`. `modelRef` splits a `provider/modelId` string at its first slash.

`prose` reads a file when the module loads. Its declared slots must match the `{{name}}` placeholders in the file. The returned function substitutes the supplied strings. `role` creates and configures a conversation in the caller's transaction. Its settings require a model and an extension selection.

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
- Use a durable receipt keyed by the tool task ID when a replay-safe publishing tool must not publish twice. A restart can replay the tool.
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

## Test without a server

Use `createRegistry`, `MemoryStorage`, and `openStore` to open a harness with the extension. Register `fauxProvider` in `createModels` to drive an agent without a live model. `fauxAnswer` supplies the human answer in tests. It is not available to loaded extensions. W2's `extensions/w2/test/harness.ts` has the complete setup and uses this answer step:

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

The server reports each failure on standard error with its name and stage. A failed extension does not prevent the server or other extensions from starting. An extension is trusted code and is not sandboxed.

Run `tau extension reload` against a running server after changing an extension. Reload follows this order:

1. Scan and import the folders and combine them with the current catalogue. A missing folder keeps its loaded extension.
2. Check the proposed catalogue in a scratch registry and check task compatibility.
3. Refuse the entire reload if a load or compatibility check fails. A refused reload changes nothing.
4. Publish the catalogue to open projects and rebuild their defaults, then report extensions, task warnings, skipped projects, and totals.

Reload refuses duplicate task names, dropped task kinds, lower task versions, and phases removed without a version increase. An in-flight tool call or task phase finishes with its old code. A waiting task uses new code when it wakes. An existing conversation keeps its stored instructions. New conversations use the new instructions.

A task with a higher installed version uses `migrate` when next reserved. Without a migration it blocks. The report lists blocked tasks and tasks that will need a migration when they wake. If publication fails partway, the server requires a restart rather than rolling back.

The command prints `added`, `replaced`, or `kept` for each extension, task warnings, skipped projects, and totals. Exit status 0 means applied, 3 means applied with warnings, 1 means refused or restart required, and 2 means invalid usage. Changes to the server itself require a restart.

## Install an extension

From the repository's development shell, run:

```sh
install-extension --home /tmp/tau-home w2
```

Omit `--home` to use `~/.tau`. The installer builds a source snapshot and links it at `<home>/extensions/<name>`. The link is a Nix garbage-collection root. The snapshot prevents unfinished source edits from reaching a running server. The flake sees only tracked files, so add new extension files to Git before installing them. With no name, the command lists the available samples.

If a server runs on that home, the installer requests a reload. If the server refuses, the installer restores the previous link or removes the new link. Without a server, the extension loads at the next start.
