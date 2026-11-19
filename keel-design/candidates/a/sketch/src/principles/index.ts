/**
 * Principles: one file each with a description and a body. Three deliveries, one source.
 *
 * | Delivery           | How                                                                              |
 * | ------------------ | -------------------------------------------------------------------------------- |
 * | Pulled by judgment | the `principle` tool returns the body and records the pull                       |
 * | Bound by fact      | `bound(facts)` names principles a lane renders in full into a brief or input     |
 * | Triggered by event | `triggered(trigger)` names principles a lane renders into the next input         |
 *
 * Keel's principles are `prose/principles/*.md`, loaded at module scope. A project's are `.keel/principles/*.md`
 * in the repo, read at request time from the agent's working directory, so a worker sees its worktree's version
 * and a verifier the version under review. `.keel/` is a protected path: a build that touches it trips the
 * weakened-check tripwire. Agents never change a principle, playbook or binding; proposals go to the queue.
 */
import type { ConversationId, ToolRegistration, Tx } from "tau/durable";
import type { ProjectPrincipleFile } from "../repo/index.ts";
import type { RoleName } from "../roles/index.ts";
import { defineState } from "../kernel/state.ts";

export type Principle = {
	readonly name: string;
	readonly description: string;
	readonly body: string;
	readonly source: "keel" | "project";
};

/** Facts a lane already knows when it renders a brief or input. */
export type BindingFacts = {
	readonly lane: "design" | "build" | "verify" | "queue";
	readonly stage: string;
	readonly role: RoleName;
	/** Write fences of the item, for path-bound principles (a numeric principle on any item fenced to the kernels). */
	readonly paths: readonly string[];
};

/** Events with a principle attached, e.g. `fix_survived_twice` -> attack-the-premise. */
export type Trigger = "fix_survived_twice" | "filing_finding" | "ruling_cites_unapproved" | "scrap_tell";

/** Keel principles bound by `facts` (a code table) plus project principles whose `bind` matches. Pure. */
export function bound(facts: BindingFacts, project: readonly ProjectPrincipleFile[]): readonly Principle[] {
	throw new Error("not implemented");
}

export function triggered(trigger: Trigger): readonly Principle[] {
	throw new Error("not implemented");
}

/**
 * The index section, a literal `{ key: "keel.principles", render }`. Renders names and descriptions of keel and
 * project principles in a fixed order, on every request, and only for an agent whose resolved tools include
 * `principle` (a tool filter does not hide sections). Returns the full index every time.
 */
export declare const principlesSection: { readonly key: string; render(input: unknown): Promise<string | undefined> };

/**
 * `principle({ name })`: returns the body (project version read from the caller's cwd) and appends to the caller's
 * `keel.pulls` record. Replay-safe: the pull is recorded with a receipt on the call's task.
 */
export declare const principleTool: ToolRegistration;

/** Principles this conversation pulled. Read by the kernel into `Self.pulled` for every keel tool call. */
export async function pulled(tx: Tx, conversation: ConversationId): Promise<readonly string[]> {
	throw new Error("not implemented");
}

export const PullState = defineState<{ readonly pulls: readonly { readonly name: string; readonly at: number }[] }>({
	kind: "keel.pulls",
	version: 1,
	scope: "conversation",
	initial: () => ({ pulls: [] }),
});
