/**
 * W1's state for one piece of work, `Work`, on D (walk.md, "W1, Who takes part"). D's conversation ID is the work's key
 * `k`. I and R each hold a small document that names D. Every W1 tool and task reads the stage first; once it is
 * `cancelled` they write nothing (row X2).
 */

import type { ConversationId, EntryId } from "@earendil-works/pi-durable";
import { defineDoc } from "@earendil-works/pi-durable";
import type { DecisionId, Subject } from "tau-core";

export type Stage =
	| "designing"
	| "reviewing_design"
	| "preparing"
	| "building"
	| "reviewing"
	| "fixing"
	| "awaiting_handoff"
	| "handed_over"
	| "cancelled"
	| "stopped";

export type WorkState = {
	stage: Stage;
	design: EntryId | null; // the accepted design entry (V2 in the walk)
	accepted: DecisionId | null; // the decision that accepted it (A2)
	owes: DecisionId | null; // the answer whose annotations the next publish must reply to
	plan: { path: string; branch: string; base: string; baseSha: string } | null; // stored before the worktree (row 8)
	candidate: { build: EntryId; sha: string } | null;
	implementer: ConversationId | null;
	reviewer: ConversationId | null;
	receipts: { [toolTaskId: string]: { entry: EntryId; decision?: DecisionId } };
};

export const Work = defineDoc<WorkState>({
	kind: "w1.work",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({
		stage: "designing",
		design: null,
		accepted: null,
		owes: null,
		plan: null,
		candidate: null,
		implementer: null,
		reviewer: null,
		receipts: {},
	}),
	checkpointWhen: () => false,
});

/** The document on I and on R that names D. */
export const Owner = defineDoc<{ work?: number }>({
	kind: "w1.owner",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({}),
	checkpointWhen: () => false,
});

/** The three subjects of one piece of work (walk.md). */
export const subjects = (k: ConversationId) =>
	({
		design: `w1:${k}:design`,
		merge: `w1:${k}:merge`,
		stuck: `w1:${k}:stuck`,
	}) as const satisfies Record<string, Subject>;
