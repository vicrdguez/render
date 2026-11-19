/**
 * The plan's rules, as pure functions over Build state. Tests for these are written first (see design.md, slice 1).
 */
import type { BoundMandate } from "../design/public.ts";
import type { PlanEdit } from "./lane.ts";
import type { BuildState, ItemId } from "./state.ts";

export type PlanError =
	| { readonly kind: "edits_started_item"; readonly item: ItemId }
	| { readonly kind: "unknown_dep"; readonly dep: string }
	| { readonly kind: "cycle"; readonly items: readonly string[] }
	| { readonly kind: "unknown_node"; readonly node: string }
	/** The Mandate needs Encode and some build item does not depend, directly or not, on an Encode item. */
	| { readonly kind: "encode_first"; readonly item: string }
	| { readonly kind: "missing_replies"; readonly numbers: readonly number[] };

/**
 * Applies the coordinator's edits, or explains why not. Invariants:
 * - `planned` items can be edited, reordered or dropped; `held` items can gain deps (a re-plan after a pivot);
 *   building, published and `merged` items are never touched (a correction is a new item);
 * - deps exist and are acyclic; touched nodes exist in the bound Mandate;
 * - Encode first when the Mandate needs it;
 * - the first plan replies to every approval note by number.
 */
export function applyPlan(
	state: BuildState,
	edits: readonly PlanEdit[],
	replies: readonly { readonly n: number }[],
	mandate: BoundMandate,
	initial: boolean,
): { readonly kind: "ok"; readonly state: BuildState } | { readonly kind: "error"; readonly errors: readonly PlanError[] } {
	throw new Error("not implemented");
}

/**
 * What can move now, in plan order, within `maxWorkers` items in briefing|preparing|building:
 * `start`: planned items with all deps merged; `resume`: held items answered by a bound revision, deps merged,
 * and no coordinator re-plan pending.
 */
export function ready(
	state: BuildState,
	maxWorkers: number,
): { readonly start: readonly ItemId[]; readonly resume: readonly ItemId[] } {
	throw new Error("not implemented");
}

/** True when every item is merged or dropped and the coordinator has nothing pending. */
export function finished(state: BuildState): boolean {
	throw new Error("not implemented");
}
