# What the host offers a client and a workflow

After the [walk](walk.md), the owner answered its open questions. The answers left design work in the host layer: what a client can call, how a project is bound, where a workflow's options live, and how the owner finds a dead task or joins a running agent. A third arena did that work. [Host arena](arena-host.md) says which part came from where.

**Decided.** The owner's rulings below.

**Proposed.** Everything else in this file. Nothing is implemented. Each change to the core carries its five checks from the admission rule in the [README](README.md).

The moves this file leans on ran on pi-durable 1.5.2 with SQLite files, in `spikes/host.mjs`, checks H1 to H12. That file uses stand-ins shaped like the design. No Render code exists.

## The owner's rulings

1. **The client API is a list of what a client must be able to do.** No client and no protocol is designed now. The list grows as a real client is used.
2. **A retried "create a conversation" may create two.** It is an accepted limit.
3. **A client chooses the workflows of a project,** when it binds the project to the server.
4. **A workflow defines options that a client can change per project,** such as the model of a role. The core does not need to know what the options are. The owner asked for one function that defines and reads them and that stores them per project without work for the workflow's author.
5. **A run that fails or is stopped is the workflow's concern.** What W1 does in [the walk](walk.md) is settled.
6. **A client can read the faulted tasks.** Cleaning them up, or running them again, comes later.
7. **The owner can join any running agent and steer it,** in a workflow as with the bare agent.

## What a client must be able to do

This is the list for the first version. It is not a protocol. The names are labels.

Every call carries the device's token. Every call but the first three and the inbox names its project. The host runs the work under its own context, so a client that disconnects ends only its own watch.

| Call | The client sends | It gets back | Built on | A resend |
| --- | --- | --- | --- | --- |
| `workflows` | | The name and the options schema of each workflow the server has | The host's import map | Reads again |
| `models` | | The models the server can use | pi-ai `getAvailable()` (measured, `packages/ai/src/models.ts:302`) | Reads again |
| `projects` | | Each project: its name, its working directory, its workflows, and any workflow the server no longer has | Each store's `Project` document | Reads again |
| `bind` | A name, a working directory, workflow names | The project | "Binding a project" below | Equal fields return it with `repeated`. Other fields give `conflict`. |
| `addWorkflows` | Workflow names | The project | "Binding a project" below | The same names change nothing |
| `options` | | For each workflow of the project: the schema, the keys that are set, and what is still wrong | "Options per project" below | Reads again |
| `setOptions` | A workflow and a patch | The keys that are set, or `bad_options` with the errors | "Options per project" below | The same patch gives the same value |
| `create` | A workflow name, or a model for a bare conversation | The conversation ID, or `options_invalid` | One commit, see "Options per project" | A second conversation |
| `conversations` | A cursor | A page: each ID, its owner, and idle, running, or failed | `tx.scanConversations` (measured, `src/types.ts:995-999`), then `pi.live` | Reads again |
| `open` | A conversation | Its newest entries, settings, queue, run, and last failure, then each change | `Conversation.watch()` (measured, `src/harness/types.ts:886-891`, `src/harness/view.ts:78-84`) | A new snapshot |
| `history` | A conversation, a cursor | A page of older entries | `Conversation.entries()` (measured, `src/harness/types.ts:869-874`) | Reads again |
| `input` | A conversation, text, a request ID, steer or follow-up, and "only if running" | The submission | `Conversation.submit()` (measured, `src/harness/types.ts:77-91,838`) | The first submission |
| `continue` | A conversation, a request ID | The submission, or `busy` | `submit({ type: "continue" })` (measured, `src/harness/types.ts:100-113`) | The first submission |
| `stop` | A conversation | Done, once nothing runs | `Conversation.abort()` (measured, `src/harness/types.ts:880`) | It stops whatever runs then |
| `setModel` | A conversation, a model, a thinking level | Done, or `unknown_model` | `Conversation.configure()` (measured, `src/harness/types.ts:828`) | The same value |
| `inbox` | | The open decisions of all projects, then each change | Each store's open list and `watchDoc` (measured, `src/types.ts:1145`) | A new snapshot |
| `decision` | A decision ID | The record, the `text` of its basis, and the state of its `then` task | `decision`, `tx.entry`, `getTask` (measured, `src/harness/types.ts:921`) | Reads again |
| `answer` | A decision ID, the basis, the choice, the annotations | The `answer` table in [Primitives](primitives.md) | `answer` | The same table |
| `timeline` | A cursor | The project's events, then each new one | `eventLog`, then the log's entries | A new snapshot |
| `faults` | A cursor | "Faulted tasks" below | `tx.scanTasks` | Reads again |

Notes on the rows:

- **W0 is `models`, `projects`, `bind`, and `create` through `setModel`.** The same rows serve a conversation that a workflow created.
- **A request ID is the client's.** pi-durable returns the earlier submission for a reused ID and compares only the type (measured, `src/harness/submissions.ts:231-239`, H4). So a client resends the same text. The host puts `client:` in front of the ID, so that it cannot equal an ID a workflow uses in the same conversation.
- **A second `stop` is not harmless.** If a new run started in between, the second call ends that one (measured, `src/harness/scheduler.ts:668-691`, H9). Two candidates of the arena got this wrong.
- **`setModel` changes the model and the thinking level only.** The tools and the instructions belong to the role. A change applies from the next model request, also in a run that is working (measured, `README.md:402`, H5).
- **The event log is not a conversation for a client.** `conversations` leaves it out, and `input`, `continue`, `stop`, and `setModel` refuse its ID. Nothing may run in it.
- **`conversations` says which ones failed.** A failed run opens no decision, so without this a client must open each conversation to find it.

Not in the list, because no ruling asks for it: unbinding a project, removing a workflow, deleting a conversation, withdrawing a queued input, and how a device gets its token.

- **Checks 1 and 2.** The bare agent cannot be reached from a second machine. pi-durable is a library and exports no transport.
- **Checks 3 and 4.** Only the host checks devices and routes a call to a store. A client that knows no workflow needs each row, and W0, W1, and W2 use them.
- **Check 5.** Each row is one pi-durable call or one host commit. No row adds a loop or a scheduler.

## Binding a project and choosing workflows

`bind({ project, workdir, workflows })`

- **`project`** is a short name that the client picks, matching `^[a-z0-9][a-z0-9-]{0,62}$`. It is the project's ID in every later call and the name of its directory. Because the client picks it, a resent `bind` finds its project.
- **`workdir`** is the directory where the project's agents work, as an absolute path on the server.
- **`workflows`** are names from `workflows`. The list can be empty.

What the server stores:

- `~/.render/projects/<project>/store.sqlite` and a lock file beside it.
- In the store, one session document, `Project`, with `{ project, workdir, workflows }`. The host layer owns it. The store layer does not read it.

The server keeps no catalogue file. The catalogue is the list of directories, so it cannot disagree with the stores.

A bind runs in this order. The host checks the name and the workflow names, makes the directory, takes the lock, and opens the store with an empty registry. The store layer's first open creates the event log. One host commit writes `Project`. The host then installs `coding-tools` and the workflows, and calls `resume()`. A crash before that commit leaves a store with no `Project`. The server skips such a store at start, and the resent `bind` finishes it.

### A project has a working directory

The walk gave no conversation a working directory. The designer has `read` and `bash`, the bare agent has all four coding tools, and W1 row 8 needs a repository. So the host sets `cwd` to the project's `workdir` on every conversation it creates, and a workflow reads it from the designer's `pi.agent` document.

`workdir` is the one path a client names. [Topology](topology.md) said that a client never names a file path. That holds for the store. It cannot hold for the place where the agents work, because the server cannot guess it.

**Open.** One candidate kept the old rule. The server's own configuration would list workspaces by key, and `bind` would take a key. That keeps a client from pointing agents at any directory, and it fits a project whose tools run on another machine. It also means editing a file on the server before each bind. The path is proposed because it needs nothing more, and because a device that holds a token is the owner. The decision is the owner's.

### How a conversation gets its workflow

`create` names one of the project's workflows. The host uses that module's `entry` (see "Options per project"). With no workflow, the host creates the bare agent: `{ cwd, model, extensions: [codingTools] }`, with the model the client sent. Without a model the first run would end with `no_model` (measured, `src/harness/generation.ts:185-189`).

Every project's registry holds `coding-tools`, so every project can run the bare agent.

### Adding a workflow, and why none is removed

`addWorkflows` writes the longer list to `Project` in one commit and then calls `registry.install()`, which publishes at once (measured, `src/harness/types.ts:458`, `src/harness/registry.ts:74-91`). A crash between the two is repaired at start.

No live work changes. Every conversation names its extensions, so a new workflow's tools do not appear in it (measured, H11). The new workflow's options start unset, and `create` for it refuses until they are set.

**Removing a workflow is not offered.** Uninstalling does not park running work. A task that was running when its extension was uninstalled went on through its next phase under the old definition (measured, `src/harness/scheduler.ts:2340-2371`, H12). The judge of the arena found this with a probe of its own, against a candidate that had claimed the opposite. A safe removal would have to wait for live work or refuse while there is any, and no ruling asks for either.

### What the server reads at start

1. Its own configuration: model logins and device tokens. The import map is code.
2. The names under `~/.render/projects/`.
3. For each one: the lock, then the store, opened with an empty registry. pi-durable sets `running` tasks back to `pending` (measured, `src/harness/harness.ts:299`).
4. `Project`. A store without one, or with another project's name in it, is skipped and reported.
5. It installs `coding-tools` and each listed workflow that the import map has, and calls `resume()`. A listed workflow that the server no longer has is reported in `projects`. Its tasks wait.

Nothing else is read. Options, decisions, and events are in the store, and code reads them when it uses them.

A store that was reopened with an empty registry and resumed kept a due timer as `blocked` with `missing_task`. The timer ran after the install (measured, H1). So this order loses nothing.

- **Checks 1 and 2.** No call binds a project or names its workflows, and [Topology](topology.md) did not say where the list comes from at start. pi-durable has no project.
- **Checks 3 and 4.** No extension runs before its registry exists. W0, W1, and W2 each need a project.
- **Check 5.** One document and two calls. The loop at start already exists.

## Options per project

A workflow's options are one flat JSON object per project, such as the model of each role and the base branch. The workflow stores them in a document of its own in the project's store. The host shows them to a client, checks what a client sends, and writes it through a small contract that the workflow's module exports. The core stores nothing.

### What the host knows

```ts
type WorkflowModule = {
	readonly extension: Extension; // its name is the workflow's name
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
	readonly options?: {
		readonly schema: JsonSchema; // a closed object, one top-level key per option
		get(tx: Tx): Promise<JsonObject>; // the keys that are set
		set(tx: Tx, value: JsonObject): Promise<void>; // replaces the keys that are set
	};
};
```

The host never reads a key of the value, and it never decides which conversation an option governs. So it still knows no workflow. It does not import the standard library. `options()` in [Standard library](library.md) builds the three members in one call, and a workflow may write them by hand.

One name in a schema means something to the host: the string format `model`. A value with that format is `"provider/modelId"`, and the host checks that the server has that model. A client can show a model picker for such a key without knowing the workflow.

### What `setOptions` does

One commit, documents only:

1. It calls `get(tx)`.
2. It merges the patch into the result. A `null` removes a key, which puts it back to its default.
3. It fills the defaults from the schema and checks the result with pi-schema. The `model` format calls pi-ai's `getModel()` (measured, `packages/schema/src/types.ts:9-19`, `packages/ai/src/models.ts:280`).
4. It ignores "missing" errors, so a client can set one key at a time. Any other error refuses the patch with `bad_options` and writes nothing.
5. It calls `set(tx, merged)`.

Only the keys that were set are stored. A default that the workflow changes later then reaches every project that never set the key.

All of this ran with a stand-in. A patch was stored while a required key was still unset. An unknown model and an unknown key were refused at their JSON pointers. A `null` cleared a key (measured, H2). A schema object is closed, so an unknown key fails, and pi-schema never inserts a default by itself (measured, `packages/schema/README.md:62,74`).

### Where the values live

The owner suggested a JSON file. All three designs of the arena chose a document in the project's store instead.

| | A JSON file beside the store | A JSON file in the working directory | A document in the store |
| --- | --- | --- | --- |
| Found from a `tx` | No. A `tx` names a store, not a directory, and one module serves many projects. The host would have to hand each workflow a path. | Only through `cwd` | Yes |
| Read in the commit that uses the value | No. Two reads can differ, with no record of it. | No | Yes |
| A write that survives a crash | Needs a temporary file and a rename | The same | A pi-durable commit (measured, K6) |
| An agent can change it | With a shell | With `write` alone, and Git then carries it | With a shell that reaches the store |
| Works when tools run on another machine | Yes | No | Yes |
| You can open it in an editor | Yes | Yes | No |

The value is still JSON, it is still per project, and the author still names no place. What the owner gives up is the editor. A client changes the values.

### When a change reaches work

- **At the next read.** A workflow reads its options in the commit that uses them. The host pushes nothing into a running conversation, because it does not know which conversation an option governs.
- **A conversation keeps its settings until code configures it.** So W1 sets the role's model in each commit that submits to that role, before the submission. A review that is running ends on the old model, and the next round runs on the new one.
- **A rerun after a crash reads the current value.** That is safe. If the first commit landed, the rerun finds its receipt or does not happen. If it did not land, nothing kept the old value.
- **A value that an outside effect depends on is copied.** W1 row 8 copies the base branch and its SHA into the plan that row 9 reads.
- **A model set by hand lasts until the next dispatch.** `setModel` changes one conversation now. The workflow sets the option's value again when it next submits to that conversation.

### How the first conversation gets its model

`entry` may be a function of a `tx`. `create` runs one commit:

1. It reads the workflow's options and checks them, this time with "missing" errors. Any error refuses with `options_invalid` and the errors, and nothing is created.
2. `tx.createConversation`, ownerless.
3. `configure(tx, id, { cwd, ...entry })`, where a function `entry` is called with the `tx` and reads the options itself.

A document read after the table write is legal, and the first model request used the model from the options (measured, H3).

- **Checks 1 and 2.** W1 rows 0, 8, 9, and 11 have no source for a model or a base branch. That is finding 13 of the walk. pi-durable has settings for the whole harness and for one conversation, and none for a workflow in a project (measured, `src/harness/types.ts:631-660`).
- **Check 3.** A workflow can store and read its options alone, so the storage stays out of the core. It cannot hear a client. The extension that was tried is a tool that writes the options when the owner asks in a chat. It needs a model run to change a model, it cannot set the model of the first conversation, and a client that knows no workflow can show nothing.
- **Check 4.** W1 and W2 both take a model from the owner, and a client that knows no workflow shows and sets them.
- **Check 5.** Three members on a module, one format name, and two calls. No stored record, and no settings service.

## Faulted tasks

A task whose phase throws ends `faulted` at once, and so does a task that five restarts in a row cut off (measured, `src/harness/scheduler.ts:2428-2441`, K3, H10). If no decision points at it, nothing shows it to you.

`faults(project, cursor)` returns a page of:

```ts
type Fault = {
	task: TaskId;
	kind: string;
	conversation: ConversationId;
	error: string; // the message that pi-durable kept
	endedAt?: number;
	decision?: DecisionId; // set when that decision's `continuation` is this task
};
```

How the host finds them:

- For each task name of the project's installed extensions, it calls `tx.scanTasks({ kind, status: "terminal", order: "descending" }, limit, cursor)` in a commit that writes nothing. It keeps the records whose outcome is `faulted` (measured, `src/types.ts:849-857,1005-1009`, H10).
- **It scans by kind.** A scan with no kind read 14 finished tasks to find 1, and 11 of them were pi-durable's own (measured, H10). Every model request and every tool call is one. On a crash loop those kinds end themselves and do not fault (measured, `README.md:216`). That they cannot fault on a throw is inferred.
- **It does not listen to `onReport`.** The report comes after the fault is stored (measured, `src/harness/scheduler.ts:2436`, H10). A crash between the two loses it, and the task record is still there.
- **`decision` is exact.** A `then` task's input names its decision. The host reads that decision and sets the field only when its `continuation` is this task. A `then` task that a resend replaced has no decision pointing at it, and it shows as such.

**What it costs.** SQLite has an index on `(kind, id)` and none on the outcome (measured, `src/storage/sqlite/migrations.ts:51-55`, `src/storage/sqlite/storage.ts:466-505`). So a full read touches every finished task of the workflow kinds. The cost grows with the work a project has done, not with its model requests. pi-durable deletes no task (measured, a search of its source; see [Grounding](grounding.md)). The limit bounds the rows a call returns. It does not bound the rows SQLite looks at.

**What it misses.** A kind whose extension the server no longer has.

**What comes later, and is not designed.**

- **Running one again** needs a new task with the same kind, input, conversation, and `background` flag, because no call restarts a finished task. K4 did this for a `then` task. It also needs the workflow's word that the task is safe to repeat.
- **Cleaning up** needs a stored list of task IDs that you have seen, because a `Tx` cannot delete a task.

- **Checks 1 and 2.** `w1.review_start` dies, W1's stage stops moving, and the inbox is empty. Only `onReport` and `getTask` see the task, and neither reaches a client.
- **Checks 3 and 4.** A faulted task runs no code, so it cannot report itself. W1's tasks and W2's timers can both fault, and a client that knows no workflow shows the list.
- **Check 5.** One read that stores nothing.

## Joining a running agent

A conversation that a workflow created is an ordinary conversation. `Harness.conversation(id)` returns it, whoever created it (measured, `src/harness/types.ts:918`). So `open`, `input`, `continue`, `stop`, and `setModel` work on W1's designer, implementer, and reviewer as they do on the bare agent, and the workflow needs no code for it.

- **A steer joins the run.** pi-durable places it after the current tool round, and it was in the next model request of the same run (measured, `README.md:541`, H4).
- **A steer to an idle conversation starts a run.** With "only if running", pi-durable refuses it instead and writes nothing (measured, `src/harness/types.ts:85-89`, H6).
- **A failed run is continued.** `continue` starts a run on the context as it is, so the model answers the input that the failed run left (measured, `README.md:565`, H8).

**How a client finds the conversation.** An event names it, a decision names it, and `conversations` lists it with its state. A conversation gets no label. The walk rejected one, and nothing here needs it.

**What a workflow must hold, so that a steer cannot break its chain of evidence.**

- A tool checks the workflow's state. The owner can make an agent call any of its tools at any time, and chat alone moves nothing.
- Evidence is entries and Git objects, never the transcript. A steer after `publish_build` can move the branch. The reviewer still reads the published SHA, and W1 row 19 catches the moved head.
- The check at the end of a run looks at the stage. A run that the owner started ends too.
- The event of the commit that first submits to a conversation names that conversation.
- Only `answer` answers. "Approve" typed into a chat answers nothing.

**A run the owner started can overlap a dispatch.** No design of the arena walked this, and the judge named it. The owner chats with the reviewer while the implementer works. W1 then starts the next review round. It sets the reviewer's model and submits. The submission queues behind the owner's run and starts a run of its own afterwards. The owner's run takes the new model from its next request (measured, H7). Nothing breaks, because the review tool reads the SHA from W1's document and checks the stage. But "this round ran on model C" is then not true of every request in that conversation. Each assistant message carries its provider and model, so the transcript says which model wrote what (measured, `packages/ai/src/types.ts:593-598`). This is a limit of joining, and the workflow accepts it.

**What you cannot fix from a chat.** A chat cannot answer a decision, restart a faulted task, change an option, revive work that was cancelled, bring back a workflow the server no longer has, or reach a model the server cannot. For a `then` task that faulted, send the answer again.

## The script, step by step

The three designs of the arena walked one script. This is the merged walk. W1 and W2 are as in [the walk](walk.md), and A, B, and C are models.

| Step | The client calls | What the host commits | What pi-durable does alone | What the client shows |
| --- | --- | --- | --- | --- |
| 1. The owner binds P with W1. | `workflows`, `bind` | The store layer's first open creates the event log. One commit writes `Project`. Then install and `resume()`. | Nothing | P, with W1's options unset |
| 2. The owner sets W1's options. | `models`, `setOptions` with the three models and the base branch | One commit: `get`, merge, check, `set` | Nothing | The values, and no error left |
| 3. The owner creates a W1 conversation. The call times out and is sent again. | `create` twice, then `input` to the ID that came back | Each `create` is one commit: check the options, create, configure. That makes D and D2. `input` is W1 row 1. | It starts the run in D2. | D2 working. D idle and empty. Nothing deletes D. |
| 4. The implementer runs. The owner steers it from a phone. | `open` on I, then `input` with steer | None of its own. `I.submit(...)` is pi-durable's commit. | It places the steer after the tool round, in the same run. | The steer queued, then placed |
| 5. The owner changes the reviewer's model during the first review. | `setOptions({ reviewer: C })` | One commit on W1's options. R is not touched. Later, W1 row 16 reads the options, configures R, and submits. | The running review ends on B. Round two runs on C. | Round one on B, round two on C |
| 6. The implementer's run fails on a model error. | `conversations`, `open` on I, `continue` | None of its own | It ends the run `unanswered` and sets `runFailure`. No `afterRun` hook fires. `continue` starts a run on the same context. | I as failed, with the reason. Then I working. |
| 7. `w1.review_start` throws and ends `faulted`. | `faults` | A commit that writes nothing | It ends the task `faulted` and keeps the error. | The task, its conversation, and its error |
| 8. The owner binds Q with W2, sets its model, and records a forecast. Later the owner adds W1. | `bind`, `setOptions`, `create`, `input`, later `addWorkflows` | As steps 1 to 3. Then one commit on `Project`, and an install. | F keeps its selection. The timer sleeps on. | Q with both workflows. W1's options unset. |
| 9. The server restarts. | Each client connects again. | None | It sets `running` tasks to `pending`, wakes due timers, and resumes cut-off runs. | The current state |

Notes:

- **Step 3.** The duplicate holds no input, no task, and no document of W1. It is the accepted limit.
- **Step 5.** To move the running review, the owner calls `setModel` on R.
- **Step 6.** The failed run opens no decision. That is settled as W1's concern. If model A is gone, the owner calls `setModel` on I and then `continue`, and changes the option for later rounds.
- **Step 7.** Nothing here runs the task again. Whether a chat can get the work going depends on what W1's tools accept in that stage, and the walk does not say. If the task throws every time, the fix is in W1's code.

## What this pass found in the earlier files

| # | What it found | Fix | Home |
| --- | --- | --- | --- |
| 1 | No conversation in the walk has a working directory. | `workdir` on the project, and `cwd` on every conversation the host creates. | Host wiring |
| 2 | `entry` is a fixed value, so the first conversation cannot take its model from the project. | `entry` may be a function of a `tx`. | Host wiring |
| 3 | "A client never names a file path" cannot hold for the place where agents work. | `bind` takes `workdir`. | Host wiring. Open. |
| 4 | Nothing said where the server finds a project's workflows at start. | The `Project` document. | Host wiring |
| 5 | Uninstalling an extension does not park its running tasks. | No removal. | A limit. Proposed. |
| 6 | A second Stop can end a newer run. | Said plainly in the list. | Docs |
| 7 | A failed run shows only inside its conversation. | `conversations` carries the state. | Host wiring |
| 8 | The event log is a conversation, and a client could submit to it. | The host refuses. | Host wiring |
| 9 | A run the owner started can overlap a dispatch and take its model change. | None. The transcript says which model wrote what. | A limit. Proposed. |
| 10 | The standard library's rule forbids a helper that defines a document, and the owner asked for exactly that. | A reworded check 3 in [Standard library](library.md). | Standard library. Open. |

## Not verified

- No host code, client, or transport exists. The list, `bind`, and the options contract are paper.
- `spikes/host.mjs` ran in one process and closed its store cleanly. It killed nothing. Its `options()`, `setOptions()`, and `create()` are stand-ins.
- The lock, the directory listing, and a half-made `bind` did not run.
- `getAvailable()` was read, not run. The spike used `getModel()` on a faux provider.
- The fault scan was not timed on a large store. That SQLite uses the `(kind, id)` index is inferred.
- No tool ran on another machine, so a `workdir` there is untested.
- How a device gets its token is not designed.
