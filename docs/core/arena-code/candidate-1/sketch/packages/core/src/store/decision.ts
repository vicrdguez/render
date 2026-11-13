/**
 * Decision: a durable request to the human (docs/core/primitives.md, "Decision").
 *
 * This module is the only writer of the decision documents, so their representation never leaves it.
 * - `request`, `withdraw`, and `decision` are the extension's. src/index.ts re-exports them.
 * - `answer`, `view`, and `watchOpen` are the host's. src/index.ts does not re-export them, and package.json `exports`
 *   makes this file unreachable from outside tau-core.
 *
 * Substrate rule 1 (primitives.md, "Three substrate rules"): `request`, `withdraw`, and `decision` touch documents only,
 * so an extension may call them anywhere in its commit. `answer` makes its own commit and does every table read before
 * its one table write.
 */

import type { Context } from "@earendil-works/chord/context";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { ConversationId, EntryId, JsonObject, TaskId, Tx, TypedEntry } from "@earendil-works/pi-durable";
import { defineDoc, defineDocFamily } from "@earendil-works/pi-durable";
import type { Store } from "./store.ts";

declare const deviceBrand: unique symbol;

/**
 * A paired device's name, `^[a-z][a-z0-9-]{0,31}$`, never used twice (docs/core/protocol.md, "Devices and tokens").
 * Only the host's device check makes one (src/host/devices.ts). An agent never has one.
 */
export type DeviceId = string & { readonly [deviceBrand]: true };

/** `${extension}:${key}`. One open decision per subject. */
export type Subject = `${string}:${string}`;

/** `${subject}#${n}`, new for each request. An answer aimed at an old ID cannot land on new content. */
export type DecisionId = `${Subject}#${number}`;

// ---- Copied from docs/core/primitives.md, "Decision". -------------------------------------------------------------

export type Annotation = {
	text: string; // the human's comment
	range?: { start: number; end: number }; // a passage of the basis text; absent means the whole basis
};

export type Decision<C extends string = string> = {
	id: DecisionId; // `${subject}#${n}`, new for each request
	subject: Subject; // `${extension}:${key}`, one open decision per subject
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

// ---- Derived shapes. -----------------------------------------------------------------------------------------------

export type AnsweredDecision<C extends string = string> = Extract<Decision<C>, { status: "answered" }>;

/** One subject's entry in the open list. The inbox streams these four fields (docs/core/protocol.md, "inbox"). */
export type OpenSlot = {
	readonly id: DecisionId;
	readonly title: string;
	readonly requestedAt: number;
	readonly conversation: ConversationId;
};

/** The input of every `then` task. A `then` task keys what it has done by `decision` (docs/core/workflows.md). */
export type ThenInput<C extends string = string> = { readonly decision: DecisionId; readonly choice: C };

/**
 * A task that accepts every choice in `C`. A pi-durable `Task` whose input is `ThenInput<A>` fits when `C` is a subset of
 * `A`: `initial` is a property here, so TypeScript checks its parameter strictly. test/types.test.ts holds the cases.
 */
export type ThenTask<C extends string> = {
	readonly definition: { readonly name: string; readonly initial: (input: ThenInput<C>) => unknown };
};

/**
 * What an extension passes to `request` (primitives.md, "`request(tx, draft)` and `withdraw(tx, subject)`").
 * - `basis` is the record that `tx.appendEntry` or `tx.entry` returned, so the compiler checks `text` and `request`
 *   reads no table.
 * - `then` is typed by the choices, and the core stores only its name.
 * - `requestedAt` is `api.now()` in a tool or `runtime.now()` in a task. A `Tx` has no clock.
 */
export type DecisionDraft<C extends string> = {
	readonly subject: Subject;
	readonly title: string;
	readonly basis: TypedEntry<{ readonly text: string }>;
	readonly choices: readonly [C, ...C[]];
	readonly conversation: ConversationId;
	readonly then: ThenTask<NoInfer<C>>;
	readonly requestedAt: number;
};

// ---- Documents. Private to this module. Their kinds are stored names and never change. -----------------------------

/** One decision per ID. `record` is absent for an ID that was never requested. */
const Decisions = defineDocFamily<{ record?: JsonObject }, null>({
	kind: "tau.decision",
	version: 1,
	scope: "session",
	family: true,
	initial: () => ({}),
	checkpointWhen: () => false,
});

/** The open decision of each subject. A client watches it through the host's `inbox`. */
const OpenList = defineDoc<{ [subject: string]: JsonObject }>({
	kind: "tau.open",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});

/**
 * The last `n` used for each subject, so a new request gets a new ID even after its subject left the open list.
 * It is also the index of which IDs exist: `${subject}#${n}` exists when `n <= Counters[subject]`.
 */
const Counters = defineDoc<{ [subject: string]: number }>({
	kind: "tau.decision.next",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});

// ---- The extension's functions. -------------------------------------------------------------------------------------

/**
 * Opens a decision on `draft.subject`. Documents only.
 *
 * | The subject has                                              | Result                                       |
 * | no open decision                                             | Opens one with a new ID.                     |
 * | an open decision, and every field but `requestedAt` is equal | Returns the open decision. Writes nothing.   |
 * | an open decision, and any other field differs                | Marks it superseded. Opens a new one.        |
 *
 * The second row is a backstop. A rerun is made safe by the workflow's receipt, not by this.
 */
export async function request<C extends string>(tx: Tx, draft: DecisionDraft<C>): Promise<Decision<C>> {
	// TODO:
	//   slot = (await tx.doc(OpenList))[draft.subject]
	//   if slot: open = record of slot.id
	//     if sameDraft(open, draft): return open           // compare subject, title, basis.id, choices, conversation,
	//                                                     // then.definition.name. Not requestedAt.
	//     mark open superseded
	//   n = ++Counters[subject]; id = `${subject}#${n}`
	//   write Decisions[id] = { ...draft fields, basis: draft.basis.id, then: { task: draft.then.definition.name },
	//                           status: "open" }
	//   OpenList[subject] = { id, title, requestedAt, conversation }
	void [tx, draft, Decisions, OpenList, Counters];
	throw new Error("not implemented");
}

/** Marks the subject's open decision withdrawn and clears its slot. Creates no task. Documents only. */
export async function withdraw(tx: Tx, subject: Subject): Promise<void> {
	void [tx, subject];
	throw new Error("not implemented");
}

/** Reads a decision, or `undefined` for an ID that was never requested. A document read. */
export async function decision(tx: Tx, id: DecisionId): Promise<Decision | undefined> {
	// TODO: `tx.doc(family, key, seed)` creates the member when it reads it (measured, probe/pi-facts/family-read.ts).
	// So first split `id` into subject and n, and return undefined unless Counters[subject] >= n. Only then read
	// Decisions[id]. A client's `decision` call with a made-up ID then writes nothing.
	void [tx, id];
	throw new Error("not implemented");
}

// ---- The host's functions. Not re-exported from src/index.ts. ---------------------------------------------------------

/** What a client sends with an answer (docs/core/host.md, `answer`). `by` comes from the device, never from the body. */
export type AnswerInput = {
	readonly basis: EntryId;
	readonly choice: string;
	readonly annotations: readonly Annotation[];
};

/**
 * The `answer` table of primitives.md, row for row. A refusal is a value. A storage failure rejects instead, and its
 * outcome is unknown; the client sends the same fields again and the "Answered" rows make the retry converge.
 */
export type AnswerResult =
	| { readonly answered: AnsweredDecision; readonly repeated: boolean }
	| { readonly refused: "unknown_decision" }
	| { readonly refused: "conflict"; readonly decision: AnsweredDecision }
	| { readonly refused: "not_open"; readonly open?: OpenSlot }
	| { readonly refused: "stale_basis" | "unknown_choice" | "bad_annotation" | "extension_not_loaded" };

export type AnswerRefusal = Extract<AnswerResult, { refused: string }>["refused"];

/**
 * Answers a decision for a device, in one commit (primitives.md, "`answer(id, { basis, choice, annotations }, device)`").
 * Two answers that arrive at once run one after the other; the second reads the first's record.
 */
export async function answer(
	store: Store,
	id: DecisionId,
	input: AnswerInput,
	device: DeviceId,
): Promise<AnswerResult> {
	// TODO: one store.harness.commit. Table reads first, then the one table write, then documents.
	//   d = Decisions[id].record                              -> none: unknown_decision
	//   d.status superseded | withdrawn                       -> not_open, with OpenList[d.subject]
	//   d.status answered:
	//     equal(basis, choice, annotations)?                  -> no: conflict, with d
	//     t = await tx.task(d.continuation)                   // table read
	//     t ended faulted?                                    -> create the then task again (below), store its ID as
	//                                                            continuation, keep `by`; return repeated: true
	//     else                                                -> return d, repeated: true. Writes nothing.
	//   d.status open:
	//     input.basis !== d.basis                             -> stale_basis
	//     input.choice not in d.choices                       -> unknown_choice
	//     basis = await tx.entry(d.basis)                     // table read; data.text
	//     any range not 0 <= start <= end <= text.length      -> bad_annotation (UTF-16 units, as text.slice counts)
	//     task = store.registry.snapshot().task(d.then.task)  -> none: extension_not_loaded. The decision stays open.
	//     continuation = await tx.createTask(task, { decision: id, choice },
	//                      { ownership: { kind: "conversation" }, conversationId: d.conversation, background: true })
	//     Decisions[id] = answered { choice, annotations, by: device, at: store.now(), continuation }
	//     delete OpenList[d.subject]
	void [store, id, input, device];
	throw new Error("not implemented");
}

/** The state of a decision's `then` task, as a client shows it next to an answered decision (primitives.md). */
export type ThenState = {
	readonly task: TaskId;
	readonly status: "live" | "completed" | "failed" | "aborted" | "orphaned" | "faulted";
	readonly error?: string; // the message pi-durable kept for a faulted or failed task
};

/** The host's `decision` call: the record, the `text` of its basis, and the state of its `then` task. */
export async function view(
	store: Store,
	id: DecisionId,
	context: Context,
): Promise<{ readonly decision: Decision; readonly text: string; readonly then?: ThenState } | undefined> {
	// TODO: one commit that writes nothing: decision(tx, id), tx.entry(basis).data.text, tx.task(continuation).
	void [store, id, context];
	throw new Error("not implemented");
}

/** A watch of the open list, for the host's `inbox`. The value is `{ [subject]: OpenSlot }`. */
export async function watchOpen(
	store: Store,
	context: Context,
): Promise<WatchHandle<Readonly<Record<Subject, OpenSlot>>>> {
	// TODO: store.harness.watchDoc(OpenList, context). The store layer creates the document at open, so it exists.
	void [store, context];
	throw new Error("not implemented");
}
