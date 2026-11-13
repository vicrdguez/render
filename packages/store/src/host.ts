import type { Context } from "@earendil-works/chord/context";
import type {
	Harness,
	HarnessOptions,
	Storage,
	WatchHandle,
} from "@earendil-works/pi-durable";
import type {
	AnswerInput,
	AnswerResult,
	DecisionId,
	DeviceId,
	OpenDecisions,
} from "./types.js";

export type { AnswerInput, AnswerResult, OpenDecisions } from "./types.js";

export type Store = {
	readonly harness: Harness;
	readonly options: HarnessOptions;
};
/** No project name, path, lock or extension policy. Scheduler remains paused.
 * Create the log conversation once in a commit if its session document is absent.
 * Caller owns storage lifecycle and must hold the process lock first.
 */
export async function openStore(
	storage: Storage,
	options: HarnessOptions,
	context: Context,
): Promise<Store> {
	throw new Error("not implemented");
}
/** The only writer of answers. Storage rejection propagates, never a refusal.
 * docs/core/primitives.md answer table, including equal resend after faulted.
 */
export async function answer(
	store: Store,
	id: DecisionId,
	input: AnswerInput,
	device: DeviceId,
	context: Context,
): Promise<AnswerResult> {
	// TODO one harness commit: read decision, subject, basis, registry, old task BEFORE writes.
	// TODO equal retry uses first by/at; only faulted gets a new continuation.
	// TODO validate UTF-16 integer ranges against text.slice(start,end).
	// TODO resolve then by registry snapshot; missing definition leaves decision open.
	// TODO create conversation-owned, background:true task with {decision,choice}.
	// TODO write record and clear slot atomically. Use options.now ?? Date.now.
	throw new Error("not implemented");
}
export async function watchOpen(
	store: Store,
	context: Context,
): Promise<WatchHandle<OpenDecisions>> {
	throw new Error("not implemented");
}
