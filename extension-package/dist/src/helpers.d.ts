import { type AgentChange, type ConversationId, type ConversationOwnership, type JsonObject, type ModelRef, type Tx } from "@earendil-works/pi-durable";
import { type Schema } from "@earendil-works/pi-schema";
export type RoleSettings = AgentChange & {
    readonly model: ModelRef;
    readonly extensions: NonNullable<AgentChange["extensions"]>;
};
export declare function role(tx: Tx, settings: RoleSettings, ownership: ConversationOwnership): Promise<ConversationId>;
export declare function options<T extends JsonObject>(extension: string, schema: Schema<T>): {
    readonly schema: Schema<T>;
    get(tx: Tx): Promise<Partial<T>>;
    set(tx: Tx, value: Partial<T>): Promise<void>;
    read(tx: Tx): Promise<T>;
};
export declare function modelRef(value: string): ModelRef;
export declare function prose<const S extends readonly string[]>(directory: string, file: string, slots: S): (facts: {
    [K in S[number]]: string;
}) => string;
