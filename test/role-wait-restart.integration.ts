import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

for (const mode of ["capacity", "parent"]) {
	test(`R11 ${mode}: ordinary waits survive eight unclean terminations and remain resolvable`, { timeout: 60000 }, async () => {
		const data = await mkdtemp(join(tmpdir(), "render-wait-restart-"));
		async function run(action: string) {
			const child = spawn(process.execPath, ["test/support/role-wait-restart-worker.ts", data, mode, action], {
				cwd: new URL("../", import.meta.url),
				stdio: ["ignore", "pipe", "pipe"],
			});
			let output = "";
			let waiting = false;
			child.stdout.on("data", (chunk) => {
				output += String(chunk);
				if (
					output.split("\n").some((line) => {
						try {
							return JSON.parse(line).event === "waiting";
						} catch {
							return false;
						}
					})
				) {
					waiting = true;
					if (action !== "resolve") child.kill("SIGKILL");
				}
			});
			child.stderr.on("data", (chunk) => {
				output += String(chunk);
			});
			const deadline = setTimeout(() => child.kill("SIGKILL"), 15000);
			try {
				const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
					child.once("exit", (code, signal) => resolve({ code, signal })),
				);
				assert.ok(waiting, `startup must accept retained ordinary waits, not unsupported_definitions or restart_limit:\n${output}`);
				if (action === "resolve") {
					assert.equal(result.code, 0, output);
					assert.ok(output.includes('"event":"resolved"'), output);
				} else assert.equal(result.signal, "SIGKILL", output);
				console.log(output.trim());
			} finally {
				clearTimeout(deadline);
			}
		}
		try {
			await run("seed");
			for (let crash = 1; crash < 8; crash++) await run(`reopen:${crash}`);
			await run("resolve");
		} finally {
			await rm(data, { recursive: true, force: true });
		}
	});
}
