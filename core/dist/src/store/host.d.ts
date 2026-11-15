import type { Context } from "@earendil-works/chord/context";
import { Harness, type HarnessOptions, type Storage } from "@earendil-works/pi-durable";
export { answer, watchOpen } from "./decisions.js";
export type { AnswerInput, AnswerResult, OpenDecisions } from "./types.js";
export type Store = {
    readonly harness: Harness;
    readonly options: HarnessOptions;
};
/**
 * Opens a harness and, in one commit, creates the store's documents and event log if they are absent. Knows no
 * project, path, lock, or extension, and leaves the scheduler paused. The caller holds the process lock and owns
 * the storage.
 */
export declare function openStore(storage: Storage, options: HarnessOptions, context: Context): Promise<Store>;
