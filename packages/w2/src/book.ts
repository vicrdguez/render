import {
	defineDoc,
	defineEntry,
	type EntryId,
	type TaskId,
} from "@earendil-works/pi-durable";
import type { DecisionId, EventData } from "tau-store";

export type ForecastData = {
	text: string;
	p: number;
	resolveBy: number;
	rule: string;
	replaces?: EntryId;
};
export const Forecast = defineEntry<ForecastData>("w2.forecast");
export const Recorded = defineEntry<EventData & { forecast: EntryId }>(
	"w2.recorded",
);
export const Revised = defineEntry<
	EventData & { forecast: EntryId; replaces: EntryId }
>("w2.revised");
export const Asked = defineEntry<
	EventData & { forecast: EntryId; decision: DecisionId }
>("w2.asked");
export const Rescheduled = defineEntry<
	EventData & { decision: DecisionId; due: number }
>("w2.rescheduled");
export const Resolved = defineEntry<
	EventData & {
		forecast: EntryId;
		decision: DecisionId;
		p: number;
		outcome: 0 | 1;
		score: number;
	}
>("w2.resolved");
export const Voided = defineEntry<
	EventData & { forecast: EntryId; decision: DecisionId }
>("w2.voided");

type ForecastState = { latest: EntryId } & (
	| { state: "waiting"; timer: TaskId }
	| { state: "open"; round: DecisionId }
	| { state: "resolved" | "voided" }
);
export const Book = defineDoc<{
	forecasts: Record<string, ForecastState>;
	receipts: Record<string, { forecast: EntryId }>;
	scored: Record<DecisionId, true>;
}>({
	kind: "w2.book",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({ forecasts: {}, receipts: {}, scored: {} }),
	checkpointWhen: () => false,
});
