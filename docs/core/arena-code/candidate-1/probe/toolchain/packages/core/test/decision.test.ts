import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { openHost } from "../src/host/index.ts";
import { request } from "../src/store/decision.ts";

test("a request opens a subject and the host answers it once", async () => {
	const host = await openHost([]);
	await host.harness.commit((tx) => request(tx, "probe:1"), ctx);
	assert.equal(await host.answer("probe:1"), "probe:1#1");
	assert.equal(await host.answer("probe:1"), undefined);
	await host.close();
});
