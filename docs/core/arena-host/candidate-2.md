## 1. What a client must be able to do.

This is a proposed host contract, not a protocol. `P` means a project ID. Server discovery needs no project. Every data call names P. The merged inbox names a set of projects.

All pi-durable claims marked M are **measured by source reading**, not execution. Paths beginning `src/` are under `/tmp/render-ground/pi/packages/durable/`. Render functions below are proposed. Every call checks the device token and validates outside data with pi-schema. Tokens come from server setup. The host uses server-owned execution contexts, never a client's connection lifetime, for work.

| Capability | Client sends | Gets back | Host builds on | Resend |
| --- | --- | --- | --- | --- |
| Find projects | `projects()` | Bindings and unavailable projects | Host catalogue | Fresh read |
| Find workflows | `workflows()` | Names, descriptions, option schemas | Static wiring catalogue | Fresh read |
| Find workspaces | `workspaces()` | Server-configured keys, not paths | Host setup | Fresh read |
| Find models | `models()` | Available ModelRefs, no credentials | Host model wiring | Fresh read |
| Bind project | `bind(P,workspaceKey,workflows)` | Binding | §3 | Equal returns binding |
| Add workflows | `addWorkflows(P,names)` | Updated selection | §3 | Set union |
| Read options | `options(P,workflow)` | Schema and value, possibly unset | §4 descriptor | Fresh read |
| Replace options | `setOptions(P,workflow,value)` | Stored value or errors | §4 descriptor | Last replacement wins |
| Create conversation | `create(P,workflow)` or `create(P,bare,model)` | Conversation ID | M `Harness.createConversation`, `src/harness/harness.ts:411-412,429-445` | May create another |
| Find conversations | `conversations(P,cursor)` | IDs and ownership | M `Tx.scanConversations`, `src/types.ts:995-999` | Fresh page |
| Open conversation | `open(P,id)` | Current transcript window, agent settings, queue, run, failure, live changes | M `Conversation.watch`, `src/harness/types.ts:886-890`; view `src/harness/view.ts:36-48,78-84` | New snapshot |
| Read older history | `history(P,id,cursor)` | Entries and next cursor | M `Conversation.entries`, `src/harness/types.ts:868-873` | Fresh page |
| Pick conversation model | `setModel(P,id,model)` | Settings or busy | M `configure`, `src/harness/agent.ts:92-95`; §6 idle guard | Rechecks idle, then replaces |
| Send input or steer | `input(P,id,requestId,text,mode,onlyIfRunning?)` | Submission ID | M `Conversation.submit`, `src/harness/types.ts:829-849` | Same ID returns first submission |
| Continue unanswered context | `continue(P,id,requestId)` | Submission ID or busy | M `SubmissionDraft`, `src/harness/types.ts:101-113` | Same submission |
| Read submission | `submission(P,id)` | Queued, placed, done, or unanswered receipt | M `Harness.submission`, `src/harness/types.ts:924-925`; `Submission.status`, `src/harness/types.ts:123-127` | Fresh read |
| Stop conversation | `stop(P,id)` | Ordinary work stopped | M `Conversation.abort`, `src/harness/types.ts:876-880` | Stops work present on resend too |
| Read inbox | `inbox(projects)` | Current open decisions and changes | Core open-subject documents | Fresh snapshots |
| Open decision | `decision(P,id)` | Record, basis text, continuation state | Core `decision`; M `Tx.entry`, `src/types.ts:991`; `Harness.getTask`, `src/harness/types.ts:921` | Fresh read |
| Answer decision | `answer(P,id,basis,choice,annotations)` | Answer, continuation, or refusal | Core `answer` table in primitives.md | Equal resend can replace a faulted continuation |
| Read timeline | `timeline(P,cursor)` with optional observation | Event entries | Core `eventLog`; M entry paging `src/types.ts:1000` | Current state, no replay |
| Find faults | `faults(P,cursor,limit)` | Fault summaries and next cursor | §5 | Fresh page |
| Inspect task | `task(P,id)` | Task record or absent | M `Harness.getTask`, `src/harness/types.ts:921` | Fresh read |

Request IDs are conversation-scoped. Clients must retain the original input for resends. M pi-durable compares the submission type, not its content, `src/harness/submissions.ts:232-239`. Unknown IDs, disabled workflows, and unavailable projects return distinct refusals. Storage errors leave an unknown outcome. No arbitrary task creation, document mutation, or workflow cancellation call is exposed. Discovery omits the core event-log conversation. Agent actions refuse its ID. Stop is not cancel. Timeline means Event here. Decision state is read separately, with no new decision events.

## 2. The script, step by step.

Within every store commit, table reads precede submission admission, which precedes table writes. Documents can be accessed throughout. M `src/session/transaction.ts:1140-1154`, `src/harness/submissions.ts:75-82`. Workflow writes below retain walk.md's receipts and checkpoints.

1. The laptop calls `workflows`, `workspaces`, then `bind(P,p,[w1])`. The host checks names, opens P under its lock, and commits its identity, workspace key, selected workflows, and event-log ID. It publishes the catalogue last, then resumes P. No agent runs. The client shows P with W1. Today's docs lack the binding contract.
2. `setOptions(P,w1,{designer:A,implementer:A,reviewer:B,baseBranch:"main"})` validates, then commits a full replacement of W1's option document. It reads that document before replacing its value. No agent settings change. The laptop can read the stored options. Today's docs have no option storage.
3. `create(P,w1)` creates ownerless D1, then its init reads selection and options through documents and configures the designer, all in one commit. The response times out. A resend commits D2 with the same procedure. Both may exist. The client lists conversations, uses returned D2, and sends its prompt once with a request ID. Creation never includes input. If input reached D1 earlier, D1 also runs. The host does not choose or merge duplicates. M creation has no request key, `src/harness/types.ts:550-555,919`.
4. The owner answers the design decision. Core `answer` reads the decision, basis, and registry, then creates its background continuation and records the answer atomically. W1's next commits store the accepted design and base SHA, plan the worktree, create I with implementer settings, and submit its input in a later commit, as walk.md rows 8 to 10. Its event links I. The phone opens I and calls `input(...,"Use the existing serializer.",steer)`. Admission reads the run and request receipt, then stores a queued input. M a boundary later places it, `src/harness/inbox.ts:71-120`. The phone shows queued, then placed, not immediate delivery.
5. The first review has already pinned B. `setOptions` changes only W1's option document to C for the reviewer. At the second `w1.review_start`, W1 reads Work, the build, and current options, configures R to C, submits with the build ID, stores its selected settings and receipt, emits, and ends, in that order. A rerun uses the saved selection, not a newer option value. The phone can show first review B and second review C.
6. M a model error ends the run and records failure, `src/harness/generation.ts:493-495`. W1's stage stays unchanged. The owner opens I, reads the failure, and submits fresh input such as "Continue the implementation." Admission starts another run. Alternatively, `continue` retries the unanswered context when idle. No task is revived. W1's publishing checks still apply. This follows the settled walk, without adding a failure watcher.
7. `faults(P,...)` reads terminal task pages and returns faulted records, including `w1.review_start`. It writes nothing. M `faulted` has an error snapshot, `src/types.ts:651-656`. The phone shows the task, error, and conversation link. No decision is required. Today's docs lack this endpoint.
8. `bind(Q,q,[w2])`, then `setOptions(Q,w2,{model:A})`, then `create(Q,w2)` and input. W2 commits F1, its due task, Book, receipt, and event as in walk.md. `addWorkflows(Q,[w1])` persists the union and installs W1. W2's agent and sleeping timer do not change. W1 options remain unset until supplied. The client can now choose either workflow for a new conversation.
9. Start reads server setup, tokens, static workflow exports, and catalogue. For each project it takes the lock, opens SQLite with scheduling paused, checks identity and workspace, reads its selection and validates configured options, installs exactly that project's extensions plus coding-tools, then calls `resume()`. P retains W1's C and existing agents. Q retains both workflows, W2 options, Book, F1, and its timer. M `resume` enables scheduling, `src/harness/types.ts:897-903`. Recovery uses stored agents, task checkpoints, receipts, and queues, not entry initialization again. Missing code or invalid options leaves that project unavailable, visibly reported, without defaulting or disturbing the others.

## 3. Binding a project and choosing workflows.

Bind takes a client-chosen stable project ID, a server-configured workspace key, and workflow names. W2's workspace may have no working directory. A client never supplies a server path. Server setup maps workspace keys to execution environments and directories.

Use `~/.render/catalogue.json` for IDs mapped to host-owned `projects/<id>/` directories. Validate IDs as single safe names. Each directory holds `store.sqlite` and its lock. The host defines a session document `ProjectBinding` holding the ID, workspace key, and workflow names. The store layer still knows no project. The event-log ID remains in its existing core document.

Serialize binding, selection changes, and client creation per project. Serialize catalogue replacements across projects too. Bind creates or verifies the store identity first, then writes and closes a temporary catalogue file and renames it in the same directory. Do not resume before publication. A crash before publication can leave an unlisted directory. Retrying the same ID verifies and reuses it. Equal binds return the binding. Different fields for an existing ID return conflict. A copied store with a different identity is refused.

Static application wiring supplies names, descriptions, Extension values, entry functions, and optional option descriptors. Neither core layer imports workflow modules or the standard library. The composition root does. Discovery reports these exports, not installed packages or files found in a project. The descriptor sits beside the Extension. It does not wrap or extend it.

Version one supports additions only. Removal is refused, so existing work never loses its definitions. Before adding, validate the proposed registry in memory, commit the selected union, then install it before acknowledging. Retry repairs an interrupted installation. M `Registry.install` replaces by name and validates task collisions, `src/harness/registry.ts:74-91`.

Every new conversation gets an explicit extension selection. Added workflows do not enter existing agents. M the absent-selection default is every installed extension, `src/harness/types.ts:631-633`. W0 selects only coding-tools. M this extension supplies read, write, edit, and bash, `src/tools/index.ts:27-35`. Workflows set selections on conversations they create. Existing task definitions remain available after additions.

## 4. Options per project.

Use a workflow-owned session document, not a file manager. A JSON file beside the store is readable but cannot commit with a dispatch. A JSON file in the working directory also risks Git changes and differs across worktrees. A store document uses the existing project scope and commits with the settings it supplies. M `defineDoc` supports session scope, `src/documents.ts:38-41`.

The library helper takes a document the workflow defines. It owns no document or commit:

```ts
projectOptions<T extends JsonObject>(doc: SessionDocToken<{ value: T | null }>, schema: Schema<T>): {
	schema: Schema<T>;
	read(tx: Tx): Promise<T | null>;
	write(tx: Tx, value: T): Promise<void>;
}
```

`read` checks stored values against the schema. `write` replaces the value through the caller's tx. Missing values stay null, meaning unconfigured. There is no hidden model default.

W1 and W2 each define their document with `scope:"session"`, `version:1`, and `initial:()=>({value:null})`, under kinds `w1.options` and `w2.options`. Each document's value type is its schema's `Static` type or null. Their declarations use the helper:

```ts
const Model = obj({ provider: str(), modelId: str() });
const w1Options = projectOptions(W1OptionsDoc, obj({
	designer: Model, implementer: Model, reviewer: Model,
	baseBranch: str({ minLength: 1 }),
}));
const w2Options = projectOptions(W2OptionsDoc, obj({ model: Model }));
```

These are closed objects. Host validation checks shape, not Git state. W1 checks and resolves the branch to a SHA when planning the worktree. Changed base options do not change an existing plan.

The host receives only `{schema,read,write}` and `entry(tx):Promise<AgentChange>` beside each workflow name. It compiles schemas once, checks a full client value without coercion, returns field errors without writing, then checks the workflow is selected and calls `write` inside a project commit. Workflow validation errors roll that commit back. M pi-schema exports JSON schema builders and compilation, `/tmp/render-ground/pi/packages/schema/src/index.ts:1-2,35-36`. The schema checks ModelRef shape. It does not promise availability. M missing models can fail a run as `no_model`, `src/harness/live.ts:93-107`. The host never searches for role names inside a value.

Only authenticated owner calls write options in the supported contract. No option-writing agent tool exists. Trusted extensions and same-account shells remain an accepted trust limit. Replacements are last-writer-wins, including a late resend. Read before editing.

Replace the fixed `entry` value with a document-only function. The host passes it through `ConversationCreateOptions.init` and calls `configure` there. M init runs after creation and permits document access, `src/harness/types.ts:544-555`. Entry refuses unconfigured options, rolling back creation. It returns a model and explicit extensions, so the first agent cannot start model-less.

Options apply at workflow dispatch, not at each provider request. W1 snapshots settings per build or design dispatch in Work and configures before admission in that commit. Existing runs remain pinned. Crash recovery uses that saved selection. A phase that never committed can select newer options. A fresh workflow dispatch reads the latest value. Direct chat recovery keeps the conversation's model. W2 reads its model for entry, so its model option affects new conversations only. No global scan rewrites agents when options change.

## 5. Faulted tasks.

Return `{items:[{id,kind,conversationId,owner?,background,startedAt?,endedAt?,error}],next?}`. Include all faulted tasks, whether a decision points at them or not. This is history, not an unresolved-work count. Do not claim that a missing inbox item means unreferenced.

Inside a host commit that writes nothing, call `tx.scanTasks({status:"terminal",order:"descending"},limit,cursor)`, then filter `state.outcome.status === "faulted"`. The limit defaults to 100 and accepts integers 1 through 100. Empty pages can still have `next`. M the query supports status, not outcome, `src/types.ts:849-857`; SQLite applies those filters, `src/storage/sqlite/storage.ts:466-506`. Full traversal inspects every terminal record, so cost grows with terminal history. No report-only cache or new index is needed.

A later retry needs the task definition, retained input, workflow receipts, and a rule for stale work and duplicate effects. Clean-up needs dependency and retention rules. Neither operation is offered here.

## 6. Joining a running agent.

Step 4 uses the same open, input, and submission calls as W0. Host input modes map to `whenBusy:"steer"` or `"followUp"`. An optional only-if-running flag maps to `whenIdle:"reject"`. M these are supported fields, `src/harness/types.ts:77-91`. Steer does not interrupt a tool or guarantee the current run consumes it. After-answer hooks can keep a conversation busy while input waits for the next run. M `src/harness/types.ts:85-87`.

The host lists every agent conversation, including ownerless workflow agents. W1 emits links to I and R on handoff. The phone opens those IDs without reading Work or understanding roles. History remains available after restart. Disconnect only ends observation.

For `setModel`, the host checks `LiveDoc.run` in the same commit before `configure`, refusing a busy conversation. M run state is read during admission too, `src/harness/submissions.ts:251-263`. It exposes no general settings editor.

W1 must keep accepted design IDs, candidate SHAs, review subjects, cancellation, and receipts in durable state. Tools check those records regardless of what a message asks. A steer is user input, never an approval or a new candidate. Reviewer reads stay pinned to Git objects. Publish and handover checks stay as walked. Chat alone cannot approve a decision, change an immutable basis, repair a task definition, revive a faulted continuation, waive worktree ownership checks, or prove that a model followed instructions. Step 6 starts new agent work. It does not repair `w1.review_start`. The accepted shell limit still permits bypass outside this contract.

## 7. What changes in `docs/core`.

All additions below are Proposed. Owner rulings remain Decided.

1. `README.md`, `topology.md`: binding, discovery, additive selection, layout, and restart order. Home: core host.
   Checks 1,2: steps 1,8 cannot select workflows remotely. M registry operations provide no project catalogue, `src/harness/registry.ts:61-91`.
   Checks 3,4: a workflow-side bind cannot open its own unopened store. W0 and W2 need the same routing.
   Check 5: host records and calls, no scheduler or workflow terms.
2. `README.md`, `primitives.md`: the capability table, including all-conversation discovery, steer, and recovery. Home: core host.
   Checks 1,2: steps 4,6 lack client access. M `submit` is an in-process call, `src/harness/types.ts:829-849`.
   Checks 3,4: a W1 diagnostic tool needs an agent run and does not serve W0. A workflow-blind phone needs authenticated reads and submissions.
   Check 5: narrow adapters over existing records, no new execution loop.
3. `primitives.md`: replace entry value with `entry(tx)` and admit only workflow-declared option reads and replacements. Home: core host.
   Checks 1,2: first agents lack per-project models. M creation accepts settings but has no project option contract, `src/harness/types.ts:550-555`.
   Checks 3,4: a W1 option-writing tool cannot set its first agent's model before that agent runs. W1 and W2 both need client configuration.
   Check 5: one descriptor and entry function. No general document exposure or lifecycle callbacks.
4. `README.md`: expose `faults` over terminal task scans, not just `inspect`. Home: core host.
   Checks 1,2: step 7 has no inbox entry. M `TaskQuery` has no outcome filter, `src/types.ts:849-857`.
   Checks 3,4: a W1 reporting tool cannot give a workflow-blind phone the same list for W0. The client clause applies.
   Check 5: a bounded scan and filter, with no index, cache, or retry mechanism.
5. `library.md`: add `projectOptions`. Home: standard library. Its four checks pass. Callers are W1 entry and review dispatch, plus W2 entry. Skipping it preserves the same calls and guarantees. Workflow-owned documents supply storage, with no library-owned kind, commit, or timer. It knows values and schemas, not roles. Keep `role` and `prose` unchanged.
6. `library.md`, `walk.md`, `workflows.md`: write W1 and W2 option documents, entry functions, dispatch snapshots, and conversation links. Home: workflow and host model wiring. No new shared helper. Run failures remain as walked. No new inbox policy.
7. `README.md`: close the answered questions. Home: accepted limit for duplicate conversation creation, owner capability requirements for the rest. Duplicate creation can start duplicate work. I would normally deduplicate it. Here the ruling wins, without a deduplication mechanism.

## 8. Not verified.

No pi-durable probe ran. No product code, client, option helper, complete workflow, or restart sequence ran. Measurements here are source readings. Reported: `docs/core/grounding.md:26-29` says the 1.5.1 and 1.5.2 durable dist files are identical. I did not repeat that comparison. Fault scan latency, simultaneous owner edits, registry additions during live work, and catalogue publication recovery need tests before build acceptance. Existing power-loss, shell, workflow-upgrade, and unsent-annotation limits remain.
