// R02/R05/R06/R08: real runtime/provider admissions and SQLite recovery, including process death.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

test("R05/R06/R08 Engine capacity, quarantined late evidence and safe startup ordering", { timeout: 30000 }, async (t) => {
	const child = spawn(process.execPath, ["test/support/role-recovery-observations.mjs"], {
		cwd: new URL("../", import.meta.url),
		stdio: ["ignore", "pipe", "pipe"],
	});
	t.after(() => {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	});
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += String(chunk);
	});
	child.stderr.on("data", (chunk) => {
		output += String(chunk);
	});
	const code = await new Promise((resolve) => child.once("exit", resolve));
	assert.equal(code, 0, output);
	console.log(output.trim());
});
