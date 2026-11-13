import type { AgentChange, Tx } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { options as defineOptions, modelRef } from "tau-kit";
import { designer } from "./roles.js";

export { extension } from "./tools.js";

// Copied from docs/core/kit.md. Models have no default.
export const W1Options = defineOptions(
	"w1",
	obj({
		designer: str({ format: "model" }),
		implementer: str({ format: "model" }),
		reviewer: str({ format: "model" }),
		base: str({ minLength: 1, default: "main" }),
	}),
);
export const options = W1Options;
export async function entry(tx: Tx): Promise<AgentChange> {
	// TODO designer(modelRef((await W1Options.read(tx)).designer)); host adds cwd.
	throw new Error("not implemented");
}
