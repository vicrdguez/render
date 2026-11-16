import assert from "node:assert/strict";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fromDirectory } from "tau/server";
import { extensionSource } from "./extensions.ts";
import { journey } from "./journey.ts";

test("the directory loader reports a repeated extension folder instead of importing it twice", async () => {
	const j = await journey();
	try {
		await symlink(extensionSource("w2"), join(j.home, "extensions", "w2-copy"));
		const loaded = await fromDirectory(join(j.home, "extensions"))();
		assert.deepEqual(Object.keys(loaded.modules), ["w1", "w2", "webkit"]);
		assert.equal(loaded.failures.length, 1);
		assert.equal(loaded.failures[0]?.name, "w2-copy");
		assert.match(String(loaded.failures[0]?.error), /same folder as w2/);
	} finally {
		await j.close();
	}
});

test("extensions reports the name, workflow flag and options schema of every real directory entry", async () => {
	const j = await journey();
	try {
		const model = { type: "string", format: "model" };
		const items = (await j.ok("extensions", {})).items.sort(
			(a: { name: string }, b: { name: string }) =>
				a.name.localeCompare(b.name),
		);
		const webkit = items.pop();
		assert.equal(webkit.name, "webkit");
		assert.equal(webkit.workflow, false);
		assert.equal(webkit.schema.type, "object");
		assert.equal(webkit.schema.additionalProperties, false);
		assert.equal(webkit.schema.properties.provider.default, "auto");
		for (const key of ["exaApiKey", "tavilyApiKey", "proxy"])
			assert.equal(webkit.schema.properties[key].format, "secret");
		assert.deepEqual(items, [
			{
				name: "w1",
				workflow: true,
				schema: {
					type: "object",
					properties: {
						designer: model,
						implementer: model,
						reviewer: model,
						base: { type: "string", minLength: 1, default: "main" },
					},
					required: ["designer", "implementer", "reviewer", "base"],
					additionalProperties: false,
				},
			},
			{
				name: "w2",
				workflow: true,
				schema: {
					type: "object",
					properties: { model },
					required: ["model"],
					additionalProperties: false,
				},
			},
		]);
	} finally {
		await j.close();
	}
});
