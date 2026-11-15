import type { Models } from "@earendil-works/pi-ai";
import type { JsonObject, Tx } from "@earendil-works/pi-durable";
import { type JsonSchema, type ValidationError } from "@earendil-works/pi-schema";
import type { ExtensionModule } from "./index.js";
type Contract = NonNullable<ExtensionModule["options"]>;
/** Splits `provider/modelId` at the first slash. */
export declare function modelRef(value: string): {
    provider: string;
    modelId: string;
} | undefined;
export declare const hasModel: (models: () => Models, value: string) => boolean;
/** The host's half of the options contract: checks with defaults filled, and replies with secrets hidden. */
export declare class Options {
    #private;
    constructor(contract: Contract, models: () => Models);
    get schema(): JsonSchema;
    /** The errors of the set keys with the defaults filled, missing keys included. */
    errors(value: JsonObject): ValidationError[];
    hide(value: JsonObject): JsonObject;
    view(tx: Tx): Promise<{
        value: JsonObject;
        errors: ValidationError[];
    }>;
    patch(tx: Tx, patch: Readonly<Record<string, unknown>>): Promise<{
        value: JsonObject;
    } | {
        errors: ValidationError[];
    }>;
}
export {};
