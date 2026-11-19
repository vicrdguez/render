/**
 * Verify lane state: one per piece of work, on its anchor conversation. Owns verdicts, finding threads
 * (convergence), merges into the build branch, the full-set pass, Land and Hand over.
 *
 * Verdicts and threads are append-only records. A verdict is about one published commit (`Sha` from Build's
 * record), never about working files.
 */
import type { DecisionId } from "tau";
import type { AgentKey, Brand, EffectKey } from "../../kernel/ids.ts";
import type { Sha } from "../../repo/index.ts";
import { defineState } from "../../kernel/state.ts";
import type { ItemId } from "../build/public.ts";
import type { FindingRef } from "../queue/public.ts";

export type ThreadId = Brand<string, "ThreadId">;

/** The only grounds for a block (workflow §6, "What the verifier may block on"). */
export type BlockGround =
	| "failing_run"
	| "mandate_violation"
	| "weakened_check"
	| "false_claim"
	| "unprobed_rule"
	| "reachable_harm";

export type EdgeCase = { readonly failure: string; readonly likelihood: string; readonly cost: string };

export type VerdictFinding = {
	/** One-based position in the verdict. */
	readonly n: number;
	readonly severity: "block" | "note";
	readonly text: string;
	/** Required for a block. */
	readonly grounds: BlockGround | null;
	/** The number of the previous verdict's block this one is (it survived the fix). */
	readonly repeats: number | null;
	/** Required for `reachable_harm` blocks and for edge-case notes. */
	readonly edgeCase: EdgeCase | null;
	/** A note to file in the queue rather than only report in the handover. */
	readonly followUp: boolean;
};

export type VerdictScope =
	| { readonly kind: "item"; readonly item: ItemId; readonly build: number }
	| { readonly kind: "full"; readonly head: Sha };

export type Verdict = {
	readonly n: number;
	readonly scope: VerdictScope;
	readonly outcome: "pass" | "fail";
	readonly text: string;
	readonly findings: readonly VerdictFinding[];
	/** Required on a full-set pass: what landed against the intent, and residual risk. */
	readonly handover: null | { readonly againstIntent: string; readonly residualRisk: string };
	readonly verifier: AgentKey;
	readonly at: number;
};

/** One block followed across fixes. Convergence is counted here, per finding, never per round. */
export type Thread = {
	readonly id: ThreadId;
	readonly scope: "full" | ItemId;
	readonly text: string;
	/** (verdict, block number) of each appearance, oldest first. */
	readonly seen: readonly { readonly verdict: number; readonly block: number }[];
	/** Fixes it survived: appearances minus one. */
	readonly survived: number;
	readonly status: "open" | "resolved" | "diagnosing" | "escalated";
	readonly diagnosis: null | { readonly premise: string; readonly test: string; readonly result: string };
};

export type Checkout = { readonly key: EffectKey; readonly path: string; readonly sha: Sha; readonly removed: boolean };

export type ItemCheck =
	| { readonly kind: "idle" }
	/** Effect: detached checkout of the published commit. */
	| { readonly kind: "checking_out"; readonly build: number; readonly checkout: Checkout }
	/** Verifier: `publish_verdict`. The same verifier conversation follows the item; its cwd moves per checkout. */
	| { readonly kind: "verifying"; readonly seq: number; readonly build: number; readonly checkout: Checkout }
	/** Diagnoser (a fresh agent on the diagnoser model): `publish_diagnosis`. */
	| { readonly kind: "diagnosing"; readonly seq: number; readonly thread: ThreadId }
	/** Build is reworking or integrating. */
	| { readonly kind: "returned"; readonly verdict: number | null }
	| { readonly kind: "awaiting_merge"; readonly build: number; readonly sha: Sha }
	/** Effect: merge into the build branch with the Mandate's checks. One item at a time per build. */
	| { readonly kind: "merging"; readonly build: number; readonly key: EffectKey }
	| { readonly kind: "merged"; readonly sha: Sha }
	/** Held by the queue after non-convergence. */
	| { readonly kind: "escalated"; readonly thread: ThreadId; readonly finding: FindingRef };

export type FullCheck =
	| { readonly kind: "waiting" }
	| { readonly kind: "checking_out"; readonly checkout: Checkout }
	| { readonly kind: "verifying"; readonly seq: number; readonly checkout: Checkout; readonly round: number }
	| { readonly kind: "diagnosing"; readonly seq: number; readonly thread: ThreadId }
	| { readonly kind: "returned"; readonly verdict: number }
	| { readonly kind: "passed"; readonly verdict: number; readonly head: Sha };

export type Landing =
	| { readonly kind: "none" }
	/** Waiting for the project's trunk lock. */
	| { readonly kind: "queued" }
	/** Effect: take trunk into the build branch, run checks on the combined result. */
	| { readonly kind: "taking_trunk"; readonly key: EffectKey; readonly expected: Sha }
	/** Effect: one commit on trunk, compare-and-swap from `expectedTrunk`. */
	| { readonly kind: "landing"; readonly key: EffectKey; readonly expectedTrunk: Sha; readonly combined: Sha }
	/** Build is resolving; the lock was released. */
	| { readonly kind: "returned"; readonly paths: readonly string[] }
	| { readonly kind: "landed"; readonly sha: Sha; readonly trunkBefore: Sha };

export type Handover =
	| { readonly kind: "none" }
	/** Owner: subject `handover` (accept | findings). Blocks nothing. */
	| { readonly kind: "asking"; readonly sha: Sha }
	| { readonly kind: "accepted"; readonly decision: DecisionId }
	| { readonly kind: "findings"; readonly decision: DecisionId; readonly filed: readonly FindingRef[] };

export type VerifyState = {
	readonly items: Readonly<Record<string, { readonly check: ItemCheck; readonly checkouts: readonly Checkout[] }>>;
	readonly mergeQueue: readonly ItemId[];
	readonly full: FullCheck;
	readonly landing: Landing;
	readonly handover: Handover;
	readonly verdicts: readonly Verdict[];
	readonly threads: Readonly<Record<string, Thread>>;
	readonly cancelled: boolean;
	readonly next: { readonly verdict: number; readonly thread: number };
	readonly seq: number;
};

export const VerifyDoc = defineState<VerifyState>({
	kind: "keel.verify",
	version: 1,
	scope: "conversation",
	initial: () => ({
		items: {},
		mergeQueue: [],
		full: { kind: "waiting" },
		landing: { kind: "none" },
		handover: { kind: "none" },
		verdicts: [],
		threads: {},
		cancelled: false,
		next: { verdict: 1, thread: 1 },
		seq: 0,
	}),
});
