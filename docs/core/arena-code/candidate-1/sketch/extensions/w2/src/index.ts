/**
 * W2, forecasts (docs/core/workflows.md, "W2, forecasts"; docs/core/walk.md, "W2"). Unit 4. A sample for testing the
 * core, not for real use.
 *
 * A workflow: its module exports `entry`. The host creates F, the one conversation, with it. W2 creates no other
 * conversation and does not use `role()`.
 */

import type { AgentChange, Tx } from "@earendil-works/pi-durable";
import { defineExtension } from "@earendil-works/pi-durable";
import { modelRef } from "tau-kit";
import { W2Options } from "./options.ts";
import { agentInstructions } from "./prose.ts";
import { Due, Score } from "./tasks.ts";
import { calibration, recordForecast, reviseForecast } from "./tools.ts";

export const extension = defineExtension({
	name: "w2",
	tools: [recordForecast, reviseForecast, calibration],
	tasks: [Due, Score],
});

export const options = W2Options;

/** F's settings: W2's model, W2's three tools exactly, and no coding tools (walk.md, "W2, Who takes part"). */
export async function entry(tx: Tx): Promise<AgentChange> {
	return {
		model: modelRef((await W2Options.read(tx)).model),
		extensions: [extension],
		tools: [recordForecast, reviseForecast, calibration],
		instructions: agentInstructions({}),
	};
}
