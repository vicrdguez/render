import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, Harness, MemoryStorage, } from "@earendil-works/pi-durable";
export const context = BACKGROUND_CONTEXT;
export async function fixture(t) {
    const harness = await Harness.open(new MemoryStorage(), { models: createModels(), registry: createRegistry() }, context);
    t.after(() => harness.close(context));
    return harness;
}
//# sourceMappingURL=fixture.js.map