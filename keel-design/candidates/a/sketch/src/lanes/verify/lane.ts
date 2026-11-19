/**
 * Verify lane: Verify, Land, Hand over.
 *
 * Item verification:
 * idle|returned --item_published(build k)--> checking_out (new path per build; the previous checkout is removed)
 * checking_out --effect_done checkout--> verifying ; --occupied--> checking_out with a new key and path
 * verifying --publish_verdict(item, fail)--> converge(); rework: returned, send build.item_failed(v);
 *          diagnose: diagnosing(thread)
 * verifying --publish_verdict(item, pass)--> awaiting_merge; remove checkout; notes with followUp -> queue.file
 * diagnosing --publish_diagnosis--> escalated; send queue.file(non_convergence, thread, diagnosis);
 *          send build.hold(item)
 * escalated --released--> returned (Build resumes the worker with the diagnosis and the owner's notes)
 * merge queue (one at a time): awaiting_merge -> merging: effect merge_item(expected = Build's head)
 * merging --merged(sha)--> merged; send build.item_merged ; --conflict|checks_failed--> returned;
 *          send build.item_integrate (never a verdict, never a convergence count)
 *
 * Full set:
 * waiting --build_complete(head)--> checking_out(head) --> verifying(full verifier, all rulings since binding)
 * verifying --publish_verdict(full, fail)--> returned; send build.full_failed (threads as above, scope "full")
 * verifying --publish_verdict(full, pass, handover)--> passed; landing queued; send trunk.request
 *
 * Land (lock held from `granted` to release):
 * queued --granted--> taking_trunk(expected = head)
 * taking_trunk --combined(sha, trunk)--> landing(expectedTrunk = trunk, combined = sha)
 * taking_trunk --conflict|checks_failed--> returned; send trunk.release; send build.trunk_conflict
 * landing --landed(sha)--> landed; send trunk.release; send build.landed; handover asking(sha)
 * landing --moved(actual)--> taking_trunk(expected = head): trunk moved under keel; take it in again
 *
 * Hand over: asking --answered accept--> accepted ; --answered findings--> each annotation filed to the queue as
 * an owner finding against this landing; findings. Neither blocks anything.
 */
import type { Ask, AgentDecl, EffectDecl, KernelEvent, Lane, Reduction, World } from "../../kernel/lane.ts";
import type { Self } from "../../kernel/kernel.ts";
import type { VerifyMessage, VerifyView } from "./public.ts";
import type { VerdictFinding, VerifyState } from "./state.ts";
import { VerifyDoc } from "./state.ts";

export type VerifyEvent =
	| {
			readonly kind: "verdict";
			readonly outcome: "pass" | "fail";
			readonly text: string;
			readonly findings: readonly Omit<VerdictFinding, "n">[];
			readonly handover: null | { readonly againstIntent: string; readonly residualRisk: string };
			readonly self: Self;
	  }
	| {
			readonly kind: "diagnosis";
			readonly premise: string;
			readonly test: string;
			readonly result: string;
			readonly self: Self;
	  }
	| VerifyMessage;

export const verifyLane: Lane<"verify", VerifyState, VerifyEvent, VerifyView> = {
	name: "verify",
	scope: "work",
	state: VerifyDoc,
	reduce(state: VerifyState, event: VerifyEvent | KernelEvent, world: World): Reduction<VerifyState> {
		throw new Error("not implemented");
	},
	view(state: VerifyState): VerifyView {
		throw new Error("not implemented");
	},
	/**
	 * `handover` while asking: basis = the trunk commit, what landed against the intent, every ruling ordered by cost
	 * if wrong (high first, then recorded order), notes and edge cases, riders bound and delegated, residual risk, and
	 * the command to promote the commit to main by hand. Choices: accept | findings.
	 */
	asks(state: VerifyState, world: World): readonly Ask[] {
		throw new Error("not implemented");
	},
	/**
	 * `item/<id>/verifier` per item from its first checkout until merged (cwd = current checkout; `verify.md` for the
	 * first build, `reverify.md` with the previous blocks after rework, `reverify-integration.md` after an integration
	 * fix). `full/verifier` for the full set (`verify-full.md`). `thread/<id>/diagnoser` while diagnosing
	 * (`diagnose.md`, attack-the-premise rendered in full). Expected tool: `publish_verdict` or `publish_diagnosis`.
	 */
	agents(state: VerifyState, world: World): readonly AgentDecl[] {
		throw new Error("not implemented");
	},
	/** Checkouts, their removal, merge_item, take_trunk, land. */
	effects(state: VerifyState, world: World): readonly EffectDecl[] {
		throw new Error("not implemented");
	},
};
