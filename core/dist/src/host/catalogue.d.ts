import type { ExtensionModule } from "./index.js";
import type { Options } from "./options.js";
type Loaded = {
    readonly module: ExtensionModule;
    readonly options: Options | undefined;
};
export declare class Catalogue {
    #private;
    constructor(modules: Readonly<Record<string, ExtensionModule>>, options: ReadonlyMap<string, Options>);
    get(name: string): Loaded | undefined;
    entries(): readonly (readonly [string, Loaded])[];
    selected(names: readonly string[]): readonly Loaded[];
    defaults(names: readonly string[]): (import("@earendil-works/pi-durable").Extension<import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{
        command: string;
        timeout?: number | undefined;
    }>, import("@earendil-works/chord/json").JsonValue> | import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{
        path: string;
        content: string;
    }>, import("@earendil-works/chord/json").JsonValue> | import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{
        path: string;
        edits: {
            oldText: string;
            newText: string;
        }[];
    }>, import("@earendil-works/pi-durable/tools").EditToolDetails> | import("@earendil-works/pi-durable").ToolRegistration<import("@earendil-works/pi-schema").Schema<{
        path: string;
        offset?: number | undefined;
        limit?: number | undefined;
    }>, import("@earendil-works/pi-durable/tools").ReadToolDetails>> | import("@earendil-works/pi-durable").Extension<import("@earendil-works/pi-durable").ToolRegistration<object, import("@earendil-works/chord/json").JsonValue>>)[];
}
export {};
