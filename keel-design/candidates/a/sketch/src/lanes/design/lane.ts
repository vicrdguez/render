/**
 * Design lane: Ground and Shape. Settles one Mandate per piece of work in rounds.
 *
 * Transitions (`reduce`), by stage:
 *
 * grounding --ground(bug|perf|follows_precedent)--> bound(rev 1, cause ground); send build.mandate_bound
 * grounding --ground(finding)--> routed_to_queue; send queue.file (source owner); the work closes
 * grounding --ground(sets_precedent, ambiguities)--> ambiguous (asks `ground`)
 * grounding --ground(sets_precedent, frame)--> arena(candidates)
 * ambiguous --answered proceed--> framing(rulings = annotations) ; --answered decline--> declined
 * framing --frame_arena(replies cover rulings)--> arena(candidates)
 * arena(candidates) --effect_done--> record every candidate; arena(judge)
 * arena(judge) --effect_done--> synthesizing
 * synthesizing --publish_mandate(base, grafts, riders)--> draft revision; challenge
 * challenge --effect_done--> answering
 * answering --publish_mandate--> revision; review(round n)
 * review --answered mandate approve--> approved; bound once every rider of the revision is disposed and none rejected
 * review --answered rider r--> record disposition; a reject makes the round a revise
 * review --answered revise--> revising ; base:c--> synthesizing(base c) ; arena--> framing(seed) ;
 *        arena_fresh--> framing ; decline--> declined (send cancel)
 * revising --publish_mandate(replies cover every annotation and rejected rider)--> revision; review(round n+1)
 * bound --message propose--> proposing ; proposing --publish_mandate--> revision; review
 * review (after a proposal) --approved--> bound(new); send build.mandate_revised(changed nodes, answered findings)
 * review (after a proposal) --decline--> bound(unchanged): the proposal is withdrawn, not the work;
 *          send build.release(findings, resume)
 * While a proposal is under review, `bound` still names the old revision: unaffected items keep building on it.
 * any live stage --cancel_work (owner input only)--> cancelled; send cancel to build and verify
 *
 * A published revision is validated purely: every node label appears once in the text; node kinds are known;
 * proof nodes have a check; replies number exactly the annotations owed; base and grafts name candidates of the
 * arena; a revision for review after an arena has at least one candidate per configured seat.
 */
import type { Lane, Reduction, World, Ask, AgentDecl, EffectDecl, KernelEvent } from "../../kernel/lane.ts";
import type { Self } from "../../kernel/kernel.ts";
import type { BuildMessage } from "../build/public.ts";
import type { DesignMessage, DesignView } from "./public.ts";
import type {
	CandidateId,
	DesignState,
	GroundReport,
	NodeKind,
	Reply,
	Rider,
} from "./state.ts";
import { DesignDoc } from "./state.ts";

/** A Mandate as the designer submits it. Node ranges are computed by keel from the labels in `text`. */
export type MandateDraft = {
	readonly text: string;
	readonly nodes: readonly {
		readonly label: string;
		readonly kind: NodeKind;
		readonly title: string;
		readonly probe: string | null;
		readonly check: { readonly argv: readonly string[]; readonly protects: readonly string[] } | null;
	}[];
};

export type DesignEvent =
	| { readonly kind: "grounded"; readonly report: GroundReport; readonly mandate: MandateDraft | null; readonly frame: Frame | null; readonly self: Self }
	| { readonly kind: "framed"; readonly frame: Frame; readonly replies: readonly Reply[]; readonly self: Self }
	| {
			readonly kind: "published";
			readonly draft: MandateDraft;
			readonly base: CandidateId | null;
			readonly grafts: readonly { readonly label: string; readonly from: CandidateId }[];
			readonly riders: readonly Pick<Rider, "text" | "origin" | "from">[];
			readonly replies: readonly Reply[];
			readonly self: Self;
	  }
	| { readonly kind: "cancel_requested"; readonly reason: string; readonly self: Self }
	| DesignMessage
	| { readonly kind: "cancel"; readonly reason: string };

export type Frame = { readonly task: string; readonly rubric: readonly string[] };

export const designLane: Lane<"design", DesignState, DesignEvent, DesignView> = {
	name: "design",
	scope: "work",
	state: DesignDoc,
	reduce(state: DesignState, event: DesignEvent | KernelEvent, world: World): Reduction<DesignState> {
		throw new Error("not implemented");
	},
	view(state: DesignState): DesignView {
		throw new Error("not implemented");
	},
	/**
	 * ambiguous: `ground` (proceed | decline), basis = Ground report and the readings.
	 * review: `mandate` unless already approved (approve | revise | base:<each candidate> | arena | arena_fresh |
	 * decline), basis = the revision, its synthesis (base and each graft's source), every candidate in full, the judge,
	 * the challenger, the replies, the riders and any same-family warning; plus `rider/<id>` (bind | delegate | reject)
	 * for each undisposed rider of the revision.
	 */
	asks(state: DesignState, world: World): readonly Ask[] {
		throw new Error("not implemented");
	},
	/**
	 * `designer` (the anchor) while the lane is live. Expectation by stage: grounding -> `ground` (input `null` when
	 * the owner's prompt is already in the transcript, `inputs/design/seed.md` for queue-seeded work); framing ->
	 * `frame_arena` (`framing.md`); synthesizing -> `publish_mandate` (`synthesize.md`); answering ->
	 * `publish_mandate` (`answer-challenge.md`); revising -> `publish_mandate` (`revise.md`); proposing ->
	 * `publish_mandate` (`propose.md`). Bound: no expectation; the designer stays as the owner's desk for the work.
	 */
	agents(state: DesignState, world: World): readonly AgentDecl[] {
		throw new Error("not implemented");
	},
	/**
	 * arena(candidates): `arena/<id>/candidates`, one dispatch job per configured arena seat, all with the same prompt
	 * (`seats/arena-candidate.md` with the frame, the Ground report, the seed). arena(judge): `arena/<id>/judge`.
	 * challenge: `arena/<id>/challenge/<draft>`.
	 */
	effects(state: DesignState, world: World): readonly EffectDecl[] {
		throw new Error("not implemented");
	},
};

/** Type witness that the lane sends Build only what Build accepts. */
export type DesignSends = BuildMessage;
