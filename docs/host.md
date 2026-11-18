# The host

The Tau host opens projects and exposes calls to clients. The [protocol reference](protocol.md) describes how clients send those calls.

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

A `nix build` also provides `result/bin/tau`, which can replace `nix run .#tau --` in each command. The server uses `~/.tau` under the process home and has no `--home` flag. `--port PORT` selects a port from 0 through 65535. Port 0 asks the OS to choose one. Repeated `--allow-host NAME` flags allow additional Host and Origin names. The pair command prints a one-use code. A device exists only after a client exchanges that code, as described in [pairing](protocol.md#devices-and-administration).

Provider login uses pi's `/login` on the server machine as the server's OS user, or a provider API key variable in the server's environment. Tau reads `${PI_CODING_AGENT_DIR:-~/.pi/agent}/auth.json`, creates it if absent, and writes refreshed credentials there. Client calls cannot set a login.

## Data and backup

An ordinary file-copy backup requires Tau to be stopped. SQLite uses WAL, so a copy of only the live database file is unsafe. A backup needs `~/.tau/projects/`, `~/.tau/devices.json`, extension code and dependencies or recoverable snapshot targets, provider credentials, and working repositories and worktrees. Extension links alone do not preserve their targets. Stores and credentials can contain secrets, so the backup needs protection.

## Restart

All projects run in one server process, so an interruption affects them together. Startup resumes durable work and overdue timers. An interrupted safe tool can replay, while an unsafe tool returns an interruption error instead of running again automatically. Five consecutive interruptions without durable progress fault ordinary tasks.

## Projects

A project has a name, an absolute working directory on the server, and an ordered list of extension names. The name matches `^[a-z0-9][a-z0-9-]{0,62}$`. Each project has its own store, harness, and registry. Its SQLite store is `~/.tau/projects/<project>/store.sqlite`, with a lock beside it.

`bind` stores and opens the project. Repeating the same binding returns `repeated: true`. A different working directory or extension list returns `conflict` with the stored project, and list order matters. `addExtensions` appends names that are not already in the list. Both calls accept names without code on the server. A project's `missing` list names extensions absent from the server's loaded extensions.

The server starts in this order:

1. It loads extensions and prepares the Tau home.
2. It loads devices and scans project directories. For each project, it takes the lock and opens the store with an empty registry.
3. It reads the project record and skips directories with invalid names, missing records, or records for another project.
4. It finds the event log, installs the built-in `coding-tools` and `codemode` extensions and the available project extensions, builds the default selection, and resumes the project's harness.
5. It reports task warnings, opens the admin socket, and listens for HTTP requests.

A repeated `bind` can finish opening a store that has no project record. A project extension absent at startup is not installed, so its tasks cannot run until its code is available.

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

`options` returns the schema, set values, and validation errors for each loaded project extension that defines options. `setOptions` merges a patch with the value from `get`. A `null` patch value deletes the key. The host checks the merged value with top-level schema defaults and ignores required-field errors for a patch. It calls `set` only if the other checks pass, and it does not insert defaults into the stored value. When `create` starts a workflow conversation, it checks required fields too.

The `model` format checks `provider/modelId` against the server's models. For secret storage and masking, see [extension options](extensions.md#imports-and-helpers).

## Calls

Each row gives the fields in the JSON body and inside `result`. A question mark marks an optional field. Conversation, entry, and decision IDs are scoped to a project. Pages have the shape `{ items, next? }` and a default limit of 50. All calls can return transport or validation refusals described in the [protocol reference](protocol.md). The last column lists additional call-specific refusals.

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
| `inbox` | `{}` | stream | `busy` |
| `decision` | `project, decision` | `decision, text, then?` | `unknown_project`, `unknown_decision` |
| `answer` | `project, decision, basis, choice, annotations` | `decision, repeated` | `unknown_project`, `unknown_decision`, `not_open`, `stale_basis`, `unknown_choice`, `bad_annotation`, `conflict`, `extension_not_loaded` |
| `timeline` | `project, after?` | stream | `unknown_project` |
| `faults` | `project, cursor?, limit?` | page of faults | `unknown_project`, `bad_cursor` |

`ProjectView` contains `project`, `workdir`, `extensions`, and `missing`. Conversation and entry IDs are positive integers. `after` is a nonnegative entry ID, and `limit` is a positive integer. History `order` is `ascending` or `descending`. Each answer annotation has `text` and an optional `range` with numeric `start` and `end`.

The `extensions` field is an array of strings, `patch` is a JSON object, and `basis` is a positive entry ID. All other body fields are strings, except the fields described above. `workflow` and `model` are mutually exclusive. The [wire shapes](protocol.md#versions-and-owned-shapes) describe records and result fields.

## Conversations

`create` with a model creates an ownerless bare conversation and configures its working directory and model. With a workflow name, `create` checks options and creates an ownerless conversation configured with the working directory and the workflow's `entry`. An `entry` function runs in the same transaction. A repeated `create` can create another conversation.

A conversation can use the [default or an explicit extension selection](extensions.md#agent-selection).

`conversations` reports `running`, `failed`, or `idle` and omits the event log. `open` watches any conversation, including one created by a workflow. `input` submits text. Its `whenBusy` field accepts `steer` or `followUp` and defaults to `followUp`. A steer joins at a tool boundary, while a follow-up waits for another run. A steer to an idle conversation starts a run unless `whenIdle: "reject"` is set. `continue` submits a continuation and refuses a busy conversation.

`stop` withdraws queued inputs and aborts ordinary work. Open decisions and background tasks remain. A repeated stop can abort a newer run. `setModel` changes the model and optional `thinkingLevel`, one of `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. The change affects the next model request, including one in a running conversation.

## Decisions, events, and faults

`inbox` watches open decisions across projects. `decision` returns the record, the text of its basis entry, and the continuation task's state as `then` when available. `answer` records the answering device. The [decision and event reference](primitives.md) defines the answer rules.

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

The decision appears only when its current continuation is that task. The result omits faults of missing extension kinds. The scan can read more tasks than the requested page size.

## Structural calls and reload

`bind`, `addExtensions`, `options`, `setOptions`, `create`, and reload share a queue. They run one at a time. When the server is stopping, queued or new structural calls return `busy`.

See [extension loading and reload](extensions.md#load-and-reload) for validation and publication failures.
