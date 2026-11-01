// Controlled fault injection for crash-recovery checks (.render/verify.md, Traps). Inert unless both variables are
// set: the host announces the barrier on stdout and stops there so a check can SIGKILL it at that exact point.
const barrier = process.env.RENDER_FAULT_BARRIER;
const command = process.env.RENDER_FAULT_COMMAND;

export async function faultBarrier(name: "before-commit" | "after-commit", commandId: string): Promise<void> {
	if (barrier !== name || command !== commandId) return;
	process.stdout.write(`${JSON.stringify({ event: "barrier", name, commandId })}\n`);
	await new Promise<never>(() => undefined);
}
