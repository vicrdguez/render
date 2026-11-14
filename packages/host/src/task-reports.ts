import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
	lit,
	num,
	obj,
	opt,
	type Static,
	str,
	union,
} from "@earendil-works/pi-schema";
import type { Projects } from "./projects.js";

export const TaskWarning = obj({
	project: str(),
	task: num(),
	kind: str(),
	conversation: num(),
	stored: num(),
	installed: num(),
	status: union([lit("blocked"), lit("migration-needed-on-reservation")]),
	reason: union([lit("migration_failed"), lit("task_too_old")]),
	until: opt(num()),
	message: opt(str()),
});
export type TaskWarning = Static<typeof TaskWarning>;

export const safeMessage = (error: unknown) =>
	(error instanceof Error ? error.message : String(error)).split(
		/[\r\n]/,
		1,
	)[0] ?? "Unknown error";

export function taskLine(task: TaskWarning): string {
	return `${task.status} ${task.project} task=${task.task} kind=${task.kind} conversation=${task.conversation} version=${task.stored}->${task.installed} ${task.reason}${task.until === undefined ? "" : ` wake=${new Date(task.until).toISOString()}`}${task.message === undefined ? "" : `: ${task.message}`}`;
}

export async function inspectTasks(projects: Projects): Promise<TaskWarning[]> {
	const warnings: TaskWarning[] = [];
	for (const project of projects.all()) {
		const inspection = await project.store.harness.inspect(context);
		const registry = project.registry.snapshot();
		for (const { record, state } of inspection.tasks) {
			const definition = registry.task(record.kind)?.definition;
			if (definition === undefined) continue;
			const blocked =
				state.kind === "blocked" && state.reason === "migration_failed";
			const older =
				record.version < definition.version && definition.migrate === undefined;
			const newer = record.version > definition.version;
			if (!blocked && !older && !newer) continue;
			warnings.push({
				project: project.name,
				task: record.id,
				kind: record.kind,
				conversation: record.conversationId,
				stored: record.version,
				installed: definition.version,
				status:
					blocked || newer ? "blocked" : "migration-needed-on-reservation",
				reason: newer ? "task_too_old" : "migration_failed",
				...(state.kind === "sleeping" ? { until: state.until } : {}),
				...(blocked && state.error !== undefined
					? { message: safeMessage(state.error) }
					: {}),
			});
		}
	}
	return warnings;
}
