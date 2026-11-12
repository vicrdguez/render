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

The arena's brief, rubric, three designs, and verdict are kept in `arena/`. The walk arena's brief, rubric, three walks, two probes, and verdict are kept in `arena-walk/`.

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
- A reused `requestId` returns the earlier submission. Only the submission type is compared, not the payload (measured, `src/harness/submissions.ts:232-239`).

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

### Extensions and the registry

- An `Extension` is a name plus optional `tools`, `sections`, `hooks`, `wraps`, and `tasks` (measured, `src/harness/types.ts:424-433`).
- An extension's tasks are "resolved by name for every task, whichever conversations select this extension" (measured, `src/harness/types.ts:431-432`).
- A registry snapshot finds a task by name with `task(name)` (measured, `src/harness/types.ts:444`).
- The registry belongs to the host and is not stored. A conversation stores the names it selected. A stored name outlives its code (measured, `README.md`, "Per-Conversation Agent").
- With no explicit selection, a conversation gets every installed extension in install order (measured, `src/harness/types.ts:632-633`).
- A conversation stores its own model, extensions, tools, instructions, `cwd`, and turn limit (measured, `README.md`, "Per-Conversation Agent").
- `HarnessSettings` apply to the whole harness and take no conversation argument (measured, `src/harness/types.ts:631-660`).
- A task name is unique in a registry. A second extension that installs the same name throws (measured, `src/harness/registry.ts:24-26`).
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
| Real agent prose is dense with backticks. | 342 backticks in 404 lines across Ultimate's 8 agent files. 616 in 527 lines across the 23 pstack playbooks. | A character count over `agents/*.md` and `.agents/skills/poteto-mode/playbooks/*.md` |
| `skl` binds named inputs into a resource. | `--input name=value` and `--describe-inputs` exist. | `skl skill --help` |
| Pi uses Vitest to alias workspace packages to source and to run several runtime configurations. | True. | `vitest.base.ts` and `packages/durable/package.json:128-130` |

## Not verified

- The Chord and pi-ai differences between 1.5.1 and 1.5.2 were not traced beyond the three modules named under the target version.
- `spikes/substrate.mjs` closes the store cleanly. `spikes/crash.mjs` kills the process inside a commit's callback and right after a commit. No check kills it in the middle of SQLite's own write.
- No one ran a read-only harness beside a writing one.
- pi-env was read, not run.
- No complete example of pi-durable hosted on a Chord host was found.
