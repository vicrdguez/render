import type {
	ConversationId,
	Entry,
	EntryId,
	Tx,
} from "@earendil-works/pi-durable";
import type { EventData } from "./types.js";

/** Table write, after all table reads and any submit. docs/core/primitives.md. */
export async function emit<D extends EventData>(
	tx: Tx,
	kind: Entry<D>,
	data: D,
): Promise<EntryId> {
	// TODO append to the ownerless event conversation obtained from a session document.
	throw new Error("not implemented");
}
export async function eventLog(tx: Tx): Promise<ConversationId> {
	throw new Error("not implemented");
}
