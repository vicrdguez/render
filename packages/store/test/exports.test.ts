import assert from "node:assert/strict";
import { test } from "node:test";

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

test("the host entry exports openStore, answer, and watchOpen", async () => {
	const host = await import("tau-store/host");
	assert.deepEqual(Object.keys(host).sort(), [
		"answer",
		"openStore",
		"watchOpen",
	]);
});
