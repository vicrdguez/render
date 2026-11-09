// Controlled fault injection for crash-recovery checks (.render/verify.md, Traps). Inert unless both variables are
// set: the host announces the barrier on stdout and stops there so a check can SIGKILL it at that exact point.
import * as Effect from "effect/Effect";

export function faultBarrier(
	name:
		| "before-commit"
		| "after-commit"
		| "before-source-root"
		| "after-source-root"
		| "after-sandbox-stop"
		| "before-target-observe"
		| "before-prepared-check"
		| "before-review-check"
		| "before-integration-admission"
		| "after-integration-admission"
		| "before-integration-cas"
		| "after-integration-cas"
		| "after-integration-readback"
		| "after-integration-qualification"
		| "before-message-submission"
		| "after-message-submission",
	commandId: string,
): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		if (process.env.RENDER_FAULT_BARRIER !== name || process.env.RENDER_FAULT_COMMAND !== commandId) return;
		process.stdout.write(`${JSON.stringify({ event: "barrier", name, commandId })}\n`);
		// Controlled tests may release an admitted operation to observe a cancellation race.
		yield* Effect.callback<void>((resume) => {
			const release = () => resume(Effect.void);
			process.once("SIGUSR2", release);
			return Effect.sync(() => {
				process.off("SIGUSR2", release);
			});
		});
	});
}
