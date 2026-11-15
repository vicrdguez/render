import { refuse } from "./refusals.js";
export class StructuralQueue {
    #tail = Promise.resolve();
    #closing = false;
    run(work) {
        if (this.#closing)
            return Promise.resolve(refuse("busy", "The server is stopping."));
        const next = this.#tail.then(() => this.#closing ? refuse("busy", "The server is stopping.") : work());
        this.#tail = next.catch(() => { });
        return next;
    }
    async close() {
        this.#closing = true;
        await this.#tail;
    }
}
//# sourceMappingURL=structural.js.map