import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

export async function serverAddress(child: ChildProcess, signal = AbortSignal.timeout(60_000)): Promise<{ port: number }> {
	return Promise.race([
		once(child, "message", { signal }).then(([message]) => message),
		once(child, "exit", { signal }).then(([code]) => { throw new Error(`Journey server exited before listening: ${code}`); }),
	]);
}
