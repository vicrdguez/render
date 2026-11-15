import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the core exposes exactly the six tau entries", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
	);
	assert.deepEqual(Object.keys(manifest.exports).sort(), [
		".",
		"./chord",
		"./durable",
		"./schema",
		"./server",
		"./testing",
	]);
});

test("the root exports exactly the five extension functions and four helpers", async () => {
	const root = await import("tau");
	assert.deepEqual(Object.keys(root).sort(), [
		"decision",
		"emit",
		"eventLog",
		"modelRef",
		"options",
		"prose",
		"request",
		"role",
		"withdraw",
	]);
	assert.equal("answer" in root, false);
});

test("the testing entry exports fauxAnswer, openStore, and the pi-ai test names", async () => {
	const testing = await import("tau/testing");
	assert.deepEqual(Object.keys(testing).sort(), [
		"createModels", "fauxAnswer", "fauxAssistantMessage", "fauxProvider", "fauxText", "fauxToolCall", "openStore",
	]);
	assert.equal("answer" in testing, false);
});

test("the server entry exports only startServer, fromDirectory, and requestAdmin", async () => {
	const server = await import("tau/server");
	assert.deepEqual(Object.keys(server).sort(), [
		"fromDirectory",
		"requestAdmin",
		"startServer",
	]);
	assert.equal("answer" in server, false);
	assert.equal("openStore" in server, false);
	for (const specifier of ["tau/host", "tau/dist/src/store/decisions.js"]) {
		const result = spawnSync(
			process.execPath,
			[
				"--input-type=module",
				"--eval",
				`await import(${JSON.stringify(specifier)})`,
			],
			{ encoding: "utf8", cwd: import.meta.dirname },
		);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/);
	}
});
