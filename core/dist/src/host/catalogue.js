import { CodingTools } from "@earendil-works/pi-durable/tools";
export class Catalogue {
    #entries;
    constructor(modules, options) {
        this.#entries = Object.freeze(Object.fromEntries(Object.entries(modules).map(([name, module]) => [
            name,
            Object.freeze({ module, options: options.get(name) }),
        ])));
        Object.freeze(this);
    }
    get(name) {
        return Object.hasOwn(this.#entries, name) ? this.#entries[name] : undefined;
    }
    entries() {
        return Object.entries(this.#entries);
    }
    selected(names) {
        return names.flatMap((name) => {
            const loaded = this.get(name);
            return loaded === undefined ? [] : [loaded];
        });
    }
    defaults(names) {
        return [
            CodingTools,
            ...this.selected(names)
                .filter(({ module }) => module.entry === undefined)
                .map(({ module }) => module.extension),
        ];
    }
}
//# sourceMappingURL=catalogue.js.map