import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Sandboxes } from "../src/sandboxes/sandboxes.ts";
import { sourceFixture } from "./support/source.ts";

test("whole-container-quiescence: seal stops background writers and fences new execute", async () => {
	const f = await sourceFixture();
	let handle: Effect.Success<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const source = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, source));
		const run = await Effect.runPromise(
			f.sandboxes.execute(handle, {
				scope: f.scope,
				argv: ["sh", "-c", "(trap '' TERM; while :; do echo child >> child.txt; sleep 0.01; done) >/dev/null 2>&1 & echo admitted"],
				timeoutMs: 10000,
			}),
		);
		assert.equal(run.exitCode, 0);
		const sealing = Effect.runPromise(f.sandboxes.seal(handle));
		await assert.rejects(
			Effect.runPromise(f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", "echo restarted"], timeoutMs: 10000 })),
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
		assert.deepEqual(await Effect.runPromise(f.sandboxes.seal(handle)), capture, "sealing is repeatable without restarting writers");
	} finally {
		if (handle) await Effect.runPromise(f.sandboxes.stop(handle)).catch(() => {});
		await f.close();
	}
});

test("whole-container-quiescence: missing runtime quarantines durably and cannot collect/reuse", async () => {
	const f = await sourceFixture();
	let handle: Effect.Success<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const source = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, source));
		execFileSync("docker", ["rm", "-f", handle.runtime]);
		await assert.rejects(Effect.runPromise(f.sandboxes.seal(handle)), /quarant|inspect/i);
		const retained = JSON.parse(await readFile(join(f.root, "sandboxes", handle.id, "state.json"), "utf8"));
		assert.equal(retained.phase, "quarantined");
		const recovered = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		await assert.rejects(Effect.runPromise(recovered.seal(handle)), /quarant/i);
		await assert.rejects(Effect.runPromise(recovered.prepare(f.scope, f.profile, source)), /reuse|exist|quarant/i);
	} finally {
		await f.close();
	}
});

for (const journal of ["missing", "legacy"] as const)
	test(`whole-container-quiescence: ${journal} journal never proves runtime absence`, async () => {
		const f = await sourceFixture();
		try {
			const source = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
			const handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, source));
			execFileSync("docker", ["rm", "-f", handle.runtime]);
			const path = join(f.root, "sandboxes", handle.id, "state.json");
			if (journal === "missing") await rm(path);
			else {
				const state = JSON.parse(await readFile(path, "utf8"));
				delete state.createIssued;
				await writeFile(path, JSON.stringify(state));
			}
			const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
			await assert.rejects(Effect.runPromise(reopened.stop(handle)), journal === "missing" ? /ENOENT/ : /quarant|inspect/i);
			await assert.rejects(Effect.runPromise(reopened.prepare(f.scope, f.profile, source)), /reuse|exist/i);
		} finally {
			await f.close();
		}
	});

for (const trigger of ["absent image", "canceled preparation"] as const)
	test(`whole-container-quiescence: ${trigger} confirms no runtime without allowing workspace reuse`, async () => {
		const f = await sourceFixture();
		try {
			const source = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
			const profile = trigger === "absent image" ? { ...f.profile, image: `sha256:${"0".repeat(64)}` } : f.profile;
			const preparing = Effect.runPromise(f.sandboxes.prepare(f.scope, profile, source));
			const rejected = assert.rejects(preparing, trigger === "absent image" ? /image.*failed/i : /fenced before create/i);
			if (trigger === "canceled preparation") {
				const stopped = await Effect.runPromise(f.sandboxes.stop({ scope: f.scope }));
				assert.equal(stopped.running, false);
				assert.deepEqual(stopped.executions, []);
			}
			await rejected;
			const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
			const stopped = await Effect.runPromise(reopened.stop({ scope: f.scope }));
			assert.equal(stopped.running, false);
			assert.deepEqual(stopped.executions, []);
			assert.equal(stopped.source.commit, f.commit);
			await assert.rejects(Effect.runPromise(reopened.prepare(f.scope, f.profile, source)), /reuse|exist/i);
			await assert.rejects(Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, source)), /reuse|exist/i);
		} finally {
			await f.close();
		}
	});
