import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { sourceFixture } from "./support/source.ts";

test("E12 cancellation during sealing holds capacity and preserves unaccepted exact source", { timeout: 20000 }, async () => {
	const source = await sourceFixture({ "fixture.txt": { text: "fixed input" } });
	const child = spawn(
		process.execPath,
		["test/support/experiment-crash-worker.ts", join(source.root, "data"), "cancel", source.repo, source.commit, source.profile.image],
		{ cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "pipe"] },
	);
	let output = "";
	let errors = "";
	child.stdout.on("data", (chunk) => {
		output += String(chunk);
	});
	child.stderr.on("data", (chunk) => {
		errors += String(chunk);
	});
	async function until(text: string) {
		for (let i = 0; i < 1000 && !output.includes(text); i++) {
			assert.equal(child.exitCode, null, errors);
			await setTimeout(10);
		}
		assert.ok(output.includes(text), `${text}: ${errors}`);
	}
	try {
		await until('"event":"barrier"');
		child.kill("SIGUSR1");
		await until('"event":"cancel-observed"');
		const observed = output
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line))
			.find((value) => value.event === "cancel-observed");
		assert.equal(observed.executing, true, "sealing effects must settle before capacity release");
		child.kill("SIGUSR2");
		assert.equal(await new Promise((resolve) => child.once("exit", resolve)), 0, errors);
		assert.deepEqual(JSON.parse(output.trim().split("\n").at(-1)!), { canceled: true, retained: true });
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await new Promise((resolve) => child.once("exit", resolve));
		}
		await source.close();
	}
});
