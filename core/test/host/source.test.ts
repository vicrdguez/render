import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { defineExtension } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { Flow, modules, Notes, WEEK } from "./extensions.js";
import { newHome, start, until } from "./helpers.js";

const valid = { extension: Notes };
const options = {
	schema: obj({}),
	get: async () => ({}),
	set: async () => {},
};
const refusals: [string, string, unknown, string][] = [
	[
		"a name outside the extension grammar",
		"Bad",
		{ extension: { name: "Bad" } },
		"shape",
	],
	[
		"the reserved coding-tools name",
		"coding-tools",
		{ extension: { name: "coding-tools" } },
		"shape",
	],
	[
		"the reserved codemode name",
		"codemode",
		{ extension: { name: "codemode" } },
		"shape",
	],
	["a missing extension export", "notes", {}, "shape"],
	["a null extension", "notes", { extension: null }, "shape"],
	["an array extension", "notes", { extension: [] }, "shape"],
	["null options", "notes", { ...valid, options: null }, "shape"],
	["array options", "notes", { ...valid, options: [] }, "shape"],
	[
		"options without a schema",
		"notes",
		{ ...valid, options: { ...options, schema: undefined } },
		"shape",
	],
	[
		"options without callable get",
		"notes",
		{ ...valid, options: { ...options, get: false } },
		"shape",
	],
	[
		"options without callable set",
		"notes",
		{ ...valid, options: { ...options, set: false } },
		"shape",
	],
	[
		"a non-object options schema",
		"notes",
		{ ...valid, options: { ...options, schema: { type: "string" } } },
		"shape",
	],
	[
		"an open options schema",
		"notes",
		{ ...valid, options: { ...options, schema: { type: "object" } } },
		"shape",
	],
	[
		"an options schema that cannot compile",
		"notes",
		{
			...valid,
			options: {
				...options,
				schema: {
					type: "object",
					additionalProperties: false,
					properties: { x: 3 },
				},
			},
		},
		"options",
	],
	["a scalar entry", "notes", { ...valid, entry: 1 }, "shape"],
	["a null entry", "notes", { ...valid, entry: null }, "shape"],
	["an array entry", "notes", { ...valid, entry: [] }, "shape"],
	[
		"a shared task name",
		"other",
		{ extension: { ...Flow, name: "other" } },
		"install",
	],
	[
		"duplicate tools in one extension",
		"notes",
		{ extension: { ...Notes, tools: [...Notes.tools!, ...Notes.tools!] } },
		"install",
	],
	[
		"a reserved section key",
		"notes",
		{ extension: { ...Notes, sections: [{ key: "instructions" }] } },
		"install",
	],
];

for (const [what, name, module, stage] of refusals) {
	test(`startup reports and leaves out ${what}`, async (t) => {
		const stderr: string[] = [];
		t.mock.method(process.stderr, "write", (chunk: string) => {
			stderr.push(String(chunk));
			return true;
		});
		const s = await start({
			source: () => ({
				modules: { flow: modules.flow, [name]: module },
				failures: [],
			}),
		});
		try {
			const reply = await s.call("bind", {
				project: "p",
				workdir: s.home,
				extensions: ["flow", name],
			});
			assert.equal(reply.status, 200);
			assert.deepEqual(reply.body.result.project.missing, [name]);
			assert.deepEqual(
				(await s.call("extensions", {})).body.result.items.map(
					(item: { name: string }) => item.name,
				),
				["flow"],
			);
			assert.equal(stderr.length, 1);
			assert.ok(stderr[0]?.includes(name), JSON.stringify(stderr));
			assert.ok(stderr[0]?.includes(stage), JSON.stringify(stderr));
			assert.match(stderr[0] ?? "", /: .+\n$/);
		} finally {
			await s.close();
		}
	});
}

test("a shared task name names the module that kept it and the one left out", async (t) => {
	const stderr: string[] = [];
	t.mock.method(process.stderr, "write", (chunk: string) => {
		stderr.push(String(chunk));
		return true;
	});
	const tasks = (Flow.tasks ?? []).filter(
		(task) => task.definition.name === "flow.due",
	);
	const s = await start({
		source: () => ({
			modules: {
				alpha: { extension: { name: "alpha", tasks } },
				beta: { extension: { name: "beta", tasks } },
			},
			failures: [],
		}),
	});
	try {
		assert.deepEqual(
			(await s.call("extensions", {})).body.result.items.map(
				(item: { name: string }) => item.name,
			),
			["alpha"],
		);
		assert.equal(stderr.length, 1);
		assert.match(
			stderr[0] ?? "",
			/^tau: extension beta \[install\]: .*flow\.due.*\balpha\b/,
		);
	} finally {
		await s.close();
	}
});

test("startup calls an async source once and reports its failures once", async (t) => {
	const stderr: string[] = [];
	t.mock.method(process.stderr, "write", (chunk: string) => {
		stderr.push(String(chunk));
		return true;
	});
	let scans = 0;
	const home = await newHome();
	const file = path.join(home, "gone", "index.ts");
	const s = await start({
		home,
		source: async () => {
			scans++;
			return {
				modules: { notes: valid },
				failures: [
					{
						name: "gone",
						path: file,
						stage: "import",
						error: new Error("broken import\nprivate stack"),
					},
				],
			};
		},
	});
	try {
		assert.equal(scans, 1);
		for (let i = 0; i < 2; i++) {
			const reply = await s.call("bind", {
				project: "p",
				workdir: s.home,
				extensions: ["notes", "gone"],
			});
			assert.equal(reply.status, 200);
			assert.deepEqual(reply.body.result.project.missing, ["gone"]);
		}
		assert.equal(scans, 1);
		assert.deepEqual(stderr, [
			`tau: extension gone ${file} [import]: broken import\n`,
		]);
	} finally {
		await s.close();
	}
});

test("startup checks do not execute entry, get, set, or migrations", async () => {
	const called = () => {
		throw new Error("validation executed author code");
	};
	const extension = {
		...Flow,
		tasks: Flow.tasks!.map((task) => ({
			...task,
			definition: { ...task.definition, migrate: called },
		})),
	};
	const s = await start({
		source: () => ({
			modules: {
				flow: {
					extension,
					entry: called,
					options: { ...options, get: called, set: called },
				},
				notes: { ...valid, entry: {} },
			},
			failures: [],
		}),
	});
	try {
		assert.deepEqual(
			(await s.call("extensions", {})).body.result.items.map(
				(item: { name: string }) => item.name,
			),
			["flow", "notes"],
		);
		assert.equal(
			(
				await s.call("bind", {
					project: "p",
					workdir: s.home,
					extensions: ["flow", "notes"],
				})
			).status,
			200,
		);
	} finally {
		await s.close();
	}
});

test("a task of a broken extension waits and runs after restart with good code", async (t) => {
	let clock = Date.UTC(2026, 10, 14);
	const s = await start({
		source: () => ({ modules, failures: [] }),
		now: () => clock,
	});
	t.after(() => s.close());
	await s.call("bind", { project: "p", workdir: s.home, extensions: ["flow"] });
	await s.call("setOptions", {
		project: "p",
		extension: "flow",
		patch: { designer: "faux/a" },
	});
	const conversation = (
		await s.call("create", { project: "p", workflow: "flow" })
	).body.result.conversation;
	s.faux.setResponses([
		fauxAssistantMessage([fauxToolCall("schedule", {})], {
			stopReason: "toolUse",
		}),
		fauxAssistantMessage("Scheduled."),
	]);
	await s.call("input", {
		project: "p",
		conversation,
		text: "Schedule.",
		requestId: "schedule",
	});
	await until("the timer sleeps", async () =>
		JSON.stringify(
			(await s.call("history", { project: "p", conversation })).body,
		).includes("Scheduled."),
	);
	clock += WEEK + 1;
	const stderr: string[] = [];
	t.mock.method(process.stderr, "write", (chunk: string) => {
		stderr.push(String(chunk));
		return true;
	});
	const broken = await s.restart({
		source: () => ({
			modules: { flow: { extension: { ...Flow, name: "wrong" } } },
			failures: [],
		}),
	});
	t.after(() => broken.close());
	assert.deepEqual(
		(await broken.call("projects", {})).body.result.items[0].missing,
		["flow"],
	);
	assert.equal(stderr.length, 1);
	const history = () => broken.call("history", { project: "p", conversation });
	assert.ok(
		!(await history()).body.result.items.some(
			(e: { kind: string }) => e.kind === "flow.woke",
		),
	);
	await broken.close();
	const ready = await s.restart();
	t.after(() => ready.close());
	await until("the restored task wakes", async () =>
		(
			await ready.call("history", { project: "p", conversation })
		).body.result.items.some((e: { kind: string }) => e.kind === "flow.woke"),
	);
});

test("cross-extension tool collisions use the last Project selection without a warning", async (t) => {
	const stderr: string[] = [];
	t.mock.method(process.stderr, "write", (chunk: string) => {
		stderr.push(String(chunk));
		return true;
	});
	const tool = Notes.tools![0]!;
	const s = await start({
		source: () => ({
			modules: {
				notes: valid,
				other: {
					extension: defineExtension({
						name: "other",
						tools: [
							{
								...tool,
								execute: async () => ({
									output: [{ type: "text", text: "other won" }],
								}),
							},
						],
					}),
				},
			},
			failures: [],
		}),
	});
	try {
		for (const [project, extensions, expected] of [
			["p", ["notes", "other"], "other won"],
			["q", ["other", "notes"], "noted"],
		] as const) {
			await s.call("bind", { project, workdir: s.home, extensions });
			const conversation = (
				await s.call("create", { project, model: "faux/a" })
			).body.result.conversation;
			s.faux.setResponses([
				fauxAssistantMessage([fauxToolCall("note", {})], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage("Done."),
			]);
			await s.call("input", {
				project,
				conversation,
				text: "Note.",
				requestId: "note",
			});
			await until("the selected tool finishes", async () =>
				JSON.stringify(
					(await s.call("history", { project, conversation })).body,
				).includes(expected),
			);
		}
		assert.deepEqual(stderr, []);
	} finally {
		await s.close();
	}
});
