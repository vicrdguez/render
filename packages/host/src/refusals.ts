import type { AnswerResult } from "tau-store/host";

// docs/core/protocol.md, "A call". The HTTP layer takes each status from here.
export const statusOf = {
	bad_request: 400,
	bad_cursor: 400,
	unauthorized: 401,
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
	bad_options: 409,
	options_invalid: 409,
	not_a_workflow: 409,
	unknown_model: 409,
	busy: 409,
	idle: 409,
	event_log: 409,
} as const;

export type Code = keyof typeof statusOf;
export type Refusal = {
	readonly code: Code;
	readonly message: string;
	readonly [field: string]: unknown;
};
export type Outcome<R> = { readonly result: R } | { readonly refused: Refusal };

export const refuse = (
	code: Code,
	message: string,
	fields: Readonly<Record<string, unknown>> = {},
): { readonly refused: Refusal } => ({ refused: { ...fields, code, message } });

type AnswerCode = Extract<AnswerResult, { kind: "refused" }>["refusal"]["code"];
type Listed<T extends true> = T;
/** Fails to compile when the store's `answer` table names a code this table lacks. */
export type AnswerCodesListed = Listed<
	[AnswerCode] extends [Code] ? true : false
>;
