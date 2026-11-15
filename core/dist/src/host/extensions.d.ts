import type { ExtensionModule, ServerOptions } from "./index.js";
import { Options } from "./options.js";
export type ExtensionFailure = {
    readonly name: string;
    readonly path?: string;
    readonly stage: string;
    readonly error: unknown;
};
export type ExtensionScan = {
    readonly modules: Readonly<Record<string, unknown>>;
    readonly failures: readonly ExtensionFailure[];
};
export type ExtensionSource = () => ExtensionScan | Promise<ExtensionScan>;
export declare function loadExtensions(source: ExtensionSource, models: ServerOptions["models"]): Promise<{
    modules: Record<string, ExtensionModule>;
    options: Map<string, Options>;
    failures: ExtensionFailure[];
}>;
