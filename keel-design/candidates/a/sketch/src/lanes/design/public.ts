/**
 * The Design lane's public face: the only file other lanes may import from `lanes/design/`.
 * A boundary test fails on any other cross-lane import.
 */
import type { DecisionId } from "tau";
import type { WorkId } from "../../kernel/ids.ts";
import type { Message, NumberedAnnotation } from "../../kernel/lane.ts";
import type { Check } from "../../repo/index.ts";
import type { FindingRef } from "../queue/public.ts";
import type { MandateNode, NodeId } from "./state.ts";

export type { NodeId } from "./state.ts";

/** Messages the Design lane accepts from other lanes. */
export type DesignMessage =
	/** Start a new piece of work from triaged findings (the queue's "build"). Ground still runs. */
	| {
			readonly kind: "seed";
			readonly prompt: string;
			readonly findings: readonly FindingRef[];
			readonly expect: "determined" | "sets_precedent";
	  }
	/** The bound Mandate is wrong: propose a revision (the queue's "build" on a `mandate_wrong` finding). */
	| { readonly kind: "propose"; readonly findings: readonly FindingRef[]; readonly notes: readonly NumberedAnnotation[] };

export const toDesign = {
	seed(title: string, message: Extract<DesignMessage, { kind: "seed" }>): Message {
		throw new Error("not implemented");
	},
	propose(work: WorkId, message: Extract<DesignMessage, { kind: "propose" }>): Message {
		throw new Error("not implemented");
	},
};

/** What Build and Verify are held to. */
export type BoundMandate = {
	readonly revision: number;
	readonly text: string;
	readonly nodes: readonly MandateNode[];
	/** `prompt`: Ground judged the work determined by approved references; the owner's prompt is the authority. */
	readonly authority: { readonly kind: "prompt" } | { readonly kind: "approved"; readonly decision: DecisionId };
	/** Annotations on the approving answer. The coordinator's first plan replies to each by number. */
	readonly approvalNotes: readonly NumberedAnnotation[];
	/** Riders the owner bound (now rules) and delegated (agents may change them). */
	readonly riders: { readonly bound: readonly string[]; readonly delegated: readonly string[] };
	/** Commands keel runs at merge and landing, from proof nodes. */
	readonly checks: readonly Check[];
	/** Paths no build item may change: proof nodes' `protects` plus `.keel/`. The Encode item may write them. */
	readonly protects: readonly string[];
	/** True when the Mandate has seams, crossings or probed rules: the plan must start with an Encode item. */
	readonly needsEncode: boolean;
};

export interface DesignView {
	readonly title: string;
	bound(): BoundMandate | null;
	/** Nodes whose text or check differs between two revisions; used to pause only affected items. */
	changed(from: number, to: number): readonly NodeId[];
	/** True once the lane ended (declined, cancelled, routed to the queue). */
	readonly closed: boolean;
}
