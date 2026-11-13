/**
 * One store: a pi-durable harness on one storage, with Decision and Event added (docs/core/README.md, "What Tau ships").
 *
 * The store layer knows no project, no path, no lock, and no extension. The host passes all of that in. biome.json
 * refuses an import from src/store/ into src/host/ or src/protocol/.
 */

import type { Context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import type { Harness, HarnessSettings, RegistryReader, Report, Storage } from "@earendil-works/pi-durable";

export type StoreOptions = {
	readonly storage: Storage; // SQLite in a temporary directory or under ~/.tau; MemoryStorage in the store's own tests
	readonly registry: RegistryReader; // the project's registry; `answer` finds the `then` task in it
	readonly models: Models | (() => Models);
	readonly now: () => number; // the Harness clock; `answer` records `at` with it
	readonly settings?: () => HarnessSettings | undefined; // the host's getter for the project default
	readonly onReport?: (report: Report) => void;
};

export type Store = {
	readonly harness: Harness;
	readonly registry: RegistryReader;
	readonly now: () => number;
};

/**
 * Opens a harness on `storage` and makes sure the event log exists. It does not call `resume()`: the host installs the
 * project's extensions first, so a due task never meets an empty registry for longer than the start takes
 * (docs/core/host.md, "What the server reads at start", and H1 of spikes/host.mjs).
 */
export async function openStore(options: StoreOptions, context: Context): Promise<Store> {
	// TODO:
	//   harness = await Harness.open(options.storage, { models, registry, now, settings, onReport }, context)
	//   await ensureEventLog(harness, context)
	//   return { harness, registry: options.registry, now: options.now }
	void [options, context];
	throw new Error("not implemented");
}
