import assert from "node:assert/strict";
import { test } from "node:test";
import { journey } from "./journey.js";

test("extensions reports the name, workflow flag and options schema of every real import-map entry", async () => {
	const j = await journey();
	try {
		const model = { type: "string", format: "model" };
		assert.deepEqual(
			(await j.ok("extensions", {})).items.sort((a: any, b: any) =>
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
