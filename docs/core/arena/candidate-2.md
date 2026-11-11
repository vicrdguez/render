## 1. Core boundary and admission rule

[reported] The target is pi-durable 1.5.2. The owner's second correction reports byte-identical `dist` files between 1.5.1 and 1.5.2, so the 1.5.1 source citations remain applicable.

[measured] The inspected source identifies itself as 1.5.1 (`/tmp/render-ground/pi/packages/durable/package.json:1-3`). Here, measured means source read, not behavior proved by execution. Reported means secondhand evidence. Inferred marks design judgments. Guess marks an untested expectation.

[inferred] Render core owns three modules:

- Host: project routing, exclusive store ownership, model and environment wiring, trusted extension installation, startup and shutdown.
- Decisions and Events: the two agreed durable primitives.
- Client transport: authenticated commands, conversation observation, decision reading and answering, and event reading. Ship a plain client with transcript, pending choices, reviewed content and task failures.

[inferred] With no workflow, a project can create a conversation, select a model, submit input, observe progress, abort current work and reconnect. No planner or coding extension is mandatory. The host adds a usable remote agent, not another execution engine.

[measured] Native `Tx` already creates conversations, entries and tasks and changes typed documents together. `Session.commit` owns the mutation line (`/tmp/render-ground/pi/packages/durable/src/types.ts:989-1087,1195-1205`).

[inferred] Keep scheduling, retries, ownership, compaction and transcript storage below Render. Keep roles, approval policy, Git, workspaces, knowledge sharing and workflow state beside it. W1 owns its enforced review rules, not just its prompts.

[inferred] Admit future core behavior only through an explicit owner decision. Require a concrete failure, evidence that native facilities do not solve it, and two materially different extension consumers. Compare an extension implementation with the proposed core seam. State the invariant, compatibility cost and verification cost. Reject convenience wrappers and mandatory extension dependencies. A necessary host safety repair can enter without waiting for a second consumer.

## 2. How an extension hooks in

[measured] Native `Extension` already contains `name`, `tools`, `sections`, `hooks`, `wraps` and `tasks`. Tasks resolve by name independently of conversation selection (`/tmp/render-ground/pi/packages/durable/src/harness/types.ts:424-444`).

[inferred] A Render extension is trusted TypeScript that exports either this object or a factory returning it. The factory receives project configuration and project-bound Decision and Event functions. Its native tools and task phases call `request(tx, ...)`, `withdraw(tx, ...)` and `emit(tx, ...)` inside their own commits. Continuations read decisions through native document readers. There is no separate workflow interface or command language.

[inferred] Add only factory injection above native `Extension`. Use explicit imports from host configuration. Do not scan project directories for executable plugins. Do not add lifecycle hooks, service registries, custom client actions or live reload until a demonstrated consumer needs them. Both proving workflows use prompts and decisions for human input.

[inferred] Persist each project's selected workflow extension name, or `null`, alongside its explicitly enabled extensions. New conversations get an explicit native selection. Do not silently switch existing work when defaults change. Changing workflow requires a new project until a migration is deliberately provided.

[measured] An unset selection otherwise includes every installed extension. Registry code is not persisted. Duplicate task names are rejected (`/tmp/render-ground/pi/packages/durable/src/harness/types.ts:631-634`; `/tmp/render-ground/pi/packages/durable/test/examples/05-harness.ts:20-23`; `/tmp/render-ground/pi/packages/durable/src/harness/registry.ts:20-27`).

[inferred] Namespace task and subject names by extension. Install configured code before enabling scheduling. Missing configured code blocks project dispatch, not history reading. Keep registries fixed during a host run. Use native task and document versions for upgrades.

## 3. Decision and Event

[inferred] Preserve the baseline union and `then.task`. Add a decision ID, a durable target conversation, and the created continuation ID on answered decisions. The conversation is an explicit, long-lived workflow conversation. It is not an implicitly captured tool invocation.

[inferred] Scope subjects to one project. Prefix them with the extension name and a workflow-owned stable key. `request` supersedes the previous open decision for that subject. Closed decisions remain addressable. Require at least one choice, with nonempty, distinct strings. `withdraw` changes only an open decision and creates no task.

[inferred] For day one, `basis` is the canonical string form of a project-local immutable entry ID. The entry contains the reviewed text and exact input references. Accept an already read or newly appended `TypedEntry` at `request`, then store its ID. Do not accept mutable file paths, `latest`, or a bare digest without a retrieval mechanism. The generic client shows entry text or JSON without requiring a workflow renderer.

[measured] Entries separate immutable application data from model context. Context edits do not rewrite entry data (`/tmp/render-ground/pi/packages/durable/src/types.ts:445-483`).

[inferred] An important revision must create a new basis and supersede or withdraw its old decision in the workflow's commit. Matching `basis` proves which content was answered. It does not prove that external facts remain current. The continuation rechecks workflow state before consequential work.

[inferred] Store decisions in a session-scoped document family. Keep a session document indexing open subjects. The request event's entry ID supplies the decision ID. This needs no second database, sequence allocator or event-sourced reducer. Callers checkpoint the returned ID with their own state in the same commit. A replay reads that state before requesting again.

[inferred] Request code supplies a typed native continuation task handle. Persist its name as `then.task`. Every such task accepts the common input `{ decision: id }` and reads the committed answer and workflow documents. No arbitrary task input comes from the client.

[inferred] Only authenticated client transport exposes `answer(id, basis, choice, notes)`. Actor and time come from the host. No extension host function or agent tool exposes `answer`. In one immediate commit:

1. Read the decision and required entries before table writes. Handle an answered record as the retry case below.
2. Require an open decision, the exact basis and a listed choice. Require the continuation definition to be installed.
3. Record answer, original actor and time. Create one conversation-owned native continuation task. Save its ID, clear the open-subject index and emit the answer event.

[inferred] An identical retry by the same owner, including from another device, returns the saved answer and task ID. Preserve the first device attribution. Changed basis, choice or notes conflicts. Superseded and withdrawn decisions reject answers. Missing definitions leave open decisions unchanged. A storage error means unknown outcome: reconnect and retry the same fields. An answered decision returns its receipt even if code was subsequently removed.

[measured] Storage errors can have unknown outcomes. Native submission deduplication does not compare payloads, so it is not this answer contract (`/tmp/render-ground/pi/packages/durable/src/types.ts:1333-1344`; `/tmp/render-ground/pi/packages/durable/src/harness/submissions.ts:231-239`).

[measured] Native waits target tasks or clocks, not human signals. Table reads after table writes throw (`/tmp/render-ground/pi/packages/durable/src/types.ts:660-693`; `/tmp/render-ground/pi/packages/durable/src/session/transaction.ts:1140-1144`).

[inferred] Thus human waiting is document state, not a parked task. `request` and `emit` use document access and append operations. They must not hide later table reads. A phase can commit its request and finish.

[inferred] Event is a typed, versioned entry in one reserved ownerless conversation per project store. Initialize its address at project creation. Never submit to it. `emit(tx, token, data)` appends in the caller's commit. Read by entry ID with pagination. Unknown event kinds remain readable as JSON. IDs order one store, not the host. Core decision transitions also emit events. Events are history, not automatic scheduling. Leave reactors, cursors, subscriptions with delivery guarantees, expiry and a general approval-policy engine out.

## 4. Topology

[inferred] Choose one server process with one SQLite store, Harness and registry per project. Open configured projects at startup. Clients use one endpoint and select project IDs. Host configuration maps IDs to storage directories; client paths never select files. Each store records its project identity and extension selection.

[measured] `Harness.open` constructs a fresh harness from supplied storage and options (`/tmp/render-ground/pi/packages/durable/src/harness/harness.ts:587-610`).

[inferred] This supports the proposed composition structurally. It is not runtime proof.

[inferred] One store for everything offers cross-project transactions. Reject it now because project ownership would need to be carried through every native access path. A separate store makes that seam explicit without modifying the substrate. One process per project isolates process failures, but needs client connections or a forwarding supervisor. Reject that extra topology.

[inferred] Per-project stores do not isolate malicious extensions or process crashes. They also preclude atomic cross-project commits. Future knowledge sharing can copy an explicitly selected immutable revision with its source reference. Do not implement that protocol now or claim it is free.

[inferred] Local mode is the same server with one configured project and store, not another runtime. Refuse a second writer with a host-owned lifetime lock. Use owner-authenticated transport over an encrypted private connection. Device disconnection never aborts work.

[measured] Upstream requires one writer but supplies no cross-process ownership lock (`/tmp/render-ground/pi/packages/durable/README.md:894`).

## 5. Prose

[measured] The premise is partly wrong: workflows need not implement prompt assembly. Native sections already render in order with committed document access and optional tags; conversation instructions render last (`/tmp/render-ground/pi/packages/durable/src/harness/types.ts:395-414,481-482`).

[inferred] Use that renderer. Workflows own Markdown bodies, typed bindings, procedure selection and tool descriptions. Small static instructions can be ordinary strings. Long prose need not become escaped TypeScript literals.

[inferred] Share a small optional `renderText` helper beside core for W1 and W2. It substitutes literal named slots such as `{{topic}}` once. Missing or unknown bindings fail. Inserted text is not evaluated or expanded again. No conditions, includes, filesystem lookup, template dependency or provenance framework belongs there. Ordinary workflow code selects the body and formats evidence as labeled data. Shared mechanics do not imply shared policy.

[measured] Native section rendering catches ordinary errors and keeps previously shown text (`/tmp/render-ground/pi/packages/durable/src/harness/prompt.ts:21-46`).

[inferred] Therefore missing required prose must block workflow preparation before dispatch. Throwing from a section is not a safety gate. Tool handlers still check current workflow state. Neither slot substitution nor prompt text grants authority.

## 6. Second proving workflow

[inferred] Choose a spaced-recall notebook. The owner pastes several question-and-answer cards. No shell, network research, Git or compute job is required. Optional agent help only rewrites supplied text.

[inferred] A native sleeping task makes each card due. It commits a review entry, a Decision with `remembered` and `again`, a due Event and its terminal outcome. The human can answer cards in any order. Each answer task records the grade and schedules the next sleep. A card revision supersedes its open decision. Removing a card withdraws it; old timers check the card revision before doing anything.

[inferred] This stresses concurrent subjects, recurrence, clocks, stale devices and long periods without an agent invocation. It has no design-to-implementation stages or approval-to-merge path. No reactor is needed: each native task directly commits the next work.

[inferred] Runner-up: a claim notebook over two pasted conflicting texts. Extract claims and ask independent keep, reject or unresolved decisions. It tests local evidence and partial answers but stresses time and restart less.

[inferred] W1 stays an extension: prompt, design checkpoint, comments or approval, implementation, independent review, final human decision. Its final continuation marks exact reviewed source ready for the owner. It never merges main. Only the human performs that merge.

## 7. Risks

[inferred] Trusted in-process extensions can bypass conventions or crash the server. This is not a sandbox. Keep owner transport credentials and merge authority outside agent execution environments. W1 must establish that separation before claiming human-only enforcement. An unrestricted shell under the host account is not sufficient separation.

[measured] Unsafe native tools report interruption rather than automatically replaying; safe replay can execute again (`/tmp/render-ground/pi/packages/durable/src/harness/tool.ts:200-230`).

[inferred] A once-created continuation is not an exactly-once external effect. Extensions own effect reconciliation and cancellation. Cancellation or revision changes must withdraw decisions with workflow state; already-created continuations recheck that state.

## 8. Not verified

[measured] No runtime probes, builds or tests ran. No 1.4.0 result supports this proposal.

[inferred] Before implementation, write failure cases first. Use strict TypeScript, native typed tokens and exhaustive state unions. Validate transport inputs at entry.

[inferred] Required acceptance evidence is still missing: two 1.5.2 SQLite harnesses in one host; restart around answer commits; identical and conflicting concurrent answers; supersession and cancellation races; missing continuation code; timer recovery; a workflow-free agent; and reconnect from a second device.

[measured] Native watches provide structural views with folded updates (`/tmp/render-ground/pi/packages/durable/src/harness/types.ts:886-892`).

[inferred] Reconnect must resnapshot, not treat watches as event replay. Keep these focused acceptance checks. Do not import v1's large schedule suite.

[measured] Upstream documents SQLite process-crash recovery, not lossless power-failure recovery (`/tmp/render-ground/pi/packages/durable/README.md:869-870`).

[inferred] Storage synchronization, backups and host-loss recovery need separate acceptance. Do not promise them from this paper design.
