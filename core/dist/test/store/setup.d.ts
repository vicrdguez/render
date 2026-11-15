import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { type ConversationId, type Storage } from "@earendil-works/pi-durable";
import { type Decision, type DecisionInput, type RequestDraft } from "tau";
export { context };
export type Choice = "approve" | "revise" | "abort";
export declare const Basis: import("@earendil-works/pi-durable").Entry<{
    text: string;
}>;
/** A `then` task that reads its decision through `decision()` and records what it saw. */
export declare const Then: import("@earendil-works/pi-durable").Task<DecisionInput<Choice>, {
    phase: "run";
}, null, object>;
export declare const Throws: import("@earendil-works/pi-durable").Task<DecisionInput<Choice>, {
    phase: "run";
}, null, object>;
export declare const Fails: import("@earendil-works/pi-durable").Task<DecisionInput<Choice>, {
    phase: "run";
}, null, object>;
export declare const extension: import("@earendil-works/pi-durable").Extension<import("@earendil-works/pi-durable").ToolRegistration>;
/** A store over memory with the test extension installed and a clock the test moves. */
export declare function setup(storage?: Storage, installed?: boolean): Promise<{
    store: import("../../src/store/host.js").Store;
    registry: import("@earendil-works/pi-durable").Registry<import("@earendil-works/pi-durable").ToolRegistration>;
    clock: {
        now: number;
    };
    conversation: ConversationId;
    basis: (text: string, where?: ConversationId) => Promise<import("@earendil-works/pi-durable").TypedEntry<{
        text: string;
    }>>;
    draft: (change?: Partial<RequestDraft<Choice, {
        phase: "run";
    }, null, object>>) => Promise<RequestDraft<Choice, {
        phase: "run";
    }, null, object>>;
    ask: (d: RequestDraft<Choice, {
        phase: "run";
    }, null, object>) => Promise<Decision<Choice>>;
    read: (id: Decision["id"]) => Promise<Decision | undefined>;
    seen: () => Promise<{
        input: DecisionInput<string>;
        read: string | null;
    }[]>;
    commits: () => number;
}>;
