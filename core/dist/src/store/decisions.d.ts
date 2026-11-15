import type { Context } from "@earendil-works/chord/context";
import { type Task, type Tx, type TypedEntry, type WatchHandle } from "@earendil-works/pi-durable";
import type { Store } from "./host.js";
import type { AnswerInput, AnswerResult, Decision, DecisionId, DeviceId, OpenDecisions } from "./types.js";
export type DecisionInput<C extends string> = {
    decision: DecisionId;
    choice: C;
};
export type RequestDraft<C extends string, S extends {
    phase: string;
}, R, H extends object> = {
    subject: string;
    title: string;
    basis: TypedEntry<{
        text: string;
    }>;
    choices: readonly [C, ...C[]];
    conversation: Decision["conversation"];
    then: Task<DecisionInput<NoInfer<C>>, S, R, H>;
    requestedAt: number;
};
/** Creates the documents in the store's first commit, so a later read never writes. */
export declare function createDecisionDocs(tx: Tx): Promise<void>;
/**
 * Documents only. The `request` table of primitives.md:
 * | The subject has no open decision. | Opens one. |
 * | An open decision, and every field of the draft but requestedAt is equal. | Returns it. Writes nothing. |
 * | An open decision, and any other field differs. | Marks it superseded. Opens a new one. |
 */
export declare function request<const C extends string, S extends {
    phase: string;
}, R, H extends object>(tx: Tx, draft: RequestDraft<C, S, R, H>): Promise<Decision<C>>;
/** Documents only. Marks the subject's open decision withdrawn and clears its slot. */
export declare function withdraw(tx: Tx, subject: string): Promise<void>;
/** A document read. An ID that was never requested gives undefined and writes nothing. */
export declare function decision(tx: Tx, id: DecisionId): Promise<Decision | undefined>;
/**
 * The only writer of answers. One commit: table reads, then at most one table write. The `answer` table of
 * primitives.md, row by row. A storage failure rejects instead, and its outcome is unknown.
 */
export declare function answer(store: Store, id: DecisionId, input: AnswerInput, device: DeviceId, context: Context): Promise<AnswerResult>;
export declare function watchOpen(store: Store, context: Context): Promise<WatchHandle<OpenDecisions>>;
