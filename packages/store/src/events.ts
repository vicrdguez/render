import {
	type ConversationId,
	defineDoc,
	type Entry,
	type EntryId,
	type Tx,
} from "@earendil-works/pi-durable";
import type { EventData } from "./types.js";

const EventLog = defineDoc<{ log?: ConversationId }>({
	kind: "tau.event.log",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => true,
});

/** Creates the ownerless log conversation once, in the store's first commit. */
export async function createEventLog(tx: Tx): Promise<void> {
	const doc = await tx.doc(EventLog);
	if (doc.log === undefined)
		doc.log = (
			await tx.createConversation({ ownership: { kind: "ownerless" } })
		).id;
}

/** A table write, inside the caller's commit: after its table reads and any submit. */
export async function emit<D extends EventData>(
	tx: Tx,
	kind: Entry<D>,
	data: D,
): Promise<EntryId> {
	const log = await eventLog(tx);
	return (await tx.appendEntry(log, { kind: kind.kind, data })).id;
}

/** A document read. */
export async function eventLog(tx: Tx): Promise<ConversationId> {
	const { log } = await tx.doc(EventLog);
	if (log === undefined)
		throw new Error("This store has no event log. Open it with openStore.");
	return log;
}
