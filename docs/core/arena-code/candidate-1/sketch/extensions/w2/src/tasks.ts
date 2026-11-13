/**
 * W2's tasks. Both belong to F and are `background`, so a Stop in F does not abort a sleeping timer (P1, probe E).
 */

import type { EntryId } from "@earendil-works/pi-durable";
import { defineTask } from "@earendil-works/pi-durable";
import type { ThenInput } from "tau-core";

export type Choice = "yes" | "no" | "void" | "not yet";
export const CHOICES = ["yes", "no", "void", "not yet"] as const satisfies readonly [Choice, ...Choice[]];

const terminal = { status: "terminal", outcome: { status: "completed", result: null } } as const;

/**
 * `w2.due`: sleeps until the forecast's date, with no model (rows 3, 4, 9, 10, 11).
 * On waking, in one commit: unless `Book` says this forecast is still the latest and this task the live timer, end.
 * Otherwise read the forecast entry (a table read), `request` on `w2:<key>` with the four choices and `then: Score`,
 * write the round to `Book`, `emit` `w2.asked`, end.
 */
export const Due = defineTask<
	{ key: string; forecast: EntryId; at: number },
	{ phase: "sleep" } | { phase: "wake" },
	null
>({
	name: "w2.due",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: async (task, runtime, context) => {
			await runtime.sleepUntil(task.input.at, { phase: "wake" }, context);
		},
		wake: async (task, runtime, context) => {
			void [task, runtime, context];
			throw new Error("not implemented");
		},
	},
	abort: (_task, runtime, context) => runtime.commit(() => terminal, context),
});

/**
 * `w2.score`, the `then` task of every W2 decision. Runs with no model (rows 6, 12, 13).
 * Keys what it has done by the decision ID, and first checks that the decision is `Book`'s open round.
 * - yes or no: the Brier score (p - outcome)^2, `Book` resolved, `emit` `w2.resolved`.
 * - void: `Book` voided, `emit` `w2.voided`.
 * - not yet: a new `w2.due` seven days after the decision's stored answer time, so a rerun computes the same deadline.
 */
export const Score = defineTask<ThenInput<Choice>, { phase: "score" }, null>({
	name: "w2.score",
	version: 1,
	initial: () => ({ phase: "score" }),
	phases: {
		score: async (task, runtime, context) => {
			void [task, runtime, context];
			throw new Error("not implemented");
		},
	},
	abort: (_task, runtime, context) => runtime.commit(() => terminal, context),
});
