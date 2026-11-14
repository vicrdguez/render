import { chmod, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server as NetServer } from "node:net";
import type {
	AgentChange,
	Extension,
	HarnessOptions,
	JsonObject,
	Storage,
	Tx,
} from "@earendil-works/pi-durable";
import type { JsonSchema } from "@earendil-works/pi-schema";
import { adminSocket, listenAdmin, refuseRunning } from "./admin.js";
import { Catalogue } from "./catalogue.js";
import { Devices } from "./devices.js";
import { type ExtensionSource, loadExtensions } from "./extensions.js";
import { handler } from "./http.js";
import { Projects } from "./projects.js";
import { StructuralQueue } from "./structural.js";

export type { AdminRequest, AdminResult } from "./admin.js";
export { requestAdmin } from "./admin.js";
export type { DeviceInfo } from "./devices.js";
export type {
	ExtensionFailure,
	ExtensionScan,
	ExtensionSource,
} from "./extensions.js";

// docs/core/host.md, "Options per project".
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
	readonly address: { readonly host: "127.0.0.1"; readonly port: number };
	/** Directories under `projects/` that start did not open, and why. A resent `bind` finishes one. */
	readonly skipped: readonly {
		readonly project: string;
		readonly reason: string;
	}[];
	/** Ends every stream with `stopping`, then closes each store and releases its lock. */
	close(): Promise<void>;
};

export async function startServer(options: ServerOptions): Promise<Server> {
	const loaded = await loadExtensions(options.source, options.models);
	await mkdir(options.home, { recursive: true, mode: 0o700 });
	await chmod(options.home, 0o700);
	const socket = adminSocket(options.home);
	const models = options.models;
	const current = typeof models === "function" ? models : () => models;
	const projects = new Projects(
		options,
		new Catalogue(loaded.modules, loaded.options),
	);
	const structural = new StructuralQueue();
	let admin: NetServer | undefined;
	try {
		const devices = await Devices.load(options.home, options.now ?? Date.now);
		await projects.start();
		await refuseRunning(socket);
		admin = await listenAdmin(socket, devices);
		const host = {
			projects,
			devices,
			models: current,
			structural,
		};
		const http = createServer(handler(host, options.allowedHosts ?? []));
		await new Promise<void>((resolve, reject) => {
			http.once("error", reject);
			http.listen(options.port ?? 6283, "127.0.0.1", () => resolve());
		});
		const address = http.address();
		const port =
			typeof address === "object" && address !== null ? address.port : 0;
		const adminServer = admin;
		let closing: Promise<void> | undefined;
		return {
			address: { host: "127.0.0.1", port },
			skipped: projects.skipped,
			close: () => {
				closing ??= (async () => {
					await structural.close();
					devices.endAll("stopping");
					await new Promise((resolve) => {
						http.close(resolve);
						http.closeAllConnections();
					});
					await new Promise((resolve) => adminServer.close(resolve));
					await projects.close();
				})();
				return closing;
			},
		};
	} catch (error) {
		await new Promise((resolve) =>
			admin ? admin.close(resolve) : resolve(undefined),
		);
		await projects.close();
		throw error;
	}
}
