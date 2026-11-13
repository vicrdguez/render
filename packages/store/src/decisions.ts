import type { Context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import {
	defineDoc,
	defineDocFamily,
	type Task,
	type TaskId,
	type Tx,
	type TypedEntry,
	type WatchHandle,
} from "@earendil-works/pi-durable";
import type { Store } from "./host.js";
import type {
	Annotation,
	AnsweredDecision,
	AnswerInput,
	AnswerRefusal,
	AnswerResult,
	Decision,
	DecisionId,
	DeviceId,
	OpenDecisions,
} from "./types.js";

export type DecisionInput<C extends string> = {
	decision: DecisionId;
	choice: C;
};
/**
 * A task that accepts every choice in `C`. A pi-durable `Task` whose input is `DecisionInput<A>` fits when `C` is a
 * subset of `A`. `Task` itself is invariant in its input, through `migrate`. Here `initial` is a property, so TypeScript
 * checks its parameter contravariantly.
 */
export type ThenTask<C extends string> = {
	readonly definition: {
		readonly name: string;
		readonly initial: (input: DecisionInput<C>) => unknown;
	};
};
export type RequestDraft<C extends string> = {
	subject: string;
	title: string;
	basis: TypedEntry<{ text: string }>;
	choices: readonly [C, ...C[]];
	conversation: Decision["conversation"];
	then: ThenTask<NoInfer<C>>;
	requestedAt: number;
};

// The stored form of Decision. pi's JSON arrays are mutable, so the public readonly arrays are copied at this seam.
type Common = Omit<Decision, "status" | "choices"> & {
	choices: [string, ...string[]];
};
type Stored = Common &
	(
		| { status: "open" }
		| {
				status: "answered";
				choice: string;
				annotations: Annotation[];
				by: DeviceId;
				at: number;
				continuation: TaskId;
		  }
		| { status: "superseded" }
		| { status: "withdrawn" }
	);
type StoredAnswer = Extract<Stored, { status: "answered" }>;

const always = () => true;
const Decisions = defineDocFamily<{ record?: Stored }, null>({
	kind: "tau.decision",
	version: 1,
	scope: "session",
	family: true,
	initial: () => ({}),
	checkpointWhen: always,
});
const Open = defineDoc<OpenDecisions>({
	kind: "tau.decision.open",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: always,
});
/** The last number used for each subject. It also tells which IDs exist without creating a family member. */
const Next = defineDoc<Record<string, number>>({
	kind: "tau.decision.next",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: always,
});

/** Creates the documents in the store's first commit, so a later read never writes. */
export async function createDecisionDocs(tx: Tx): Promise<void> {
	await tx.doc(Open);
	await tx.doc(Next);
}

/**
 * Documents only. The `request` table of primitives.md:
 * | The subject has no open decision. | Opens one. |
 * | An open decision, and every field of the draft but requestedAt is equal. | Returns it. Writes nothing. |
 * | An open decision, and any other field differs. | Marks it superseded. Opens a new one. |
 */
export async function request<const C extends string>(
	tx: Tx,
	draft: RequestDraft<C>,
): Promise<Decision<C>> {
	const open = await tx.doc(Open);
	const slot = own(open, draft.subject);
	const current = slot && (await tx.doc(Decisions, slot.id, null));
	const opened = (
		id: DecisionId,
		requestedAt: number,
	): Extract<Decision<C>, { status: "open" }> => ({
		id,
		subject: draft.subject,
		title: draft.title,
		basis: draft.basis.id,
		choices: copy(draft.choices),
		conversation: draft.conversation,
		then: { task: draft.then.definition.name },
		requestedAt,
		status: "open",
	});
	if (current?.record?.status === "open") {
		const { record } = current;
		if (
			record.title === draft.title &&
			record.basis === draft.basis.id &&
			record.conversation === draft.conversation &&
			record.then.task === draft.then.definition.name &&
			same(record.choices, draft.choices)
		)
			return opened(record.id, record.requestedAt);
		current.record = { ...common(record), status: "superseded" };
	}
	const next = await tx.doc(Next);
	const n = (own(next, draft.subject) ?? 0) + 1;
	next[draft.subject] = n;
	const decision = opened(`${draft.subject}#${n}`, draft.requestedAt);
	(await tx.doc(Decisions, decision.id, null)).record = {
		...decision,
		choices: copy(decision.choices),
	};
	open[draft.subject] = {
		id: decision.id,
		title: decision.title,
		requestedAt: decision.requestedAt,
		conversation: decision.conversation,
	};
	return decision;
}

/** Documents only. Marks the subject's open decision withdrawn and clears its slot. */
export async function withdraw(tx: Tx, subject: string): Promise<void> {
	const open = await tx.doc(Open);
	const slot = own(open, subject);
	if (slot === undefined) return;
	const member = await tx.doc(Decisions, slot.id, null);
	if (member.record)
		member.record = { ...common(member.record), status: "withdrawn" };
	delete open[subject];
}

/** A document read. An ID that was never requested gives undefined and writes nothing. */
export async function decision(
	tx: Tx,
	id: DecisionId,
): Promise<Decision | undefined> {
	const record = (await member(tx, id))?.record;
	return record && toDecision(record);
}

/**
 * The only writer of answers. One commit: table reads, then at most one table write. The `answer` table of
 * primitives.md, row by row. A storage failure rejects instead, and its outcome is unknown.
 */
export function answer(
	store: Store,
	id: DecisionId,
	input: AnswerInput,
	device: DeviceId,
	context: Context,
): Promise<AnswerResult> {
	const now = store.options.now ?? Date.now;
	return store.harness.commit(async (tx): Promise<AnswerResult> => {
		const found = await member(tx, id);
		const record = found?.record;
		if (found === undefined || record === undefined)
			return refused({
				code: "unknown_decision",
				message: `No decision has the ID ${id}.`,
			});
		const message = (text: string) => `Decision ${id} ${text}`;
		const notLoaded = refused({
			code: "extension_not_loaded",
			message: message(
				`needs task ${record.then.task}, which no installed extension provides.`,
			),
		});
		const start = (choice: string) => {
			// The registry erases task types. request() checked this task against the choices when it stored the name.
			const task = store.options.registry.snapshot().task(record.then.task) as
				| Task<DecisionInput<string>, { phase: string }, unknown, object>
				| undefined;
			return (
				task &&
				tx.createTask(
					task,
					{ decision: id, choice },
					{
						ownership: { kind: "conversation" },
						conversationId: record.conversation,
						background: true,
					},
				)
			);
		};
		switch (record.status) {
			case "superseded":
			case "withdrawn": {
				const slot = own(await tx.doc(Open), record.subject);
				const open = slot && (await member(tx, slot.id))?.record;
				return refused({
					code: "not_open",
					message: message(`was ${record.status}.`),
					...(open && { open: toDecision(open) }),
				});
			}
			case "answered": {
				if (
					input.basis !== record.basis ||
					input.choice !== record.choice ||
					!sameAnnotations(input.annotations, record.annotations)
				)
					return refused({
						code: "conflict",
						message: message("was answered with other fields."),
						decision: toAnswered(record),
					});
				const old = await tx.task(record.continuation);
				if (
					old?.state.status !== "terminal" ||
					old.state.outcome.status !== "faulted"
				)
					return {
						kind: "answered",
						decision: toAnswered(record),
						repeated: true,
					};
				const replacement = await start(record.choice);
				if (replacement === undefined) return notLoaded;
				record.continuation = replacement;
				return {
					kind: "answered",
					decision: toAnswered(record),
					repeated: true,
				};
			}
			case "open": {
				if (input.basis !== record.basis)
					return refused({
						code: "stale_basis",
						message: message("asks about another basis."),
					});
				if (!record.choices.includes(input.choice))
					return refused({
						code: "unknown_choice",
						message: message(`does not offer ${input.choice}.`),
					});
				if (input.annotations.some((annotation) => annotation.range)) {
					const text = basisText((await tx.entry(record.basis))?.data);
					if (
						!input.annotations.every(({ range }) => !range || fits(range, text))
					)
						return refused({
							code: "bad_annotation",
							message: message("has a range outside its basis text."),
						});
				}
				const continuation = await start(input.choice);
				if (continuation === undefined) return notLoaded;
				const answered: StoredAnswer = {
					...common(record),
					status: "answered",
					choice: input.choice,
					annotations: input.annotations.map(copyAnnotation),
					by: device,
					at: now(),
					continuation,
				};
				found.record = answered;
				delete (await tx.doc(Open))[record.subject];
				return {
					kind: "answered",
					decision: toAnswered(answered),
					repeated: false,
				};
			}
		}
	}, context);
}

export async function watchOpen(
	store: Store,
	context: Context,
): Promise<WatchHandle<OpenDecisions>> {
	const watch = await store.harness.watchDoc(Open, context);
	if (watch === undefined)
		throw new Error("This store has no open list. Open it with openStore.");
	return watch;
}

async function member(tx: Tx, id: string) {
	const match = /^(.+)#([1-9][0-9]*)$/.exec(id);
	if (!match?.[1] || !match[2]) return undefined;
	const last = own(await tx.doc(Next), match[1]) ?? 0;
	if (Number(match[2]) > last) return undefined;
	return tx.doc(Decisions, id, null);
}

function own<T>(record: Record<string, T>, key: string): T | undefined {
	return Object.hasOwn(record, key) ? record[key] : undefined;
}

function refused(refusal: AnswerRefusal): AnswerResult {
	return { kind: "refused", refusal };
}

function copy<T>(list: readonly [T, ...T[]]): [T, ...T[]] {
	return [list[0], ...list.slice(1)];
}

function same(a: readonly string[], b: readonly string[]) {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

function copyAnnotation({ text, range }: Annotation): Annotation {
	return range
		? { text, range: { start: range.start, end: range.end } }
		: { text };
}

function sameAnnotations(a: readonly Annotation[], b: readonly Annotation[]) {
	return (
		a.length === b.length &&
		a.every((annotation, index) => {
			const other = b[index];
			return (
				annotation.text === other?.text &&
				annotation.range?.start === other.range?.start &&
				annotation.range?.end === other.range?.end
			);
		})
	);
}

function basisText(data: JsonValue | undefined): string {
	return typeof data === "object" &&
		data !== null &&
		!Array.isArray(data) &&
		typeof data.text === "string"
		? data.text
		: "";
}

/** As `text.slice(start, end)` counts, in UTF-16 code units. */
function fits(range: { start: number; end: number }, text: string) {
	return (
		Number.isInteger(range.start) &&
		Number.isInteger(range.end) &&
		range.start >= 0 &&
		range.start <= range.end &&
		range.end <= text.length
	);
}

function common(record: Stored): Common {
	return {
		id: record.id,
		subject: record.subject,
		title: record.title,
		basis: record.basis,
		choices: copy(record.choices),
		conversation: record.conversation,
		then: { task: record.then.task },
		requestedAt: record.requestedAt,
	};
}

function toAnswered(record: StoredAnswer): AnsweredDecision {
	return {
		...common(record),
		status: "answered",
		choice: record.choice,
		annotations: record.annotations.map(copyAnnotation),
		by: record.by,
		at: record.at,
		continuation: record.continuation,
	};
}

function toDecision(record: Stored): Decision {
	return record.status === "answered"
		? toAnswered(record)
		: { ...common(record), status: record.status };
}
