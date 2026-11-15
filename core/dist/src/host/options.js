import { compile, } from "@earendil-works/pi-schema";
const propertiesOf = (schema) => {
    if (typeof schema !== "object" || schema === null)
        return {};
    const properties = schema.properties;
    return typeof properties === "object" && properties !== null
        ? properties
        : {};
};
/** Splits `provider/modelId` at the first slash. */
export function modelRef(value) {
    const cut = value.indexOf("/");
    return cut <= 0
        ? undefined
        : { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
}
export const hasModel = (models, value) => {
    const ref = modelRef(value);
    return (ref !== undefined &&
        models().getModel(ref.provider, ref.modelId) !== undefined);
};
/** The host's half of the options contract: checks with defaults filled, and replies with secrets hidden. */
export class Options {
    #contract;
    #check;
    #defaults;
    #secrets;
    constructor(contract, models) {
        this.#contract = contract;
        this.#check = compile(contract.schema, {
            formats: { model: (value) => hasModel(models, value) },
        });
        const properties = Object.entries(propertiesOf(contract.schema));
        this.#defaults = Object.fromEntries(properties.flatMap(([key, p]) => p.default === undefined ? [] : [[key, p.default]]));
        this.#secrets = new Set(properties.filter(([, p]) => p.format === "secret").map(([key]) => key));
    }
    get schema() {
        return this.#contract.schema;
    }
    /** The errors of the set keys with the defaults filled, missing keys included. */
    errors(value) {
        return this.#check.errors({ ...this.#defaults, ...value });
    }
    hide(value) {
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [
            key,
            this.#secrets.has(key) ? true : v,
        ]));
    }
    async view(tx) {
        const value = await this.#contract.get(tx);
        return { value: this.hide(value), errors: this.errors(value) };
    }
    async patch(tx, patch) {
        const merged = { ...(await this.#contract.get(tx)) };
        for (const [key, value] of Object.entries(patch)) {
            if (value === null)
                delete merged[key];
            else
                merged[key] = value;
        }
        const errors = this.errors(merged).filter((e) => e.keyword !== "required");
        if (errors.length > 0)
            return { errors };
        await this.#contract.set(tx, merged);
        return { value: this.hide(merged) };
    }
}
//# sourceMappingURL=options.js.map