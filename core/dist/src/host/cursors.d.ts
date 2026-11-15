import type { JsonValue } from "@earendil-works/chord/json";
export type Decoded = {
    readonly query: Readonly<Record<string, unknown>>;
    readonly position: unknown;
};
/** A cursor names its call, its project, its query, and pi-durable's own position, and no server memory. So it
 * works after a restart. */
export declare function encodeCursor(call: string, project: string, query: Readonly<Record<string, JsonValue | undefined>>, position: JsonValue): string;
/** Undefined for a cursor that this call did not make for this project. */
export declare function decodeCursor(cursor: string, call: string, project: string): Decoded | undefined;
