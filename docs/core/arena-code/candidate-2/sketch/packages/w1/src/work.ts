import type {
	ConversationId,
	EntryId,
	TaskId,
} from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-store";

// docs/core/walk.md: one Work per D; k is D's conversation ID.
export type Plan = {
	path: string;
	branch: string;
	base: string;
	baseSha: string; // copied BEFORE outside effect
};
export type Reply = { annotation: number; text: string }; // decision ID + list index names annotation
export type DesignData = { text: string; replies?: Reply[] };
export type BuildData = {
	text: string;
	design: EntryId;
	sha: string;
	fixes?: EntryId;
	replies?: Reply[];
};
export type ReviewData = {
	text: string;
	build: EntryId;
	sha: string;
	verdict: "pass" | "fail";
	findings: string[];
};
export type MergeData = {
	text: string;
	design: EntryId;
	sha: string;
	build: EntryId;
	review: EntryId;
	branch: string;
};
export type Candidate = { build: EntryId; sha: string; review?: EntryId };
export type Stage =
	| { stage: "designing"; owes?: DecisionId }
	| { stage: "design_review"; waiting: DecisionId; design: EntryId }
	| { stage: "preparing"; accepted: EntryId; approval: DecisionId; plan: Plan }
	| { stage: "building"; accepted: EntryId; approval: DecisionId; plan: Plan }
	| {
			stage: "fixing";
			accepted: EntryId;
			approval: DecisionId;
			plan: Plan;
			candidate?: Candidate;
			fixes?: EntryId;
	  }
	| {
			stage: "reviewing";
			accepted: EntryId;
			approval: DecisionId;
			plan: Plan;
			candidate: Candidate;
			model: string;
	  }
	| {
			stage: "merge_review";
			accepted: EntryId;
			approval: DecisionId;
			plan: Plan;
			candidate: Candidate;
			waiting: DecisionId;
			basis: EntryId;
	  }
	| { stage: "handed_over"; sha: string }
	| { stage: "cancelled" | "stopped"; plan?: Plan };
export type Work = {
	designer: ConversationId;
	implementer?: ConversationId;
	reviewer?: ConversationId;
	state: Stage;
	stuck?: {
		waiting: DecisionId;
		conversation: ConversationId;
		priorStage: Stage;
	};
	receipts: Record<string, { entry: EntryId; decision?: DecisionId }>;
	handled: Record<DecisionId, true>; // recreated then tasks share this key
};
// TODO a conversation Work document owned by D; I/R docs only name D.
// TODO any tool/task checks cancellation FIRST, then stage and expected decision/candidate.
// Decision subjects: w1:${k}:design, w1:${k}:merge, w1:${k}:stuck.
// Private document definitions stay here; no host or kit-owned work record.
