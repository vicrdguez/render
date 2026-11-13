import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { openSubjects, request } from "tau-core";
import { openHost } from "tau-core/host";
import { extension } from "../src/index.ts";

test("an extension's commit opens a subject that the host answers", async () => {
	const host = await openHost([extension]);
	await host.harness.commit((tx) => request(tx, "demo:x"), ctx);
	assert.deepEqual(await host.harness.commit((tx) => openSubjects(tx), ctx), ["demo:x"]);
	assert.equal(await host.answer("demo:x"), "demo:x#1");
	await host.close();
});
