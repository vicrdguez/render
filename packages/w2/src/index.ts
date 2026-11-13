import {
	type AgentChange,
	defineExtension,
	defineTool,
	type Tx,
} from "@earendil-works/pi-durable";
import { int, num, obj, str } from "@earendil-works/pi-schema";
import { options as defineOptions, prose } from "tau-kit";
import { due, score } from "./tasks.js";

const parameters = obj({
	key: str(),
	text: str(),
	p: num({ minimum: 0, maximum: 1 }),
	resolveBy: int(),
	rule: str(),
});
const missing = async () => {
	throw new Error("not implemented");
};
const recordForecast = defineTool({
	name: "record_forecast",
	description: "Record a forecast",
	parameters,
	replay: "safe",
	callers: ["model"],
	executionMode: "sequential",
	execute: missing,
});
const reviseForecast = defineTool({
	name: "revise_forecast",
	description: "Revise a forecast",
	parameters,
	replay: "safe",
	callers: ["model"],
	executionMode: "sequential",
	execute: missing,
});
const calibration = defineTool({
	name: "calibration",
	description: "Read calibration",
	parameters: obj({}),
	execute: missing,
});
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
export async function entry(_tx: Tx): Promise<AgentChange> {
	void instructions;
	return {
		model: { provider: "faux", modelId: "faux-1" },
		extensions: [extension],
		tools: [recordForecast, reviseForecast, calibration],
	};
}
