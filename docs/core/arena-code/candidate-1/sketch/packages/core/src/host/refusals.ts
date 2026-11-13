/**
 * Every refusal code and its HTTP status, as one list (docs/core/protocol.md, "A call").
 *
 * A handler can only refuse with a code from this list, and the HTTP layer takes the status from it. The codes of the
 * `answer` table in src/store/decision.ts must be in it; the `satisfies` line below fails the build when they are not.
 * A new code needs no new protocol version (protocol.md, "Versions").
 */

import type { AnswerRefusal } from "../store/decision.ts";

export const refusalStatus = {
	bad_request: 400,
	bad_cursor: 400,
	unauthorized: 401,
	bad_code: 401, // a pairing code that does not work: unknown, used, expired, or after five wrong in a row
	unknown_call: 404,
	unknown_project: 404,
	unknown_conversation: 404,
	unknown_decision: 404,
	too_large: 413,
	conflict: 409,
	not_open: 409,
	stale_basis: 409,
	unknown_choice: 409,
	bad_annotation: 409,
	extension_not_loaded: 409,
	unknown_extension: 409, // `bind` or `addExtensions` names an extension the server has no module for
	bad_options: 409,
	options_invalid: 409,
	not_a_workflow: 409,
	unknown_model: 409,
	busy: 409,
	idle: 409,
	event_log: 409,
} as const;

export type RefusalCode = keyof typeof refusalStatus;

/** A refusal's body: `code` for a client to branch on, `message` for a person, and the fields the call names. */
export type Refusal = {
	readonly code: RefusalCode;
	readonly message: string;
	readonly [field: string]: unknown;
};

/** What a handler returns. A thrown error becomes `unknown` in src/host/host.ts, never a refusal. */
export type Outcome<R> = { readonly result: R } | { readonly refused: Refusal };

export function refuse(code: RefusalCode, message: string, fields?: Readonly<Record<string, unknown>>): Outcome<never> {
	return { refused: { ...fields, code, message } };
}

export function ok<R>(result: R): Outcome<R> {
	return { result };
}

/** Fails to compile when the answer table names a refusal that this list lacks. */
export type AnswerRefusalsAreListed = Assert<[AnswerRefusal] extends [RefusalCode] ? true : false>;
type Assert<T extends true> = T;
