/**
 * The Build lane's public face: the only file other lanes may import from `lanes/build/`.
 */
import type { AgentKey, WorkId } from "../../kernel/ids.ts";
import type { Message, NumberedAnnotation } from "../../kernel/lane.ts";
import type { BranchName, Sha } from "../../repo/index.ts";
import type { NodeId } from "../design/public.ts";
import type { FindingRef } from "../queue/public.ts";
import type { ItemId, PublishedBuild, Ruling } from "./state.ts";

export type { ItemId, RulingId } from "./state.ts";

export type BuildMessage =
	/** From Design: the first bound Mandate. Starts the build. */
	| { readonly kind: "mandate_bound"; readonly revision: number }
	/**
	 * From Design: a later revision was approved. Items held on any finding in `answers` resume under it; the
	 * coordinator re-plans unstarted items touching `changed`.
	 */
	| {
			readonly kind: "mandate_revised";
			readonly revision: number;
			readonly changed: readonly NodeId[];
			readonly answers: readonly FindingRef[];
	  }
	/** From Verify. */
	| { readonly kind: "item_failed"; readonly item: ItemId; readonly verdict: number }
	| { readonly kind: "item_integrate"; readonly item: ItemId; readonly reason: "conflict" | "checks_failed"; readonly detail: string }
	| { readonly kind: "item_merged"; readonly item: ItemId; readonly sha: Sha }
	| { readonly kind: "full_failed"; readonly verdict: number }
	| { readonly kind: "trunk_conflict"; readonly paths: readonly string[]; readonly against: Sha }
	| { readonly kind: "landed"; readonly sha: Sha }
	/** From the queue. `agent` names the filer when it is this build's worker; Build maps it to its item. */
	| { readonly kind: "hold"; readonly finding: FindingRef; readonly items: readonly ItemId[]; readonly agent: AgentKey | null }
	| {
			readonly kind: "release";
			readonly finding: FindingRef;
			readonly outcome: "resume" | "drop";
			readonly notes: readonly NumberedAnnotation[];
			readonly diagnosis: string | null;
	  }
	/** From the queue: a defect against the current Mandate. The coordinator plans it; no owner step. */
	| { readonly kind: "plan_finding"; readonly finding: FindingRef; readonly text: string }
	| { readonly kind: "cancel"; readonly reason: string };

export const toBuild = {
	send(work: WorkId, message: BuildMessage): Message {
		throw new Error("not implemented");
	},
};

export interface BuildView {
	readonly branch: BranchName | null;
	/** The build branch head as keel last advanced it. */
	readonly head: Sha | null;
	published(item: ItemId, build: number): (PublishedBuild & { readonly worktree: string; readonly goal: string }) | null;
	/** Rulings shipped in one build, in the order recorded. */
	rulingsOf(item: ItemId, build: number): readonly Ruling[];
	/** Every ruling since the Mandate was bound, for the full-set verifier and the handover. */
	allRulings(): readonly Ruling[];
	itemOf(agent: AgentKey): ItemId | null;
	/** The building attempt of a worker, for `publish_build`'s observation. */
	attemptOf(agent: AgentKey): { readonly item: ItemId; readonly worktree: string; readonly base: Sha } | null;
	/** Items not merged or dropped that touch any of `nodes`. */
	touching(nodes: readonly NodeId[]): readonly ItemId[];
}
