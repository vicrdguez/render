/**
 * The queue's public face: the only file other lanes may import from `lanes/queue/`.
 */
import type { AgentKey, Brand, Scope, WorkId } from "../../kernel/ids.ts";
import type { Message } from "../../kernel/lane.ts";
import type { Sha } from "../../repo/index.ts";
import type { RoleName } from "../../roles/index.ts";
import type { ItemId } from "../build/public.ts";

/**
 * A finding's identity, chosen by the filer from its own stored facts (`<scope>/<local>`), so a filing lane can
 * hold an item on a finding in the same commit that files it, before the queue has numbered it.
 */
export type FindingRef = Brand<string, "FindingRef">;

export function findingRef(scope: Scope, local: string): FindingRef {
	throw new Error("not implemented");
}

export type FileFinding = {
	readonly ref: FindingRef;
	readonly source:
		| { readonly kind: "owner"; readonly via: "handover" | "conversation" | "ground" }
		| { readonly kind: "agent"; readonly role: RoleName; readonly agent: AgentKey }
		| { readonly kind: "keel"; readonly lane: "build" | "verify" };
	readonly work: WorkId | null;
	readonly item: ItemId | null;
	readonly text: string;
	readonly context: { readonly revision: number | null; readonly sha: Sha | null; readonly report: string | null };
	readonly edgeCase: null | { readonly failure: string; readonly likelihood: string; readonly cost: string };
	readonly preset:
		| null
		| "non_convergence"
		| "tripwire"
		| "stall"
		| "unapproved_pattern"
		| "principle_change"
		| "edge_case";
	/** Items the filer already holds on this finding. */
	readonly holds: readonly { readonly work: WorkId; readonly item: ItemId }[];
};

export type QueueMessage =
	| { readonly kind: "file"; readonly finding: FileFinding }
	/**
	 * The owner acted directly on what a finding was waiting for (messaged the held worker, who then published). The
	 * finding is routed as settled; its batch's triage decision loses it, and is withdrawn when empty.
	 */
	| { readonly kind: "settled_by_owner"; readonly finding: FindingRef };

export const toQueue = {
	file(finding: FileFinding): Message {
		throw new Error("not implemented");
	},
};

export interface QueueView {
	/** Patterns the owner blessed; a ruling citing one is citing an approved reference. */
	approved(path: string): boolean;
	/** Open findings concerning a work, for the coordinator's and investigator's inputs. */
	openFor(work: WorkId): readonly { readonly ref: FindingRef; readonly n: number; readonly text: string }[];
}
