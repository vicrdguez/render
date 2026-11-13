/**
 * The `tau` command (docs/core/protocol.md, "Devices and tokens"; docs/core/README.md, the default port 6283).
 *
 *   tau serve [--root ~/.tau] [--port 6283] [--allow-host <host:port>]...
 *   tau device pair <name>      prints a code of 8 characters, good once, for 10 minutes
 *   tau device revoke <name>
 *   tau device list
 *
 * apps/tau/src/main.ts calls `main` with the import map. `serve` prints `listening on 127.0.0.1:<port>` once it listens,
 * so a test can start it with `--port 0` and read the port.
 */

import type { ExtensionModule } from "./module.ts";

export const DEFAULT_PORT = 6283;

/** Runs one command and returns its exit code. `serve` returns when SIGINT or SIGTERM has closed the host. */
export async function main(argv: readonly string[], modules: readonly ExtensionModule[]): Promise<number> {
	// TODO:
	//   serve:  host = await openHost({ root, modules, models, now: Date.now })
	//           models: pi-ai with pi's own login on this machine (host.md: decided for now)
	//           http = await serve(host, { port, allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`, ...flags] })
	//           admin = await listenAdmin(host, join(root, "admin.sock"))
	//           print the port; on SIGINT or SIGTERM: http.close(), admin.close(), host.close()
	//   device: askAdmin(join(root, "admin.sock"), { op, device }) and print the reply
	void [argv, modules];
	throw new Error("not implemented");
}
