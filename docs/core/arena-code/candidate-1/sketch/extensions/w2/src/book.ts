/**
 * W2's one document, `Book`, on F (walk.md, "W2, Who takes part"): per forecast, the latest entry, the live timer, the
 * open round, and the state; and the receipts of the tools that write.
 */

import type { EntryId, TaskId } from "@earendil-works/pi-durable";
import { defineDoc } from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-core";

export type ForecastState = {
	latest: EntryId; // the newest version; an older `w2.due` that wakes sees it and ends without asking (row 10)
	timer: TaskId | null; // the live `w2.due`
	round: DecisionId | null; // the decision a `w2.score` must match (row 13)
	state: "open" | "resolved" | "voided";
};

export type BookState = {
	forecasts: { [key: string]: ForecastState };
	receipts: { [toolTaskId: string]: { forecast: string; entry: EntryId } }; // keyed by `api.taskId` (K1)
};

export const Book = defineDoc<BookState>({
	kind: "w2.book",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({ forecasts: {}, receipts: {} }),
	checkpointWhen: () => false,
});
