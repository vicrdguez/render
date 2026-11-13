import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@earendil-works/chord/context";
import type { Calls } from "./calls.js";
import type { Devices } from "./devices.js";
export type Refusal = { code: string; message: string; [key: string]: unknown };
export type Reply<R> =
	| { result: R }
	| { refused: Refusal }
	| { unknown: { code: string; message: string } };
export async function serve(
	request: IncomingMessage,
	response: ServerResponse,
	calls: Calls,
	devices: Devices,
	context: Context,
): Promise<void> {
	// TODO node:http POST only, /v1/<key>, JSON object <=1 MiB, closed pi-schema.
	// TODO reject unexpected Host and cross-site Origin. No CORS/redirects/auth logging.
	// TODO pair is the ONLY unauthenticated route, separate from the 20 host calls.
	// TODO Object.keys(calls) is BOTH route discovery and unknown_call.calls, including /v1/.
	// TODO attach Tau-Protocol:1 to every reply, including refusals and streams.
	// TODO authenticate -> descriptor.dispatch(context, unknown JSON) under SERVER context.
	// Descriptor validates its own schema in the typed closure; do not cast a union of request bodies.
	// TODO storage rejects become 500 unknown/storage_failed, never a refusal.
	// TODO refused status table is protocol.md:400,401,404,409,413. Only body counts.
	// TODO request cancellation stops its watch, not committed/admitted work.
	throw new Error("not implemented");
}
