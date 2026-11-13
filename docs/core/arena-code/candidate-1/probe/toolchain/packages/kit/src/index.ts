import type { ModelRef } from "@earendil-works/pi-durable";

/** "provider/modelId", cut at the first "/". */
export function modelRef(value: string): ModelRef {
	const cut = value.indexOf("/");
	return { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
}
