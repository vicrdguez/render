import {
	arr,
	lit,
	obj,
	opt,
	type Static,
	str,
	union,
} from "@earendil-works/pi-schema";
import { Catalogue } from "./catalogue.js";
import {
	type ExtensionFailure,
	type ExtensionScan,
	loadExtensions,
} from "./extensions.js";
import type { ServerOptions } from "./index.js";
import type { Projects } from "./projects.js";
import { inspectTasks, TaskWarning } from "./task-reports.js";

export const ReloadReport = obj({
	status: union([lit("applied"), lit("refused"), lit("restart_required")]),
	extensions: arr(
		obj({
			name: str(),
			status: union([lit("added"), lit("replaced"), lit("kept")]),
			projects: arr(str()),
		}),
	),
	tasks: arr(TaskWarning),
	skipped: arr(obj({ project: str(), reason: str() })),
	failures: arr(
		obj({ name: str(), path: opt(str()), stage: str(), message: str() }),
	),
	reached: opt(obj({ project: str(), extension: str() })),
});
export type ReloadReport = Static<typeof ReloadReport>;

export async function reload(
	projects: Projects,
	options: Pick<ServerOptions, "source" | "models">,
): Promise<ReloadReport> {
	const skipped = projects.skipped.filter(
		(p) => projects.get(p.project) === undefined,
	);
	const failures: ExtensionFailure[] = [];
	let scan: ExtensionScan;
	try {
		scan = await options.source();
	} catch (error) {
		failures.push({ name: "*", stage: "scan", error });
		scan = { modules: {}, failures: [] };
	}
	const current = projects.catalogue;
	const proposed = {
		...Object.fromEntries(
			current.entries().map(([name, loaded]) => [name, loaded.module]),
		),
		...scan.modules,
	};
	const loaded = await loadExtensions(
		() => ({ modules: proposed, failures: scan.failures }),
		options.models,
	);
	failures.push(...loaded.failures);
	for (const [name, before] of current.entries()) {
		const after = loaded.modules[name];
		if (after === undefined) continue;
		const tasks = new Map(
			(after.extension.tasks ?? []).map((task) => [
				task.definition.name,
				task.definition,
			]),
		);
		for (const task of before.module.extension.tasks ?? []) {
			const old = task.definition;
			const next = tasks.get(old.name);
			let message: string | undefined;
			if (next === undefined)
				message = `Extension ${name} dropped task ${old.name}.`;
			else if (next.version < old.version)
				message = `Task ${old.name} version ${next.version} is lower than loaded version ${old.version}.`;
			else if (next.version === old.version) {
				const removed = Object.keys(old.phases).filter(
					(phase) => !Object.hasOwn(next.phases, phase),
				);
				if (removed.length > 0)
					message = `Task ${old.name} removed phase ${removed.join(", ")} at version ${old.version}.`;
			}
			if (message !== undefined)
				failures.push({
					name,
					stage: "compatibility",
					error: new Error(message),
				});
		}
	}
	const describe = () =>
		failures.map((f) => ({
			name: f.name,
			...(f.path === undefined ? {} : { path: f.path }),
			stage: f.stage,
			message:
				(f.error instanceof Error ? f.error.message : String(f.error)).split(
					/[\r\n]/,
					1,
				)[0] ?? "Unknown error",
		}));
	if (failures.length > 0)
		return {
			status: "refused",
			extensions: [],
			tasks: [],
			skipped,
			failures: describe(),
		};
	const catalogue = new Catalogue(loaded.modules, loaded.options);
	const found = new Set(Object.keys(scan.modules));
	let installed: Map<string, string[]>;
	let reached: ReloadReport["reached"];
	try {
		installed = projects.publish(catalogue, found, (project, extension) => {
			reached = { project, extension };
		});
	} catch (error) {
		failures.push({
			name: reached?.extension ?? "*",
			stage: "publish",
			error: new Error(
				`Restart required after publication failed: ${error instanceof Error ? error.message : String(error)}`,
			),
		});
		return {
			status: "restart_required",
			extensions: [],
			tasks: [],
			skipped,
			failures: describe(),
			...(reached === undefined ? {} : { reached }),
		};
	}
	const extensions = catalogue.entries().map(([name]) => ({
		name,
		status: !found.has(name)
			? ("kept" as const)
			: current.get(name) === undefined
				? ("added" as const)
				: ("replaced" as const),
		projects: !found.has(name)
			? projects
					.all()
					.filter((p) => p.record.extensions.includes(name))
					.map((p) => p.name)
			: (installed.get(name) ?? []),
	}));
	return {
		status: "applied",
		extensions,
		tasks: await inspectTasks(projects),
		skipped,
		failures: [],
	};
}
