/**
 * The transport: `node:http`, one `POST /v1/<call>` per call, an event stream for a feed (docs/core/protocol.md).
 *
 * This file knows HTTP and nothing about what a call does. It reads the routes from `calls` through the host, so a
 * call added to src/host/calls.ts is served with no change here.
 */

import type { Host } from "../host/host.ts";

export type ServeOptions = {
	readonly port: number; // 6283 by default, 0 in a test
	/** The `Host` values the server accepts: `127.0.0.1:<port>`, `localhost:<port>`, and any name a proxy forwards. */
	readonly allowedHosts: readonly string[];
};

/**
 * Listens on 127.0.0.1 only.
 *
 * For each request:
 * - not `POST`, or a path other than `/v1/<name>`: `unknown_call`. `POST /v1/` with no name: `unknown_call`, whose
 *   `calls` lists the server's calls, so a client learns them with no extra call.
 * - a `Host` not in `allowedHosts`, or an `Origin` of another site: refused (see design.md, open questions).
 * - a body over 1 MiB: `too_large`. A body that is not JSON: `bad_request`.
 * - `/v1/pair`: `host.redeem(code)`, no token. Every other path: `host.authenticate(Authorization)` or `unauthorized`.
 * - `host.call(device, name, body)`. A `result` whose call is a stream: `pipeFeed`. Anything else: one JSON body.
 * - the status of a refusal comes from `refusalStatus`. `unknown` is 500. Every reply has `Tau-Protocol: 1`.
 * - no CORS headers, no redirect, and `Authorization` never reaches a log.
 */
export async function serve(
	host: Host,
	options: ServeOptions,
): Promise<{ readonly port: number; close(): Promise<void> }> {
	void [host, options];
	throw new Error("not implemented");
}
