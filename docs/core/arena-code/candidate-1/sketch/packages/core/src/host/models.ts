/**
 * Models as the protocol names them: the string `provider/modelId` (docs/core/protocol.md, "Every other call").
 * The host parses it here for `create`, `setModel`, and the `model` option format. The kit's `modelRef()` cuts the same
 * string for workflows; the core cannot import the kit, so the rule lives in both places (design.md, "Tradeoffs").
 */

import type { Models } from "@earendil-works/pi-ai";
import type { ModelRef } from "@earendil-works/pi-durable";

/** `provider/modelId`, cut at the first `/`. `undefined` when either side is empty. */
export function parseModel(value: string): ModelRef | undefined {
	const cut = value.indexOf("/");
	if (cut <= 0 || cut === value.length - 1) return undefined;
	return { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
}

/** Whether the server can use the model: pi-ai's `getModel()`, with no request (host.md, "What `setOptions` does"). */
export function hasModel(models: Models, value: string): boolean {
	void [models, value];
	throw new Error("not implemented");
}

/** The `models` call: pi-ai's `getAvailable()`, the models whose providers have complete auth. */
export function listModels(models: Models): { readonly items: readonly { model: string; name: string }[] } {
	void models;
	throw new Error("not implemented");
}
