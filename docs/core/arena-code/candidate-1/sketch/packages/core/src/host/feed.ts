/**
 * A feed: what `open`, `inbox`, and `timeline` return, and what the HTTP layer writes as an event stream
 * (docs/core/protocol.md, "A stream").
 *
 * A feed is pulled. The HTTP layer asks for the next frame only once the socket has drained, so a slow client makes the
 * pi-durable watch fold what lands meanwhile (W5 of spikes/wire.mjs). No commit waits for a client.
 * The first frame replaces the whole value. Later frames are ops. The last frame, when the server ends the feed, is
 * `end`. A test reads a feed with `for await` and needs no HTTP.
 */

import type { Op as ChordOp } from "@earendil-works/chord/delta";
import type { JsonValue } from "@earendil-works/chord/json";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { DeviceId } from "../store/decision.ts";

// ---- Copied from docs/core/protocol.md, "A stream". ----------------------------------------------------------------

export type Path = readonly (string | number)[];

/** The seven ops of protocol version 1. They are Chord's, as data; this type is the protocol's own copy. */
export type Op =
	| readonly ["r", JsonValue] // replaces the whole value
	| readonly ["s", Path, JsonValue] // sets the key or the index at the path
	| readonly ["d", Path] // deletes the key, or removes the array item
	| readonly ["a", Path, string] // appends the text to the string
	| readonly ["t", Path, number] // drops the string's first n UTF-16 code units
	| readonly ["p", Path, number, number, JsonValue[]] // splice: index, remove, items
	| readonly ["m", Path, number[]]; // reorder: new[i] = old[order[i]]

export type EndReason = "stopping" | "revoked" | "failed";

export type Frame = { readonly ops: readonly Op[] } | { readonly end: { readonly reason: EndReason } };

/** Fails to compile if a pi-durable upgrade gives Chord an op that protocol version 1 does not have. */
export type ChordOpsAreProtocolOps = Assert<[ChordOp] extends [Op] ? true : false>;
type Assert<T extends true> = T;

// ---- Feeds. ----------------------------------------------------------------------------------------------------------

export type Feed = AsyncIterable<Frame> & {
	/** The client went away. Stops the watches. The work goes on, because it runs under the host's context. */
	close(): void;
};

/**
 * A feed over one pi-durable watch, its first frame `["r", value]`. `prefix` puts every path under a key, which the
 * inbox uses to put each project's open list under the project's name.
 */
export function feedOf<T>(watch: WatchHandle<T>, prefix: Path = []): Feed {
	// TODO: queue of one pending frame; watch.start(listener) where the listener awaits the consumer's next pull,
	// so pi-durable folds commits that land meanwhile (one call at a time, README.md:525).
	// A watch that ends `failed` yields { end: { reason: "failed" } }.
	void [watch, prefix];
	throw new Error("not implemented");
}

/**
 * The open feeds of the server, by device. The only writer of that set.
 * `revoke` ends a device's feeds with `revoked` (W8 of spikes/wire.mjs), `close` ends all of them with `stopping` (W9).
 */
export type Feeds = {
	add(device: DeviceId, feed: Feed): Feed;
	end(device: DeviceId | "all", reason: EndReason): void;
};

export function createFeeds(): Feeds {
	throw new Error("not implemented");
}
