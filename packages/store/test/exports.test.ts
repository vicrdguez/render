import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("the store exposes exactly the root, host, and testing entries", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	);
	assert.deepEqual(Object.keys(manifest.exports).sort(), [
		".",
		"./host",
		"./testing",
	]);
});

test("the root exports exactly the five extension functions", async () => {
	const root = await import("tau-store");
	assert.deepEqual(Object.keys(root).sort(), [
		"decision",
		"emit",
		"eventLog",
		"request",
		"withdraw",
	]);
	assert.equal("answer" in root, false);
});

test("the testing entry exports only fauxAnswer and the same openStore", async () => {
	const testing = await import("tau-store/testing");
	const host = await import("tau-store/host");
	assert.deepEqual(Object.keys(testing).sort(), ["fauxAnswer", "openStore"]);
	assert.equal("answer" in testing, false);
	assert.equal(testing.openStore, host.openStore);
});

test("the host entry exports openStore, answer, and watchOpen", async () => {
	const host = await import("tau-store/host");
	assert.deepEqual(Object.keys(host).sort(), [
		"answer",
		"openStore",
		"watchOpen",
	]);
});
