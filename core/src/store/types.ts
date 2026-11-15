import type {
	ConversationId,
	EntryId,
	TaskId,
} from "@earendil-works/pi-durable";

// Copied from docs/core/primitives.md. IDs are local to one store.
export type DecisionId = `${string}#${number}`;
export type DeviceId = string;
export type Annotation = {
	text: string;
	range?: { start: number; end: number };
};
export type Decision<C extends string = string> = {
	id: DecisionId;
	subject: string;
	title: string;
	basis: EntryId;
	choices: readonly [C, ...C[]];
	conversation: ConversationId;
	then: { task: string };
	requestedAt: number;
} & (
	| { status: "open" }
	| {
			status: "answered";
			choice: C;
			annotations: readonly Annotation[];
			by: DeviceId;
			at: number;
			continuation: TaskId;
	  }
	| { status: "superseded" }
	| { status: "withdrawn" }
);
export type EventData = {
	text: string;
	at: number;
	conversation?: ConversationId;
};
export type OpenDecisions = Record<
	string,
	{
		id: DecisionId;
		title: string;
		requestedAt: number;
		conversation: ConversationId;
	}
>;
export type AnsweredDecision = Extract<Decision, { status: "answered" }>;
export type AnswerInput = {
	basis: EntryId;
	choice: string;
	annotations: readonly Annotation[];
};
// Domain outcomes, not HTTP envelopes. Only http/calls turn these into protocol bodies.
export type AnswerRefusal =
	| { code: "unknown_decision"; message: string }
	| { code: "conflict"; message: string; decision: AnsweredDecision }
	| { code: "not_open"; message: string; open?: Decision }
	| {
			code:
				| "stale_basis"
				| "unknown_choice"
				| "bad_annotation"
				| "extension_not_loaded";
			message: string;
	  };
export type AnswerResult =
	| { kind: "answered"; decision: AnsweredDecision; repeated: boolean }
	| { kind: "refused"; refusal: AnswerRefusal };
