import {
	BACKGROUND_CONTEXT,
	type Context,
} from "@earendil-works/chord/context";
import { answer } from "./decisions.js";
import type { Store } from "./host.js";
import type { AnswerInput, AnswerResult, DecisionId } from "./types.js";

export { openStore, type Store } from "./host.js";
export type { AnswerInput, AnswerResult } from "./types.js";

export function fauxAnswer(
	store: Store,
	id: DecisionId,
	input: AnswerInput,
	context: Context = BACKGROUND_CONTEXT,
): Promise<AnswerResult> {
	return answer(store, id, input, "!test", context);
}
