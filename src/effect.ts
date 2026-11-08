import * as Effect from "effect/Effect";

export { runPromise } from "effect/Effect";

/** Adapt an existing I/O operation without introducing retries or cancellation of admitted work. */
export function fromPromise<A>(operation: () => PromiseLike<A>): Effect.Effect<A, unknown> {
	return Effect.tryPromise({ try: operation, catch: (error) => error });
}
