import { type DecisionInput, type EventData } from "tau";
import type { ExtensionModule } from "../../src/host/index.js";
export declare const WEEK: number;
export declare const Search: import("@earendil-works/pi-durable").Extension<import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{
    query: string;
}>, import("@earendil-works/chord/json").JsonValue>>;
export declare const search: ExtensionModule;
export declare const Notes: import("@earendil-works/pi-durable").Extension<import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{}>, import("@earendil-works/chord/json").JsonValue>>;
export declare const notes: ExtensionModule;
type Phase = {
    phase: string;
};
export declare const Due: import("@earendil-works/pi-durable").Task<Record<string, never>, Phase, null, object>;
export declare const Broken: import("@earendil-works/pi-durable").Task<Record<string, never>, Phase, null, object>;
type Choice = "approve" | "revise";
export declare const Approved: import("@earendil-works/pi-durable").Task<DecisionInput<Choice>, Phase, null, object>;
export declare const Dies: import("@earendil-works/pi-durable").Task<DecisionInput<Choice>, Phase, null, object>;
export declare const Asked: import("@earendil-works/pi-durable").Entry<EventData>;
/** Lets a test hold a run inside a tool round. */
export declare const gate: {
    entered: Promise<void>;
    release: () => void;
    arm(): void;
    wait: () => Promise<void>;
};
export declare const Flow: import("@earendil-works/pi-durable").Extension<import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{}>, import("@earendil-works/chord/json").JsonValue>>;
export declare const flow: ExtensionModule;
export declare const modules: {
    search: ExtensionModule;
    notes: ExtensionModule;
    flow: ExtensionModule;
};
export {};
