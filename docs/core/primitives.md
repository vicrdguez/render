# Primitives the core adds to pi-durable

pi-durable persists conversations, tasks, and documents. It has no way to ask a human, to record what the human decided on, or to show what happened in terms a client understands without knowing the workflow. The core adds two primitives for that: Decision and Event.

The two primitives are **Decided**. The shapes and rules below are **Proposed**. They are the result of the [arena](arena.md), and they replace the first draft.

## Why a decision is not a waiting task

A pi-durable task waits on other tasks or sleeps until a time. It has no state for "wait for something outside" (measured, `src/types.ts:660-693`).

So the work that asks ends. The answer starts new work.

## Three substrate rules that shape everything here

1. **A commit cannot read a table after it writes one.** `tx.entry()`, `tx.task()`, and the scans throw `ReadAfterWrite` once `appendEntry()` or `createTask()` has run. `submit(tx, draft)` throws too. Documents can be read and written at any point (measured, `src/session/transaction.ts:1140-1156`, and checks 3 and 5 of `spikes/substrate.mjs`).
2. **A task has an owner.** A task that a host commit creates must name its conversation, or `createTask` throws (measured, `src/session/transaction.ts:488-489`).
3. **Code can run twice.** A phase or a hook can run again after a crash (reported). Every operation here must give the same result when it repeats.

## Decision

A Decision is a durable request to the human. It names exactly what the human reviews, it records who answered, and it starts the work that follows.

```ts
type Decision<C extends string = string> = {
	id: DecisionId; // `${subject}#${n}`, new for each request
	subject: string; // `${extension}:${key}`, one open decision per subject
	title: string; // one line for the inbox
	basis: EntryId; // the entry the human reviews, in this store
	choices: readonly [C, ...C[]]; // opaque to the core, for example ["approve", "revise"]
	conversation: ConversationId; // owns the task that runs after the answer
	then: { task: string }; // the task that runs after the answer
	requestedAt: number; // the Harness clock, passed by the caller
} & (
	| { status: "open" }
	| { status: "answered"; choice: C; notes?: string; by: DeviceId; at: number; continuation: TaskId }
	| { status: "superseded" }
	| { status: "withdrawn" }
);
```

Decisions live in documents. One session document family holds a decision per ID. One session document lists the open decision of each subject, and a client watches it to see what needs you.

Why each field is there:

- **`id` is new for each request.** A revised design gets a new ID. An answer aimed at the old ID cannot land on the new content. This is the main guard against a stale answer.
- **`basis` is an entry ID.** Entries never change, so the ID names exact content with no hash, and a client can always fetch and show it. For work outside the store, the workflow appends an entry that records a content address, such as a commit SHA, with the summary you read.
- **`title` and `requestedAt`** let an inbox show and sort decisions from many projects without knowing any workflow.
- **`conversation`** is required by substrate rule 2.
- **`by` is a device.** One human uses several devices. Agents never answer.
- **`continuation`** is the ID of the task that the answer created. A client that retries gets it back.

### `request(tx, draft)` and `withdraw(tx, subject)`

Extension code calls these inside its own commit.

`request` takes `then` as a typed task whose input is `{ decision: DecisionId; choice: C }`. TypeScript then checks that the task accepts every choice in the request. The task reads the notes and the basis from the decision document. The core stores only the task's name.

The caller passes the time. A tool reads it from `api.now()` and a task from `runtime.now()`, and both return the Harness clock (measured, `src/harness/types.ts:263-264`, `src/types.ts:342-343`). A `Tx` has no clock.

`request` reads and writes documents only. Substrate rule 1 makes that matter. A workflow can call `request` anywhere in a commit, after it appends the basis entry and before it calls `submit(tx, draft)`.

| Call | Result |
| --- | --- |
| The subject has no open decision. | Opens one. |
| The subject has an open decision, and every field of the draft is equal. | Returns the open decision and writes nothing. |
| The subject has an open decision, and any field differs. | Marks it superseded and opens a new one. |
| `withdraw`, and the subject has an open decision. | Marks it withdrawn. Creates no task. |

The second row is what makes a repeated phase safe.

### `answer(id, { basis, choice, notes }, device)`

Only the host calls `answer`, for a client. It runs in one commit, and it reads before it writes.

| State | Condition | Result |
| --- | --- | --- |
| No such decision | | Refuses with `unknown_decision`. |
| Answered | The basis, choice, and notes all equal the record. | Returns the record with `repeated: true`. Writes nothing. The first device stays as `by`. |
| Answered | Any of them differs. | Refuses with `conflict` and returns the record. |
| Superseded or withdrawn | | Refuses with `not_open` and returns the subject's open decision, if it has one. |
| Open | The quoted basis differs from the stored basis. | Refuses with `stale_basis`. |
| Open | The choice is not in `choices`. | Refuses with `unknown_choice`. |
| Open | No installed extension provides the `then` task. | Refuses with `workflow_not_loaded`. The decision stays open. |
| Open | None of the above. | Records the answer, the device, and the time. Creates the `then` task in `conversation`, with the decision ID and the choice as its input. Stores the task's ID. Clears the subject's open slot. |

A refusal is a returned value. A storage failure is different. The call rejects, and the outcome is unknown (measured, `src/types.ts:1333-1344`). The client sends the same fields again, and the "Answered" rows make the retry converge.

Two answers that arrive at once run one after the other. One wins, the other reads the winner's record, and one task is created (measured, check 7 of `spikes/substrate.mjs`).

The full answer-shaped commit ran on SQLite: read a session document, write it, find a task by name, and create it in a named conversation (measured, check 2).

### What the workflow must do

The core cannot enforce these. They belong in the guide for workflow authors.

- **Make the `then` task safe to run twice.** When it submits to an agent, it passes the decision ID as `requestId`. A reused `requestId` returns the earlier submission (measured, `src/harness/submissions.ts:231-239`).
- **Check the world again.** A matching basis proves which content you answered. It does not prove that outside facts still hold. In W1, the `then` task of the final decision checks that the branch still points at the SHA in the basis entry before it hands the branch to you.
- **Withdraw on cancel.** When the work behind a decision is cancelled, the same commit withdraws the decision.
- **Keep task names stable.** A renamed `then` task leaves its open decisions unanswerable until the workflow requests them again.
- **Accept old decisions after an upgrade.** See the next section.

### A workflow upgrade is a known gap

The `then` task does not exist until the answer. So `createTask` uses whatever definition is installed at answer time (measured, `src/session/transaction.ts:492-501`). New code can give an old decision a new meaning. The cross-judge found this, and no candidate had covered it.

The obvious fix is to store the task's version on the decision and refuse an answer when the installed version differs. That fix is not adopted, for two reasons.

- A pi-durable task version describes the shape of stored input and checkpoints (measured, `src/types.ts:369-370`). It changes when the shape changes, and it does not change when the behaviour does. So the check would refuse harmless upgrades and pass harmful ones.
- A refused decision would stay stuck. The work that asked has ended, and the core has no hook that makes an upgraded workflow ask again.

So the duty sits with the workflow for now. An upgraded `then` task handles every decision that its older versions requested. A decision that the new code cannot honour is withdrawn before the upgrade. The W1 walk must show whether that is enough.

### What stays out

Approval policy, routing per choice, expiry, quorum, and comment threads are workflow concerns. A workflow that wants a decision to expire sleeps and then withdraws it.

The core emits no events about decisions. See "Decision and Event do not depend on each other" below.

### Only a human answers, and how far that holds

`answer` is exported to the host only. The entry point for extensions does not have it, no tool wraps it, and an import check can enforce that.

That stops mistakes. It does not stop an agent with a shell. The built-in `bash` tool passes the server's environment to the command by default (measured, `src/tools/bash.ts:84-86`), and a shell that runs as the server's OS user can read the store and any token file.

So "only a human answers" is a guarantee only when agent shells cannot reach the device tokens or the store. That takes an execution environment outside the server's account. pi-durable's `env` option is where a host passes one in, and pi-env ships one that runs tools on another machine or account over SSH (measured, `packages/env/README.md:3-4`, not run). Whether Render requires it is the first open question in the [README](README.md).

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
- An event is a typed entry in that conversation. The extension defines the kind with pi-durable's `defineEntry` and prefixes it with its own name, for example `w1.design.revised` (measured, `src/entries.ts:6-12`).
- `emit` appends inside the caller's commit. The event exists only if the change it describes committed.
- Entry IDs give one order inside a store. Across projects the host merges by `at`.
- pi-durable records which task appended an entry, so attribution is free (measured, `byTaskId` in `src/types.ts:460-476`).
- `emit` is a table write. By substrate rule 1, a commit calls it after its table reads and after any `submit(tx, draft)`.
- An event log was written, closed, and read back on SQLite (measured, check 4).
- An extension reads events back with pi-durable's own entry reads. It needs the ID of the log conversation first, and how the core hands that over is not designed.

Events are history. They schedule nothing. Reactors with cursors stay out until two extensions must hear each other. Ultimate's design, where a cursor advances in the handler's transaction, is the path when that day comes (reported).

## Decision and Event do not depend on each other

The first draft had `request` emit a `decision.requested` event. The arena removed that, for three reasons.

- It would make `request` a table write. A workflow could then no longer call it before `submit(tx, draft)` or before a table read in the same commit.
- A workflow can emit its own event in the same commit, in its own words. "Design v2 is ready for review" reads better than "decision requested".
- The decision documents already hold the history. A client that wants one merged timeline sorts decisions and events by time.

The cost is that a workflow that emits nothing has an empty timeline. Its decisions still show in the inbox.

## What each need reuses

| Need | pi-durable part | New in the core |
| --- | --- | --- |
| The decision record | A session document family, written in the caller's commit | The shape and the rules above |
| The exact basis | Immutable entries with IDs | An equality check in `answer` |
| Work after the answer | `tx.createTask` in the commit that records the answer | Nothing |
| Finding the `then` task by name | `registry.snapshot().task(name)` | Nothing |
| Telling an agent the answer | `submit(tx, draft)` from the `then` task | Nothing |
| The event record | A typed entry from `defineEntry` | The `text` and `at` fields, and `emit` |
| A live inbox and timeline | A watch on a document and on a conversation | Nothing |

## How an extension reaches the core

A Render extension is a pi-durable `Extension` with no wrapper. It bundles tools, prompt sections, hooks, wraps, and tasks under a name (measured, `src/harness/types.ts:424-433`).

It imports three functions from the core: `request`, `withdraw`, and `emit`. Each takes the `tx` that the extension already holds, and the `tx` names the store. So nothing is injected, and no registration step exists.

A project's configuration lists extension names. The host maps each name to a module through static imports, so TypeScript checks them. The host does not scan a project directory for code to run.

Each project has its own registry, which holds exactly its extensions. With no explicit selection, a conversation gets every installed extension in install order (measured, `src/harness/types.ts:632-633`). A workflow that runs several roles selects extensions and tools per conversation.

One point is open. A conversation with no explicit selection follows the project's list, so a change to the list changes running work. Candidate 2 proposed that the host writes an explicit selection on each new conversation.

A stored name outlives its code. A task whose definition is gone shows as blocked with `missing_task` (measured, `src/harness/types.ts:793-798`). Task names are unique in a registry, so each carries its extension's prefix (measured, `src/harness/registry.ts:24-26`).

Ultimate adds lifecycle callbacks, client actions, document exposure, and typed services to its extensions (reported). Render adds none. Tasks cover lifecycle, Decision covers actions, and imports cover services. Each one enters only through the admission rule in the [README](README.md).

## Not verified

- A crash in the middle of an `answer` commit was not tested. Checks 1 and 6 close the store cleanly.
- The decision document family and the open-subject list have not been built. The checks used one plain document.
- No workflow upgrade has been walked through with open decisions.
- SQLite opens with `synchronous = NORMAL`, so the newest commit can be lost when the power fails (measured, `chord/src/sqlite/node.ts:220-221`). An answer inherits that limit. Changing it means the host opens the database itself, which was not checked.
