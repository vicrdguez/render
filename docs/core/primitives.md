# Primitives the core adds to pi-durable

pi-durable persists conversations, tasks, and documents. It has no way to ask a human, to record what the human decided on, or to show what happened in terms a client understands without knowing the workflow. The core adds two primitives for that: Decision and Event.

**Decided.** The two primitives, and the shapes and rules below. The owner locked the design on 2026-11-13. They come from the first [arena](arena.md). The [walk](walk.md) then changed this file in six places. Each change is marked "From the walk" and carries its five checks from the admission rule in the [README](README.md). The owner reviewed the walk and accepted its changes, so those six are **Decided**.

## Why a decision is not a waiting task

A pi-durable task waits on other tasks or sleeps until a time. It has no state for "wait for something outside" (measured, `src/types.ts:660-693`).

So the work that asks ends. The answer starts new work.

## Three substrate rules that shape everything here

1. **A commit cannot read a table after it writes one.** `tx.entry()`, `tx.task()`, and the scans throw `ReadAfterWrite` once `appendEntry()`, `createTask()`, or `createConversation()` has run. `submit(tx, draft)` throws too, and it counts as a table write itself, so a commit holds at most one. Documents can be read and written at any point (measured, `src/session/transaction.ts:1140-1156`, `src/harness/submissions.ts:75-82`, and checks 3 and 5 of `spikes/substrate.mjs`).
2. **A task has an owner.** A task that a host commit creates must name its conversation, or `createTask` throws (measured, `src/session/transaction.ts:488-489`).
3. **Code can run twice.** A tool that declares `replay: "safe"` runs again after a crash, with the same `api.taskId` (measured, K1 of `spikes/crash.mjs`). A phase or a hook can run again too (reported). Every operation here must give the same result when it repeats.

So the order inside one commit is fixed: table reads, then at most one `submit(tx, draft)`, then table writes. Document reads and writes go anywhere.

## Decision

A Decision is a durable request to the human. It names exactly what the human reviews, it records who answered, and it starts the work that follows.

```ts
type Annotation = {
	text: string; // the human's comment
	range?: { start: number; end: number }; // a passage of the basis text; absent means the whole basis
};

type Decision<C extends string = string> = {
	id: DecisionId; // `${subject}#${n}`, new for each request
	subject: string; // `${extension}:${key}`, one open decision per subject
	title: string; // one line for the inbox
	basis: EntryId; // the entry the human reviews, in this store; its data has `text`
	choices: readonly [C, ...C[]]; // opaque to the core, for example ["approve", "revise", "abort"]
	conversation: ConversationId; // owns the task that runs after the answer
	then: { task: string }; // the task that runs after the answer
	requestedAt: number; // the Harness clock, passed by the caller
} & (
	| { status: "open" }
	| {
			status: "answered";
			choice: C;
			annotations: readonly Annotation[]; // empty when the human sent none
			by: DeviceId;
			at: number;
			continuation: TaskId;
	  }
	| { status: "superseded" }
	| { status: "withdrawn" }
);
```

Decisions live in documents. One session document family holds a decision per ID. One session document lists the open decision of each subject, with its `id`, `title`, `requestedAt`, and `conversation`, and a client watches it to see what needs you.

Why each field is there:

- **`id` is new for each request.** A revised design gets a new ID. An answer aimed at the old ID cannot land on the new content. This is the main guard against a stale answer.
- **`basis` is an entry ID.** Entries never change, so the ID names exact content with no hash. For work outside the store, the workflow appends an entry that records a content address, such as a commit SHA, with the summary you read.
- **`title` and `requestedAt`** let an inbox show and sort decisions from many projects without knowing any workflow.
- **`conversation`** is required by substrate rule 2.
- **`by` is a device.** One human uses several devices. Agents never answer.
- **`continuation`** is the ID of the task that the answer created. A client that retries gets it back.

### From the walk: the basis entry carries `text`

The first version let a basis be any entry. An entry's data is any JSON (measured, `src/types.ts:459-476`), so a client that knows no workflow could not show a design or a forecast. All three walks found this at the first answer.

The data of a basis entry now has `text: string`, the text the human reads. The workflow adds its own fields beside it. Event already works this way.

- **Checks 1 and 2.** The phone cannot show V1 in W1 row 3 or F1 in W2 row 5. pi-durable gives entries no display form.
- **Checks 3 and 4.** Every client must read the same field, so a private convention per workflow fails. Both workflows use it, and so does the client.
- **Check 5.** One field. No view type, no renderer, and no Markdown rule.

### From the walk: annotations replace `notes`

The owner asked that Annotation go through the admission rule. The result is a pass, as a list stored with the answer.

| Check | Result | Evidence |
| --- | --- | --- |
| 1. A real failure | Pass | In W1 row 3 the owner comments on two passages. One `notes` string cannot say which comment belongs to which passage. |
| 2. pi-durable does not provide it | Pass | It stores any JSON. Nothing ties a human's comment to an answer and a device. |
| 3. An extension cannot keep the promise | Pass | W1 can pack JSON into `notes` and read it back. A phone that knows no workflow can then neither place a comment nor show the earlier ones. And only the host calls `answer`, so only the core can record who sent a comment. |
| 4. Two unlike users | Pass, on the client clause only | W2 never comments on a passage. A client that knows no workflow cannot do W1 row 3 without one shared shape. |
| 5. A small shape that names no workflow concept | Pass | One list on the answer. No thread, no saved draft, and no reply. |

What the core does with an annotation is store it. The workflow gives it meaning and decides how it is answered. In W1, `publish_design` refuses a new version until each annotation of the last answer has a reply, and the replies are stored in the new design entry (W1 row 5).

The shape, and why it is this small:

- **An annotation without a `range` is a note.** So `notes` is gone, and the answer has one field for what the human wrote.
- **`start` and `end` count as `text.slice(start, end)` does,** in UTF-16 code units. The host checks them against the basis text with that call.
- **An annotation has no ID of its own.** A workflow names one by its decision ID and its place in the list.
- **`by` and `at` come from the answer.** One device sends the whole list.

Three other shapes were weighed.

| Shape | Result | Reason |
| --- | --- | --- |
| Notes only | Rejected | It fails check 1. |
| A client-made ID, a JSON pointer, and a quote on each annotation | Rejected | The decision ID and the index already name it, and the basis is one `text` field that never changes. |
| Annotations saved as entries before the answer | Out for now | A review could then move between devices. It needs a second write call for clients, its own retry rule, and a rule that fixes which annotations an answer includes. The owner accepted the limit: an unsent review stays on the device that holds it. |

One cost is known. A client offers comments on every decision, and a workflow may ignore them. W2 stores them and does nothing more. Candidate 1 proposed a flag on the request that turns comments on. It is not adopted, because the owner's ruling is that the core only stores.

### `request(tx, draft)` and `withdraw(tx, subject)`

Extension code calls these inside its own commit.

`request` takes `then` as a typed task whose input is `{ decision: DecisionId; choice: C }`. TypeScript then checks that the task accepts every choice in the request. The core stores only the task's name.

`request` takes the basis as the record that `tx.appendEntry` or `tx.entry` returned, typed `TypedEntry<{ text: string }>` (measured, `src/types.ts:993,1026-1030`). The compiler then checks that the entry has `text`, and `request` does not have to read a table.

The caller passes the time. A tool reads it from `api.now()` and a task from `runtime.now()`, and both return the Harness clock (measured, `src/harness/types.ts:263-264`, `src/types.ts:342-343`). A `Tx` has no clock.

`request` reads and writes documents only, so it can be called anywhere in a commit. A commit that also submits to an agent calls `submit(tx, draft)` first, then appends the basis entry, then calls `request`.

The first version of this file gave that order backwards. All three walks stopped on it, and the order it gave throws.

| Call | Result |
| --- | --- |
| The subject has no open decision. | Opens one. |
| The subject has an open decision, and every field of the draft but `requestedAt` is equal. | Returns the open decision and writes nothing. |
| The subject has an open decision, and any other field differs. | Marks it superseded and opens a new one. |
| `withdraw`, and the subject has an open decision. | Marks it withdrawn. Creates no task. |

The second row is a backstop. It is not what makes a rerun safe, and the first version of this file was wrong to say so. A tool that runs again appends a new basis entry, so its draft differs and the first decision is superseded (measured, K2). And if the first decision is already answered, the rerun opens a second one. What makes a rerun safe is a receipt that the workflow writes in the same commit. See "Rules for workflow authors" in [Proving workflows](workflows.md).

### `answer(id, { basis, choice, annotations }, device)`

Only the host calls `answer`, for a client. It runs in one commit, and it reads before it writes.

| State | Condition | Result |
| --- | --- | --- |
| No such decision | | Refuses with `unknown_decision`. |
| Answered | The basis, choice, and annotations all equal the record. | Returns the record with `repeated: true`. Writes nothing. The first device stays as `by`. |
| Answered | The same, and the `then` task has ended `faulted`. | Creates the `then` task again with the same input and stores its ID as `continuation`. Returns the record with `repeated: true`. The first device stays as `by`. |
| Answered | Any of them differs. | Refuses with `conflict` and returns the record. |
| Superseded or withdrawn | | Refuses with `not_open` and returns the subject's open decision, if it has one. |
| Open | The quoted basis differs from the stored basis. | Refuses with `stale_basis`. |
| Open | The choice is not in `choices`. | Refuses with `unknown_choice`. |
| Open | A range does not fit the basis text. | Refuses with `bad_annotation`. |
| Open | No installed extension provides the `then` task. | Refuses with `extension_not_loaded`. The decision stays open. |
| Open | None of the above. | Records the answer, the annotations, the device, and the time. Creates the `then` task. Stores the task's ID. Clears the subject's open slot. |

A refusal is a returned value. A storage failure is different. The call rejects, and the outcome is unknown (measured, `src/types.ts:1333-1344`). The client sends the same fields again, and the "Answered" rows make the retry converge.

Two answers that arrive at once run one after the other. One wins, the other reads the winner's record, and one task is created (measured, check 7 of `spikes/substrate.mjs`).

The answer and its task land together or not at all. A process killed inside the commit left an open decision and no task. A process killed right after it left both (measured, K6).

### From the walk: who owns the `then` task

The first version did not say. Two walks gave opposite answers, and the third missed the question.

`answer` creates the `then` task owned by the decision's `conversation`, with `background: true`.

A task without that flag is aborted when a client presses Stop in its conversation. A task with it is left alone (measured, `src/harness/scheduler.ts:668-691`, P1 of `arena-walk/candidate-1-probe.mjs`, and check E of `arena-walk/candidate-3-probe.mjs`). An answer is the owner's act, and a Stop aimed at an agent's run must not cancel it. The cost is that the workflow must cancel on purpose. W1 does so with an "abort" choice on every decision (W1 rows X1 to X6).

- **Checks 1 and 2.** A Stop in D between W1 rows 3 and 4 would abort T1 and leave A1 answered with nothing after it. pi-durable gives the flag and no rule.
- **Checks 3 and 4.** The core's own commit creates the task, so no extension can set the flag. Both workflows have `then` tasks.
- **Check 5.** One option on one call.

### From the walk: an answered decision must not be a dead end

The judge named this as the most serious gap in all three walks. The `then` task can throw, or a crash loop can end it. pi-durable then marks it `faulted`, and a terminal task never runs again (measured, `src/harness/scheduler.ts:1944-1957,2428-2441`, K3). The decision is answered, the open slot is clear, and the work that asked is over. Sending the answer again returned the dead task.

The fix is the third row of the table above. An equal resend creates the task again when the old one has ended `faulted`.

- **It was measured.** A commit read the faulted task, created a replacement, and stored its ID, and the replacement ran (K4).
- **It cannot make two live tasks.** Commits run one after the other. The first resend stores the new task. The second reads a live task and writes nothing.
- **The new task starts from its first phase.** That is why a `then` task keys what it has done by the decision ID.
- **Only `faulted` counts.** `failed` and `aborted` are outcomes that the workflow's own code committed (measured, `src/types.ts:630-643`). The core does not undo them.
- **It is not a loop.** A task that throws every time is created once per resend, and a human sends each one.

The host shows an answered decision together with the state of its `then` task, which it reads with `getTask` (measured, `src/harness/types.ts:921`). A faulted task keeps its error message in its outcome (measured, `src/types.ts:651-654`). So a client on any device can show "answered, and the work after it failed", and offer to send the answer again.

- **Checks 1 and 2.** Five kills while a `then` task waited ended it for good (K3). pi-durable has no call that restarts a terminal task (none found in `src/types.ts` or `src/harness/types.ts`).
- **Checks 3 and 4.** Only `answer` writes `continuation`, and only the host calls `answer`. Both workflows have `then` tasks.
- **Check 5.** One row in one table. No timer, no loop, and no new call for clients.

### A workflow upgrade is an accepted limit

The `then` task does not exist until the answer. So `createTask` uses whatever definition is installed at answer time (measured, `src/session/transaction.ts:492-501`). New code can give an old decision a new meaning.

The obvious fix is to store the task's version on the decision and refuse an answer when the installed version differs. That fix is not adopted, for two reasons.

- A pi-durable task version describes the shape of stored input and checkpoints (measured, `src/types.ts:369-370`). It changes when the shape changes, and it does not change when the behaviour does. So the check would refuse harmless upgrades and pass harmful ones.
- A refused decision would stay stuck. The work that asked has ended, and the core has no hook that makes an upgraded workflow ask again.

The owner accepted this as a limit. The workflow owns it. An upgraded `then` task handles every decision that its older versions requested, and a decision that the new code cannot honour is withdrawn before the upgrade. No walk covered an upgrade.

### What stays out

Approval policy, routing per choice, expiry, quorum, comment threads, and replies to annotations are workflow concerns. A workflow that wants a decision to expire sleeps and then withdraws it.

The core emits no events about decisions. See "Decision and Event do not depend on each other" below.

### Only a human answers, and how far that holds

`answer` is exported to the host only. The entry point for extensions does not have it, no tool wraps it, and an import check can enforce that.

That stops mistakes. It does not stop an agent with a shell. The built-in `bash` tool passes the server's environment to the command by default (measured, `src/tools/bash.ts:84-86`), and a shell that runs as the server's OS user can read the store and any token file. In W1 the same shell can also merge the branch.

So "only a human answers" is a guarantee only when agent shells cannot reach the device tokens or the store. That takes an execution environment outside the server's account. pi-durable's `env` option is where a host passes one in, and pi-env ships one that runs tools on another machine or account over SSH (measured, `packages/env/README.md:3-4`, not run).

The owner accepted the weaker mode for now, as a documented limit. It depends on the tools as well as the environment. W2's conversation has no shell, so the limit does not reach it.

## Event

An Event is one line in a timeline that every client can show.

```ts
type EventData = {
	text: string; // one line a client shows without knowing the workflow
	at: number; // the Harness clock, passed by the caller
	conversation?: ConversationId;
}; // plus the emitter's own fields

declare function emit<D extends EventData>(tx: Tx, kind: Entry<D>, data: D): Promise<EntryId>;
```

- The log is one conversation per store. No agent owns it, it never runs, and it takes no submissions. Ultimate uses the same construction (measured, `server/events.ts:105-127` at ultimate `7eb49b8`).
- The store layer creates the log when it first opens a store, and keeps its ID in a session document.
- An event is a typed entry in that conversation. The extension defines the kind with pi-durable's `defineEntry` and prefixes it with its own name, for example `w1.design.revised` (measured, `src/entries.ts:5-12`).
- `emit` appends inside the caller's commit. The event exists only if the change it describes committed.
- Entry IDs give one order inside a store. Across projects the host merges by `at`.
- pi-durable records which task appended an entry, so attribution is free (measured, `byTaskId` in `src/types.ts:460-476`).
- `emit` is a table write. By substrate rule 1, a commit calls it after its table reads and after its `submit(tx, draft)`.
- An event log was written, closed, and read back on SQLite (measured, check 4).

Events are history. They schedule nothing. Reactors with cursors stay out until two extensions must hear each other. Ultimate's design, where a cursor advances in the handler's transaction, is the path when that day comes (reported).

The walk found one reader among the extensions, W2's `calibration` tool, and it could have read W2's own document instead. So Event rests on the client alone: a client that knows no workflow shows one timeline.

## Decision and Event do not depend on each other

The first draft had `request` emit a `decision.requested` event. The first arena removed that, for three reasons.

- It would make `request` a table write. A workflow could then no longer call it before a table read in the same commit.
- A workflow can emit its own event in the same commit, in its own words. "Design v2 is ready for review" reads better than "decision requested".
- The decision documents already hold the history. A client that wants one merged timeline sorts decisions and events by time.

The cost is that a workflow that emits nothing has an empty timeline. Its decisions still show in the inbox.

## What each need reuses

| Need | pi-durable part | New in the core |
| --- | --- | --- |
| The decision record | A session document family, written in the caller's commit | The shape and the rules above |
| The exact basis | Immutable entries with IDs | An equality check in `answer`, and the `text` field |
| Work after the answer | `tx.createTask` in the commit that records the answer | Nothing |
| Work after a `then` task faulted | `tx.task` and `tx.createTask` in a later `answer` commit | One row in the `answer` table |
| Finding the `then` task by name | `registry.snapshot().task(name)` | Nothing |
| Telling an agent the answer | `submit(tx, draft)` from the `then` task | Nothing |
| The event record | A typed entry from `defineEntry` | The `text` and `at` fields, and `emit` |
| A live inbox and timeline | A watch on a document and on a conversation | Nothing |

## How an extension reaches the core

A Tau extension is a pi-durable `Extension` with no wrapper. It bundles tools, prompt sections, hooks, wraps, and tasks under a name (measured, `src/harness/types.ts:424-433`).

It imports five functions from the core. Each takes the `tx` that the extension already holds, and the `tx` names the store. So nothing is injected, and no registration step exists.

| Function | Does |
| --- | --- |
| `request(tx, draft)` | Opens a decision. Documents only. |
| `withdraw(tx, subject)` | Closes the subject's open decision. Documents only. |
| `emit(tx, kind, data)` | Appends an event. A table write. |
| `decision(tx, id)` | Reads a decision. A document read. |
| `eventLog(tx)` | Returns the ID of the log conversation. A document read. |

### From the walk: `decision` and `eventLog`

The first version said that a `then` task "reads the notes and the basis from the decision document", and that how an extension finds the log "is not designed". All three walks hit both. Neither function writes, and `answer` stays with the host.

- **Checks 1 and 2.** T1 in W1 row 4 cannot read the annotations, and `calibration` in W2 row 15 cannot find the log. Both are the core's own documents.
- **Checks 3 and 4.** An extension that reads the core's documents by their stored names breaks when the core changes them. Both workflows read a decision.
- **Check 5.** Two reads over a `tx`.

An extension reads the events themselves with pi-durable's entry reads. A scan has no filter by kind (measured, `src/types.ts:838-846`), so a reader pages the whole log and filters with the kind's `is()`.

### How a project gets its extensions

A project's `Project` document lists extension names, workflows among them. The client sets them when it binds the project (see [Host](host.md)). The host maps each name to a module through static imports, so TypeScript checks them. The host does not scan a project directory for code to run.

Each project has its own registry, which holds `coding-tools` and exactly the project's extensions. [Extensions](extensions.md) says what an extension is, what makes one a workflow, and how an agent gets one.

### From the walk: the host sets what a new conversation selects

With no explicit selection, a conversation gets every installed extension in install order (measured, `src/harness/types.ts:632-633`). So in a project that runs W1, a plain conversation would carry W1's tools, and W1's first conversation would carry every tool and no role. A change to the project's list would also change running work.

The host now writes the selection on each conversation it creates for a client.

- A bare conversation stores no selection. It follows the project's default, which the host passes to the harness: `coding-tools`, then the project's extensions that are not workflows. The owner ruled that the bare agent selects `coding-tools`. The owner then agreed that it also gets the project's other tool extensions. See [Extensions](extensions.md). The client sends its model.
- A workflow module may export `entry`: a pi-durable `AgentChange`, or a function of a `tx` that returns one. When the client asks for a conversation of that workflow, the host applies it in the commit that creates the conversation (measured, `src/harness/types.ts:550-555`, H3 of `spikes/host.mjs`).
- Either way the host adds the project's working directory as `cwd`.

A workflow sets the selection itself on every conversation it creates. See `role()` in [Kit](kit.md).

- **Checks 1 and 2.** W1 row 0 has no designer without it. pi-durable takes the settings and does not choose them.
- **Checks 3 and 4.** The host creates the conversation, so no extension is running yet. W1, W2, and the bare agent each need a different first conversation.
- **Check 5.** One optional value of a pi-durable type. The host never looks inside it.

The walk left two points open here, and [Host](host.md) answers both. A workflow keeps its per-project options in a document of its own, and `entry` reads them, which is why it can be a function. And a client names the workflow in the call that creates the conversation.

### What a stored name means

A stored name outlives its code. A task whose definition is gone shows as blocked with `missing_task` (measured, `src/harness/types.ts:793-798`). Task names are unique in a registry, so each carries its extension's prefix (measured, `src/harness/registry.ts:24-26`).

Ultimate adds lifecycle callbacks, client actions, document exposure, and typed services to its extensions (reported). Tau adds none. Tasks cover lifecycle, Decision covers actions, and imports cover services. Each one enters only through the admission rule.

## Not verified

- The decision document family, the open-subject list, and the five functions have not been built. The checks used plain documents with the same shape.
- K6 kills the process inside the commit's callback and right after the commit. It does not kill it in the middle of SQLite's own write.
- No client has placed an annotation on a basis.
- No workflow upgrade has been walked through with open decisions.
- SQLite opens with `synchronous = NORMAL`, so the newest commit can be lost when the power fails (measured, `chord/src/sqlite/node.ts:220-221`). An answer inherits that limit, and the owner accepted it. Changing it means the host opens the database itself, which was not checked.
