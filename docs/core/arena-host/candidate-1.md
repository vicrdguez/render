# The Render host: client calls and options per project

**Proposed.** Paper only. Paths are relative to `/tmp/render-ground/pi/packages/durable/`, or to `ai/` and `schema/` beside it. A cited claim is measured, by reading the line, unless it says otherwise. Probe H1 to H8 is `probe.mjs` here, run on pi-durable 1.5.2 with SQLite. It passed.

## 1. What a client must be able to do

Each row is one capability, named by its call. Every call carries a device token, and all but `listWorkflows`, `listModels`, `listProjects`, and `watchInbox` name a project. A timed-out call has an unknown outcome, so the last column says what a resend does.

| Call | Client sends | Gets back | Built on | A resend |
|---|---|---|---|---|
| `listWorkflows` | nothing | names, descriptions, option schemas, defaults | the `WORKFLOWS` map (§3) | reads |
| `listModels` | nothing | `provider/modelId` strings | `Models.getAvailable`, `ai/src/models.ts:302` | reads |
| `bindProject` | `id`, `name`, `workdir`, `workflows` | the project record | `render.project` (§3) | the record if equal, else `conflict` |
| `listProjects` | nothing | project records | the catalogue (§3) | reads |
| `setWorkflows` | `workflows` | the record, or `workflow_in_use` | `Registry.install`, `uninstall`, `src/harness/types.ts:456-460` | writes nothing |
| `getOptions` | workflow | schema, defaults, stored values, errors | `storedOptions` (§4) | reads |
| `setOptions` | workflow, a patch | the values, or `bad_options` | `render.options` (§4) | writes nothing |
| `listConversations` | a cursor | conversation records | `Tx.scanConversations`, `src/types.ts:995-999` | reads |
| `createConversation` | `workflow`, or `model` if bare | its ID, or `options_invalid` | `Harness.createConversation`, `src/harness/types.ts:550-555,919` | makes a second, ruling 13 |
| `watchConversation` | conversation, `from` or a cursor | entries, `pi.agent`, `pi.live`, `pi.inbox` | `Conversation.watch`, `src/harness/types.ts:891`, `src/harness/view.ts:78-84` | a new snapshot |
| `send` | conversation, text, `requestId`, `whenBusy`: `steer` or `followUp` | a submission ID | `Conversation.submit`, `src/harness/types.ts:77-90,838` | the first submission, `src/harness/submissions.ts:231-239` |
| `continue` | conversation, `requestId` | a submission ID, or `busy` | `type: "continue"`, `src/harness/types.ts:100-113` | as `send` |
| `setModel` | conversation, model | done, or `unknown_model` | `Conversation.configure`, `src/harness/types.ts:828` | writes nothing |
| `stop` | conversation | done, once idle | `Conversation.abort`, `src/harness/types.ts:880` | finds nothing to stop |
| `watchWork` | the project | each live task's kind, status, conversation | `Harness.watchTaskGraph`, `src/harness/task-graph.ts:41-56` | a new snapshot |
| `watchInbox` | nothing | open decisions of all projects | `watchDoc`, `src/types.ts:1144-1170` | a new snapshot |
| `readDecision` | decision | it, its basis `text`, its `then` task state | `decision`, `getTask`, `src/harness/types.ts:921` | reads |
| `answer` | decision, basis, choice, annotations | the record, or a refusal | core `answer` | converges |
| `watchTimeline` | the project | its events | `eventLog`, `Conversation.watch` | a new snapshot |
| `faultedTasks` | a cursor | faulted tasks no decision points at | `Tx.scanTasks` (§5) | reads |

`listConversations` through `watchWork` are W0, and serve workflow conversations too.

## 2. The script, step by step

**Step 1. Bind P with W1.** The laptop calls `listWorkflows` and `bindProject({ id: "p", name: "P", workdir: "/srv/p", workflows: ["w1"] })`. The host checks the fields, creates `~/.render/projects/p/`, takes `lock`, and opens `store.sqlite` with an empty registry. Commit 1, the store layer's first open, creates the event log. Commit 2 finds no `render.project` and writes one. The host installs `coding-tools` and W1 and calls `resume()`. The client shows P with W1's models missing. Today: no bind call.

**Step 2. Set W1's options.** `listModels`, then `setOptions("p", "w1", { designer: "x/A", implementer: "x/A", reviewer: "x/B", base: "main" })`. One commit reads the `render.options` member `w1`, merges the patch, checks it, and writes it. Today: finding 13.

**Step 3. Create, send, time out, resend.** Each `createConversation("p", { workflow: "w1" })` reads `render.options/w1` (`src/types.ts:1284-1288`) and checks it. Then pi-durable's own commit creates the conversation with `agent = { cwd: workdir, ...w1.entry(values) }`. The lost reply was D1's, and the resend made D2. `send("p", D2, { text, requestId: "r1" })` calls `D2.submit`, one pi-durable commit, and the run starts. The client shows D2 working, and D1 idle and empty. Today: `entry` cannot read options.

**Step 4. The phone steers the implementer.** In walk rows 7 to 10, row 8 copies `base` into the plan, and rows 9 and 10 apply the implementer's model. The phone finds I from row 10's event or a live `pi.generation` task in `watchWork`, calls `watchConversation("p", I)`, then `send("p", I, { text: "Use the existing serializer.", whenBusy: "steer", requestId: "r2" })`, one pi-durable commit. pi-durable places it after the current tool round (`README.md:541`, probe H4). Had the run ended, the input would start one, which can still publish. The phone shows it queued, then placed.

**Step 5. The reviewer's model becomes C mid-review.** `setOptions("p", "w1", { reviewer: "x/C" })` commits as in step 2. The host does not touch R, so the first review ends on B. Rows 13 to 15 follow. Row 16, `w1.review_start`, reads `Work`, B2, and options → `configure(tx, R, { model: C })` → `R.submit(input, requestId: B2)` → `Work` records round 2 on C → `emit` → terminal. `configure` writes only a document (`src/harness/agent.ts:92-95`), so it may precede `submit` (probe H2). The next run's requests use C (`README.md:402`, `src/harness/generation.ts:178-186`). R's view, each assistant entry (`ai/src/types.ts:593-598`), and R2 show it. Today: R keeps B.

**Step 6. A model error.** With no retry left, pi-durable ends I's run `unanswered` with `pi.live.runFailure` set to `model_error` and the error text (`README.md:563`, probe H5). `afterRun` does not fire (`src/harness/types.ts:1018-1025`), so `Work` says fixing and no decision opens, as ruling 16 settles. The owner opens I from row 14's event and calls `continue("p", I, { requestId: "r3" })`, one pi-durable commit. pi-durable runs the context as it is, and the model answers the findings (probe H5). If model A is broken, the owner also calls `setModel` on I and changes `implementer`, or W1's next round restores A. Gap: a client sees a failed run only inside its conversation.

**Step 7. `w1.review_start` faults.** The phase throws. The scheduler ends the task `faulted` and reports `task_faulted` (`src/harness/scheduler.ts:2428-2441`, probe H6). `Work` still says built. The phone calls `faultedTasks("p")` (§5) and shows "`w1.review_start` in D failed" with its message, time, and conversation. Today: finding 20.

**Step 8. Q with W2, then W1.** `bindProject` for `q` with `["w2"]`, `setOptions("q", "w2", { model: "x/A" })`, `createConversation` for F, and `send`, then W2 rows 1 to 3. Later `setWorkflows("q", ["w2", "w1"])` writes `render.project`, then installs W1. F names its extensions, so it does not change (probe H8), and U1 sleeps on. W1 needs Q's `workdir` to be a Git repository and finds out at row 8. Today: no mechanism.

**Step 9. The server restarts.** It reads its configuration (pi-ai credentials, device tokens) and the compiled-in `WORKFLOWS`. For each directory under `~/.render/projects/`, it takes `lock`, opens `store.sqlite` with an empty registry, reads `render.project` (`src/types.ts:1273`), installs `coding-tools` and the listed workflows, calls `resume()`, and reads the open-subject document for the inbox. It reads no options, conversations, or tasks. A task waits `blocked: missing_task` until the install, then runs (probe H1). pi-durable wakes overdue timers, resumes cut-off runs, and reruns replay-safe tools. The faulted task stays faulted. Today: `topology.md` omits where the list comes from.

## 3. Binding a project and choosing workflows

`bindProject` takes `id`, `name`, `workdir`, and `workflows`. The client picks `id`, which matches `^[a-z0-9][a-z0-9-]{0,62}$`, so a resend finds its project. `workdir` is an absolute directory on the server. Refusals are `bad_project`, `unknown_workflow`, and `conflict`.

The server stores `~/.render/projects/<id>/store.sqlite` and `lock`. In the store, a session document `render.project` holds `{ id, name, workdir, workflows }`. The directories are the catalogue, so no second list can disagree with a store. `topology.md` says a client never names a file path. That is wrong for `workdir`, because the server cannot guess where a repository is.

Workflows come from a map compiled into the server:

```ts
type WorkflowModule = {
	readonly extension: Extension;
	readonly description: string;
	readonly options: { readonly schema: JsonSchema; readonly defaults: JsonObject };
	entry(options: JsonObject): AgentChange;
};
declare const WORKFLOWS: Readonly<Record<string, WorkflowModule>>; // keyed by extension.name
```

Two modules that install one task name stop the server at start, because a registry throws (`src/harness/registry.ts:24-26`).

The create call names the workflow, which must be in the project's list. The host passes `{ cwd: workdir, ...entry(values) }` as `agent`, or `{ cwd, model, extensions: [codingTools] }` for a bare conversation. `pi.agent.extensions` then names the workflow, as `role()` does for conversations a workflow creates.

Adding a workflow writes `render.project`, then installs. No live conversation changes, because each names its extensions (probe H8). Removing one is refused with `workflow_in_use` while a live task has one of its task names or an open decision's subject starts with `<name>:`. Otherwise the host writes the list and uninstalls, and an idle conversation that selects it loses those tools from its next request (`README.md:402`). Start repairs a crash between the write and the install.

## 4. Options per project

The standard library:

```ts
declare function defineOptions<S extends JsonSchema>(
	workflow: string, // the extension's name
	schema: S, // a closed pi-schema obj()
	defaults: Partial<Static<S>>,
): { workflow: string; schema: S; defaults: Partial<Static<S>>; read(tx: Tx): Promise<Static<S>> };
declare function modelRef(value: string): ModelRef; // splits "provider/modelId" at the first "/"
```

`read` spreads the new core read `storedOptions(tx, workflow)`, which returns `{}` when nothing is set, over `defaults`. It checks the result with `compile(schema)` and returns it or throws.

The owner placed options outside the core. Only this helper fits there. The stored record, the client's write, and its check must be core, because only the host serves clients.

```ts
export const options = defineOptions("w1", obj({
	designer: str({ format: "model" }),
	implementer: str({ format: "model" }),
	reviewer: str({ format: "model" }),
	base: str({ minLength: 1 }),
}), { base: "main" });
export const entry = (o: W1Options) => ({ ...designer, model: modelRef(o.designer) });
// W2
export const options = defineOptions("w2", obj({ model: str({ format: "model" }) }), {});
```

Models have no default, because a workflow cannot know a server's models.

| Where the values live | JSON file beside the store | JSON file in `workdir` | Document in the store |
|---|---|---|---|
| Commits with the work that reads it | No | No | Yes |
| The library reaches it from a `tx` | Only by a new core path lookup | Only through `cwd`, and W2 has no files | `tx.doc` |
| An agent can change it | With a shell | With `write` or `edit`, and Git copies it | Only by opening the SQLite file, as for decisions |
| A crash mid-write | Can leave half a file | The same | Lands whole or not at all |

The document wins. The owner suggested a JSON file. The value is JSON and the store is the file, so only hand-editing is lost. It is `render.options`, a session document family keyed by workflow (`src/documents.ts:59-62`).

**Who may write.** Only the host, for `setOptions`.

**How the host checks a value.** The workflow must be in the project's list. A `null` in the patch removes that key. The host merges defaults, stored values, and the patch, and checks them with `compile(schema, { formats: { model } })`, where `model` tests `models.getModel(provider, modelId)` (`schema/src/types.ts:10,20`, `ai/src/models.ts:280`). Probe H7 refused an unknown model and an extra field. A `required` error refuses a create but not a patch, so fields can be set one at a time. The host stores the patch over the stored values, never the defaults, so a new default reaches projects that never set the field.

**When a change reaches running work.** The host never pushes it. W1 reads options in the commit that starts each round (rows 4, 8, 9, 10, 12, 14, and 16) and applies the role's model with `configure` before `submit`. A run in flight keeps its model. A pushed change would reach the next request of the same run, as probe H3 saw, and R1 could not say which model reviewed. W2 reads options only in `entry`, so F changes by `setModel`.

**What a rerun after a crash reads.** The committed options, in its own commit. A first try that did not land left nothing to mix with. A value an outside effect needs is copied into the workflow's state in that commit, as row 8 copies the base branch and SHA into the plan that row 9 reads.

**How the first conversation gets its model.** From `entry(values)`, passed to `createConversation`. A missing model refuses the create with `options_invalid`, so no run ends with `no_model` (`src/harness/generation.ts:185-186`).

**What the host must know.** The map, each schema and default as opaque JSON, `entry` as an opaque function, and the format name `model`. It reads no field by name and never decides which conversation a field governs, so it still knows no workflow.

## 5. Faulted tasks

`faultedTasks(project, { cursor, limit })` returns a page of `{ task, kind, conversation, error, endedAt, input }` and the next cursor. The host finds them in one read-only commit. For each task name of the project's workflows, it calls `tx.scanTasks({ kind, status: "terminal", order: "descending" }, limit, cursor)` (`src/types.ts:849-858,1005-1009`) and keeps the `faulted` outcomes. It drops a record whose `input.decision` names a decision whose `then.task` is that kind, because "read a decision" shows it. The cursor holds one pi-durable cursor per kind.

**Cost.** SQLite reads one kind through the `(kind, id)` index, filters `status` in SQL, and parses each row (`src/storage/sqlite/migrations.ts:51-53`, `src/storage/sqlite/storage.ts:466-505`). Rows grow with workflow tasks, not with tool calls, which a scan by status alone would also read (probe H6). At a guessed ten W1 tasks per piece of work, 1,000 pieces are 10,000 rows. The commit holds the session line, so `limit` bounds the pause. The scan misses built-in tasks, which end themselves at the restart limit (`README.md:216`), and tasks of a workflow that left the project.

**A later retry would need** the kind installed, and one commit that reads the record, creates the same kind with the same input, conversation, and `background` flag, as K4 did, and records the replacement, as `continuation` does. Only conversation-owned tasks qualify, because a child's owner is terminal. **A clean-up would need** a stored mark that the endpoint filters, because `Tx` cannot delete a task (`src/types.ts:989-1095`).

## 6. Joining a running agent

pi-durable gives steer, follow-up, and `continue` input, `requestId`, a watch over the run and its queue, `configure`, and `abort`. The host adds the device check and project routing, and stores nothing. D, I, and R are ordinary conversations, so ruling 18 needs no workflow code. In step 4 the join is a steer, and in step 6 a `continue`.

A client finds a conversation that a workflow created through a new rule for authors: the event of the commit that first submits to a conversation names it in `conversation`, as W1 rows 10 and 12 do. Live work and decisions also name conversations.

W1 must hold six things so that a steer cannot break its chain of evidence:

1. Only W1's tools and tasks move `Work`, after checking the stage. Chat moves nothing.
2. A publish tool reads the SHA from Git and the design from `Work`, so a steer can change the code at the SHA, not what B names.
3. The reviewer reads Git objects at the SHA in `Work`, so a steer changes the verdict, not what was reviewed.
4. A steer is a `pi.user` entry inside the round (probe H4), so the transcript shows it.
5. Only `answer` answers. "Approve" typed into D answers nothing.
6. `Work` and each evidence entry record the round's model.

The chain says what was built and reviewed, not that a steer was wise. A chat cannot fix a faulted task, because a message to R starts a run while `Work` still says built. Nor can it fix an open decision, a faulted `then` task, cancelled work, a missing model, or a removed workflow.

## 7. What changes in `docs/core`

1. **`README.md`.** Replace the open questions on the client API, options, and faulted tasks with §1, §4, and §5. Host. Proposed.
   - 1, 2: W0 is unreachable from a phone. pi-durable exports no transport (`src/index.ts`).
   - 3, 4: only the host checks devices and routes to stores. A client that knows no workflow needs every row.
   - 5: each row is one pi-durable call or one host commit.
2. **`README.md`, "Accepted limits".** A retried create makes a second, empty conversation. Finding 21 closes. Accepted limit, by ruling 13.
3. **`primitives.md`: options.** `render.options`, `storedOptions`, `getOptions`, `setOptions`, the `model` format, and the module's `options`. Finding 13 closes. Core. Proposed.
   - 1, 2: steps 2 and 5 fail. pi-durable keeps settings per conversation and per harness only (`src/harness/types.ts:464,631-660`).
   - 3, 4: no extension sees a client call, and clients and extensions must read one record alike. W1 and W2 both set models.
   - 5: one document family, one read, two host calls, one format name.
4. **`primitives.md`, "The host sets what a new conversation selects".** `entry` becomes a required `entry(options): AgentChange`, and the host adds `cwd`. Host. Proposed.
   - 1, 2: step 3's designer gets no model from options. pi-durable chooses no settings.
   - 3, 4: the host creates the conversation before any extension runs. W1 and W2 need their own models.
   - 5: one function, opaque to the host.
5. **`topology.md`.** The layout, `render.project`, bind, list changes, the start order, and `workdir`. Its first open point closes. Host. Proposed.
   - 1, 2: steps 1 and 8 have no call. The registry is the host's (`src/harness/types.ts:455`).
   - 3, 4: only the host opens stores and fills registries. P and Q differ, and a workflow-blind client must bind.
   - 5: one document, three calls, the existing loop at start.
6. **`walk.md` finding 20: `faultedTasks`.** Host. Proposed.
   - 1, 2: step 7 is invisible. `onReport` is not stored, and `scanTasks` has no client.
   - 3, 4: a faulted task cannot report itself. Any workflow's task can fault.
   - 5: one read that stores nothing.
7. **`library.md`: `defineOptions`, `modelRef`.** Standard library. Proposed.
   - Callers: W1's `entry` and rows 4, 8 to 10, 12, 14, 16, and W2's `entry`.
   - No guarantee: a core read, a spread, a check. The host's check is the guarantee.
   - Nothing stored: the document is the core's.
   - No workflow concept: it knows schemas, not roles.
8. **`walk.md`, `workflows.md`.** W1 reads options in each round's commit, applies the role's model before `submit`, and records it in `Work` and the evidence entry. New author rules: copy what an outside effect depends on, never change a model mid-run, and name a new conversation in the next event. Workflow. Proposed.

## 8. Not verified

- No host code, client, transport, or real model ran. The probe used documents named as here and a stand-in for `w1.review_start`, and closed its store cleanly.
- An unwritten `storedOptions` member, removing a workflow, and a steer during an `afterRun` hold did not run.
- The faulted-task scan was not timed on a large store.
