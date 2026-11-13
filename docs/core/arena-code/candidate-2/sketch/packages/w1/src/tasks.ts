import type { Context } from "@earendil-works/chord/context";
import type {
	ConversationId,
	EntryId,
	HookRegistration,
	Task,
} from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-store";
import type { Work } from "./work.js";

type One = { phase: "act" };
export type DesignAnswerInput = {
	decision: DecisionId;
	choice: "approve" | "revise" | "abort";
};
export declare const designAnswer: Task<DesignAnswerInput, One, void, object>; // w1.design_answer v1
// TODO abort first -> durable cancel; revise reads decision+basis, configures designer MODEL
// from current options then ONE submit(requestId:decision ID), Work owes that answer, emit.
// approve copies option base+Git SHA into Plan before creating prepare; annotations go to I.

export type PreparePhase = { phase: "ensure" } | { phase: "submit" };
export declare const prepare: Task<
	{ work: ConversationId },
	PreparePhase,
	void,
	object
>; // w1.prepare v1
// TODO ensure effect using persisted Plan; mismatch -> stuck retry/abort, never delete.
// commit role(ownerless implementer(current model,plan.path)) + I doc + Work + checkpoint.
// next phase reads stored design+approval+annotations before submit; first event names I.

export declare const reviewStart: Task<
	{ work: ConversationId; build: EntryId },
	One,
	void,
	object
>; // w1.review_start v1
export declare const fixStart: Task<
	{ work: ConversationId; review: EntryId },
	One,
	void,
	object
>; // w1.fix_start v1
// TODO each reads current options, configure model, submit using stored causing ENTRY ID,
// then Work+event+terminal. Review inputs come from published Build, fix inputs from Review.
// A joined user run may be in progress. Queue the dispatch; never rewrite its evidence.

export declare const handoff: Task<
	{ decision: DecisionId; choice: "approve" | "abort" },
	One,
	void,
	object
>; // w1.handoff v1
// TODO abort first. Verify Merge->accepted Design->Build->Review->same SHA->actual branch head.
// moved head -> no handoff, fixing + text basis naming both SHAs + stuck retry/abort.
// match -> handed_over, emit git merge --ff-only SHA and unacted annotations. NEVER merge.

export declare const retry: Task<
	{ decision: DecisionId; choice: "retry" | "abort" },
	One,
	void,
	object
>; // w1.retry v1
// TODO current expected stuck decision only; configure role's model then submit stored text
// and annotations with decision ID requestId. Receipt keyed by decision ID, not new task ID.

export type StopPhase =
	| { phase: "designer" }
	| { phase: "implementer" }
	| { phase: "reviewer" }
	| { phase: "done" };
export declare const stop: Task<
	{ work: ConversationId },
	StopPhase,
	void,
	object
>; // w1.stop v1
// TODO own background task in D: runtime.conversation(...).abort() then changed checkpoint.
// cancel is committed BEFORE this task is created: cancelled + withdraw other subjects +
// entry with unpursued annotations + stop task + event. Final phase stopped, path stays.

export declare const ensureHandoff: Task<
	{ conversation: ConversationId; final: EntryId },
	One,
	void,
	object
>; // w1.ensure_handoff v1
export declare const ensureHandoffHook: HookRegistration;
// TODO hook afterRun returns runEndTask(ensureHandoff,...), ordinary CHILD of run.
// Stage moved -> terminal only. Otherwise basis is last message, stuck retry/abort -> retry.
// Failed/aborted runs deliberately get no decision. Owner uses open/continue.

// All tasks except ensure_handoff are conversation-owned in D, background:true.
// Every then task checks expected decision AND Work.handled[decision] before effect.
// No phase waits in memory without first committing a changed checkpoint.
// Implementation replaces these declarations with defineTask, handlers all initially throw.
