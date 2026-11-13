/**
 * The contract between an extension's module and the host (docs/core/host.md, "What the host knows", and
 * docs/core/extensions.md, "What an extension is").
 *
 * An extension package's entry module exports these members by name, so `import * as w1 from "tau-w1"` is an
 * `ExtensionModule`. apps/tau/src/extensions.ts lists the modules and checks them with `satisfies`.
 * A workflow is an extension whose module exports `entry`. That is the whole difference.
 */

import type { AgentChange, Extension, JsonObject, Tx } from "@earendil-works/pi-durable";
import type { JsonSchema } from "@earendil-works/pi-schema";

// ---- Copied from docs/core/host.md, "What the host knows". --------------------------------------------------------

export type OptionsContract = {
	readonly schema: JsonSchema; // a closed object, one top-level key per option
	get(tx: Tx): Promise<JsonObject>; // the keys that are set
	set(tx: Tx, value: JsonObject): Promise<void>; // replaces the keys that are set
};

export type ExtensionModule = {
	readonly extension: Extension;
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>); // only a workflow has it
	readonly options?: OptionsContract;
};
