/**
 * Build lane: Encode and Build. A coordinator owns the live plan; keel moves items.
 *
 * Transitions (`reduce`):
 *
 * waiting_mandate --mandate_bound(rev)--> starting; effect `start_build`
 * starting --effect_done started(base)--> active; coordinator planning(initial)
 * planning|closing --publish_plan--> validate (`plan.ts`); apply edits; replies cover approval notes on the first plan;
 *          coordinator idle; schedule
 * schedule: planned items whose deps are all merged and which are not held, up to `max_workers` items in
 *           briefing|preparing|building, in plan order -> briefing (coordinator: `brief_item`)
 * briefing --brief_item--> preparing(attempt n+1); effect `worktree` from the build branch head
 * preparing --effect_done worktree(base, principles)--> building(input brief)
 * preparing --effect_done occupied--> preparing(attempt with a new key and path); never reuses a path it cannot prove
 * building --record_ruling--> rulings += pending ruling of this attempt; unapproved pattern -> send queue.file
 * building --publish_build(sha from git)--> if a protected path changed and the item is not Encode:
 *          held + send queue.file(tripwire); else published(build k), pending rulings attached to build k,
 *          send verify.item_published
 * published --item_failed(v)--> building(same attempt, round+1, input rework(v))
 * published --item_integrate--> building(input integrate)
 * published --item_merged(sha)--> merged; head = sha; schedule; nothing left -> coordinator closing
 * planned|briefing|building|published --hold--> held(attempt); a building worker is paused
 * held --release(resume)--> planned (no attempt) or building(input resume(notes, diagnosis));
 *          --release(drop)--> dropped; coordinator planning(item dropped)
 * held --publish_build from a run the owner started (self.ownerInput)--> published as above;
 *          send queue.settled_by_owner (its triage decision is withdrawn in the same commit)
 * active --mandate_revised(rev, changed, answers)--> revision = rev; items held on an answered finding are marked
 *          answered(rev); coordinator planning(revised, changed)
 * planning --publish_plan--> may add deps to held items; then held+answered items whose deps are merged resume
 *          (input resume with the revision's changes), and ready planned items start
 * active --plan_finding--> coordinator planning(finding)
 * closing --handoff_build--> handed_off(head); send verify.build_complete
 * handed_off --full_failed(v) | trunk_conflict--> active; coordinator planning(reason)
 * handed_off --landed(sha)--> landed; workers retired; worktree removals planned
 * any --agent_stalled(worker)--> held + send queue.file(stall) ; --agent_stalled(coordinator)--> send queue.file(stall)
 * any --cancel--> cancelled
 */
import type { Ask, AgentDecl, EffectDecl, KernelEvent, Lane, Reduction, World } from "../../kernel/lane.ts";
import type { Self } from "../../kernel/kernel.ts";
import type { Sha } from "../../repo/index.ts";
import type { NodeId } from "../design/public.ts";
import type { BuildMessage, BuildView } from "./public.ts";
import type { Brief, BuildState, Citation, ItemId } from "./state.ts";
import { BuildDoc } from "./state.ts";

export type PlanEdit =
	| {
			readonly kind: "add";
			/** A name local to this edit list, so new items can depend on each other. */
			readonly key: string;
			readonly goal: string;
			readonly deps: readonly string[] /* ItemId or key */;
			readonly itemKind: "encode" | "build" | "correction" | "integrate";
			readonly touches: readonly NodeId[];
	  }
	| { readonly kind: "edit"; readonly item: ItemId; readonly goal: string; readonly deps: readonly string[]; readonly touches: readonly NodeId[] }
	| { readonly kind: "drop"; readonly item: ItemId; readonly reason: string }
	| { readonly kind: "order"; readonly items: readonly ItemId[] };

export type BuildEvent =
	| { readonly kind: "plan_published"; readonly edits: readonly PlanEdit[]; readonly replies: readonly { readonly n: number; readonly text: string }[]; readonly self: Self }
	| { readonly kind: "briefed"; readonly item: ItemId; readonly brief: Omit<Brief, "revision">; readonly self: Self }
	| { readonly kind: "handoff"; readonly self: Self }
	| {
			readonly kind: "ruling";
			readonly what: string;
			readonly why: string;
			readonly cost: { readonly level: "low" | "medium" | "high"; readonly text: string };
			readonly cites: readonly Citation[];
			readonly self: Self;
	  }
	| {
			readonly kind: "build_published";
			readonly summary: string;
			readonly replies: readonly { readonly n: number; readonly text: string }[];
			/** From git, through `observe`. */
			readonly facts:
				| { readonly kind: "ok"; readonly sha: Sha; readonly touched: readonly string[] }
				| { readonly kind: "dirty"; readonly files: readonly string[] }
				| { readonly kind: "not_descendant" };
			readonly self: Self;
	  }
	| BuildMessage;

export const buildLane: Lane<"build", BuildState, BuildEvent, BuildView> = {
	name: "build",
	scope: "work",
	state: BuildDoc,
	reduce(state: BuildState, event: BuildEvent | KernelEvent, world: World): Reduction<BuildState> {
		throw new Error("not implemented");
	},
	view(state: BuildState): BuildView {
		throw new Error("not implemented");
	},
	/** Build never asks the owner. What it cannot decide goes to the queue. */
	asks(_state: BuildState, _world: World): readonly Ask[] {
		return [];
	},
	/**
	 * `coordinator` while active or handed off, cwd = repository root; expectations: planning/closing ->
	 * `publish_plan`/`handoff_build` (`inputs/build/plan.md`, `replan.md`, `close.md`), each briefing item ->
	 * `brief_item` (`brief-request.md`). One worker per attempt, `item/<id>/worker/<n>`, cwd = its worktree, paused
	 * while held; expectation while building -> `publish_build`, input by `WorkerInput.kind` (`brief.md`,
	 * `rework.md`, `integrate.md`, `resume.md`). The brief renders the goal, evidence, fences, the bound Mandate text,
	 * principles bound by fact and by the coordinator (full bodies), and the approval notes owed replies.
	 */
	agents(state: BuildState, world: World): readonly AgentDecl[] {
		throw new Error("not implemented");
	},
	/** `start_build`; `worktree` per preparing attempt; `remove` per merged item's worktree after landing. */
	effects(state: BuildState, world: World): readonly EffectDecl[] {
		throw new Error("not implemented");
	},
};
