import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { serverAddress } from "./readiness.ts";

async function child(t: TestContext, source: string) {
	const root = await mkdtemp(join(tmpdir(), "tau-ready-"));
	const file = join(root, "child.mjs");
	await writeFile(file, source);
	const process = fork(file, { stdio: ["ignore", "ignore", "ignore", "ipc"] });
	t.after(async () => {
		process.kill("SIGKILL");
		await rm(root, { recursive: true, force: true });
	});
	return process;
}

test("journey readiness ignores a resumed model request before the listening address", async (t) => {
	const process = await child(
		t,
		`
process.on("message", () => process.send({port: 12345}));
process.send({id: 1, request: {messages: []}});
`,
	);
	const address = serverAddress(process);
	let resolved = false;
	void address.then(() => {
		resolved = true;
	});
	await new Promise<void>((resolve) =>
		process.once("message", () => resolve()),
	);
	assert.equal(resolved, false);
	process.send("listen");
	assert.deepEqual(await address, { port: 12345 });
	assert.equal(process.listenerCount("message"), 0);
	assert.equal(process.listenerCount("exit"), 0);
});

test("journey readiness fails when the child exits before listening", async (t) => {
	const process = await child(t, "process.exit(7);");
	await assert.rejects(serverAddress(process), /before listening.*7/);
});

test("journey readiness has a bound and removes its listeners on expiry", async (t) => {
	const process = await child(t, 'process.on("message", () => {});');
	const abort = new AbortController();
	const address = serverAddress(process, abort.signal);
	abort.abort(new Error("readiness deadline"));
	await assert.rejects(address, /readiness deadline/);
	assert.equal(process.listenerCount("message"), 0);
	assert.equal(process.listenerCount("exit"), 0);
});
