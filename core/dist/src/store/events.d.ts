import { type ConversationId, type Entry, type EntryId, type Tx } from "@earendil-works/pi-durable";
import type { EventData } from "./types.js";
/** Creates the ownerless log conversation once, in the store's first commit. */
export declare function createEventLog(tx: Tx): Promise<void>;
/** A table write, inside the caller's commit: after its table reads and any submit. */
export declare function emit<D extends EventData>(tx: Tx, kind: Entry<D>, data: D): Promise<EntryId>;
/** A document read. */
export declare function eventLog(tx: Tx): Promise<ConversationId>;
