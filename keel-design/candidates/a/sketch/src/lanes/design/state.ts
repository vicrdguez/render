/**
 * Design lane state: one per piece of work, on its anchor conversation. Owns the Mandate.
 *
 * Revisions are immutable once published and never deleted. Every arena candidate is kept by reference to its
 * child conversation and answer entry, which tau never deletes. A round is one owner review of one revision.
 */
import type { DecisionId } from "tau";
import type { ConversationId, EntryId } from "tau/durable";
import type { Brand } from "../../kernel/ids.ts";
import type { NumberedAnnotation } from "../../kernel/lane.ts";
import type { Check } from "../../repo/index.ts";
import type { RoleName } from "../../roles/index.ts";
import { defineState } from "../../kernel/state.ts";
import type { FindingRef } from "../queue/public.ts";

/** A label the designer writes in the Mandate text, unique within the piece of work: `I1`, `S2`, `R4`, `P1`. */
export type NodeId = Brand<string, "NodeId">;
export type RiderId = Brand<string, "RiderId">;
export type ArenaId = Brand<string, "ArenaId">;
export type CandidateId = Brand<string, "CandidateId">;

/**
 * The labelled parts of a Mandate (workflow §6, "The Mandate"). Intent carries callers per seam and precedence;
 * seams and crossings carry the usage-first sketch; rules carry their probe; anti-criteria what must never exist;
 * proof nodes carry the check keel itself runs and the paths that check protects.
 */
export type NodeKind = "intent" | "seam" | "crossing" | "rule" | "anti" | "proof";

export type MandateNode = {
	readonly id: NodeId;
	readonly kind: NodeKind;
	readonly title: string;
	/** UTF-16 range of the node in the revision text, computed by keel from the label. */
	readonly range: { readonly start: number; readonly end: number };
	readonly probe: string | null;
	readonly check: { readonly run: Check; readonly protects: readonly string[] } | null;
};

export type Reply = { readonly n: number; readonly text: string };

export type MandateRevision = {
	readonly n: number;
	readonly text: string;
	readonly nodes: readonly MandateNode[];
	readonly cause:
		| { readonly kind: "ground" }
		| { readonly kind: "synthesis"; readonly arena: ArenaId; readonly base: CandidateId; readonly grafts: readonly { readonly node: NodeId; readonly from: CandidateId }[] }
		| { readonly kind: "challenge"; readonly draft: number }
		| { readonly kind: "round"; readonly round: number }
		| { readonly kind: "proposal"; readonly findings: readonly FindingRef[] };
	/** One per annotation of the round (or ruling, or proposal note) this revision answers. Validated complete. */
	readonly replies: readonly Reply[];
	/** Riders this revision raises or carries. */
	readonly riders: readonly RiderId[];
	readonly at: number;
};

export type Rider = {
	readonly id: RiderId;
	readonly text: string;
	/** What the winner decided that the question did not ask, and why it is there. */
	readonly origin: "evidence" | "incidental" | "seeded";
	readonly from: CandidateId | null;
	/** Each rider is its own owner decision; blanket acceptance is not an available answer. */
	readonly disposition: null | {
		readonly choice: "bind" | "delegate" | "reject";
		readonly decision: DecisionId;
		readonly annotations: readonly NumberedAnnotation[];
	};
};

export type MandateChoice = "approve" | "revise" | `base:${string}` | "arena" | "arena_fresh" | "decline";

export type Round = {
	readonly n: number;
	readonly revision: number;
	readonly answer: null | {
		readonly choice: MandateChoice;
		readonly annotations: readonly NumberedAnnotation[];
		readonly decision: DecisionId;
	};
};

export type JobRef = {
	readonly conversation: ConversationId;
	readonly answer: EntryId | null;
	readonly unanswered: string | null;
};

export type Candidate = { readonly id: CandidateId; readonly seat: RoleName; readonly model: string; readonly job: JobRef };

export type Arena = {
	readonly id: ArenaId;
	readonly frame: { readonly task: string; readonly rubric: readonly string[] };
	/** Seeded from a revision and the owner's annotations, or fresh. */
	readonly seed: null | { readonly revision: number; readonly annotations: readonly NumberedAnnotation[] };
	readonly candidates: readonly Candidate[];
	readonly judge: JobRef | null;
	readonly challenger: JobRef | null;
	/** True when seats resolved to fewer than two model providers; shown in the review basis. */
	readonly sameFamily: boolean;
};

export type TaskShape = "bug" | "perf" | "follows_precedent" | "sets_precedent" | "finding";

export type GroundReport = {
	readonly shape: TaskShape;
	readonly report: string;
	readonly gaps: readonly string[];
	/** Two defensible readings with different observable results: the only reason Ground stops for the owner. */
	readonly ambiguities: readonly { readonly question: string; readonly readings: readonly string[] }[];
	readonly references: readonly string[];
};

/** The one situation of the Design lane. Each kind names who may move it. */
export type DesignStage =
	/** Designer: `ground`. */
	| { readonly kind: "grounding"; readonly seq: number }
	/** Owner: subject `ground` (proceed with rulings, or decline). */
	| { readonly kind: "ambiguous"; readonly seq: number }
	/** Designer: `frame_arena`, replying to `rulings`. */
	| { readonly kind: "framing"; readonly seq: number; readonly rulings: readonly NumberedAnnotation[]; readonly seed: Arena["seed"] }
	/** Code: dispatch effect for the candidates, then for the judge. */
	| { readonly kind: "arena"; readonly arena: ArenaId; readonly step: "candidates" | "judge" }
	/** Designer: `publish_mandate` as the synthesis draft. `base` forced when the owner picked one. */
	| { readonly kind: "synthesizing"; readonly seq: number; readonly arena: ArenaId; readonly base: CandidateId | null }
	/** Code: dispatch effect for the challenger on draft `draft`. */
	| { readonly kind: "challenge"; readonly arena: ArenaId; readonly draft: number }
	/** Designer: `publish_mandate` answering the challenger; this revision goes to the owner. */
	| { readonly kind: "answering"; readonly seq: number; readonly draft: number }
	/** Owner: subject `mandate` (until answered) and `rider/<id>` for each undisposed rider of the revision. */
	| { readonly kind: "review"; readonly round: number; readonly approved: boolean }
	/** Designer: `publish_mandate` with a reply per annotation of `round` and per rejected rider. */
	| { readonly kind: "revising"; readonly seq: number; readonly round: number }
	/** Designer: `publish_mandate` proposing a change to the bound Mandate, from triaged findings. */
	| { readonly kind: "proposing"; readonly seq: number; readonly findings: readonly FindingRef[]; readonly notes: readonly NumberedAnnotation[] }
	/** The Mandate Build is held to. A later revision under review does not bind until approved. */
	| { readonly kind: "bound"; readonly revision: number }
	| { readonly kind: "routed_to_queue" }
	| { readonly kind: "declined" }
	| { readonly kind: "cancelled" };

export type DesignState = {
	/** Written by the kernel in the commit that creates the piece of work; `null` only inside that commit. */
	readonly origin:
		| null
		| { readonly kind: "owner"; readonly prompt: EntryId }
		| { readonly kind: "queue"; readonly findings: readonly FindingRef[]; readonly prompt: string };
	readonly ground: GroundReport | null;
	readonly stage: DesignStage;
	readonly revisions: readonly MandateRevision[];
	readonly rounds: readonly Round[];
	readonly arenas: readonly Arena[];
	readonly riders: Readonly<Record<string, Rider>>;
	/** The revision Build is held to; changes only when the owner approves a later one (or Ground binds a prompt Mandate). */
	readonly bound: number | null;
	readonly seq: number;
};

export const DesignDoc = defineState<DesignState>({
	kind: "keel.design",
	version: 1,
	scope: "conversation",
	initial: () => ({
		origin: null,
		ground: null,
		stage: { kind: "grounding", seq: 0 },
		revisions: [],
		rounds: [],
		arenas: [],
		riders: {},
		bound: null,
		seq: 0,
	}),
});
