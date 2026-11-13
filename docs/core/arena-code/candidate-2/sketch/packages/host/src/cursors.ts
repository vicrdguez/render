// Private transport data. Never a public host type.
import type { Cursor } from "@earendil-works/pi-durable";
export type CursorPayload = {
	call: "history" | "conversations" | "faults";
	query: object; // resolved project, filters and bounds, checked by the call's closed schema
	positions: Record<string, Cursor | null>; // null is exhausted; absent is not started
};
export function encodeCursor(value: CursorPayload): string {
	throw new Error("not implemented");
}
export function decodeCursor(value: string, query: object): CursorPayload {
	// TODO base64url JSON + pi-schema; refuse wrong call/project/bounds with bad_cursor.
	// TODO no server memory, so restart does not invalidate the cursor.
	// For faults retain a per-kind frontier, never advance past an unreturned fault.
	// Exhausted kinds stay exhausted instead of being rescanned from the beginning.
	throw new Error("not implemented");
}
