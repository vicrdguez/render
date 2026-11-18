import { createRegistry } from "@earendil-works/pi-durable";
import { builtInExtensions } from "./catalogue.js";
import type { ExtensionModule, ServerOptions } from "./index.js";
import { Options } from "./options.js";
import { PROJECT } from "./projects.js";

export type ExtensionFailure = {
	readonly name: string;
	readonly path?: string;
	readonly stage: string;
	readonly error: unknown;
};

export type ExtensionScan = {
	readonly modules: Readonly<Record<string, unknown>>;
	readonly failures: readonly ExtensionFailure[];
};

export type ExtensionSource = () => ExtensionScan | Promise<ExtensionScan>;

const object = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const nameRule = new RegExp(PROJECT);

function check(name: string, value: unknown): ExtensionModule {
	if (
		!nameRule.test(name) ||
		builtInExtensions.some((extension) => extension.name === name)
	)
		throw new Error(`Invalid extension name ${name}`);
	if (!object(value) || !object(value.extension))
		throw new Error("The extension export must be an object");
	if (value.extension.name !== name)
		throw new Error(
			`Expected extension.name ${name}, found ${String(value.extension.name)}`,
		);
	if (value.options !== undefined) {
		const options = value.options;
		if (
			!object(options) ||
			!object(options.schema) ||
			options.schema.type !== "object" ||
			options.schema.additionalProperties !== false ||
			typeof options.get !== "function" ||
			typeof options.set !== "function"
		)
			throw new Error(
				"Options require a closed object schema and callable get and set",
			);
	}
	if (
		value.entry !== undefined &&
		!object(value.entry) &&
		typeof value.entry !== "function"
	)
		throw new Error("The entry export must be an object or function");
	return value as ExtensionModule;
}

export async function loadExtensions(
	source: ExtensionSource,
	models: ServerOptions["models"],
) {
	const found = await source();
	const failures = [...found.failures];
	const modules: Record<string, ExtensionModule> = Object.create(null);
	const options = new Map<string, Options>();
	const current = typeof models === "function" ? models : () => models;
	const registry = createRegistry();
	for (const extension of builtInExtensions) registry.install(extension);
	const owners = new Map<string, string>();
	for (const name of Object.keys(found.modules).sort()) {
		const value = found.modules[name];
		let stage = "shape";
		try {
			const module = check(name, value);
			stage = "options";
			const contract =
				module.options === undefined
					? undefined
					: new Options(module.options, current);
			stage = "install";
			const tasks = (module.extension.tasks ?? []).map(
				(task) => task.definition.name,
			);
			const shared = tasks.find((task) => owners.has(task));
			if (shared !== undefined)
				throw new Error(
					`Task ${shared} of extension ${name} is already installed by extension ${owners.get(shared)}`,
				);
			registry.install(module.extension);
			for (const task of tasks) owners.set(task, name);
			modules[name] = module;
			if (contract !== undefined) options.set(name, contract);
		} catch (error) {
			failures.push({ name, stage, error });
		}
	}
	for (const failure of failures) {
		const message =
			failure.error instanceof Error
				? failure.error.message
				: String(failure.error);
		process.stderr.write(
			`tau: extension ${failure.name}${failure.path === undefined ? "" : ` ${failure.path}`} [${failure.stage}]: ${message.split(/[\r\n]/, 1)[0]}\n`,
		);
	}
	return { modules, options, failures };
}
