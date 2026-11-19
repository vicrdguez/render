/**
 * Trunk: the project lane that serializes landings across pieces of work. Session scope, one per project.
 * It owns only the lock and the record of what landed; the landing itself is the holder's Verify lane.
 */
import type { WorkId } from "../../kernel/ids.ts";
import type { Ask, AgentDecl, EffectDecl, KernelEvent, Lane, Reduction, World } from "../../kernel/lane.ts";
import { defineState } from "../../kernel/state.ts";
import type { Sha } from "../../repo/index.ts";
import type { TrunkMessage, TrunkView } from "./public.ts";

export type TrunkState = {
	readonly holder: WorkId | null;
	/** First come, first served. A work appears at most once. */
	readonly waiting: readonly WorkId[];
	readonly landed: readonly { readonly work: WorkId; readonly sha: Sha; readonly at: number }[];
};

export const TrunkDoc = defineState<TrunkState>({
	kind: "keel.trunk",
	version: 1,
	scope: "session",
	initial: () => ({ holder: null, waiting: [], landed: [] }),
});

/**
 * request: free -> holder, send verify.granted to that work; held -> append to waiting (idempotent).
 * release(work): holder === work -> next waiting becomes holder and is granted; a waiting work is removed.
 * Releasing a work that holds nothing is a no-op (a replay or a cancelled work).
 */
export const trunkLane: Lane<"trunk", TrunkState, TrunkMessage, TrunkView> = {
	name: "trunk",
	scope: "project",
	state: TrunkDoc,
	reduce(state: TrunkState, event: TrunkMessage | KernelEvent, world: World): Reduction<TrunkState> {
		throw new Error("not implemented");
	},
	view(state: TrunkState): TrunkView {
		throw new Error("not implemented");
	},
	asks: () => [],
	agents: () => [],
	effects: () => [],
};
