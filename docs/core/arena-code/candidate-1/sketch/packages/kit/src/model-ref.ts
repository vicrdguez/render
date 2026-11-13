/**
 * `modelRef()` (docs/core/kit.md, "`options()`"). Unit 4: W2's `entry` is its first caller.
 */

import type { ModelRef } from "@earendil-works/pi-durable";

/** `"provider/modelId"`, cut at the first `/`, into the value that `configure` takes. */
export function modelRef(value: string): ModelRef {
	const cut = value.indexOf("/");
	return { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
}
