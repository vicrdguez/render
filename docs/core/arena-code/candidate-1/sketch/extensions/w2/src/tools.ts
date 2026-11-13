/**
 * W2's three tools (workflows.md, "W2, forecasts", steps 2, 7, and 8).
 *
 * The two that write declare `replay: "safe"` and keep a receipt under `api.taskId`, written in the commit of their
 * other writes; a rerun finds it and returns the saved result (K1).
 */

import { defineTool } from "@earendil-works/pi-durable";
import { num, obj, str } from "@earendil-works/pi-schema";

const forecast = obj({
	key: str({ pattern: "^[a-z0-9-]{1,40}$" }),
	text: str({ minLength: 1 }),
	p: num({ minimum: 0, maximum: 1 }),
	resolveBy: num(),
	rule: str({ minLength: 1 }),
});

/**
 * Row 2, one commit: the receipt check (a document), then the table writes: the `w2.forecast` entry in F, a `w2.due`
 * task in F with `background: true`, `Book`, and `emit` `w2.recorded`.
 */
export const recordForecast = defineTool({
	name: "record_forecast",
	description: "Record a forecast: a statement that can fail, a probability, a date to resolve by, and its rule.",
	parameters: forecast,
	replay: "safe",
	execute: async (args, api, context) => {
		void [args, api, context];
		throw new Error("not implemented");
	},
});

/**
 * Row 8, one commit: the new entry with `replaces`, a new `w2.due`, `withdraw` on the subject (so the replaced forecast
 * cannot be scored), `Book`, and `emit` `w2.revised`.
 */
export const reviseForecast = defineTool({
	name: "revise_forecast",
	description: "Revise a recorded forecast. The old version can no longer be resolved.",
	parameters: forecast,
	replay: "safe",
	execute: async (args, api, context) => {
		void [args, api, context];
		throw new Error("not implemented");
	},
});

/**
 * Row 15: reads `eventLog(tx)`, pages every entry of the log, keeps `Resolved.is(entry)`, and reports. Writes nothing.
 * A scan has no filter by kind (src/types.ts:838-846 of pi-durable).
 */
export const calibration = defineTool({
	name: "calibration",
	description: "Compare the stated probabilities of resolved forecasts with their outcomes.",
	parameters: obj({}),
	execute: async (args, api, context) => {
		void [args, api, context];
		throw new Error("not implemented");
	},
});
