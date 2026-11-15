import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the core exposes exactly the root, server, and testing entries", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
	);
	assert.deepEqual(Object.keys(manifest.exports).sort(), [
		".",
		"./server",
		"./testing",
	]);
});

test("the root exports exactly the five extension functions", async () => {
	const root = await import("tau");
	assert.deepEqual(Object.keys(root).sort(), [
		"decision",
		"emit",
		"eventLog",
		"request",
		"withdraw",
	]);
	assert.equal("answer" in root, false);
});

test("the testing entry exports only fauxAnswer and openStore", async () => {
	const testing = await import("tau/testing");
	assert.deepEqual(Object.keys(testing).sort(), ["fauxAnswer", "openStore"]);
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
		await assert.rejects(import(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
	}
});
