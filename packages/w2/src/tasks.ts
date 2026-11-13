import { defineTask, type EntryId } from "@earendil-works/pi-durable";
import type { DecisionInput } from "tau-store";
export type Choice = "yes" | "no" | "void" | "not yet";
export type DueInput = { subject: string; forecast: EntryId; dueAt: number };
const missing = async () => {
	throw new Error("not implemented");
};
export const due = defineTask<
	DueInput,
	{ phase: "sleep" } | { phase: "ask" },
	null
>({
	name: "w2.due",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: { sleep: missing, ask: missing },
	abort: missing,
});
export const score = defineTask<
	DecisionInput<Choice>,
	{ phase: "score" },
	null
>({
	name: "w2.score",
	version: 1,
	initial: () => ({ phase: "score" }),
	phases: { score: missing },
	abort: missing,
});
