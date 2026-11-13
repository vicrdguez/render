/**
 * An opaque cursor (docs/core/protocol.md, "A cursor is an opaque string"): base64url of JSON that holds the call's name,
 * the query, and pi-durable's own cursor, which names a record and no server memory. So a cursor works after a restart
 * and carries its own bounds. `faults` keeps one position for each task kind it scans.
 */

import type { Cursor, JsonObject } from "@earendil-works/pi-durable";

export type CursorState = {
	readonly call: string;
	readonly query: JsonObject;
	readonly next: Cursor | { readonly [kind: string]: Cursor | null };
};

export function encodeCursor(state: CursorState): string {
	return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/** `undefined` for a string that this server did not make for this call: the call refuses with `bad_cursor`. */
export function decodeCursor(call: string, cursor: string): CursorState | undefined {
	void [call, cursor];
	throw new Error("not implemented");
}
