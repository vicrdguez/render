import { type Context } from "@earendil-works/chord/context";
import type { Store } from "./host.js";
import type { AnswerInput, AnswerResult, DecisionId } from "./types.js";
export { openStore, type Store } from "./host.js";
export type { AnswerInput, AnswerResult } from "./types.js";
export declare function fauxAnswer(store: Store, id: DecisionId, input: AnswerInput, context?: Context): Promise<AnswerResult>;
