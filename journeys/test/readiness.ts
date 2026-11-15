import type { ChildProcess } from "node:child_process";

export function serverAddress(
	child: ChildProcess,
	signal = AbortSignal.timeout(60_000),
): Promise<{ port: number }> {
	return new Promise((resolve, reject) => {
		function cleanup() {
			child.off("message", message);
			child.off("exit", exit);
			child.off("error", error);
			signal.removeEventListener("abort", abort);
		}
		function message(value: unknown) {
			if (
				typeof value !== "object" ||
				value === null ||
				!("port" in value) ||
				typeof value.port !== "number"
			)
				return;
			cleanup();
			resolve({ port: value.port });
		}
		function error(reason: unknown) {
			cleanup();
			reject(reason);
		}
		function exit(code: number | null, killed: string | null) {
			error(
				new Error(`Journey server exited before listening: ${code ?? killed}`),
			);
		}
		function abort() {
			error(signal.reason);
		}
		child.on("message", message);
		child.once("exit", exit);
		child.once("error", error);
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
	});
}
