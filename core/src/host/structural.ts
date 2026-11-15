import { type Outcome, refuse } from "./refusals.js";

export class StructuralQueue {
	#tail: Promise<unknown> = Promise.resolve();
	#closing = false;

	run<T>(work: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
		if (this.#closing)
			return Promise.resolve(refuse("busy", "The server is stopping."));
		const next = this.#tail.then(() =>
			this.#closing ? refuse("busy", "The server is stopping.") : work(),
		);
		this.#tail = next.catch(() => {});
		return next;
	}

	async close(): Promise<void> {
		this.#closing = true;
		await this.#tail;
	}
}
