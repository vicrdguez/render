import assert from "node:assert/strict";
import { test } from "node:test";
import { modules } from "./extensions.js";
import { start } from "./helpers.js";

test("extensions and models describe what the server has", async () => {
	const s = await start({ modules });
	try {
		const listed = await s.call("extensions", {});
		assert.deepEqual(
			listed.body.result.items.map((e: { name: string; workflow: boolean }) => [
				e.name,
				e.workflow,
			]),
			[
				["search", false],
				["notes", false],
				["flow", true],
			],
		);
		assert.deepEqual(listed.body.result.items[0].schema, modules.search.options?.schema);
		assert.ok(!("schema" in listed.body.result.items[1]));
		const models = await s.call("models", {});
		assert.deepEqual(
			models.body.result.items.map((m: { model: string }) => m.model),
			["faux/a", "faux/b", "faux/c"],
		);
		assert.equal(typeof models.body.result.items[0].name, "string");
	} finally {
		await s.close();
	}
});

test("setOptions merges a patch, stores set keys only, and refuses at JSON pointers without writing", async () => {
	const s = await start({ modules });
	try {
		await s.call("bind", {
			project: "p",
			workdir: "/p",
			extensions: ["flow", "notes", "search"],
		});
		const set = (patch: object, extension = "flow") =>
			s.call("setOptions", { project: "p", extension, patch });
		const view = async () =>
			(await s.call("options", { project: "p" })).body.result.items;

		const before = await view();
		assert.deepEqual(
			before.map((i: { extension: string }) => i.extension),
			["flow", "search"],
		);
		assert.deepEqual(before[0].value, {});
		assert.ok(
			before[0].errors.some(
				(e: { path: string; keyword: string }) =>
					e.path === "/designer" || e.keyword === "required",
			),
		);

		assert.deepEqual((await set({ base: "trunk" })).body, {
			result: { value: { base: "trunk" } },
		});
		const badModel = await set({ designer: "faux/none" });
		assert.equal(badModel.status, 409);
		assert.equal(badModel.body.refused?.code, "bad_options");
		assert.ok(
			badModel.body.refused?.errors.some(
				(e: { path: string; keyword: string }) =>
					e.path === "/designer" && e.keyword === "format",
			),
		);
		const badKey = await set({ extra: 1 });
		assert.equal(badKey.body.refused?.code, "bad_options");
		assert.ok(
			badKey.body.refused?.errors.some(
				(e: { path: string }) => e.path === "/extra",
			),
		);
		assert.deepEqual((await view())[0].value, { base: "trunk" });

		assert.deepEqual((await set({ designer: "faux/a" })).body.result, {
			value: { base: "trunk", designer: "faux/a" },
		});
		assert.deepEqual((await set({ base: null })).body.result, {
			value: { designer: "faux/a" },
		});
		assert.deepEqual(
			(await set({ base: null })).body.result,
			{ value: { designer: "faux/a" } },
			"the same patch gives the same value",
		);
		const after = (await view())[0];
		assert.deepEqual(after.value, { designer: "faux/a" });
		assert.deepEqual(after.errors, []);

		const notes = await set({}, "notes");
		assert.equal(notes.status, 409);
		const absent = await s.call("setOptions", {
			project: "p",
			extension: "gone",
			patch: {},
		});
		assert.equal(absent.status, 409);
		assert.equal(absent.body.refused?.code, "extension_not_loaded");
		const project = await s.call("setOptions", {
			project: "nope",
			extension: "flow",
			patch: {},
		});
		assert.equal(project.body.refused?.code, "unknown_project");
	} finally {
		await s.close();
	}
});

test("a secret is replied as true and never as its value", async () => {
	const s = await start({ modules });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: ["search"] });
		const key = "sk-secret-0123456789";
		const set = await s.call("setOptions", {
			project: "p",
			extension: "search",
			patch: { apiKey: key },
		});
		assert.deepEqual(set.body, { result: { value: { apiKey: true } } });
		const refused = await s.call("setOptions", {
			project: "p",
			extension: "search",
			patch: { provider: 3 },
		});
		assert.equal(refused.body.refused?.code, "bad_options");
		const options = await s.call("options", { project: "p" });
		assert.deepEqual(options.body.result.items[0].value, { apiKey: true });
		for (const reply of [set, refused, options]) {
			assert.ok(!JSON.stringify(reply.body).includes(key));
		}
		const restarted = await s.restart();
		try {
			const again = await restarted.call("options", { project: "p" });
			assert.deepEqual(again.body.result.items[0].value, { apiKey: true });
		} finally {
			await restarted.close();
		}
	} finally {
		await s.close().catch(() => {});
	}
});
