/**
 * A feed written as a server-sent event stream (docs/core/protocol.md, "A stream" and "A slow client, a dead link,
 * the end"). `Content-Type: text/event-stream`, `Cache-Control: no-store`. A frame is `data: <json>` and a blank line.
 */

import type { ServerResponse } from "node:http";
import type { Feed } from "../host/feed.ts";

/** After this long with no frame, the server writes a heartbeat line, `:`. */
export const HEARTBEAT_MS = 15_000;
/** A write that has not drained in this long ends the stream. The client opens it again. */
export const DRAIN_MS = 60_000;

/**
 * Pulls the next frame only after the last write drained, so pi-durable folds what lands meanwhile.
 * The client closing its request closes the feed; the work goes on.
 */
export async function pipeFeed(feed: Feed, response: ServerResponse): Promise<void> {
	void [feed, response];
	throw new Error("not implemented");
}
