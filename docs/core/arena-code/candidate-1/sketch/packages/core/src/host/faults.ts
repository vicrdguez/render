/**
 * The faulted tasks of a project (docs/core/host.md, "Faulted tasks"). One read that stores nothing.
 */

import type { Context } from "@earendil-works/chord/context";
import type { ConversationId, TaskId } from "@earendil-works/pi-durable";
import type { DecisionId } from "../store/decision.ts";
import type { Page } from "./conversations.ts";
import type { HostState } from "./host.ts";
import type { OpenProject } from "./project.ts";
import type { Outcome } from "./refusals.ts";

// ---- Copied from docs/core/host.md, "Faulted tasks". ----------------------------------------------------------------

export type Fault = {
	task: TaskId;
	kind: string;
	conversation: ConversationId;
	error: string; // the message that pi-durable kept
	endedAt?: number;
	decision?: DecisionId; // set when that decision's `continuation` is this task
};

/**
 * For each task name of the project's installed extensions, `tx.scanTasks({ kind, status: "terminal", order:
 * "descending" }, limit, cursor)` in a commit that writes nothing, keeping the `faulted` outcomes. It scans by kind:
 * a scan with no kind reads every model request and tool call (H10 of spikes/host.mjs). It does not listen to
 * `onReport`. `decision` is set only when that decision's `continuation` is this task.
 * The cursor holds one position per kind. It misses a kind whose extension the server no longer has.
 */
export async function faults(
	host: HostState,
	project: OpenProject,
	page: { readonly cursor?: string; readonly limit?: number },
	context: Context,
): Promise<Outcome<Page<Fault>>> {
	void [host, project, page, context];
	throw new Error("not implemented");
}
