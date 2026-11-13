# Facts this design rests on

This file holds facts and their sources. It holds no design positions.

Each fact has a label. **Measured** means a command was run or the source was read for this design. **Reported** means an explorer agent read the source and cited lines, and the claim was not rechecked.

## Sources

| Source | Version |
| --- | --- |
| Pi monorepo, `earendil-works/pi` | Commit `b2aabe0`, pi-durable 1.5.1. See the target version below. |
| Ultimate, `HazAT/ultimate` | Commit `7eb49b8` |
| Render v1, branch `proposal/render-v1` | Commit `20c12ed` |
| Pluggable-kernels design, branch `docs/pluggable-kernels-design` | Commit `afc95d4` |

Paths below are relative to those trees. pi-durable paths start at `packages/durable/`.

Eight explorer reports and the clones were kept under `/tmp/render-ground/` during the work. That directory does not survive a reboot. The commits above are enough to fetch everything again.

The arena's brief, rubric, three designs, and verdict are kept in `arena/`. The walk arena's brief, rubric, three walks, two probes, and verdict are kept in `arena-walk/`. The host arena's brief, rubric, three designs, three probes, and verdict are kept in `arena-host/`. The extension arena's and the protocol arena's files are kept in `arena-ext/` and `arena-wire/`.

pi-ai and pi-schema paths start at `packages/ai/` and `packages/schema/` in the same monorepo commit.

## Target version

The design targets the latest pi-durable. On 2026-11-10 that is 1.5.2, published the same day (measured, `npm view @earendil-works/pi-durable time`).

The source was read at 1.5.1. The citations still hold for 1.5.2:

- pi-durable's published `dist` is the same in 1.5.1 and 1.5.2. 0 of 396 files differ, and the 1.5.2 changelog section is empty (measured, `diff -rq` over the two npm installs).
- pi-schema's `dist` is also the same. 0 of 172 files differ (measured).
- Chord differs in 187 of 1,188 `dist` files, and pi-ai in 10 of 884. Both 1.5.2 changelog sections are empty. The parts this design has used are the same in both versions: Chord's `context` module, and pi-ai's `models.js` and `providers/faux.js` (measured). The other differences were not traced.

Render v1 pinned 1.4.0. Nothing in this design depends on 1.4.0.

## pi-durable

### What it is

- pi-durable is marked experimental. "The API changes without notice between releases" (measured, `README.md`).
- It persists conversations, submissions, documents, and tasks. Generation, tool calls, and compaction are built-in durable tasks (reported).
- The smallest durable conversation is 21 lines. A harness with an extension and a typed document is 68 lines (measured, `wc -l test/examples/00-conversation.ts test/examples/05-harness.ts`).
- It depends on Chord library parts such as the context. It needs no Chord host (measured, `package.json`, and the imports of Ultimate's `server/harness.ts`).
- Version 1.5 removed `watchEvents()` and `AgentEvent` (measured, `CHANGELOG.md:76`). Render v1 imports both (measured, `src/engine/runtime.ts:8,32`).

### Data

- A session is one store and one line of serialized commits. A harness adds a scheduler to a session (reported).
- An entry is immutable and has a numeric ID that is global to the session (reported).
- A document is typed, versioned JSON. Its scope is the session, a conversation, or a task. It commits in the same transaction as entries and tasks (reported).
- A submission is admitted input with its own lifecycle. A host can admit one inside its own commit with `submit(tx, draft)`, together with its own checks and documents (measured, `test/examples/34-submit-in-commit.ts`).
- A reused `requestId` returns the earlier submission. Only the submission type is compared, not the payload (measured, `src/harness/submissions.ts:232-239`, H4 of `spikes/host.mjs`).
- A host reaches any conversation in a store by its ID, whoever created it (measured, `src/harness/types.ts:918`).
- The harness creates a conversation, applies `agent`, and runs `init` in one commit. `init` may read and write documents, and a table read in it throws (measured, `src/harness/types.ts:544-555`, `src/harness/harness.ts:429-442`, H3).
- `tx.scanConversations` pages the conversation records of a store. A record holds the ID, the fork parent, and the owner (measured, `src/types.ts:429-441,995-999`).

### Input to a conversation

- An input to a busy conversation queues. A steer is placed after the current tool round and joins the running work. A follow-up starts the next run (measured, `README.md:541`, `src/harness/types.ts:77-91`, H4).
- An input with `whenIdle: "reject"` to an idle conversation is refused with `ConversationIdle` and writes nothing (measured, `src/harness/types.ts:85-89`, H6).
- The model, the prompt, and the tools of a request are fixed when it is prepared. "A change applies from the next request", also inside a run (measured, `README.md:402`, H5).
- `configure` has no check for a working run. A commit that configures and submits while a run works changes that run's model from its next request, and its submission queues (measured, H7).
- A run that ends without an answer leaves the reason in `pi.live.runFailure`, such as `model_error` or `no_model`, until the next run starts (measured, `README.md:563`, `src/harness/live.ts:93-107`, H8).
- A `continue` starts a run on the context as it is. It is never queued, and a busy conversation refuses it (measured, `README.md:565`, `src/harness/types.ts:100-113`, H8).
- `Conversation.abort()` withdraws queued inputs and marks every live task of the conversation that is not `background`. It ends whatever runs when it is called, so a second call later ends a newer run (measured, `src/harness/scheduler.ts:668-691`, H9).
- A conversation's view mounts its `pi.agent`, `pi.live`, `pi.inbox`, provider, and usage documents beside a window of entries (measured, `src/harness/view.ts:78-84`, `src/harness/types.ts:886-891`).
- An assistant message carries its provider and its model (measured, `packages/ai/src/types.ts:593-598`).

### Tasks

- A task is a checkpointed state machine. Its statuses are `pending`, `running`, `waiting`, `sleeping`, `completing`, and `terminal` (measured, `src/types.ts`).
- A task waits on other tasks or sleeps until a time. No status parks a task on an outside signal (measured, `src/types.ts:660-693`).
- A phase must commit a changed checkpoint or a terminal outcome, or the task faults (measured, `src/types.ts`).
- A phase runs again after a crash (measured, K3 of `spikes/crash.mjs`). A hook can too (reported).
- A tool's intent commits before `execute()`. An interrupted tool is not run again unless it declares `replay: "safe"`. The model gets an error result instead. Nothing is exactly-once (measured, `src/harness/tool.ts:195-226`, `README.md:277`, K1 and K2).
- A task that a crash cuts off five times in a row ends `faulted`. A new state that the task commits starts the count over (measured, `README.md:216`, `src/harness/scheduler.ts:1944-1957`, K3 and K5).
- A terminal task never runs again. No call that restarts one was found in `src/types.ts` or `src/harness/types.ts` (measured, a search for "retry", "restart", "revive", and "rerun").
- A `background` task is left out of a conversation's abort and of its idle wait (measured, `src/types.ts:415-416`, `src/harness/scheduler.ts:668-691`, P1 of `arena-walk/candidate-1-probe.mjs`).
- An `afterRun` hook runs after a final answer, and never after a failure or an abort. Its tasks are children of the run (measured, `src/harness/types.ts:1018-1025`).
- A round's tool calls run in parallel by default. The round ends the run only when every call asks for it. One call that declares `executionMode: "sequential"` makes its whole round sequential (measured, `src/harness/agent.ts:81`, `src/harness/generation.ts:1096-1097`, `src/harness/types.ts:358-359`).
- A reused request ID returns the earlier submission. Only the type is compared (measured, `src/harness/submissions.ts:231-239`).
- A new ownerless conversation starts with an empty agent. A new task-owned one starts as a copy of its owner's (measured, `src/harness/agent.ts:204-215`, `README.md:402`).
- The harness takes a `now` clock (measured, `src/harness/types.ts:729-732`). A tool reads it with `api.now()` and a task with `runtime.now()` (measured, `src/harness/types.ts:263-264`, `src/types.ts:342-343`). A `Tx` has no clock.
- A task definition has a `version`, the "definition version persisted with live input and checkpoints". An optional `migrate` converts a record stored by an older version (measured, `src/types.ts:369-386`).
- A new task takes the name and version of the definition installed when it is created (measured, `src/session/transaction.ts:492-501`).
- A task whose definition is not installed is blocked with `missing_task` (measured, `src/harness/types.ts:793-798`).
- A harness reports when it next needs a running process, so a host can close it and reopen it on a timer (reported, `Harness.wake()` and `onWake`).
- A phase that throws ends its task `faulted` at once, with the error message in the outcome. `onReport` is called after the fault is stored (measured, `src/harness/scheduler.ts:2428-2441`, H10).
- `tx.scanTasks` filters by conversation, kind, status, abort mark, and `background`. It has no filter by outcome (measured, `src/types.ts:849-857,1005-1009`).
- The SQLite task table has an index on `(status, id)` and one on `(kind, id)`, and none on the outcome (measured, `src/storage/sqlite/migrations.ts:51-55`). pi-durable deletes no task. The only `DELETE FROM` in its source removes document revisions, and a `Tx` has no call that removes a task (measured, `src/storage/sqlite/commit.ts:468`, and a search over `src/`).
- Every model request and every tool call is a task of pi-durable's own and stays as a finished record. After six short runs, 11 of 14 finished tasks were of those kinds (measured, H10).
- On a crash loop the built-in kinds end themselves and are reported as `task_interrupted`. They do not fault (measured, `README.md:216`).

### Extensions and the registry

- An `Extension` is a name plus optional `tools`, `sections`, `hooks`, `wraps`, and `tasks` (measured, `src/harness/types.ts:424-433`).
- An extension's tasks are "resolved by name for every task, whichever conversations select this extension" (measured, `src/harness/types.ts:431-432`).
- A registry snapshot finds a task by name with `task(name)` (measured, `src/harness/types.ts:444`).
- The registry belongs to the host and is not stored. A conversation stores the names it selected. A stored name outlives its code (measured, `README.md`, "Per-Conversation Agent").
- With no explicit selection, a conversation gets every installed extension in install order (measured, `src/harness/types.ts:632-633`).
- A conversation stores its own model, extensions, tools, instructions, `cwd`, and turn limit (measured, `README.md`, "Per-Conversation Agent").
- `HarnessSettings` apply to the whole harness and take no conversation argument (measured, `src/harness/types.ts:631-660`).
- A task name is unique in a registry. A second extension that installs the same name throws (measured, `src/harness/registry.ts:24-26`).
- `install` replaces an installed extension of the same name in place, and both `install` and `uninstall` publish at once (measured, `src/harness/types.ts:456-460`, `src/harness/registry.ts:74-91`).
- A store that is reopened with an empty registry keeps a due task as `blocked` with `missing_task`. The task runs once its extension is installed (measured, H1).
- An extension that is installed later does not reach a conversation that names its extensions (measured, H11).
- A conversation's stored selection is an exact list, or `{ add, remove }` over the default in `settings.extensions`, or nothing, which follows that default. With no default it means every installed extension. A selected name with no code is left out with no error (measured, `src/harness/agent.ts:351-371`, E1, E3, and E5 of `spikes/ext.mjs`).
- The settings can be a function that pi-durable reads at each use. A default that grows reaches a conversation that follows it from its next model request, also inside a run (measured, `src/harness/types.ts:630-633`, E2).
- A tool list filters tools and not sections. A conversation with an exact tool list still got its extension's section (measured, E7).
- A nested tool call, made with `executeTool()`, runs as soon as it is made, whatever its `executionMode`. A tool that declares `callers: ["model"]` refuses a nested call (measured, `src/harness/types.ts:324-325,372-376`, E6).
- A call to a tool that is no longer offered ends as `tool_unavailable` (measured, `src/harness/tool.ts:148-155`).
- A task that is running when its extension is uninstalled keeps running under its old definition, and `task_outdated` is reported (measured, `src/harness/scheduler.ts:2340-2371`, `src/types.ts:164`, H12).
- pi-durable ships `read`, `write`, `edit`, and `bash` as the `coding-tools` extension, and "nothing installs it automatically" (measured, `src/tools/index.ts:27-36`).
- The `bash` tool passes the process environment to the command by default, with `inheritEnv: true` (measured, `src/tools/bash.ts:84-86`).

### Prompt

- The system prompt is built from the selected extensions' sections, rendered in order before each request. A section sees the resolved agent, the environment, and committed documents (measured, `README.md`, "System Prompt", and `PromptInput` in `src/harness/types.ts`).
- A section is wrapped as `<key>...</key>` by default (measured, `PromptSection.tag`).
- Sections are stored as `pi.system` entries in the transcript, and only a changed section is sent again (measured, `README.md`).
- A conversation's `instructions` render last (measured, `README.md`). `configure()` changes them (measured, `src/harness/harness.ts:126-128`, `src/harness/agent.ts:161`).
- A section that throws does not stop the request. The error is reported, and the text shown before is kept (measured, `src/harness/prompt.ts:21-46`).

### Transactions and the environment

- A `Tx` can append a typed entry, create a task, create a conversation, and read and write documents (measured, `src/types.ts:1012-1052`).
- `env(target, context)` builds the environment for one conversation. The target carries the conversation ID, its `cwd`, and a document reader (measured, `src/harness/types.ts:695-721`).
- `conversationCreated(tx, conversation)` runs in every commit that creates or forks a conversation (measured, `src/harness/types.ts:722-727`).
- A commit cannot read a table after it writes one. `tx.entry()`, `tx.task()`, `tx.conversation()`, and the scans throw `ReadAfterWrite` once an entry is appended or a task is created. Documents can be read and written at any point (measured, `src/session/transaction.ts:1140-1156`, and check 3 below).
- `submit(tx, draft)` "must come before the commit's first table write" (measured, `src/harness/submissions.ts:76-82`, and check 5 below).
- A task created by a commit that is not bound to a conversation must name its conversation, or `createTask` throws (measured, `src/session/transaction.ts:488-489`, `src/types.ts:397-414`).
- A storage call that fails rejects "for an unknown outcome" (measured, `src/types.ts:1339-1341`).
- An entry records the task that appended it, as `byTaskId` (measured, `src/types.ts:460-476`). An entry has no timestamp of its own.

### Storage

- "One process writes a storage at a time; there is no cross-process locking" (measured, `README.md:894`).
- A harness can open read-only "as a viewer of a session that another process drives" (measured, `src/harness/types.ts:759-765`).
- Watches give structural snapshots and deltas. A replayable log of events with meaning is a stated non-goal (reported). Commits made while a watch's listener runs "arrive folded" (measured, `src/harness/types.ts:886-889`).
- SQLite storage runs in WAL mode with `synchronous = NORMAL`: "commits survive process crashes; the newest may be lost on power or host failure" (measured, `README.md:869`, and the pragmas at `packages/chord/src/sqlite/node.ts:220-221`).

### Compaction

- A compaction summarizes older entries in one extra model request and appends a `pi.compaction` entry. "Older entries stay in storage" (measured, `README.md:608`, E11).
- By default it keeps about 20,000 recent tokens verbatim, and the summary is at most 0.8 of `reserveTokens`, about 13,100 tokens (measured, `src/harness/agent.ts:29-34`, `src/harness/compaction.ts:153-156`).
- The summarizer gets no system message and no thinking, and each tool result is cut to 2,000 characters. A later compaction folds the earlier summary into the new one (measured, `src/harness/compaction.ts:66-68,78,398-402`).
- A `beforeCompact` hook can decline a compaction or supply the summary itself, with no model request (measured, `src/harness/compaction.ts:142-147`, E12).
- A `write` submission with a model message is in the conversation's next context and starts no run (measured, `src/harness/types.ts:72-99`, E9).

### Watches on the wire

- A watch calls its listener one call at a time and folds what lands meanwhile. Past 10,000 pending ops it hands over one replacement of the whole value (measured, `README.md:525`, `packages/chord/src/delta/pending.ts:9-12`, W5 of `spikes/wire.mjs`).
- A listener gets the new value and the ops that lead to it. There are seven ops, and they are plain JSON tuples (measured, `packages/chord/src/delta/index.ts:32-40`, W4).
- A conversation's view holds a window of entries: the newest 50, then appends, dropping its oldest once it would pass 100. `before` names the entry just before the window, and `from` starts the first window at an entry (measured, `src/harness/view.ts:37-66`, W5 and W6).
- A scan's cursor on SQLite is the ID of the last record and the order. It holds no server memory (measured, `src/storage/scan.ts:36-40`).
- Partial answers and tool output are committed at most every 100 ms by default (measured, `README.md:527`).
- pi-durable has changed the shape of `pi.live` between versions of that document (measured, `src/harness/live.ts:197-205`).
- Node has an HTTP server and a WebSocket client in its kit, and no WebSocket server (reported by two candidates of the protocol arena; one checked it in a probe).

### pi-schema and pi-ai

- pi-schema's builders return plain JSON Schema. `obj()` is closed unless it is opened, and errors carry JSON Pointer paths (measured, `packages/schema/README.md:10,62`, H2).
- A `default` is an annotation. "Validation never inserts it" (measured, `packages/schema/README.md:74`).
- `compile(schema, { formats })` checks a named format of a string with a function that the caller passes. Without it a format is an annotation (measured, `packages/schema/src/types.ts:9-19`, H2).
- pi-ai's `getAvailable()` returns the chat models whose providers have complete auth. `getModel(provider, id)` looks one up without a request (measured, `packages/ai/src/models.ts:280,302`).

### pi-env

- `@earendil-works/pi-env` provides `RemoteExecutionEnv`, an execution environment where "an agent's tools run on another machine, usually over SSH, while the Durable worker, its storage and credentials stay local" (measured, `packages/env/README.md:3-4`). Version 1.5.2 is on npm (measured, `npm view @earendil-works/pi-env version`). It was not installed or run for this design.

## Ultimate

- Every project is its own process with its own state home. "That is why every project gets its own process and state home instead of one server for all of them" (measured, `README.md:160-164`).
- Its host code in `server/`, `shared/`, and `bin/` is 6,573 lines (measured, `wc -l`).
- Fifteen extensions are forced on as the core tier (measured, `grep "tier = 'core'" extensions/*/api.ts`).
- Its event log is one conversation that no agent owns and that never runs. An event is a typed entry. A reactor's cursor advances in the transaction its handler writes in (measured, `server/events.ts`, 362 lines).
- Its extensions get lifecycle callbacks, client actions, document exposure, and typed services on top of the pi-durable `Extension` (reported).
- A question to the human is structured data on a durable message, and the answer arrives as a reply (reported).
- Agent prose is Markdown with frontmatter. The body becomes the conversation's `instructions`. No slot syntax exists (measured, `lib/agents.ts`).
- It takes one lock file per store (measured, `server/harness.ts:228`).
- It patches Pi internals in places (reported).

## Render v1

- `src/` has 18,826 lines. `engine/runtime.ts` has 3,498 (measured, `wc -l`).
- The tests are 147 files and 32,997 lines (measured). The gates took about 840 seconds (reported). One suite ran 10,000 schedules over one authority (measured, `RENDER_V1_SCHEDULES=10000` in `package.json`).
- The authority has 74 named commands and 18 kinds of domain write. One role, Watchdog, appears in nine production files (reported).
- It ran assignments, generations, attempts, and four-slot admission beside pi-durable's own task ownership (reported).
- The full design journey never ran end to end (reported, `docs/design-gaps.md`).

## The pluggable-kernels design

- Revision 2 chose one host database with a logical project scope, because it "keeps project records, knowledge provenance, receipts, and runtime work in one transaction space" (measured, `storage-and-knowledge.md:13`).
- It names the cost in the same table. "Every relevant access path needs project scope. Storage failure, schema incompatibility, or a fatal host error can affect all projects" (measured, `storage-and-knowledge.md:17`).
- Sharing is explicit. "A globally unique ID is a location, not a permission" (measured, `storage-and-knowledge.md`).
- Its sharing example is a finance project that grants one knowledge revision to a programming project (measured, `storage-and-knowledge.md:85-111`).
- On prose it recommends Markdown bodies with an explicit catalogue. "Body substitutions bind established facts; they do not contain `if new pass`", and "Do not commit a compiler or template dependency" (measured, `execution-skills.md:120-122`).
- It requires every project to select a workflow, and it describes no agent without one (reported).
- It adds 22 glossary terms (reported).

## Checks run for this design

| Claim | Result | How |
| --- | --- | --- |
| One process can drive two harnesses at once, each with its own store and registry. | True on pi-durable 1.5.2, 1.5.1, and 1.4.0, with in-memory storage. | `spikes/two-harnesses.mjs` |
| 1. Two SQLite stores with separate registries run in one process and survive a close and a reopen. | True on 1.5.2. | `spikes/substrate.mjs` |
| 2. A commit that is not bound to a conversation can read and write a session document, find a task by name, and create it in a named conversation. | True on 1.5.2. | `spikes/substrate.mjs` |
| 3. After a table write, a table read throws `ReadAfterWrite`, and document access still works. | True on 1.5.2. | `spikes/substrate.mjs` |
| 4. A conversation with no owner takes typed entries and returns them after a reopen. | True on 1.5.2. | `spikes/substrate.mjs` |
| 5. `submit(tx, draft)` works before a table write and throws after one. | True on 1.5.2. | `spikes/substrate.mjs` |
| 6. A task sleeps for a week across a closed store and wakes on reopen. | True on 1.5.2, with a clock passed as `now`. | `spikes/substrate.mjs` |
| 7. Two answer-shaped commits sent at once run one after the other, and one task is created. | True on 1.5.2. | `spikes/substrate.mjs` |
| K1. A tool that declares `replay: "safe"` runs again after the process is killed, with the same `api.taskId`. It finds its receipt and appends nothing more. | True on 1.5.2. | `spikes/crash.mjs` |
| K2. A tool with the default `replay` is not run again. The model gets an error result, and its next call is a new task that appends a twin entry. | True on 1.5.2. | `spikes/crash.mjs` |
| K3. A task that waits in memory is ended `faulted` after five restarts in a row, and `onReport` hears `task_faulted`. | True on 1.5.2. | `spikes/crash.mjs` |
| K4. A commit reads a faulted task and creates a replacement, and the replacement runs. | True on 1.5.2. | `spikes/crash.mjs` |
| K5. A task that commits a changed checkpoint before its wait is still running after seven kills. | True on 1.5.2. | `spikes/crash.mjs` |
| K6. A process killed inside an answer-shaped commit leaves neither the answer nor the task. Killed right after the commit, it leaves both. | True on 1.5.2. | `spikes/crash.mjs` |
| P1 to P5. A Stop aborts a plain sleeping task and spares a `background` one. `createConversation` and `configure` work in one commit, and `submit(tx, draft)` to the new conversation throws. A task phase submits to another conversation and waits for its run. | True on 1.5.2, with in-memory storage. | `arena-walk/candidate-1-probe.mjs` |
| A to F. A tool commit appends an entry and then writes documents. A task creates a conversation, sets its agent, and reads its tools back. A request ID returns the first submission after a reopen. An abort handler withdraws a decision-shaped document. A `write` submission starts no run. | True on 1.5.2. | `arena-walk/candidate-3-probe.mjs` |
| H1. A store reopened with an empty registry keeps a due timer blocked. The timer runs after the host reads the workflow list from a document and installs the extension. | True on 1.5.2. | `spikes/host.mjs` |
| H2. A helper defines one session document named by the workflow. A host commit reads the set keys, merges a patch, checks it with pi-schema and a `model` format, and stores the set keys. | True on 1.5.2, with a stand-in for the helper and the host. | `spikes/host.mjs` |
| H3. One commit checks the options, creates a conversation, calls `entry(tx)`, which reads the options after the table write, and configures the agent. | True on 1.5.2, with the same stand-ins. | `spikes/host.mjs` |
| H4 to H6. A steer sent during a tool round is in the next request of the same run, and a resend returns the first submission. A model change during a run applies from the next request. A steer marked "only if running" to an idle conversation is refused. | True on 1.5.2. | `spikes/host.mjs` |
| H7. A commit that configures and submits while an owner's run works queues its input, and the owner's run takes the new model from its next request. | True on 1.5.2. | `spikes/host.mjs` |
| H8 and H9. A run that ends on a model error leaves `runFailure`, and a `continue` answers. A second Stop ends a newer run. | True on 1.5.2. | `spikes/host.mjs` |
| H10. A phase that throws ends its task `faulted`. `onReport` hears it after the fault is stored. A scan by kind finds it, and a scan with no kind also reads every finished built-in task. | True on 1.5.2. | `spikes/host.mjs` |
| H11 and H12. A later install does not reach a conversation that names its extensions. A task that is running when its extension is uninstalled goes on. | True on 1.5.2. | `spikes/host.mjs` |
| E1 to E5. A project default in the settings, an `{ add }` edit, and an exact list. A default that grows during a run. A named extension with no code. A secret that the host's reply hides. | True on 1.5.2, with a stand-in for the host. | `spikes/ext.mjs` |
| E6 and E7. A nested call ignores `sequential`, and `callers: ["model"]` refuses it. A tool list does not hide a section. | True on 1.5.2. | `spikes/ext.mjs` |
| E8 to E12. A dispatch that ends its round is one model request, and a second input gets its own run. A `write` costs no request. Append and then submit throws. A compaction is one request and loses the first turn from the context. A hook supplies the summary from a document. | True on 1.5.2, with a faux model. | `spikes/ext.mjs` |
| W1 to W3. A pairing code gives a token once. Only a body of one of three shapes counts as a reply. A request ID is kept under its device. | True, with a stand-in server on `node:http`. | `spikes/wire.mjs` |
| W4 to W6. The ops of a watched run, applied by a client's own code, give the value of a new watch. A client that stops reading gets 300 commits as 6 frames, and `before` and `history` fill the gap. `after` starts a watch at what the client lacks. | True on 1.5.2, over HTTP on loopback. | `spikes/wire.mjs` |
| W7 to W9. An inbox over two stores, and a project bound later. A revoked device's stream ends. A clean stop ends the streams with a reason. | True on 1.5.2, over HTTP on loopback. | `spikes/wire.mjs` |
| An answer that grows to 100 KB costs about 50 MB as whole values and about 200 KB as ops. | A byte count over 1,000 updates, with no network. | `arena-wire/verdict-facts.mjs`, run by the judge |
| Real agent prose is dense with backticks. | 342 backticks in 404 lines across Ultimate's 8 agent files. 616 in 527 lines across the 23 pstack playbooks. | A character count over `agents/*.md` and `.agents/skills/poteto-mode/playbooks/*.md` |
| `skl` binds named inputs into a resource. | `--input name=value` and `--describe-inputs` exist. | `skl skill --help` |
| Pi uses Vitest to alias workspace packages to source and to run several runtime configurations. | True. | `vitest.base.ts` and `packages/durable/package.json:128-130` |

## Not verified

- The Chord and pi-ai differences between 1.5.1 and 1.5.2 were not traced beyond the three modules named under the target version.
- `spikes/substrate.mjs`, `spikes/host.mjs`, `spikes/ext.mjs`, and `spikes/wire.mjs` close the store cleanly. `spikes/crash.mjs` kills the process inside a commit's callback and right after a commit. No check kills it in the middle of SQLite's own write.
- pi-ai's `getAvailable()` was read, not run. The spikes use a faux provider.
- No one ran a read-only harness beside a writing one.
- pi-env was read, not run.
- No complete example of pi-durable hosted on a Chord host was found.
