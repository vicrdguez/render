/**
 * The boundary between an extension and the core, as a test (docs/core/primitives.md, "How an extension reaches the
 * core"). `tau-core` exports exactly five functions. Adding `answer` or anything else to src/index.ts fails here.
 * Runs in unit 1, and in unit 2 with the `./host` entry.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

test("tau-core exports exactly request, withdraw, emit, decision, and eventLog", async () => {
	const api = await import("tau-core");
	assert.deepEqual(Object.keys(api).sort(), ["decision", "emit", "eventLog", "request", "withdraw"]);
});

test("tau-core/host exports the composition root's surface and no store function", async () => {
	const host = await import("tau-core/host");
	assert.deepEqual(Object.keys(host).sort(), ["DEFAULT_PORT", "callNames", "deviceId", "main", "openHost"]);
});
