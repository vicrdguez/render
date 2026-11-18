import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import type { Extension } from "@earendil-works/pi-durable";
import { createCodemodeExtension } from "@earendil-works/pi-durable/codemode";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import type { ExtensionModule } from "./index.js";
import type { Options } from "./options.js";

export const builtInExtensions: readonly Extension[] = [
	CodingTools,
	createCodemodeExtension({ sandbox: new CodemodeSandbox() }),
];

type Loaded = {
	readonly module: ExtensionModule;
	readonly options: Options | undefined;
};

export class Catalogue {
	readonly #entries: Readonly<Record<string, Loaded>>;

	constructor(
		modules: Readonly<Record<string, ExtensionModule>>,
		options: ReadonlyMap<string, Options>,
	) {
		this.#entries = Object.freeze(
			Object.fromEntries(
				Object.entries(modules).map(([name, module]) => [
					name,
					Object.freeze({ module, options: options.get(name) }),
				]),
			),
		);
		Object.freeze(this);
	}

	get(name: string): Loaded | undefined {
		return Object.hasOwn(this.#entries, name) ? this.#entries[name] : undefined;
	}

	entries(): readonly (readonly [string, Loaded])[] {
		return Object.entries(this.#entries);
	}

	selected(names: readonly string[]): readonly Loaded[] {
		return names.flatMap((name) => {
			const loaded = this.get(name);
			return loaded === undefined ? [] : [loaded];
		});
	}

	defaults(names: readonly string[]) {
		return [
			...builtInExtensions,
			...this.selected(names)
				.filter(({ module }) => module.entry === undefined)
				.map(({ module }) => module.extension),
		];
	}
}
