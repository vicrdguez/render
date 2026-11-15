import { Harness, } from "@earendil-works/pi-durable";
import { createDecisionDocs } from "./decisions.js";
import { createEventLog } from "./events.js";
export { answer, watchOpen } from "./decisions.js";
/**
 * Opens a harness and, in one commit, creates the store's documents and event log if they are absent. Knows no
 * project, path, lock, or extension, and leaves the scheduler paused. The caller holds the process lock and owns
 * the storage.
 */
export async function openStore(storage, options, context) {
    const harness = await Harness.open(storage, options, context);
    await harness.commit(async (tx) => {
        await createDecisionDocs(tx);
        await createEventLog(tx);
    }, context);
    return { harness, options };
}
//# sourceMappingURL=host.js.map