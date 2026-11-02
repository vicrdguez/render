// Controlled fault injection for crash-recovery checks (.render/verify.md, Traps). Inert unless both variables are
// set: the host announces the barrier on stdout and stops there so a check can SIGKILL it at that exact point.
export async function faultBarrier(
	name:
		| "before-commit"
		| "after-commit"
		| "before-source-root"
		| "after-source-root"
		| "after-sandbox-stop"
		| "package-snapshot"
		| "package-publish"
		| "repair-before-commit"
		| "repair-after-commit"
		| "offhost-before-publish"
		| "offhost-after-publish",
	commandId: string,
): Promise<void> {
	if (process.env.RENDER_FAULT_BARRIER !== name || process.env.RENDER_FAULT_COMMAND !== commandId) return;
	process.stdout.write(`${JSON.stringify({ event: "barrier", name, commandId })}\n`);
	// Controlled tests may release an admitted operation to observe a cancellation race.
	await new Promise<void>((resolve) => process.once("SIGUSR2", resolve));
}
