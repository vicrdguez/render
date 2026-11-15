import { BACKGROUND_CONTEXT, } from "@earendil-works/chord/context";
import { answer } from "./decisions.js";
export { openStore } from "./host.js";
export function fauxAnswer(store, id, input, context = BACKGROUND_CONTEXT) {
    return answer(store, id, input, "!test", context);
}
//# sourceMappingURL=testing.js.map