import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import type {
	ConversationId,
	Cursor,
	JsonObject,
	TaskId,
	TaskRecord,
} from "@earendil-works/pi-durable";
import { type DecisionId, decision } from "tau-store";
import type { OpenProject } from "./projects.js";

// docs/core/host.md, "Faulted tasks".
export type Fault = {
	task: TaskId;
	kind: string;
	conversation: ConversationId;
	error: string;
	endedAt?: number;
	decision?: DecisionId;
};
/** Where a kind's scan goes on: from `cursor`, past `skip` records. `null` is a kind with nothing left. */
type Position = { cursor?: Cursor; skip: number } | null;
export type Positions = Record<string, Position>;
type Task = TaskRecord<JsonValue, JsonValue, JsonValue>;

const PAGE = 100;

/** One page of faulted tasks of the given kinds, newest first. A kind's position moves only past a fault that the
 * page returns, so none is skipped. */
export async function scanFaults(
	open: OpenProject,
	kinds: readonly string[],
	limit: number,
	positions: Positions,
): Promise<{ items: Fault[]; positions: Positions }> {
	const { harness } = open.store;
	const found: { kind: string; task: Task; after: Position }[] = [];
	const complete = new Set<string>();
	for (const kind of kinds) {
		const start = positions[kind];
		if (start === null) continue;
		let cursor = start?.cursor;
		let skip = start?.skip ?? 0;
		let count = 0;
		for (;;) {
			const at = cursor;
			const page = await harness.commit(
				(tx) =>
					tx.scanTasks(
						{ kind, status: "terminal", order: "descending" },
						PAGE,
						at,
					),
				context,
			);
			for (let i = skip; i < page.items.length && count < limit; i++) {
				const task = page.items[i];
				if (task?.state.outcome?.status !== "faulted") continue;
				count++;
				const after: Position =
					i + 1 < page.items.length
						? { ...(at === undefined ? {} : { cursor: at }), skip: i + 1 }
						: page.next === undefined
							? null
							: { cursor: page.next, skip: 0 };
				found.push({ kind, task, after });
			}
			if (count >= limit) break;
			if (page.next === undefined) {
				complete.add(kind);
				break;
			}
			cursor = page.next;
			skip = 0;
		}
	}
	const chosen = found.sort((a, b) => b.task.id - a.task.id).slice(0, limit);
	const next: Positions = { ...positions };
	for (const kind of kinds) {
		const mine = chosen.filter((c) => c.kind === kind);
		const all = found.filter((c) => c.kind === kind);
		if (complete.has(kind) && mine.length === all.length) next[kind] = null;
		else if (mine.length > 0) next[kind] = mine.at(-1)?.after ?? null;
	}
	const items = await harness.commit(async (tx) => {
		const faults: Fault[] = [];
		for (const { kind, task } of chosen) {
			const input = task.input as JsonObject | null;
			const named =
				typeof input?.decision === "string" ? input.decision : undefined;
			const record =
				named === undefined
					? undefined
					: await decision(tx, named as DecisionId);
			faults.push({
				task: task.id,
				kind,
				conversation: task.conversationId,
				error:
					task.state.outcome?.status === "faulted"
						? task.state.outcome.error.message
						: "",
				...(task.endedAt === undefined ? {} : { endedAt: task.endedAt }),
				...(record?.status === "answered" && record.continuation === task.id
					? { decision: record.id }
					: {}),
			});
		}
		return faults;
	}, context);
	return { items, positions: next };
}
