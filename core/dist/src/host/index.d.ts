import type { AgentChange, Extension, HarnessOptions, JsonObject, Storage, Tx } from "@earendil-works/pi-durable";
import type { JsonSchema } from "@earendil-works/pi-schema";
import { type ExtensionSource } from "./extensions.js";
import type { Outcome } from "./refusals.js";
import { type ReloadReport } from "./reload.js";
export type { AdminRequest, AdminResult } from "./admin.js";
export { requestAdmin } from "./admin.js";
export type { DeviceInfo } from "./devices.js";
export type { ExtensionFailure, ExtensionScan, ExtensionSource, } from "./extensions.js";
export { fromDirectory } from "./loader.js";
export type { ReloadReport } from "./reload.js";
export { taskLine } from "./task-reports.js";
export type ExtensionModule = {
    readonly extension: Extension;
    readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
    readonly options?: {
        readonly schema: JsonSchema;
        get(tx: Tx): Promise<JsonObject>;
        set(tx: Tx, value: JsonObject): Promise<void>;
    };
};
export type ServerOptions = {
    /** `~/.tau` in production: `devices.json`, `admin.sock`, and `projects/`. */
    readonly home: string;
    /** Finds extension modules and any failures before projects open. */
    readonly source: ExtensionSource;
    readonly models: HarnessOptions["models"];
    readonly env?: HarnessOptions["env"];
    readonly now?: () => number;
    /** Opens each project's storage. Defaults to Node SQLite at the given file. */
    readonly storage?: (file: string) => Promise<Storage>;
    /** Default 6283. 0 asks the system for a free port. */
    readonly port?: number;
    /** Host names a proxy forwards with, beside the loopback names. */
    readonly allowedHosts?: readonly string[];
};
export type Server = {
    readonly address: {
        readonly host: "127.0.0.1";
        readonly port: number;
    };
    /** Directories under `projects/` that start did not open, and why. A resent `bind` finishes one. */
    readonly skipped: readonly {
        readonly project: string;
        readonly reason: string;
    }[];
    reload(): Promise<Outcome<ReloadReport>>;
    /** Ends every stream with `stopping`, then closes each store and releases its lock. */
    close(): Promise<void>;
};
export declare function startServer(options: ServerOptions): Promise<Server>;
