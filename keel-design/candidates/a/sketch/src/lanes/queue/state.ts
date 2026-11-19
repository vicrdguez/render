/**
 * Queue state: one per project (session scope). One intake, two sources (the owner and agents), cheap
 * investigation first, triage by the owner in batches the investigator forms.
 */
import type { DecisionId } from "tau";
import type { AgentKey, Brand, WorkId } from "../../kernel/ids.ts";
import type { NumberedAnnotation } from "../../kernel/lane.ts";
import type { Sha } from "../../repo/index.ts";
import type { RoleName } from "../../roles/index.ts";
import { defineState } from "../../kernel/state.ts";
import type { ItemId } from "../build/public.ts";
import type { NodeId } from "../design/public.ts";
import type { FindingRef } from "./public.ts";

export type BatchId = Brand<string, "BatchId">;

export type FindingClass =
	/** A defect against the current Mandate: a new item in that build's plan, no owner step. */
	| "defect_in_scope"
	/** Determined by an approved reference: triage; build goes straight to implementation. */
	| "determined"
	/** Sets precedent: triage; build starts design. */
	| "sets_precedent"
	/** The current Mandate is wrong: affected items pause now; triage; build proposes a revision. */
	| "mandate_wrong"
	/** A block survived two fixes and a fresh diagnosis (filed by Verify). */
	| "non_convergence"
	/** A protected check was changed (filed by Build). */
	| "tripwire"
	/** An agent stopped owing its hand-off (filed by a lane on `agent_stalled`). */
	| "stall"
	/** A ruling cited an unapproved pattern: bless or revoke. */
	| "unapproved_pattern"
	/** A proposal to change a principle's description or binding. */
	| "principle_change"
	/** An unlikely edge case, filed with failure, likelihood and cost. */
	| "edge_case";

export type Source =
	| { readonly kind: "owner"; readonly via: "handover" | "conversation" | "ground"; readonly decision: DecisionId | null }
	| { readonly kind: "agent"; readonly role: RoleName; readonly agent: AgentKey }
	| { readonly kind: "keel"; readonly lane: "build" | "verify" };

export type Investigation = {
	readonly class: FindingClass;
	readonly summary: string;
	readonly reproduced: boolean | null;
	readonly size: "small" | "medium" | "large";
	readonly affects: null | { readonly work: WorkId; readonly items: readonly ItemId[]; readonly nodes: readonly NodeId[] };
	readonly recommendation: "build" | "defer" | "drop";
	readonly duplicateOf: FindingRef | null;
};

export type Finding = {
	readonly ref: FindingRef;
	/** Display number, `#n`. */
	readonly n: number;
	readonly source: Source;
	readonly work: WorkId | null;
	readonly item: ItemId | null;
	readonly text: string;
	/** The context the finding was raised in: Mandate revision, commit (from git or state), report. */
	readonly context: { readonly revision: number | null; readonly sha: Sha | null; readonly report: string | null };
	readonly edgeCase: null | { readonly failure: string; readonly likelihood: string; readonly cost: string };
	/** Set by the filing lane for keel-filed findings; the investigator cannot change it. */
	readonly preset: FindingClass | null;
	/** Items held because of this finding, released when it is routed, deferred or dropped. */
	readonly holds: readonly { readonly work: WorkId; readonly item: ItemId }[];
	readonly situation:
		/** Investigator: `report_investigation`. */
		| { readonly kind: "filed"; readonly seq: number; readonly attempts: number }
		| { readonly kind: "classified"; readonly investigation: Investigation; readonly batch: BatchId | null }
		| { readonly kind: "routed"; readonly decision: DecisionId | null; readonly notes: readonly NumberedAnnotation[] }
		| { readonly kind: "deferred"; readonly decision: DecisionId }
		| { readonly kind: "dropped"; readonly decision: DecisionId }
		| { readonly kind: "duplicate"; readonly of: FindingRef };
	readonly at: number;
};

/** Findings that take one answer. The investigator forms batches; keel asks one decision per open batch. */
export type Batch = {
	readonly id: BatchId;
	readonly class: FindingClass;
	readonly findings: readonly FindingRef[];
	readonly answer: null | {
		readonly choice: string;
		readonly annotations: readonly NumberedAnnotation[];
		readonly decision: DecisionId;
	};
};

export type QueueState = {
	readonly findings: Readonly<Record<string, Finding>>;
	readonly batches: Readonly<Record<string, Batch>>;
	/** Patterns the owner blessed in triage. Rulings may cite them as approved references. */
	readonly references: Readonly<Record<string, { readonly decision: DecisionId; readonly at: number }>>;
	/** The current investigator; replaced by a fresh one after a stall. */
	readonly investigator: { readonly generation: number };
	readonly next: { readonly finding: number; readonly batch: number };
	readonly seq: number;
};

export const QueueDoc = defineState<QueueState>({
	kind: "keel.queue",
	version: 1,
	scope: "session",
	initial: () => ({
		findings: {},
		batches: {},
		references: {},
		investigator: { generation: 1 },
		next: { finding: 1, batch: 1 },
		seq: 0,
	}),
});
