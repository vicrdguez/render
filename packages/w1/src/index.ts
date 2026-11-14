import type { AgentChange, Tx } from "@earendil-works/pi-durable";
import { modelRef } from "tau-kit";
import { designer } from "./roles.js";
import { W1Options } from "./work.js";

export { W1 as extension } from "./extension.js";
export const options = W1Options;

/** The designer's settings for the conversation the host creates. The host adds the project's `cwd`. */
export const entry = async (tx: Tx): Promise<AgentChange> =>
	designer(modelRef((await W1Options.read(tx)).designer));
