import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { WebkitError } from "./domain.ts";

const STDERR_BYTES = 8192;

export function nativeTool(name: "git" | "curl"): string {
	const tools: unknown = JSON.parse(
		readFileSync(new URL("./native-tools.json", import.meta.url), "utf8"),
	);
	const path =
		typeof tools === "object" && tools !== null
			? (tools as Record<string, unknown>)[name]
			: undefined;
	if (typeof path !== "string" || path === "")
		throw new WebkitError(
			"config",
			`native-tools.json does not declare ${name}.`,
		);
	return path;
}

function stopped(signal: AbortSignal): WebkitError {
	return signal.reason instanceof WebkitError
		? signal.reason
		: new WebkitError("cancelled", "The command was cancelled.");
}

export function runNative(
	command: string,
	args: readonly string[],
	options: {
		signal: AbortSignal;
		maxBytes: number;
		cwd?: string;
		env?: Record<string, string | undefined>;
	},
): Promise<{ stdout: Uint8Array; stderr: string; status: number }> {
	const { signal, maxBytes } = options;
	if (signal.aborted) return Promise.reject(stopped(signal));
	return new Promise((resolve, reject) => {
		// A separate process group lets cancellation kill helpers (git-remote-https, index-pack) that hold our pipes open.
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: { ...process.env, ...options.env },
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let failure: WebkitError | undefined;
		const stop = (error: WebkitError) => {
			failure ??= error;
			try {
				if (child.pid) process.kill(-child.pid, "SIGKILL");
			} catch {}
		};
		const onAbort = () => stop(stopped(signal));
		signal.addEventListener("abort", onAbort, { once: true });
		child.stdout.on("data", (chunk: Buffer) => {
			stdoutBytes += chunk.byteLength;
			if (stdoutBytes > maxBytes)
				stop(
					new WebkitError(
						"invalid-response",
						`The command output exceeded ${maxBytes} bytes.`,
					),
				);
			else stdout.push(chunk);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			if (stderrBytes >= STDERR_BYTES) return;
			const kept = chunk.subarray(0, STDERR_BYTES - stderrBytes);
			stderr.push(kept);
			stderrBytes += kept.byteLength;
		});
		child.once("error", (error: NodeJS.ErrnoException) => {
			signal.removeEventListener("abort", onAbort);
			reject(
				failure ??
					new WebkitError(
						"config",
						`${command} could not be started (${error.code ?? "unknown error"}).`,
					),
			);
		});
		child.once("close", (code) => {
			signal.removeEventListener("abort", onAbort);
			if (failure) return reject(failure);
			const bytes = new Uint8Array(stdoutBytes);
			let offset = 0;
			for (const chunk of stdout) {
				bytes.set(chunk, offset);
				offset += chunk.byteLength;
			}
			resolve({
				stdout: bytes,
				stderr: Buffer.concat(stderr).toString("utf8"),
				status: code ?? -1,
			});
		});
	});
}
