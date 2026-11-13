import type { ConversationId, TaskId } from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-store";
import type { OpenProject } from "./projects.js";

// Copied from docs/core/host.md.
export type Fault = {
	task: TaskId;
	kind: string;
	conversation: ConversationId;
	error: string;
	endedAt?: number;
	decision?: DecisionId;
};
export async function faults(
	project: OpenProject,
	cursor?: string,
	limit?: number,
): Promise<{
	items: readonly Fault[];
	next?: string;
}> {
	// TODO read-only scan terminal tasks BY installed extension task name, descending.
	// TODO filter outcome=faulted. Keep one cursor per kind and merge in ID order.
	// TODO only tag decision when its continuation equals this task; old replaced faults remain.
	// TODO never persist a fault index or rely on onReport. Missing kinds remain invisible.
	throw new Error("not implemented");
}
