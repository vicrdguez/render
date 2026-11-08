import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

/** Adapt an existing I/O operation without introducing retries or cancellation of admitted work. */
export function fromPromise<A>(operation: () => PromiseLike<A>): Effect.Effect<A, unknown> {
	return Effect.tryPromise({ try: operation, catch: (error) => error });
}

/** Promise consumers must see the original refusal/error, not an Effect FiberFailure wrapper. */
export async function runPromise<A, E>(program: Effect.Effect<A, E>): Promise<A> {
	const exit = await Effect.runPromiseExit(program);
	if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
	return exit.value;
}
