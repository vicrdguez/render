/**
 * Build lane state: one per piece of work, on its anchor conversation. Owns the live plan, the briefs, the
 * workers' attempts and the rulings.
 *
 * An item is a goal and its dependencies until it starts; its brief is frozen at start from the bound Mandate and
 * the build branch as it stood. A `merged` item is a record: the plan tool cannot edit it, and a pivot that
 * invalidates it adds a `correction` item instead.
 */
import type { AgentKey, Brand } from "../../kernel/ids.ts";
import type { NumberedAnnotation } from "../../kernel/lane.ts";
import type { BranchName, ProjectPrincipleFile, Sha } from "../../repo/index.ts";
import { defineState } from "../../kernel/state.ts";
import type { NodeId } from "../design/public.ts";
import type { FindingRef } from "../queue/public.ts";

export type ItemId = Brand<string, "ItemId">;
export type RulingId = Brand<string, "RulingId">;

export type Brief = {
	readonly goal: string;
	/** What proves the item done, by Mandate node where one applies. */
	readonly evidence: readonly string[];
	readonly fences: { readonly write: readonly string[]; readonly never: readonly string[] };
	/** Principles the coordinator binds in addition to those bound by fact. */
	readonly principles: readonly string[];
	/** The Mandate revision the brief was rendered from. */
	readonly revision: number;
};

export type Attempt = {
	readonly n: number;
	readonly worker: AgentKey;
	readonly worktree: string;
	readonly branch: BranchName;
	/** Build-branch head the worktree was made from; `null` until the worktree effect reports it. */
	readonly base: Sha | null;
	readonly brief: Brief;
	/** Project principles bound into the brief, as read from the worktree at `base`. */
	readonly bound: readonly ProjectPrincipleFile[];
	/** Rework rounds within this attempt; each publish after a failed verdict is one more. */
	readonly round: number;
};

export type WorkerInput =
	| { readonly kind: "brief" }
	| { readonly kind: "rework"; readonly verdict: number }
	| { readonly kind: "integrate"; readonly reason: "conflict" | "checks_failed"; readonly detail: string }
	/** After a hold: continue, under a new Mandate revision or with the owner's notes from triage. */
	| { readonly kind: "resume"; readonly revision: number; readonly notes: readonly NumberedAnnotation[]; readonly diagnosis: string | null };

export type ItemSituation =
	| { readonly kind: "planned" }
	/** Coordinator: `brief_item`. */
	| { readonly kind: "briefing"; readonly seq: number }
	/** Effect: the worker's worktree. */
	| { readonly kind: "preparing"; readonly attempt: Attempt }
	/** Worker: `publish_build`. */
	| { readonly kind: "building"; readonly seq: number; readonly attempt: Attempt; readonly input: WorkerInput }
	/** Verify has build `build`; Build waits for `item_failed`, `item_integrate` or `item_merged`. */
	| { readonly kind: "published"; readonly attempt: Attempt; readonly build: number }
	/**
	 * Waiting on a queue finding. The worker is paused, not retired, so its worktree and context survive.
	 * `answered`: a Mandate revision answering the finding was approved; the item resumes after the coordinator's
	 * re-plan (which may give it new deps), once its deps are merged. A queue release resumes it at once.
	 * On resume: `planned` (no attempt yet) or `building` with a `resume` input.
	 */
	| {
			readonly kind: "held";
			readonly finding: FindingRef;
			readonly attempt: Attempt | null;
			readonly answered: null | { readonly revision: number };
	  }
	| { readonly kind: "merged"; readonly attempt: Attempt; readonly sha: Sha }
	| { readonly kind: "dropped"; readonly reason: string; readonly finding: FindingRef | null };

export type PublishedBuild = {
	readonly n: number;
	readonly sha: Sha;
	readonly base: Sha;
	readonly summary: string;
	readonly rulings: readonly RulingId[];
	/** Replies to the annotations the worker's input carried. */
	readonly replies: readonly { readonly n: number; readonly text: string }[];
	readonly at: number;
};

export type Item = {
	readonly id: ItemId;
	readonly goal: string;
	readonly deps: readonly ItemId[];
	readonly kind: "encode" | "build" | "correction" | "integrate";
	/** Mandate nodes the item implements; a revision changing one of them pauses the item. */
	readonly touches: readonly NodeId[];
	readonly origin:
		| { readonly kind: "plan" }
		| { readonly kind: "finding"; readonly finding: FindingRef }
		| { readonly kind: "correction"; readonly of: readonly ItemId[] }
		| { readonly kind: "trunk"; readonly against: Sha };
	readonly situation: ItemSituation;
	readonly builds: readonly PublishedBuild[];
};

export type Citation =
	| { readonly kind: "mandate"; readonly node: NodeId }
	| { readonly kind: "principle"; readonly name: string }
	| { readonly kind: "document"; readonly path: string }
	/** An existing pattern. `approved: false` sends it to the queue for the owner to bless or revoke. */
	| { readonly kind: "pattern"; readonly path: string; readonly approved: boolean };

export type Ruling = {
	readonly id: RulingId;
	readonly item: ItemId;
	readonly attempt: number;
	readonly what: string;
	readonly why: string;
	readonly cost: { readonly level: "low" | "medium" | "high"; readonly text: string };
	readonly cites: readonly Citation[];
	/** Cited principles neither pulled by this worker nor bound into its brief; computed at publish. */
	readonly unbacked: readonly string[];
	/** The build it shipped in; `null` while pending. */
	readonly build: number | null;
	readonly at: number;
};

export type PlanReason =
	| { readonly kind: "initial" }
	| { readonly kind: "revised"; readonly revision: number; readonly changed: readonly NodeId[] }
	| { readonly kind: "finding"; readonly finding: FindingRef }
	| { readonly kind: "full_failed"; readonly verdict: number }
	| { readonly kind: "trunk_conflict"; readonly paths: readonly string[]; readonly against: Sha }
	| { readonly kind: "stalled"; readonly item: ItemId };

export type CoordinatorSituation =
	| { readonly kind: "idle" }
	/** Coordinator: `publish_plan`, addressing every reason. */
	| { readonly kind: "planning"; readonly seq: number; readonly reasons: readonly PlanReason[] }
	/** Every item merged or dropped. Coordinator: `publish_plan` (more items) or `handoff_build`. */
	| { readonly kind: "closing"; readonly seq: number };

export type BuildStatus =
	| { readonly kind: "waiting_mandate" }
	/** Effect: trunk and the build branch. */
	| { readonly kind: "starting"; readonly revision: number }
	| { readonly kind: "active"; readonly revision: number; readonly branch: BranchName; readonly base: Sha; readonly head: Sha }
	/** Verify has the whole build. A full-set failure or trunk conflict returns it to `active`. */
	| { readonly kind: "handed_off"; readonly revision: number; readonly branch: BranchName; readonly head: Sha }
	| { readonly kind: "landed"; readonly sha: Sha }
	| { readonly kind: "cancelled" };

export type BuildState = {
	readonly status: BuildStatus;
	readonly coordinator: CoordinatorSituation;
	readonly items: Readonly<Record<string, Item>>;
	/** Plan order; the coordinator reorders unstarted items only. */
	readonly order: readonly ItemId[];
	readonly rulings: readonly Ruling[];
	readonly next: { readonly item: number; readonly ruling: number };
	readonly seq: number;
};

export const BuildDoc = defineState<BuildState>({
	kind: "keel.build",
	version: 1,
	scope: "conversation",
	initial: () => ({
		status: { kind: "waiting_mandate" },
		coordinator: { kind: "idle" },
		items: {},
		order: [],
		rulings: [],
		next: { item: 1, ruling: 1 },
		seq: 0,
	}),
});
