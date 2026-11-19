/**
 * The kernel's own records. Only kernel code reads or writes them. They map lane names to tau identities and
 * remember what the kernel already did, so reconciliation is idempotent: "declared minus recorded" is the work
 * left, whichever commit or rerun computes it.
 */
import type { DecisionId } from "tau";
import type { ConversationId, EntryId, TaskId } from "tau/durable";
import type { RepoInfo } from "../repo/index.ts";
import type { RoleName } from "../roles/index.ts";
import type { AgentKey, EffectKey, LaneName, SubjectLocal, Token, WorkId } from "./ids.ts";
import { defineState } from "./state.ts";

export type AskRecord = {
	readonly lane: LaneName;
	readonly work: WorkId | null;
	readonly local: SubjectLocal;
	readonly decision: DecisionId;
	readonly basis: EntryId;
	/** Hash of basis text and choices; a different hash re-asks. */
	readonly hash: string;
};

export type AgentRecord = {
	readonly conversation: ConversationId;
	readonly role: RoleName;
	readonly cwd: string | null;
	/** Tokens delivered and not yet answered or withdrawn by the lane. */
	readonly open: Token[];
	/** Tokens already nudged once after a run ended owing them. */
	readonly nudged: Token[];
	/** Last reconciled state; a change to `paused` or `retired` plans one `keel.stop`. */
	readonly state: "active" | "paused" | "retired";
};

export type EffectRecord = {
	readonly task: TaskId;
	/** `cancelled`: no longer declared; a task that has not started yet exits without acting. */
	readonly state: "planned" | "done" | "cancelled";
};

/** One per project (session scope). */
export type ProjectRecord = {
	readonly repo: RepoInfo | null;
	/** The investigator's conversation. Project-lane tasks and triage decisions live there. */
	readonly anchor: ConversationId | null;
	readonly works: Record<
		string /* WorkId */,
		{ readonly title: string; readonly createdAt: number; readonly origin: "owner" | "queue"; readonly closed: boolean }
	>;
	/** Open owner questions, by tau decision subject. Subjects are project-wide in tau, so this is too. */
	readonly asks: Record<string, AskRecord>;
	readonly agents: Record<string /* AgentKey */, AgentRecord>;
	readonly effects: Record<string /* EffectKey */, EffectRecord>;
};

/** One per piece of work, on its anchor conversation. */
export type WorkRecord = {
	readonly agents: Record<string /* AgentKey */, AgentRecord>;
	readonly effects: Record<string /* EffectKey */, EffectRecord>;
};

/**
 * On every conversation keel creates (and on an adopted anchor). Read by the tool gate, the `afterRun` hook and
 * the principles section. A conversation without a binding is not keel's.
 */
export type Binding = {
	readonly work: WorkId | null;
	readonly lane: LaneName;
	readonly agent: AgentKey;
	readonly role: RoleName;
};

/**
 * On a tool call's own task (task scope), written in the same commit as the publication. pi-durable retires it with
 * the task, so receipts never accumulate.
 */
export type Receipt = { readonly output: string | null; readonly isError: boolean };

export const ProjectState = defineState<ProjectRecord>({
	kind: "keel.project",
	version: 1,
	scope: "session",
	initial: () => ({ repo: null, anchor: null, works: {}, asks: {}, agents: {}, effects: {} }),
});
export const WorkState = defineState<WorkRecord>({
	kind: "keel.work",
	version: 1,
	scope: "conversation",
	initial: () => ({ agents: {}, effects: {} }),
});
export const BindingState = defineState<{ readonly binding: Binding | null }>({
	kind: "keel.binding",
	version: 1,
	scope: "conversation",
	initial: () => ({ binding: null }),
});
export const ReceiptState = defineState<Receipt>({
	kind: "keel.receipt",
	version: 1,
	scope: "task",
	initial: () => ({ output: null, isError: false }),
});
