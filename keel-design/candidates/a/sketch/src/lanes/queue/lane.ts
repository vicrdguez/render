/**
 * Queue: one per project. Nothing filed here stops the work that found it, except the filer's own item when the
 * filer says it cannot go on (`blocking`), and items the investigator names when the Mandate itself is wrong.
 *
 * Transitions:
 * (none) --file / file_finding--> filed (investigator expected); a blocking worker's item is held
 * filed --report_investigation--> classified, by class:
 *   defect_in_scope          -> routed now: send build.plan_finding (no owner step)
 *   duplicate                -> duplicate; its holds move to the original
 *   mandate_wrong            -> send build.hold(affected items, unless already held); joins or opens a batch
 *   every other class        -> joins or opens a batch (`batchWith`)
 * batch open --answered--> each finding routed, deferred or dropped (one answer for the batch):
 *   determined       build: plan_finding to its active build, else a new piece of work (seed, expect determined)
 *   sets_precedent   build: Design propose on its active work, else a new piece of work (seed, expect sets_precedent)
 *   mandate_wrong    build: Design propose (items stay held until the revision is approved); defer|drop: release
 *   non_convergence  build: release(resume, diagnosis, notes); drop: release(drop); defer: release(drop), parked
 *   tripwire         build: Design propose (the check changes); drop: release(resume, "restore the check")
 *   stall            build: release(resume, notes); drop: release(drop)
 *   unapproved_pattern  bless: add to approved references; revoke: new work to make it fail structurally; defer
 *   principle_change, edge_case  build: new piece of work; defer; drop
 * filed --agent_stalled(investigator)--> a fresh investigator (generation + 1); after two stalls on one finding it
 *   joins a batch unclassified, so the owner sees it
 * any open --settled_by_owner--> routed (no decision); removed from its batch; an empty batch's ask disappears
 */
import type { Ask, AgentDecl, EffectDecl, KernelEvent, Lane, Reduction, World } from "../../kernel/lane.ts";
import type { Self } from "../../kernel/kernel.ts";
import type { Sha } from "../../repo/index.ts";
import type { FindingRef, QueueMessage, QueueView } from "./public.ts";
import type { Investigation, QueueState } from "./state.ts";
import { QueueDoc } from "./state.ts";

export type QueueEvent =
	| {
			readonly kind: "agent_filed";
			readonly text: string;
			readonly report: string | null;
			readonly nodes: readonly string[];
			readonly edgeCase: null | { readonly failure: string; readonly likelihood: string; readonly cost: string };
			/** The filer cannot continue its item without an answer. */
			readonly blocking: boolean;
			/** HEAD of the filer's working directory, read from git by `observe`. */
			readonly sha: Sha | null;
			readonly self: Self;
	  }
	| {
			readonly kind: "investigated";
			readonly finding: FindingRef;
			readonly investigation: Investigation;
			/** Classified findings this one takes one answer with; empty opens a new batch. */
			readonly batchWith: readonly FindingRef[];
			readonly self: Self;
	  }
	| QueueMessage;

export const queueLane: Lane<"queue", QueueState, QueueEvent, QueueView> = {
	name: "queue",
	scope: "project",
	state: QueueDoc,
	reduce(state: QueueState, event: QueueEvent | KernelEvent, world: World): Reduction<QueueState> {
		throw new Error("not implemented");
	},
	view(state: QueueState): QueueView {
		throw new Error("not implemented");
	},
	/**
	 * `triage/<batch>` per unanswered batch. Choices by class: build | defer | drop, or bless | revoke | defer for
	 * patterns. Basis: each finding (source, context, investigation, recommendation, the failure/likelihood/cost
	 * triple for edge cases, the items it holds) and what each choice will do for this batch.
	 */
	asks(state: QueueState, world: World): readonly Ask[] {
		throw new Error("not implemented");
	},
	/**
	 * `queue/investigator/<generation>`, cwd = repository root, one expectation per filed finding
	 * (`inputs/queue/investigate.md`: the finding, its context, open findings and the affected plan for duplicates).
	 * Its conversation is the project anchor: triage decisions and their continuations live there.
	 */
	agents(state: QueueState, world: World): readonly AgentDecl[] {
		throw new Error("not implemented");
	},
	effects: (): readonly EffectDecl[] => [],
};
