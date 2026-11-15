import { readFileSync } from "node:fs";
import { join } from "node:path";
import { configure, defineDoc, } from "@earendil-works/pi-durable";
import { compile } from "@earendil-works/pi-schema";
export async function role(tx, settings, ownership) {
    const { id } = await tx.createConversation({ ownership });
    await configure(tx, id, settings);
    return id;
}
export function options(extension, schema) {
    const document = defineDoc({
        kind: `${extension}.options`,
        version: 1,
        scope: "session",
        initial: () => ({}),
        checkpointWhen: () => false,
    });
    const validator = compile(schema);
    const defaults = Object.fromEntries(Object.entries(schema.properties)
        .filter(([, property]) => "default" in property)
        .map(([key, property]) => [key, property.default]));
    // A document draft is a proxy. Return detached JSON, not the caller's mutable draft.
    const get = async (tx) => JSON.parse(JSON.stringify(await tx.doc(document)));
    return {
        schema,
        get,
        async set(tx, value) {
            const draft = await tx.doc(document);
            for (const key of Object.keys(draft))
                delete draft[key];
            Object.assign(draft, value);
        },
        async read(tx) {
            const value = { ...structuredClone(defaults), ...(await get(tx)) };
            if (!validator.check(value)) {
                throw new Error(`Options of ${extension} do not fit: ${JSON.stringify(validator.errors(value))}`);
            }
            return value;
        },
    };
}
export function modelRef(value) {
    const cut = value.indexOf("/");
    return { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
}
export function prose(directory, file, slots) {
    const text = readFileSync(join(directory, file), "utf8");
    const pattern = /{{([^{}]*)}}/g;
    const found = new Set([...text.matchAll(pattern)].map((match) => match[1]));
    const declared = new Set(slots);
    if (found.size !== declared.size || slots.some((slot) => !found.has(slot))) {
        throw new Error(`Prose slots differ in ${file}: declared ${JSON.stringify(slots)}, found ${JSON.stringify([...found])}`);
    }
    return (facts) => text.replace(pattern, (_match, name) => facts[name]);
}
//# sourceMappingURL=helpers.js.map