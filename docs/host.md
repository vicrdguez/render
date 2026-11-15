# The host

The Tau host opens projects and offers calls to clients. Use this reference with the [protocol](protocol.md) to build a client.

## Run the server

From the repository, start the server and administer it in another terminal:

```sh
nix run .#tau -- --port 0
nix run .#tau -- device pair phone
nix run .#tau -- device list
# Exchange the pairing code with a client before revoking phone.
nix run .#tau -- device revoke phone
nix run .#tau -- extension reload
```

Or run `nix build` and use `result/bin/tau` in place of `nix run .#tau --` for each command. The server uses `~/.tau` under the process home and has no `--home` flag. `--port PORT` selects a port from 0 through 65535. Port 0 asks the OS to choose one. Repeat `--allow-host NAME` to allow additional Host and Origin names. The pair command prints a one-use code. The device exists only after a client exchanges the code as described in [pairing](protocol.md#devices-and-administration).

Log in to model providers with pi's `/login` on the server machine as the server's OS user, or set a provider's API key variable in the server's environment. Tau reads `${PI_CODING_AGENT_DIR:-~/.pi/agent}/auth.json`, creates it if absent, and writes refreshed credentials there. No client call sets a login.

## Data and backup

Stop Tau before an ordinary file-copy backup. SQLite uses WAL, so copying only a live database file is unsafe. Preserve `~/.tau/projects/`, `~/.tau/devices.json`, extension code and dependencies or recoverable snapshot targets, provider credentials, and working repositories and worktrees. Extension links alone do not preserve their targets. Protect the backup because stores and credentials can contain secrets.

## Restart

All projects share one process interruption. Startup resumes durable work and overdue timers. Interrupted safe tools can replay. Unsafe tools return interruption errors instead of running again automatically. Five consecutive interruptions without durable progress fault ordinary tasks.

## Projects

A project has a name, an absolute working directory on the server, and an ordered list of extension names. The name matches `^[a-z0-9][a-z0-9-]{0,62}$`. Each project has its own store, harness, and registry. Its SQLite store is `~/.tau/projects/<project>/store.sqlite`, with a lock beside it.

`bind` stores the project and opens it. Repeating the same binding returns `repeated: true`. A different working directory or extension list returns `conflict` with the stored project. List order matters. `addExtensions` appends names that are not already in the list. Neither call requires the server to have code for every name. A project's `missing` list names extensions absent from the server's catalogue.

The server starts in this order.

1. Load the extension catalogue and prepare the Tau home.
2. Load devices, then scan project directories. For each project, take its lock and open its store with an empty registry.
3. Read the project record. Skip directories with invalid names, missing records, or records for another project.
4. Find the event log, install coding tools and available project extensions, build the default selection, and resume the project's harness.
5. Report task warnings, open the admin socket, and listen for HTTP requests.

A repeated `bind` can finish opening a store that has no project record. An extension absent at startup is not installed, and its tasks cannot run until its code is available.

## Options

An extension can give the host this contract, from `core/src/host/index.ts`.

```ts
export type ExtensionModule = {
	readonly extension: Extension;
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
	readonly options?: {
		readonly schema: JsonSchema;
		get(tx: Tx): Promise<JsonObject>;
		set(tx: Tx, value: JsonObject): Promise<void>;
	};
};
```

`options` returns each available project's extension schema, set values, and validation errors. `setOptions` merges a patch with the value from `get`. A `null` patch value deletes the key. The host checks the merged value with top-level schema defaults, ignores required-field errors for a patch, and calls `set` only if other checks pass. Defaults are not inserted into the stored value. `create` checks required fields too.

The `model` format checks `provider/modelId` against the server's models. For secret storage and masking, see [extension options](extensions.md#imports-and-helpers).

## Calls

Each row gives fields in the JSON body and fields inside `result`. A question mark marks an optional field. Conversation, entry, and decision IDs are scoped to a project. Pages are `{ items, next? }`; the default limit is 50. All calls can return transport or validation refusals described in the [protocol](protocol.md). The last column lists additional call-specific refusals.

| Call | Body | Result | Additional refusals |
| --- | --- | --- | --- |
| `extensions` | `{}` | `items: { name, workflow, schema? }[]` | none |
| `models` | `{}` | `items: { model, name }[]` | none |
| `projects` | `{}` | `items: ProjectView[]` | none |
| `bind` | `project, workdir, extensions` | `project, repeated` | `conflict`, `busy` |
| `addExtensions` | `project, extensions` | `project` | `unknown_project`, `busy` |
| `options` | `project` | `items: { extension, schema, value, errors }[]` | `unknown_project`, `busy` |
| `setOptions` | `project, extension, patch` | `value` | `unknown_project`, `extension_not_loaded`, `bad_options`, `busy` |
| `create` | `project` and either `workflow` or `model` | `conversation` | `unknown_project`, `extension_not_loaded`, `not_a_workflow`, `unknown_model`, `options_invalid`, `busy` |
| `conversations` | `project, cursor?, limit?` | page of `{ conversation, owner?, state }` | `unknown_project`, `bad_cursor` |
| `open` | `project, conversation, after?` | stream | `unknown_project`, `unknown_conversation` |
| `history` | `project, conversation, cursor?, limit?, minEntryId?, maxEntryId?, order?` | page of entries | `unknown_project`, `unknown_conversation`, `bad_cursor` |
| `input` | `project, conversation, text, requestId, whenBusy?, whenIdle?` | `submission` | `unknown_project`, `unknown_conversation`, `event_log`, `idle` |
| `continue` | `project, conversation, requestId` | `submission` | `unknown_project`, `unknown_conversation`, `event_log`, `busy` |
| `stop` | `project, conversation` | `{}` | `unknown_project`, `unknown_conversation`, `event_log` |
| `setModel` | `project, conversation, model, thinkingLevel?` | `{}` | `unknown_project`, `unknown_conversation`, `event_log`, `unknown_model` |
| `inbox` | `{}` | stream | none |
| `decision` | `project, decision` | `decision, text, then?` | `unknown_project`, `unknown_decision` |
| `answer` | `project, decision, basis, choice, annotations` | `decision, repeated` | `unknown_project`, `unknown_decision`, `not_open`, `stale_basis`, `unknown_choice`, `bad_annotation`, `conflict`, `extension_not_loaded` |
| `timeline` | `project, after?` | stream | `unknown_project` |
| `faults` | `project, cursor?, limit?` | page of faults | `unknown_project`, `bad_cursor` |

`ProjectView` contains `project`, `workdir`, `extensions`, and `missing`. IDs for conversations and entries are positive integers. `after` is a nonnegative entry ID. `limit` is a positive integer. History `order` is `ascending` or `descending`. Each answer annotation has `text` and an optional `range` with numeric `start` and `end`. All other body fields are strings except `extensions`, an array of strings, `patch`, a JSON object, and `basis`, a positive entry ID. `workflow` and `model` are mutually exclusive. See the [wire shapes](protocol.md#versions-and-owned-shapes) for records and result fields.

## Conversations

`create` with a model creates an ownerless bare conversation and configures its working directory and model. With a workflow name, it checks options, creates an ownerless conversation, and configures it with the working directory and the workflow's `entry`. An `entry` function runs in the same transaction. A repeated `create` can create another conversation.

A conversation can use the [default or an explicit extension selection](extensions.md#agent-selection).

`conversations` reports `running`, `failed`, or `idle` and omits the event log. `open` watches any conversation, including one created by a workflow. `input` submits text. `whenBusy` accepts `steer` or `followUp` and defaults to `followUp`. A steer joins at a tool boundary. A follow-up waits for another run. A steer to an idle conversation starts a run unless `whenIdle: "reject"` is set. `continue` submits a continuation and refuses a busy conversation.

`stop` withdraws queued inputs and aborts ordinary work. It does not withdraw decisions or cancel background tasks. A repeated stop can abort a newer run. `setModel` changes the model and optional `thinkingLevel`, one of `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. The change affects the next model request, including one in a running conversation.

## Decisions, events, and faults

`inbox` watches open decisions across projects. `decision` returns the record, the text of its basis entry, and the continuation task's state as `then` when available. `answer` records the device as the person answering. The [Decision and Event reference](primitives.md) defines the answer rules.

`timeline` watches the project's event log. Its conversation ID can be used with `history`. The host refuses `input`, `continue`, `stop`, and `setModel` on that log.

`faults` scans terminal tasks of available project extension task kinds and returns faulted tasks, newest task ID first. Each item has the shape from `core/src/host/faults.ts`.

```ts
export type Fault = {
	task: TaskId;
	kind: string;
	conversation: ConversationId;
	error: string;
	endedAt?: number;
	decision?: DecisionId;
};
```

The decision appears only when its current continuation is that task. Faults of missing extension kinds are not listed. The scan can read more tasks than the requested page size.

## Structural calls and reload

`bind`, `addExtensions`, `options`, `setOptions`, `create`, and reload share a queue. They run one at a time. When the server is stopping, queued or new structural calls return `busy`.

See [extension loading and reload](extensions.md#load-and-reload) for validation and publication failures.
