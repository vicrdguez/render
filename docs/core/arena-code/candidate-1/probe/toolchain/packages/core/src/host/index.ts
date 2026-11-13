import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import type { Extension, Harness } from "@earendil-works/pi-durable";
import { createRegistry, Harness as Harnesses, MemoryStorage } from "@earendil-works/pi-durable";
import { answer } from "../store/decision.ts";

export type Host = {
	readonly harness: Harness;
	answer(subject: string): Promise<string | undefined>;
	close(): Promise<void>;
};

export async function openHost(extensions: readonly Extension[]): Promise<Host> {
	const registry = createRegistry();
	for (const extension of extensions) registry.install(extension);
	const harness = await Harnesses.open(new MemoryStorage(), { models: createModels(), registry }, BACKGROUND_CONTEXT);
	return {
		harness,
		answer: async (subject) => (await harness.commit((tx) => answer(tx, subject), BACKGROUND_CONTEXT))?.id,
		close: () => harness.close(BACKGROUND_CONTEXT),
	};
}
