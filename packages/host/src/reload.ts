import { Catalogue } from "./catalogue.js";
import {
	type ExtensionFailure,
	type ExtensionScan,
	loadExtensions,
} from "./extensions.js";
import type { ServerOptions } from "./index.js";
import type { Projects } from "./projects.js";

export type ReloadReport = {
	readonly status: "applied" | "refused" | "restart_required";
	readonly extensions: readonly {
		readonly name: string;
		readonly status: "added" | "replaced" | "kept";
		readonly projects: readonly string[];
	}[];
	readonly skipped: readonly {
		readonly project: string;
		readonly reason: string;
	}[];
	readonly failures: readonly {
		readonly name: string;
		readonly path?: string;
		readonly stage: string;
		readonly message: string;
	}[];
	readonly reached?: { readonly project: string; readonly extension: string };
};

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
		return { status: "refused", extensions: [], skipped, failures: describe() };
	const catalogue = new Catalogue(loaded.modules, loaded.options);
	const found = new Set(Object.keys(scan.modules));
	const extensions = catalogue.entries().map(([name]) => ({
		name,
		status: !found.has(name)
			? ("kept" as const)
			: current.get(name) === undefined
				? ("added" as const)
				: ("replaced" as const),
		projects: projects
			.all()
			.filter((p) => p.record.extensions.includes(name))
			.map((p) => p.name),
	}));
	let reached: ReloadReport["reached"];
	try {
		projects.publish(catalogue, found, (project, extension) => {
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
			skipped,
			failures: describe(),
			...(reached === undefined ? {} : { reached }),
		};
	}
	return { status: "applied", extensions, skipped, failures: [] };
}
