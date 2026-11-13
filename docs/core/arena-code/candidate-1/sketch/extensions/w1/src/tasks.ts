/**
 * W1's tasks. Each `then` task looks for "abort" before anything else (rows X1 to X6), keys what it has done by the
 * decision ID, and checks that the decision is the one `Work` still waits on. A commit that submits to a role's
 * conversation first sets that role's model from the options (rows 4, 12, 14, 16).
 */

import type { ConversationId } from "@earendil-works/pi-durable";
import { defineTask } from "@earendil-works/pi-durable";
import type { ThenInput } from "tau-core";

const notYet = async (): Promise<never> => {
	throw new Error("not implemented");
};
const aborted = { status: "terminal", outcome: { status: "aborted" } } as const;

const single = <I>(name: string) =>
	defineTask<I, { phase: "run" }, null>({
		name,
		version: 1,
		initial: () => ({ phase: "run" }),
		phases: { run: notYet },
		abort: (_task, runtime, context) => runtime.commit(() => aborted, context),
	});

/** Row 4 (revise), row 8 (approve), X2 (abort). */
export const DesignAnswer = single<ThenInput<"approve" | "revise" | "abort">>("w1.design_answer");
/** Row 19 (approve, or the branch moved), X2 (abort). */
export const Handoff = single<ThenInput<"approve" | "abort">>("w1.handoff");
/** Row E3 (retry), X2 (abort). */
export const StuckAnswer = single<ThenInput<"retry" | "abort">>("w1.stuck_answer");
/** Rows 12 and 16: configure R's model, submit with the build's ID as `requestId`. */
export const ReviewStart = single<{ work: ConversationId }>("w1.review_start");
/** Row 14: configure I's model, submit the findings with the review's ID as `requestId`. */
export const FixStart = single<{ work: ConversationId }>("w1.fix_start");
/** Row E2: if the stage did not move, a `stuck` decision on the agent's last message. */
export const EnsureHandoff = single<{ work: ConversationId; conversation: ConversationId }>("w1.ensure_handoff");

/**
 * Rows 9 and 10, two phases, two commits: `role()` creates I (a table write), and only the next commit submits to it.
 * Phase 1 first makes sure the worktree is the planned one: none, create it; the same branch and base, carry on;
 * anything else, a `stuck` decision. W1 never deletes a directory it cannot prove is its own.
 */
export const Prepare = defineTask<{ work: ConversationId }, { phase: "worktree" } | { phase: "submit" }, null>({
	name: "w1.prepare",
	version: 1,
	initial: () => ({ phase: "worktree" }),
	phases: { worktree: notYet, submit: notYet },
	abort: (_task, runtime, context) => runtime.commit(() => aborted, context),
});

/** Rows X3 to X6: one phase per conversation, each `runtime.conversation(id)` then `abort()`, then `Work` stopped. */
export const Stop = defineTask<
	{ work: ConversationId },
	{ phase: "designer" | "implementer" | "reviewer" | "done" },
	null
>({
	name: "w1.stop",
	version: 1,
	initial: () => ({ phase: "designer" }),
	phases: { designer: notYet, implementer: notYet, reviewer: notYet, done: notYet },
	abort: (_task, runtime, context) => runtime.commit(() => aborted, context),
});
