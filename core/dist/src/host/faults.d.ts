import type { ConversationId, Cursor, TaskId } from "@earendil-works/pi-durable";
import { type DecisionId } from "../store/index.js";
import type { OpenProject } from "./projects.js";
export type Fault = {
    task: TaskId;
    kind: string;
    conversation: ConversationId;
    error: string;
    endedAt?: number;
    decision?: DecisionId;
};
/** Each kind continues after a returned task's identity. `null` is a kind with nothing left. */
type Position = Cursor | null;
export type Positions = Record<string, Position>;
/** One page of faulted tasks of the given kinds, newest first. A kind's position moves only past a fault that the
 * page returns, so none is skipped. */
export declare function scanFaults(open: OpenProject, kinds: readonly string[], limit: number, positions: Positions): Promise<{
    items: Fault[];
    positions: Positions;
}>;
export {};
