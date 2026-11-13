import type { AgentChange, Tx } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { options as defineOptions, modelRef, prose } from "tau-kit";
import {
	calibration,
	extension,
	recordForecast,
	reviseForecast,
} from "./forecast.js";
export { extension };

// Copied from docs/core/kit.md.
export const W2Options = defineOptions(
	"w2",
	obj({ model: str({ format: "model" }) }),
);
export const options = W2Options;
const instructions = prose(import.meta.dirname, "agent.md", [])({});
export async function entry(tx: Tx): Promise<AgentChange> {
	// TODO read current model in this commit. Closed role, exact extensions AND tools.
	// Return {model:modelRef((await W2Options.read(tx)).model), extensions:[extension],
	// tools:[recordForecast,reviseForecast,calibration], instructions}.
	throw new Error("not implemented");
}
