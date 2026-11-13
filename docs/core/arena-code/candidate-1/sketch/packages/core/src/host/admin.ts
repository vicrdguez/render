/**
 * The admin socket, `<root>/admin.sock` (docs/core/protocol.md, "The first token"). Only the server's OS user can open
 * it. `tau device pair`, `revoke`, and `list` reach the running server through it. One JSON line each way.
 * Both ends live here, so the line format is known in one file.
 */

import type { DeviceRecord } from "./devices.ts";
import type { Host } from "./host.ts";

export type AdminRequest =
	| { readonly op: "pair"; readonly device: string }
	| { readonly op: "revoke"; readonly device: string }
	| { readonly op: "list" };

export type AdminReply =
	| { readonly code: string }
	| { readonly revoked: string }
	| { readonly devices: readonly DeviceRecord[] }
	| { readonly refused: string };

/** The server's end. Makes the socket with mode 0600 in a directory with mode 0700. */
export async function listenAdmin(host: Host, path: string): Promise<{ close(): Promise<void> }> {
	void [host, path];
	throw new Error("not implemented");
}

/** The command's end. */
export async function askAdmin(path: string, request: AdminRequest): Promise<AdminReply> {
	void [path, request];
	throw new Error("not implemented");
}
