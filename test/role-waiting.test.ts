import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { test } from "node:test";

for (const mode of ["capacity", "parent", "load-restart"]) {
	test(`R10 ${mode}: waiting role work stays idle, responsive and resumes on committed changes`, { timeout: 60000 }, async () => {
		const child = spawn(process.execPath, ["test/support/role-wait-observations.ts", mode], {
			cwd: new URL("../", import.meta.url),
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		let data: string | undefined;
		child.stdout.on("data", (chunk) => {
			output += String(chunk);
			for (const line of output.split("\n")) {
				try {
					const event = JSON.parse(line);
					if (event.event === "owned-data") data = event.data;
				} catch {}
			}
		});
		child.stderr.on("data", (chunk) => {
			output += String(chunk);
		});
		// The reported bug starves this child's timers too. Bound it from a separate event loop.
		const deadline = setTimeout(() => child.kill("SIGKILL"), 50000);
		try {
			const code = await new Promise((resolve) => child.once("exit", resolve));
			assert.equal(code, 0, `waiting role work must not busy-commit or starve the host:\n${output}`);
			console.log(output.trim());
		} finally {
			clearTimeout(deadline);
			if (data) await rm(data, { recursive: true, force: true });
		}
	});
}
