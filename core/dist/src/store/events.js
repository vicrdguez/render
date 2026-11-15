import { defineDoc, } from "@earendil-works/pi-durable";
const EventLog = defineDoc({
    kind: "tau.event.log",
    version: 1,
    scope: "session",
    initial: () => ({}),
    checkpointWhen: () => true,
});
/** Creates the ownerless log conversation once, in the store's first commit. */
export async function createEventLog(tx) {
    const doc = await tx.doc(EventLog);
    if (doc.log === undefined)
        doc.log = (await tx.createConversation({ ownership: { kind: "ownerless" } })).id;
}
/** A table write, inside the caller's commit: after its table reads and any submit. */
export async function emit(tx, kind, data) {
    const log = await eventLog(tx);
    return (await tx.appendEntry(log, { kind: kind.kind, data })).id;
}
/** A document read. */
export async function eventLog(tx) {
    const { log } = await tx.doc(EventLog);
    if (log === undefined)
        throw new Error("This store has no event log. Open it with openStore.");
    return log;
}
//# sourceMappingURL=events.js.map