import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Sandboxes } from "../src/sandboxes/sandboxes.ts";
import { sourceFixture } from "./support/source.ts";

test("whole-container-quiescence: seal stops background writers and fences new execute", async () => {
	const f = await sourceFixture();
	let handle: Awaited<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const source = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		handle = await f.sandboxes.prepare(f.scope, f.profile, source);
		const run = await f.sandboxes.execute(handle, {
			scope: f.scope,
			argv: ["sh", "-c", "(trap '' TERM; while :; do echo child >> child.txt; sleep 0.01; done) >/dev/null 2>&1 & echo admitted"],
			timeoutMs: 10000,
		});
		assert.equal(run.exitCode, 0);
		const sealing = f.sandboxes.seal(handle);
		await assert.rejects(
			f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", "echo restarted"], timeoutMs: 10000 }),
			/seal|froz|closed/i,
		);
		const capture = await sealing;
		assert.equal(capture.freeze.running, false);
		assert.equal(capture.freeze.scope.generation, 1);
		assert.equal(capture.freeze.runtime, handle.runtime);
		assert.ok(capture.entries.some((e) => e.path === "child.txt"));
		assert.equal(
			execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", handle.runtime], { encoding: "utf8" }).trim(),
			"false",
		);
		assert.deepEqual(await f.sandboxes.seal(handle), capture, "sealing is repeatable without restarting writers");
	} finally {
		if (handle) await f.sandboxes.stop(handle).catch(() => {});
		await f.close();
	}
});

test("whole-container-quiescence: missing runtime quarantines durably and cannot collect/reuse", async () => {
	const f = await sourceFixture();
	let handle: Awaited<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const source = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		handle = await f.sandboxes.prepare(f.scope, f.profile, source);
		execFileSync("docker", ["rm", "-f", handle.runtime]);
		await assert.rejects(f.sandboxes.seal(handle), /quarant|inspect/i);
		const retained = JSON.parse(await readFile(join(f.root, "sandboxes", handle.id, "state.json"), "utf8"));
		assert.equal(retained.phase, "quarantined");
		const recovered = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		await assert.rejects(recovered.seal(handle), /quarant/i);
		await assert.rejects(recovered.prepare(f.scope, f.profile, source), /reuse|exist|quarant/i);
	} finally {
		await f.close();
	}
});
