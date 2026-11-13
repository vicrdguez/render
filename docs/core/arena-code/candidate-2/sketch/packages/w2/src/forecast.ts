import type { EntryId, TaskId } from "@earendil-works/pi-durable";
import {
	defineEntry,
	defineExtension,
	defineTool,
} from "@earendil-works/pi-durable";
import { int, num, obj, str } from "@earendil-works/pi-schema";
import type { DecisionId } from "tau-store";
import { due, score } from "./tasks.js";

export type ForecastData = {
	text: string;
	p: number;
	resolveBy: number;
	rule: string;
	replaces?: EntryId;
};
export type ResolutionData = {
	text: string;
	at: number;
	forecast: EntryId;
	decision: DecisionId;
	p: number;
	outcome: 0 | 1;
	score: number;
};
export const Forecast = defineEntry<ForecastData>("w2.forecast");
export const Resolved = defineEntry<ResolutionData>("w2.resolved");
export const Revised = defineEntry<{
	text: string;
	at: number;
	forecast: EntryId;
	replaces: EntryId;
}>("w2.revised");
export const Voided = defineEntry<{
	text: string;
	at: number;
	forecast: EntryId;
	decision: DecisionId;
}>("w2.voided");
export type ForecastState = {
	latest: EntryId;
	timer: TaskId;
	round?: DecisionId;
	state: "waiting" | "open" | "resolved" | "voided";
};
// Private Book is a conversation document in F. Forecast keys are local to that Book;
// subject is w2:<F>:<key>. Calibration pages the project event log, across all F conversations.
export type Book = {
	forecasts: Record<string, ForecastState>; // many subjects in F's Book
	receipts: Record<string, { forecast: EntryId }>; // api.taskId -> saved tool result
	scored: Record<DecisionId, true>; // then task dedup is by decision ID, not task ID
};
const parameters = obj({
	key: str(),
	text: str(),
	p: num({ minimum: 0, maximum: 1 }),
	resolveBy: int(),
	rule: str(),
});
export const recordForecast = defineTool({
	name: "record_forecast",
	description: "Fix a forecast before the result",
	parameters,
	replay: "safe",
	async execute(args, api, context) {
		// TODO in one commit: receipt -> append forecast -> create background due -> Book/receipt -> emit.
		// Probability is the agent's estimate and the entry says so.
		throw new Error("not implemented");
	},
});
export const reviseForecast = defineTool({
	name: "revise_forecast",
	description: "Replace the latest forecast",
	parameters,
	replay: "safe",
	async execute(args, api, context) {
		// TODO append new version + new background due + withdraw immediately + Book + receipt + Revised event.
		// Old due tasks are left alive and self-disqualify when they wake.
		throw new Error("not implemented");
	},
});
export const calibration = defineTool({
	name: "calibration",
	description: "Read scored forecasts",
	parameters: obj({}),
	async execute(args, api, context) {
		// TODO eventLog(tx), page entire log, filter Resolved.is for scores and Revised.is for replaced count.
		// No kind-index invention or transcript-derived truth; a project report covers all F conversations.
		throw new Error("not implemented");
	},
});
export const extension = defineExtension({
	name: "w2",
	tools: [recordForecast, reviseForecast, calibration],
	tasks: [due, score],
});
