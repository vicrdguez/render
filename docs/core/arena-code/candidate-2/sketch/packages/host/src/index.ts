import type { Context } from "@earendil-works/chord/context";
import type {
	AgentChange,
	Extension,
	HarnessOptions,
	JsonObject,
	Tx,
} from "@earendil-works/pi-durable";
import type { JsonSchema } from "@earendil-works/pi-schema";

// Copied from docs/core/host.md, Options per project.
// No kit import, no wrapper around Extension.
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
	home: string; // production passes ~/.tau; tests pass an ordinary temporary home
	modules: Readonly<Record<string, ExtensionModule>>;
	models: HarnessOptions["models"];
	env?: HarnessOptions["env"];
	now?: HarnessOptions["now"];
	port?: number; // default 6283; 0 asks the OS for an available port
	allowedHosts?: readonly string[]; // includes configured TLS proxy host; never wildcard
	allowedOrigins?: readonly string[];
};
export type Server = {
	readonly address: { host: "127.0.0.1"; port: number };
	close(): Promise<void>;
};
export async function startServer(
	options: ServerOptions,
	context: Context,
): Promise<Server> {
	// TODO server-owned context. Read configuration; validate static modules before opening projects.
	// TODO open devices.json and admin.sock with owner-only permissions.
	// TODO open all projects in startup order, then listen on loopback with node:http.
	// TODO close sends end:stopping, closes watches/harnesses/storage, then releases locks.
	throw new Error("not implemented");
}
export type AdminRequest =
	| { command: "pair"; device: string }
	| { command: "revoke"; device: string }
	| { command: "list" };
export type DeviceInfo = {
	device: string;
	pairedAt: number;
	revokedAt?: number;
};
export type AdminResult =
	| { code: string; expiresAt: number }
	| { devices: readonly DeviceInfo[] }
	| { done: true };
/** Local command only. pi-schema checks socket messages on both sides. */
export async function requestAdmin(
	home: string,
	request: AdminRequest,
): Promise<AdminResult> {
	throw new Error("not implemented");
}
