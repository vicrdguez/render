# The host: what a client and a workflow author get

Labels: **m** measured (I read the line or ran it), **r** reported, **i** inferred. Paths without a package are under pi-durable. H1 to H6 are the checks of `probe.mjs` in this directory, run on pi-durable 1.5.2 with SQLite. It printed `ok: checks H1-H6 passed`.

Three names recur.

- `Project` is one session document in a project's store: `{ name, cwd, workflows }`. The host layer owns it.
- `Options` is a session document family in the store, one member per workflow name: `{ value }`. The store layer owns it.
- A workflow module is what the host imports: `{ extension, options?, entry? }`.

## 1. What a client must be able to do

Every call names its project, and the host knows the calling device from its token.

| # | Capability | The client sends | It gets back | Built on | A resend |
| --- | --- | --- | --- | --- | --- |
| 1 | List workflows | | Each name and options schema | The host's import map | Reads again |
| 2 | List models | | Each usable provider and model ID | pi-ai `Models.getAvailable()` (m, `pi-ai/dist/models.d.ts:172`) | Reads again |
| 3 | List projects | | Each `Project`, and the ID of its event log | `harness.snapshot(Project)`, `eventLog` | Reads again |
| 4 | Bind a project | Name, `cwd`, workflows | The `Project` | Section 3 | Equal fields return it with `repeated`. Other fields give `conflict`. |
| 5 | Set a project's workflows | The list | The `Project` | Section 3 | The same list changes nothing |
| 6 | Read options | | Per workflow: schema, value, errors | Section 4 | Reads again |
| 7 | Set options | Workflow, patch | The new value, or `invalid` with errors | Section 4 | The same patch gives the same value |
| 8 | List conversations | A cursor | Each ID, its owner, and idle, running, or failed | `tx.scanConversations` (m, `src/types.ts:995`), then `pi.live` per row | Reads again |
| 9 | Create a conversation | A workflow name, or none | The ID | `tx.createConversation`, then `configure`, in one commit (m, H2) | A second conversation (ruling 13) |
| 10 | Watch a conversation | The ID | The view now, then each change | `Conversation.watch()` (m, `src/harness/types.ts:886-891`) | A new snapshot |
| 11 | Read entries | The ID, a cursor | A page | `Conversation.entries()` (m, `src/harness/types.ts:869`) | Reads again |
| 12 | Send input | Content, a request ID, steer or follow-up | The submission | `Conversation.submit()` (m, `src/harness/types.ts:838`) | The first submission (m, `src/harness/submissions.ts:231-239`) |
| 13 | Continue a failed run | A request ID | The submission, or `busy` | `submit({ type: "continue" })` (m, `src/harness/types.ts:108`, H5) | The first submission |
| 14 | Stop | | | `Conversation.abort()` (m, `src/harness/types.ts:880`) | Nothing to stop |
| 15 | Set the model | Model, thinking level | | `Conversation.configure()` (m, `src/harness/types.ts:828`) | The same value |
| 16 | Read the inbox | | The open decisions of all projects, then changes | Each store's open list, `watchDoc` (m, `src/types.ts:1145`) | A new snapshot |
| 17 | Read a decision | The ID | The record, and its `then` task's state once answered | `decision`, `getTask` (m, `src/harness/types.ts:921`) | Reads again |
| 18 | Answer | Basis, choice, annotations | The `answer` table in `primitives.md` | `answer` | The same table |
| 19 | Read faulted tasks | A cursor | Section 5 | Section 5 | Reads again |

- W0 is rows 2 to 4 and 8 to 15.
- The timeline is rows 10 and 11 on the log conversation. A basis `text` is row 11.
- Row 15 sets only the model and the thinking level. The role owns the rest.
- Not listed, because no ruling asks for it: unbind, delete, and how a device gets its token.

## 2. The script, step by step

**1. Bind P with W1.** The client calls row 1, then row 4 with `{ project: "p", cwd: "/srv/export-tool", workflows: ["w1"] }`.

- The host checks the name and that its import map has `w1`. It makes `projects/p/`, takes the lock, and opens the store with an empty registry.
- Commit B1 writes `Project`. Then the host installs `coding-tools` and `w1`, and calls `resume()`.
- A crash before B1 leaves a store with no `Project`. The resend finishes it.
- Row 6 shows W1 with three errors, one per model.

**2. Set W1's options.** The client calls row 2, then row 7 with the three models and `baseBranch`.

- Commit O1 reads `Options("w1")`, merges the patch, checks the result against W1's schema, and writes it. It touches documents only.

**3. Create, time out, create again.** The client calls row 9 twice with `workflow: "w1"`.

- Each call is one commit: read `Options("w1")`, `tx.createConversation`, then `configure(tx, id, { cwd, ...entry(options) })`. A document read after a table write is legal (m, H2).
- Two calls make D and D2 (ruling 13). The client sends the prompt to the ID it received. That is W1 row 1.
- D stays empty and idle, with no task and no `Work` document. Nothing deletes it.

**4. Steer the implementer from the phone.**

- The phone finds I. W1's event for row 10 carries `conversation: I`, and row 8 lists it. Row 10 shows a run working.
- It calls row 12 with `whenBusy: "steer"`. The host calls `I.submit(...)` with the request ID prefixed `client:`.
- pi-durable places a steer after the current tool round (m, `README.md:541`). It was in the next model request of the same run (m, H3).
- The implementer then calls `publish_build`, which reads the head SHA itself. W1 row 11 is unchanged.

**5. Change the reviewer's model during a review.** The client calls row 7 with `{ reviewerModel: C }`.

- Commit O2 writes `Options("w1")` and nothing else. R's `pi.agent` still names B, so the running review ends on B.
- Round two is W1 row 16. `w1.review_start` now reads the options and calls `configure(tx, R, { model })` before `R.submit(tx, ...)`. Round two runs on C.
- To move the running review, the owner calls row 15 on R. A model change applies from the next model request (m, `README.md:402`, H4).

**6. The implementer's run fails.**

- pi-durable ends the run `unanswered` and sets `pi.live.runFailure` to `model_error` (m, H5). `afterRun` does not fire, so W1 opens no decision (m, `src/harness/types.ts:1018-1025`).
- Row 8 shows I as failed. Row 10 shows the reason.
- The owner calls row 13. A continue starts a run on the context as it is, and the model answers the input that the failed run left (m, `README.md:565`, H5). `publish_build` then works, because it checks the stage and not the run.
- If model A is gone, the owner first calls row 15 on I, and row 7 for later work.

**7. `w1.review_start` ends `faulted`.**

- A phase that throws ends its task `faulted` at once, with the error text in the outcome (m, `src/harness/scheduler.ts:2428-2441`, H6).
- R got no input and `Work` did not move. The inbox is empty.
- The phone calls row 19 and gets the task, its kind, its conversation D, and the error.
- Nothing in this design runs it again. Section 5 says what that would take.

**8. Bind Q, then add W1.** Rows 4, 7, 9, and 12 as above, with `workflows: ["w2"]`. Later row 5 with `["w2", "w1"]`.

- One commit writes `Project`. Then the host calls `registry.install()`, which publishes at once (m, `src/harness/types.ts:458`).
- F keeps its own selection, so it gains no W1 tool. W2's timers go on sleeping.
- Row 9 for W1 in Q refuses with `options_invalid` until row 7 has set W1's models.

**9. The server restarts.** It reads the names under `projects/`. For each one:

- It takes the lock and opens the store with an empty registry. pi-durable sets `running` tasks back to `pending` (m, `src/harness/harness.ts:299`).
- It reads `Project`. A store without one is skipped.
- It installs `coding-tools` and each listed workflow, and calls `resume()`.
- A due timer in a store reopened with an empty registry waited as `blocked` with `missing_task`, and ran after the install (m, H1).
- Options, decisions, and events are in the store. Nothing else is read.

Steps 1, 2, 5, 7, and 8 need the changes in section 7. No step lacks a pi-durable part.

## 3. Binding a project and choosing workflows

- **The call.** `bind({ project, cwd, workflows })`. `project` is a short name that the owner picks, and it is the ID in every later call. `cwd` is where the project's agents work.
- **`cwd` is new.** `docs/core` gives no conversation a working directory, and D has `bash`.
- **What is stored.** `projects/<project>/store.sqlite`, and `Project` inside it. The server keeps no catalogue file. The catalogue is the directory listing, so it cannot disagree with the stores.
- **How a conversation gets its workflow.** Row 9 names one of the project's workflows, and the host uses that module's `entry`. With no name the host creates the bare agent: `coding-tools` and `cwd`.
- **Adding a workflow** touches no live work (step 8).
- **Removing one** parks its work and loses nothing.
  - Its tasks wait as `blocked` (m, H1).
  - Its conversations lose its tools from the next request (m, `README.md:402`).
  - Answers to its decisions refuse with `workflow_not_loaded`.
  - Adding it back resumes all three.

## 4. Options per project

```ts
type Options<T extends JsonObject> = {
	readonly workflow: string; // the extension's name
	readonly schema: Schema<T>; // a pi-schema object, one top-level key per option
	read(tx: Tx): Promise<T>; // the stored keys over the schema's defaults, checked
};
declare function options<T extends JsonObject>(workflow: string, schema: Schema<T>): Options<T>;
```

```ts
const Model = obj({ provider: str(), modelId: str() });
export const W1Options = options(
	"w1",
	obj({ designerModel: Model, implementerModel: Model, reviewerModel: Model, baseBranch: str({ default: "main" }) }),
);
export const entry = (o: Static<typeof W1Options.schema>) => ({ ...designer, model: o.designerModel });

export const W2Options = options("w2", obj({ model: Model }));
```

A workflow reads with `await W1Options.read(tx)` in the commit that uses the value.

**Where the values live.**

| | A JSON file beside the store | A JSON file in the working directory | A document in the store |
| --- | --- | --- | --- |
| Found from a `tx` | No. One module serves many projects, and a `tx` names a store, not a directory. | No | Yes |
| Read inside a commit | No. Two reads can differ with no record. | No | Yes |
| Write that survives a crash | New code: temporary file and rename | The same | A pi-durable commit (m, K6) |
| An agent can change it | With a shell | With `write`, and it dirties W1's worktree | With a shell that reaches the store |
| Reaches the server under a remote `env` | Yes | No | Yes |
| Open it in an editor | Yes | Yes | No |

The document wins on the first row alone. The owner asked for a JSON file. The value is JSON, it is per project, and the author never names a place. The owner gives up the editor.

- **Who may write.** The host only, for a client, as with `answer`. The core exports no write to extensions. So an agent's tool cannot choose which model reviews its work.
- **How the host checks.** It merges the patch into the stored keys. A `null` clears a key. It fills defaults and runs pi-schema's `errors()` on the result (m, `schema/README.md:10`). `obj()` is closed, so an unknown key fails (m, `schema/README.md:62`). The host stores the explicit keys only.
- **A model that does not exist** passes the check and shows as a failed run (step 6).
- **When a change reaches running work.** At the next `read(tx)`. Nothing is pushed. A conversation keeps its `pi.agent` until code configures it, so W1 sets the role's model in each commit that submits to a role.
- **A rerun after a crash** reads the current value. That is safe. If the first commit landed, the rerun finds its receipt or does not happen. If not, nothing kept the old value.
- **A value that must not move during a piece of work** is copied into the work's document on first use. W1 row 8 does that with the base.
- **The first conversation.** `entry` may be a function of the options. The host reads them and calls it in the creating commit.
- **What the host knows.** A module may export `options` and `entry`. The schema is JSON Schema and the value is JSON. The host never reads a key.

`read` throws when the stored value fails the schema. So an upgrade that adds a required option with no default faults the tasks that read it. New options ship with a default.

## 5. Faulted tasks

```ts
type Fault = {
	task: TaskId;
	kind: string;
	conversation: ConversationId;
	error: string;
	endedAt?: number;
	decision?: DecisionId; // set when the task is a decision's `then` task
};
```

- **How the host finds them.** For each task name of the installed extensions, it calls `tx.scanTasks({ kind, status: "terminal" }, limit, cursor)` in a commit that writes nothing, and keeps the rows whose outcome is `faulted` (m, `src/types.ts:849-857,1005`, H6).
- **Why by kind.** A scan with no kind read 8 finished tasks to find 1, and 5 of them were pi-durable's own (m, H6). Every model request and every tool call is one. On a crash loop those kinds end themselves and do not fault (m, `README.md:216`). That they never fault on a throw is inferred.
- **Why not `onReport`.** It fires after the fault is stored (m, `src/harness/scheduler.ts:2436`, H6). A crash between the two loses it.
- **Cost.** SQLite has an index on `(kind, id)` and none on the outcome (m, `src/storage/sqlite/migrations.ts:51-55`). So a call reads every finished task of the workflow kinds. pi-durable deletes no task (i, none found).
- **A miss.** A kind whose extension is not installed is not scanned.
- **`decision`.** A `then` task's input names its decision. The host sets the field when that decision's `then.task` is the task's kind.

A later retry needs a new task with the same kind, input, and conversation, because no call restarts a terminal task. It also needs the workflow's word that the task is safe to repeat. A clean-up needs a stored list of acknowledged task IDs.

## 6. Joining a running agent

**What pi-durable gives.** `Harness.conversation(id)` returns any conversation in the store, whoever created it (m, `src/harness/types.ts:918`). It takes input, a steer, a continue, a Stop, and a model change. The steer and the model change ran on a conversation that a task created (m, H3, H4).

**What the host adds.** Rows 8 and 10 to 15 for every conversation, with no check of who created it. It prefixes a client's request ID with `client:`, so that the ID cannot equal one a workflow uses.

**How a client finds one.** An event or a decision names it, and row 8 lists it. A conversation gets no label.

**What a workflow must hold.**

- A tool checks the workflow's state. An owner can make an agent call any of its tools at any time.
- Evidence is entries and Git objects, never the transcript. A steer after `publish_build` can move the branch. The reviewer still reads the published SHA, and W1 row 19 catches the moved head.
- The `afterRun` check looks at the stage. A run that the owner started ends too.
- An event about an agent names its conversation.

**What the owner cannot fix from a chat.** Answer a decision, run a faulted task again, change an option, revive cancelled work, or load a missing workflow.

## 7. What changes in `docs/core`

All are Proposed.

1. **A new `host.md`** holds sections 1, 3, 5, and 6. Core, host layer.
2. **`Project`, bind, and the workflow list.** Core, host layer.
   - Checks 1 and 2: step 1 cannot be done. pi-durable has no project.
   - Checks 3 and 4: no extension runs before its registry exists. W0, W1, and W2 all need it.
   - Check 5: one document and two calls.
3. **`options()`, `Options`, and rows 6 and 7.** Core, store layer. It closes walk finding 13.
   - Checks 1 and 2: W1 rows 0, 8, and 11 have no source for a model or the base. pi-durable has settings for the whole harness and for one conversation.
   - Check 3: the extension tried is a workflow document that a tool writes. Then a client that knows no workflow cannot show or change it, and the agent picks its own reviewer.
   - Check 4: W1, W2, and that client.
   - Check 5: one document family, one function, two client calls.
4. **`entry` may be a function of the options, and the host adds `cwd`.** Host wiring. `primitives.md`, `library.md`, and walk row 0.
5. **Row 19.** Core, host layer. It closes walk finding 20 as far as the owner asked.
   - Checks 1 and 2: step 7. Only `onReport` and `getTask` see the task.
   - Checks 3 and 4: a faulted task runs no code. W1's tasks, W2's timers, and the client.
   - Check 5: one read.
6. **Rows 8 and 13, and the `client:` prefix.** Host wiring.
7. **Workflow rules** in `workflows.md`: read options at use, copy what must not move, set a role's model before each submit, name the conversation in an event.
8. **`walk.md`**: rows 0, 4, 10, 12, 14, and 16 read options. Finding 21 becomes an accepted limit.
9. **`topology.md`**: the directory layout, and `cwd` as the one path a client names.
10. **`library.md`: no new part.** Ruling 15 proposed the library. I think that home is wrong. The owner still gets the one function. The library version through its four checks:
    - 1, callers: pass.
    - 2, no guarantee: fail. "Only the host writes" is one.
    - 3, nothing stored: fail. It owns a document.
    - 4, no workflow concept: pass.

    The core also never imports the library, and the host must write the value.

## 8. Not verified

- No host code exists. `bind`, `options()`, and the 19 rows are paper.
- H1 to H6 ran in one process with clean closes. No check killed a process.
- pi-schema and `Models.getAvailable()` were read, not run.
- The lock, the directory listing, and a half-made bind were not run.
- `uninstall` with live work was not run. H1 covers a store that opens without the extension.
- That SQLite uses the `(kind, id)` index for the scan is inferred.
- No remote `env` ran, so a `cwd` on another machine is untested.
