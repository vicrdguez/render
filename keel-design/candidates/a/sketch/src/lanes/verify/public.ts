/**
 * The Verify lane's public face (work lane `verify` and project lane `trunk`): the only file other lanes may
 * import from `lanes/verify/`.
 */
import type { WorkId } from "../../kernel/ids.ts";
import type { Message } from "../../kernel/lane.ts";
import type { Sha } from "../../repo/index.ts";
import type { ItemId } from "../build/public.ts";
import type { FindingRef } from "../queue/public.ts";

export type VerifyMessage =
	| { readonly kind: "item_published"; readonly item: ItemId; readonly build: number }
	| { readonly kind: "build_complete"; readonly head: Sha }
	/** From trunk: this work holds the landing lock. */
	| { readonly kind: "granted" }
	/** From the queue: an escalated item was released (resume) or dropped. */
	| { readonly kind: "released"; readonly item: ItemId; readonly finding: FindingRef }
	| { readonly kind: "item_dropped"; readonly item: ItemId }
	| { readonly kind: "cancel"; readonly reason: string };

export type TrunkMessage =
	| { readonly kind: "request"; readonly work: WorkId }
	/** After landing, a returned landing, or cancellation. Grants the next waiting work in the same commit. */
	| { readonly kind: "release"; readonly work: WorkId };

export const toVerify = {
	send(work: WorkId, message: VerifyMessage): Message {
		throw new Error("not implemented");
	},
};
export const toTrunk = {
	send(message: TrunkMessage): Message {
		throw new Error("not implemented");
	},
};

export interface VerifyView {
	/** The verdict text and blocks Build renders into a rework input. */
	verdict(n: number): { readonly text: string; readonly blocks: readonly { readonly n: number; readonly text: string }[] } | null;
	/** The thread history and diagnosis the queue attaches to a non-convergence finding. */
	thread(item: ItemId): { readonly text: string; readonly survived: number; readonly diagnosis: string | null } | null;
	readonly landed: Sha | null;
}

export interface TrunkView {
	readonly holder: WorkId | null;
	readonly waiting: readonly WorkId[];
}
