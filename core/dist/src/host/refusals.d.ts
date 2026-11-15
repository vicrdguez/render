import type { AnswerResult } from "../store/host.js";
export declare const statusOf: {
    readonly bad_request: 400;
    readonly bad_cursor: 400;
    readonly unauthorized: 401;
    readonly unknown_call: 404;
    readonly unknown_project: 404;
    readonly unknown_conversation: 404;
    readonly unknown_decision: 404;
    readonly too_large: 413;
    readonly conflict: 409;
    readonly not_open: 409;
    readonly stale_basis: 409;
    readonly unknown_choice: 409;
    readonly bad_annotation: 409;
    readonly extension_not_loaded: 409;
    readonly bad_options: 409;
    readonly options_invalid: 409;
    readonly not_a_workflow: 409;
    readonly unknown_model: 409;
    readonly busy: 409;
    readonly idle: 409;
    readonly event_log: 409;
};
export type Code = keyof typeof statusOf;
export type Refusal = {
    readonly code: Code;
    readonly message: string;
    readonly [field: string]: unknown;
};
export type Outcome<R> = {
    readonly result: R;
} | {
    readonly refused: Refusal;
};
export declare const refuse: (code: Code, message: string, fields?: Readonly<Record<string, unknown>>) => {
    readonly refused: Refusal;
};
type AnswerCode = Extract<AnswerResult, {
    kind: "refused";
}>["refusal"]["code"];
type Listed<T extends true> = T;
/** Fails to compile when the store's `answer` table names a code this table lacks. */
export type AnswerCodesListed = Listed<[
    AnswerCode
] extends [Code] ? true : false>;
export {};
