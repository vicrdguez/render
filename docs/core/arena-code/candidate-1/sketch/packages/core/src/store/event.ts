/**
 * Event: one line in a timeline that every client can show (docs/core/primitives.md, "Event").
 *
 * The log is one conversation per store. No agent owns it, it never runs, and it takes no submissions. The store layer
 * creates it at the first open of a store (`ensureEventLog`, called by `openStore`) and keeps its ID in a session
 * document. `emit` and `eventLog` are the extension's; src/index.ts re-exports them.
 */

import type { Context } from "@earendil-works/chord/context";
import type { ConversationId, Entry, EntryId, Harness, JsonObject, Tx } from "@earendil-works/pi-durable";
import { defineDoc } from "@earendil-works/pi-durable";

// ---- Copied from docs/core/primitives.md, "Event". ----------------------------------------------------------------

export type EventData = {
	text: string; // one line a client shows without knowing the workflow
	at: number; // the Harness clock, passed by the caller
	conversation?: ConversationId;
}; // plus the emitter's own fields

// ---- The log's document. Private to this module. -------------------------------------------------------------------

const EventLog = defineDoc<{ conversation?: number }>({
	kind: "tau.events",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});

/**
 * Appends an event inside the caller's commit. The event exists only if the change it describes committed.
 * A table write: by substrate rule 1 the caller calls it after its table reads and after its `submit(tx, draft)`.
 * `kind` comes from the extension's `defineEntry`, prefixed with its name, for example `w1.design.revised`.
 */
export async function emit<D extends EventData & JsonObject>(tx: Tx, kind: Entry<D>, data: D): Promise<EntryId> {
	// TODO: const log = await eventLog(tx); return (await tx.appendEntry(kind, log, { data })).id
	void [tx, kind, data, EventLog];
	throw new Error("not implemented");
}

/** The ID of the store's log conversation. A document read. An extension reads the events with pi-durable's reads. */
export async function eventLog(tx: Tx): Promise<ConversationId> {
	void tx;
	throw new Error("not implemented");
}

/**
 * Creates the log on the first open of a store, in one commit: read the document, create an ownerless conversation,
 * write its ID. A second open finds the ID and writes nothing. A crash before the commit leaves nothing to repair.
 * Store-internal: `openStore` calls it.
 */
export async function ensureEventLog(harness: Harness, context: Context): Promise<ConversationId> {
	void [harness, context];
	throw new Error("not implemented");
}
