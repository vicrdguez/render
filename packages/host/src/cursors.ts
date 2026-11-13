import type { JsonValue } from "@earendil-works/chord/json";
import { compile, map, obj, str, unknown } from "@earendil-works/pi-schema";

const Payload = obj({
	call: str(),
	project: str(),
	query: map(unknown()),
	position: unknown(),
});
const checkPayload = compile(Payload);

export type Decoded = {
	readonly query: Readonly<Record<string, unknown>>;
	readonly position: unknown;
};

/** A cursor names its call, its project, its query, and pi-durable's own position, and no server memory. So it
 * works after a restart. */
export function encodeCursor(
	call: string,
	project: string,
	query: Readonly<Record<string, JsonValue | undefined>>,
	position: JsonValue,
): string {
	return Buffer.from(
		JSON.stringify({ call, project, query, position }),
	).toString("base64url");
}

/** Undefined for a cursor that this call did not make for this project. */
export function decodeCursor(
	cursor: string,
	call: string,
	project: string,
): Decoded | undefined {
	let value: unknown;
	try {
		value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
	} catch {
		return undefined;
	}
	const parsed = checkPayload.validate(value);
	if (
		!parsed.ok ||
		parsed.value.call !== call ||
		parsed.value.project !== project
	)
		return undefined;
	return { query: parsed.value.query, position: parsed.value.position };
}
