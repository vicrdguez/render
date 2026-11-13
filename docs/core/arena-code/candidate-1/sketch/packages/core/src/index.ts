/**
 * `tau-core`: what an extension imports from the core (docs/core/primitives.md, "How an extension reaches the core").
 *
 * Exactly five functions, each over the `tx` the extension already holds. `answer` is the host's and is not here.
 * test/exports.test.ts pins this list, so adding a function here fails the build until the test is changed on purpose.
 *
 * The types are the shapes of docs/core/primitives.md and the module contract of docs/core/host.md.
 */

export type { ExtensionModule, OptionsContract } from "./module.ts";
export type {
	Annotation,
	Decision,
	DecisionDraft,
	DecisionId,
	DeviceId,
	OpenSlot,
	Subject,
	ThenInput,
	ThenTask,
} from "./store/decision.ts";
export { decision, request, withdraw } from "./store/decision.ts";
export type { EventData } from "./store/event.ts";
export { emit, eventLog } from "./store/event.ts";
