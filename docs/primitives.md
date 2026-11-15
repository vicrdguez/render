# Decision and Event

A Decision is a durable request for a human answer. An Event is an entry that a client can show in a timeline without knowing the extension that wrote it. Extensions use these records inside their own commits.

## Decision

The store defines these types in `core/src/store/types.ts`:

```ts
export type DecisionId = `${string}#${number}`;
export type DeviceId = string;
export type Annotation = {
	text: string;
	range?: { start: number; end: number };
};
export type Decision<C extends string = string> = {
	id: DecisionId;
	subject: string;
	title: string;
	basis: EntryId;
	choices: readonly [C, ...C[]];
	conversation: ConversationId;
	then: { task: string };
	requestedAt: number;
} & (
	| { status: "open" }
	| {
			status: "answered";
			choice: C;
			annotations: readonly Annotation[];
			by: DeviceId;
			at: number;
			continuation: TaskId;
	  }
	| { status: "superseded" }
	| { status: "withdrawn" }
);
```

IDs are local to a store. A subject identifies the work under review. Use an extension name and key, such as `w2:forecast`. Each new decision for a subject gets an ID of the form `${subject}#${n}`. A subject has at most one open decision.

The basis is an entry whose data includes the `text` the human reviews. An annotation without a range applies to the whole basis. A range uses UTF-16 code units, as in `text.slice(start, end)`. Its endpoints must be integers with `0 <= start <= end <= text.length`.

The store keeps decisions in documents and keeps an open list indexed by subject. Each open list item holds the ID, title, request time, and conversation.

## Request, withdraw, and read

`request(tx, draft)` takes the following draft, defined in `core/src/store/decisions.ts`:

```ts
export type DecisionInput<C extends string> = {
	decision: DecisionId;
	choice: C;
};
export type RequestDraft<
	C extends string,
	S extends { phase: string },
	R,
	H extends object,
> = {
	subject: string;
	title: string;
	basis: TypedEntry<{ text: string }>;
	choices: readonly [C, ...C[]];
	conversation: Decision["conversation"];
	then: Task<DecisionInput<NoInfer<C>>, S, R, H>;
	requestedAt: number;
};
```

The caller supplies the time. The typed basis comes from an entry read or append. `request` stores its ID, not its text.

| Open decision for the subject | Result |
| --- | --- |
| None | Opens a decision with a new ID. |
| All draft fields except `requestedAt` match | Returns the open decision with its original time and writes nothing. |
| Any other draft field differs | Marks the open decision superseded and opens a new decision. |

For comparison, `then` means the task's name and `basis` means the entry ID. A newly appended basis has a new ID even if its text matches. An identical request after an answer opens another decision.

`request` reads and writes documents only, so it can run before or after table operations in a commit. `withdraw(tx, subject)` marks the open decision withdrawn and clears its slot without creating a task. If there is no open decision, it does nothing. `decision(tx, id)` reads a decision or returns `undefined` if the ID does not exist.

## Answer

The host calls `answer` for a client with a decision ID, the basis ID, a choice, annotations, and the authenticated device ID. The host supplies the answer time. Refusals are returned values. A storage failure rejects the call and leaves its outcome unknown, so the client can resend the same fields.

The store checks the rows in this order:

| Decision state | Condition | Result |
| --- | --- | --- |
| Missing | Any input | Refuses with `unknown_decision`. |
| Superseded or withdrawn | Any input | Refuses with `not_open` and includes the subject's open decision if one exists. |
| Answered | Basis, choice, or annotations differ | Refuses with `conflict` and includes the answered decision. |
| Answered | Fields match and the continuation is not terminal with a `faulted` outcome | Returns the decision with `repeated: true` and writes nothing. |
| Answered | Fields match, the continuation faulted, and its task is available | Creates a replacement task, stores its ID, and returns the decision with `repeated: true`. |
| Answered | Fields match, the continuation faulted, and its task is unavailable | Refuses with `extension_not_loaded` and writes nothing. |
| Open | Basis differs | Refuses with `stale_basis`. |
| Open | Choice is not offered | Refuses with `unknown_choice`. |
| Open | An annotation range does not fit the basis text | Refuses with `bad_annotation`. |
| Open | The task is unavailable | Refuses with `extension_not_loaded`. The decision stays open. |
| Open | All checks pass | Records the answer, creates the task, clears the open slot, and returns `repeated: false`. |

An equal resend compares annotations in order, including their text and range. It keeps the original answering device and time. Only a `faulted` continuation causes a replacement. The replacement starts the task again with the same input.

The answer and its task land in one commit. The store keeps the task's name in the decision and looks up the installed task when the answer lands. The task belongs to the decision's conversation and runs in the background, so stopping the conversation's agent does not abort it. Its input is `{ decision, choice }`. The `request` type checks the task against the decision's choice type.

## Who can answer

The real `answer` is not exported from a package entry. The host reaches it through the authenticated client call, not through an extension function or an agent tool. A device is a paired client identity whose token authenticates calls. See [Protocol](protocol.md) for pairing and tokens.

This boundary prevents an extension from answering by mistake. It is not a sandbox. An agent with access to the server's account, store, or device tokens can act outside the extension interface.

## Event

The store defines the event data in `core/src/store/types.ts`:

```ts
export type EventData = {
	text: string;
	at: number;
	conversation?: ConversationId;
};
```

An extension defines an entry kind and calls `emit(tx, kind, data)`. The data includes text a client can display and a caller-supplied time. It can include extension-specific fields. Use the extension's name as a prefix for the kind.

`emit` appends the entry in the caller's commit. The event is committed with the change it describes. Each store has an ownerless conversation for its event log, created when the store opens. `eventLog(tx)` returns its ID. Extensions read entries from that conversation with pi-durable's entry reads.

The core does not emit events for decisions. An extension can emit its own event in the same commit.

## Commit order

Within a commit, perform table reads first, then at most one `submit(tx, draft)`, then table writes. `emit`, entry appends, task creation, and conversation creation are table writes. Document reads and writes can occur anywhere in that order. For example, submit first, append the basis entry, then call `request`.

## Tests

`tau/testing` exports `openStore` and `fauxAnswer`. `openStore` opens a harness, creates the store documents and event log when absent, and leaves the scheduler paused. `fauxAnswer` uses the real answer logic with the fixed device ID `!test`. See [Extensions](extensions.md) for extension tests.
