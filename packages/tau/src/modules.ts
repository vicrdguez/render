import type { ExtensionModule } from "tau-host";
import * as w1 from "tau-w1";
import * as w2 from "tau-w2";
import * as websearch from "tau-websearch";

export function moduleMap(
	entries: readonly ExtensionModule[],
): Readonly<Record<string, ExtensionModule>> {
	const result: Record<string, ExtensionModule> = {};
	for (const module of entries) {
		const name = module.extension.name;
		if (Object.hasOwn(result, name))
			throw new Error(`Repeated extension name: ${name}`);
		result[name] = module;
	}
	return result;
}

export const modules = moduleMap([websearch, w2, w1]);
