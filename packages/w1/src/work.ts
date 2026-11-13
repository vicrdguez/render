import type { Draft } from "@earendil-works/chord/delta";
import {
	type ConversationId,
	defineDoc,
	defineEntry,
	type EntryId,
	type Tx,
} from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { options } from "tau-kit";
import {
	type Annotation,
	type DecisionId,
	decision,
	type EventData,
} from "tau-store";

export const W1Options = options(
	"w1",
	obj({
		designer: str({ format: "model" }),
		implementer: str({ format: "model" }),
		reviewer: str({ format: "model" }),
		base: str({ minLength: 1, default: "main" }),
	}),
);

export type Stage =
	| "designing"
	| "design_review"
	| "preparing"
	| "building"
	| "reviewing"
	| "fixing"
	| "merge_review"
	| "handed_over"
	| "cancelled"
	| "stopped";

/** Stored before the worktree exists (row 8). `repo` is the designer's `cwd`, copied for the outside effect. */
export type Plan = {
	repo: string;
	path: string;
	branch: string;
	base: string;
	baseSha: string;
};

export type Subject = "design" | "merge" | "stuck";

/** One piece of work, on D. D's conversation ID is the work's key `k`. */
export type WorkState = {
	stage: Stage;
	/** The decision W1 still waits on, per subject. A `then` task acts only on the one named here. */
	waiting: { [S in Subject]?: DecisionId };
	/** Decisions whose `then` work has landed. A `then` task created again for one of them does nothing. */
	handled: Record<string, true>;
	/** Where "retry" on the stuck decision goes: a role's conversation, or the worktree again. */
	retry?: ConversationId | "prepare";
	/** The answer whose annotations the next publish must reply to. */
	owes?: DecisionId;
	accepted?: { design: EntryId; decision: DecisionId };
	plan?: Plan;
	implementer?: ConversationId;
	reviewer?: ConversationId;
	candidate?: { build: EntryId; sha: string; review?: EntryId };
	/** The failed review that the next build fixes. */
	fixes?: EntryId;
	reviewModel?: string;
	/** A publishing tool's result, by its `api.taskId`. */
	receipts: Record<string, string>;
};

export const Work = defineDoc<WorkState>({
	kind: "w1.work",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({ stage: "designing", waiting: {}, handled: {}, receipts: {} }),
	checkpointWhen: () => true,
});

/** On I and R: the D whose work they serve. */
export const Owner = defineDoc<{ work?: ConversationId }>({
	kind: "w1.owner",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({}),
	checkpointWhen: () => true,
});

export type Reply = { annotation: number; text: string };

export const Design = defineEntry<{ text: string; replies?: Reply[] }>(
	"w1.design",
);
export const Build = defineEntry<{
	text: string;
	design: EntryId;
	sha: string;
	replies?: Reply[];
	fixes?: EntryId;
}>("w1.build");
export const Review = defineEntry<{
	text: string;
	build: EntryId;
	sha: string;
	verdict: "pass" | "fail";
	findings: string[];
}>("w1.review");
export const Merge = defineEntry<{
	text: string;
	design: EntryId;
	sha: string;
	build: EntryId;
	review: EntryId;
	branch: string;
}>("w1.merge");
/** The basis of a stuck decision. */
export const Note = defineEntry<{ text: string }>("w1.note");
export const Cancel = defineEntry<{
	text: string;
	notPursued: { decision: DecisionId; annotation: number; text: string }[];
}>("w1.cancel");
export const W1Event = defineEntry<
	EventData & {
		stage: Stage;
		sha?: string;
		path?: string;
		notActedOn?: Annotation[];
	}
>("w1.event");

export const subject = (k: ConversationId, name: Subject) =>
	`w1:${k}:${name}`;

/** The work a conversation serves: D's own, or the one that I's or R's owner document names. */
export async function workOf(tx: Tx, conversation: ConversationId) {
	const k = (await tx.doc(Owner, conversation)).work ?? conversation;
	return { k, work: await tx.doc(Work, k) };
}

export const closed = (work: { stage: Stage }) =>
	work.stage === "cancelled" || work.stage === "stopped";

/** Whether a `then` task may act on its decision: W1 still waits on it, and no earlier task did the work. */
export const expects = (
	work: Draft<WorkState>,
	name: Subject,
	id: DecisionId,
) => !closed(work) && work.waiting[name] === id && !work.handled[id];

export function settle(
	work: Draft<WorkState>,
	name: Subject,
	id: DecisionId,
) {
	delete work.waiting[name];
	work.handled[id] = true;
}

/** Whether this conversation's run was meant to end with a handoff in the current stage (row E2). */
export function owesHandoff(
	work: Readonly<WorkState> | Draft<WorkState>,
	k: ConversationId,
	conversation: ConversationId,
) {
	const { stage, candidate } = work;
	if (conversation === k) return stage === "designing";
	if (conversation === work.implementer)
		return (
			(stage === "building" || stage === "fixing") &&
			(candidate === undefined || candidate.review !== undefined)
		);
	if (conversation === work.reviewer)
		return stage === "reviewing" && candidate?.review === undefined;
	return false;
}

/** The annotations of an answered decision, or none. */
export async function annotationsOf(tx: Tx, id: DecisionId | undefined) {
	const found = id === undefined ? undefined : await decision(tx, id);
	return found?.status === "answered" ? found.annotations : [];
}

/** Each annotation by its number, with the passage of `text` it names. */
export function listed(annotations: readonly Annotation[], text: string) {
	if (annotations.length === 0) return "(none)";
	return annotations
		.map(
			({ text: comment, range }, index) =>
				`${index}. ${range ? `On "${text.slice(range.start, range.end)}"` : "On the whole text"}: ${comment}`,
		)
		.join("\n");
}

/** The refusal when a publish leaves an annotation it owes without a reply (rows 5 and 11). */
export async function unreplied(
	tx: Tx,
	work: Draft<WorkState>,
	replies: readonly Reply[] | undefined,
) {
	const owed = await annotationsOf(tx, work.owes);
	const missing = owed
		.map((_, index) => index)
		.filter((index) => !replies?.some((reply) => reply.annotation === index));
	return missing.length === 0
		? undefined
		: `Reply to every annotation of ${work.owes} by its number first. Missing: ${missing.join(", ")}.`;
}
