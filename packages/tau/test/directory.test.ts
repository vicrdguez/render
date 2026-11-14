import assert from "node:assert/strict";
import { test } from "node:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";
import { fromDirectory } from "tau-host";
import { extensionSource } from "./extensions.js";
import { journey } from "./journey.js";

test("the directory loader reports a repeated extension folder instead of importing it twice", async () => {
	const j = await journey();
	try {
		await symlink(extensionSource("w2"), join(j.home, "extensions", "w2-copy"));
		const loaded = await fromDirectory(join(j.home, "extensions"))();
		assert.deepEqual(Object.keys(loaded.modules), ["w1", "w2", "websearch"]);
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
		assert.deepEqual(
			(await j.ok("extensions", {})).items.sort(
				(a: { name: string }, b: { name: string }) =>
					a.name.localeCompare(b.name),
			),
			[
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
				{
					name: "websearch",
					workflow: false,
					schema: {
						type: "object",
						properties: {
							provider: { enum: ["exa", "tavily"] },
							apiKey: { type: "string", format: "secret", minLength: 1 },
						},
						required: ["provider", "apiKey"],
						additionalProperties: false,
					},
				},
			],
		);
	} finally {
		await j.close();
	}
});
