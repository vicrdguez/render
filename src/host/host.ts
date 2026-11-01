// Composition root: one authoritative host process. Startup order and admission are Ledger's; Engine supplies the
// fixed runtime configuration.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { runtimeOptions } from "../engine/runtime.ts";
import type { Persistence } from "../kernel/kernel.ts";
import { adminServer, deviceServer } from "../ledger/http.ts";
import type { Ledger } from "../ledger/ledger.ts";
import { openLedger } from "../ledger/startup.ts";

export type Host = {
	readonly url: string;
	readonly admin: string;
	readonly ledger: Ledger;
	readonly authorityEpoch: string;
	readonly executorEpoch: string;
	readonly persistence: Persistence;
	close(): Promise<void>;
};

export async function openHost(options: {
	readonly data: string;
	readonly port?: number;
	readonly hostname?: string;
	readonly onFatal?: (error: unknown) => void;
}): Promise<Host> {
	const opened = await openLedger({ data: options.data, runtime: runtimeOptions, onFatal: (error) => options.onFatal?.(error) });
	let device: Server | undefined;
	let admin: Server | undefined;
	try {
		const socketPath = join(options.data, "admin.sock");
		admin = await adminServer(opened.ledger, socketPath);
		const listener = deviceServer(opened.ledger);
		device = listener;
		await new Promise<void>((resolve, reject) => {
			listener.once("error", reject);
			listener.listen(options.port ?? 0, options.hostname ?? "127.0.0.1", () => resolve());
		});
		const address = listener.address() as AddressInfo;
		const servers = [listener, admin];
		return {
			url: `http://${address.address}:${address.port}`,
			admin: socketPath,
			ledger: opened.ledger,
			authorityEpoch: opened.authorityEpoch,
			executorEpoch: opened.executorEpoch,
			persistence: opened.persistence,
			close: async () => {
				for (const s of servers) s.closeAllConnections();
				await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
				await opened.close();
			},
		};
	} catch (error) {
		device?.close();
		admin?.close();
		await opened.close();
		throw error;
	}
}
