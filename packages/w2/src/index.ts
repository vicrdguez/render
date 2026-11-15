import { options as defineOptions, modelRef, prose } from "tau-extension";
import {
	type AgentChange,
	defineExtension,
	type Tx,
} from "tau-extension/durable";
import { obj, str } from "tau-extension/schema";
import { calibration, recordForecast, reviseForecast } from "./forecast.ts";
import { due, score } from "./tasks.ts";

export const extension = defineExtension({
	name: "w2",
	tools: [recordForecast, reviseForecast, calibration],
	tasks: [due, score],
});
export const W2Options = defineOptions(
	"w2",
	obj({ model: str({ format: "model" }) }),
);
export const options = W2Options;
const instructions = prose(import.meta.dirname, "agent.md", [])({});

export async function entry(tx: Tx): Promise<AgentChange> {
	return {
		model: modelRef((await W2Options.read(tx)).model),
		extensions: [extension],
		tools: [recordForecast, reviseForecast, calibration],
		instructions,
	};
}
