import * as Effect from "effect/Effect";
import type { Decision, Refusal } from "../../src/kernel/kernel.ts";

/** Interpret a Kernel program only where a test consumes a synchronous decision. Defects still throw. */
export function decision(program: Effect.Effect<Extract<Decision, { outcome: "accepted" }>, Refusal>): Decision {
	return Effect.runSync(
		Effect.match(program, {
			onFailure: (refusal) => refusal,
			onSuccess: (accepted) => accepted,
		}),
	);
}
