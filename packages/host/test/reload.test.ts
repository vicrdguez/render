import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type TestContext, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import {
	type ConversationId,
	defineDoc,
	defineExtension,
	defineTask,
	defineTool,
	type JsonObject,
	type Tx,
} from "@earendil-works/pi-durable";
import { type JsonSchema, obj, str } from "@earendil-works/pi-schema";
import { calls } from "../src/calls.js";
import type { ExtensionScan } from "../src/extensions.js";
import type { ExtensionModule } from "../src/index.js";
import { Projects } from "../src/projects.js";
import { newHome, type Running, start, until } from "./helpers.js";

function latch() {
	let release = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

const reload = async (s: Running) => {
	const report = await s.server.reload();
	return "result" in report
		? { ...report, refused: undefined }
		: { ...report, result: undefined };
};

const Doc = defineDoc<JsonObject>({
	kind: "reload.options",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});
const contract = (schema: JsonSchema = obj({ label: str() })) => ({
	schema,
	get: async (tx: Tx): Promise<JsonObject> =>
		JSON.parse(JSON.stringify(await tx.doc(Doc))),
	set: async (tx: Tx, value: JsonObject) => {
		const doc = await tx.doc(Doc);
		for (const key of Object.keys(doc)) delete doc[key];
		Object.assign(doc, value);
	},
});
const done = {
	status: "terminal" as const,
	outcome: { status: "completed" as const, result: null },
};
function version(
	label: string,
	version = 1,
	phases = ["first", "next", "sleep"],
	held = latch(),
) {
	const entered = latch();
	const task = defineTask<{ mode: string }, { phase: string }, null>({
		name: "demo.task",
		version,
		initial: (input) => ({ phase: input.mode }),
		abort: async (_task, runtime, c) => {
			await runtime.commit(
				() => ({
					status: "terminal",
					outcome: { status: "aborted", reason: "test" },
				}),
				c,
			);
		},
		phases: Object.fromEntries(
			phases.map((phase) => [
				phase,
				async (task, runtime, c) => {
					if (phase === "first") {
						entered.release();
						await held.promise;
						await runtime.commit(
							() => ({ status: "running", checkpoint: { phase: "next" } }),
							c,
						);
					} else if (phase === "sleep") {
						await runtime.sleepUntil(
							runtime.now() + 1000,
							{ phase: "next" },
							c,
						);
					} else
						await runtime.commit(async (tx) => {
							await tx.appendEntry(task.conversationId, {
								kind: "reload.ran",
								data: { label },
							});
							return done;
						}, c);
				},
			]),
		),
	});
	const extension = defineExtension({
		name: "demo",
		tasks: [task],
		tools: [
			defineTool({
				name: "demo_tool",
				description: label,
				parameters: obj({}),
				execute: async () => {
					entered.release();
					await held.promise;
					return { output: [{ type: "text", text: label }] };
				},
			}),
		],
	});
	return {
		module: { extension, options: contract() } satisfies ExtensionModule,
		task,
		entered,
		held,
	};
}
const bind = (s: Running, project = "p", extensions = ["demo"]) =>
	s.call("bind", { project, workdir: `/${project}`, extensions });
const patch = (s: Running, value: unknown) =>
	s.call("setOptions", { project: "p", extension: "demo", patch: value });
const create = async (s: Running) =>
	(await s.call("create", { project: "p", model: "faux/a" })).body.result
		.conversation as ConversationId;
async function idle(s: Running) {
	await until("idle", async () =>
		(await s.call("conversations", { project: "p" })).body.result.items.every(
			(c: { state: string }) => c.state === "idle",
		),
	);
}
function capture(t: TestContext) {
	let projects!: Projects;
	const original = Projects.prototype.start;
	t.mock.method(Projects.prototype, "start", function (this: Projects) {
		projects = this;
		return original.call(this);
	});
	return () => projects;
}

const refusals: [
	string,
	(old: ReturnType<typeof version>) => ExtensionScan | never,
	string,
][] = [
	[
		"a dropped task kind",
		(old) => ({
			modules: {
				demo: { ...old.module, extension: defineExtension({ name: "demo" }) },
			},
			failures: [],
		}),
		"dropped task",
	],
	[
		"a lower task version",
		() => ({ modules: { demo: version("new", 1).module }, failures: [] }),
		"version",
	],
	[
		"a phase removed at the same version",
		() => ({
			modules: { demo: version("new", 2, ["next"]).module },
			failures: [],
		}),
		"phase",
	],
	[
		"a shared task name",
		(old) => ({
			modules: {
				other: {
					extension: defineExtension({ name: "other", tasks: [old.task] }),
				},
			},
			failures: [],
		}),
		"already installed",
	],
	[
		"a bad module shape",
		() => ({ modules: { demo: { extension: null } }, failures: [] }),
		"object",
	],
	[
		"an import failure",
		() => ({
			modules: {},
			failures: [
				{ name: "demo", stage: "import", error: new Error("import broke") },
			],
		}),
		"import broke",
	],
	[
		"a rejected scan",
		() => {
			throw new Error("scan broke");
		},
		"scan broke",
	],
];
for (const [cause, proposed, message] of refusals) {
	test(`reload refuses ${cause} without changing any project`, {
		timeout: 5000,
	}, async (t) => {
		const get = capture(t);
		const old = version("old", 2);
		old.held.release();
		let scan: () => ExtensionScan = () => ({
			modules: { demo: old.module },
			failures: [],
		});
		const s = await start({ source: () => scan() });
		try {
			await bind(s);
			await bind(s, "q");
			await patch(s, { label: "saved" });
			const beforeCatalogue = get().catalogue;
			const beforeRegistries = get()
				.all()
				.map((p) => p.registry.snapshot());
			const beforeOptions = (await s.call("options", { project: "p" })).body;
			const beforeExtensions = (await s.call("extensions", {})).body;
			scan = () => {
				const candidate = proposed(old);
				return {
					...candidate,
					modules: {
						fresh: { extension: defineExtension({ name: "fresh" }) },
						...candidate.modules,
					},
				};
			};
			const report = await reload(s);
			assert.equal(report.result?.status, "refused");
			assert.ok(
				report.result?.failures.some((f) => f.message.includes(message)),
				JSON.stringify(report),
			);
			assert.equal(get().catalogue, beforeCatalogue);
			get()
				.all()
				.forEach((p, i) => {
					assert.equal(p.registry.snapshot(), beforeRegistries[i]);
				});
			assert.deepEqual(
				(await s.call("options", { project: "p" })).body,
				beforeOptions,
			);
			assert.deepEqual((await s.call("extensions", {})).body, beforeExtensions);
			const conversation = await create(s);
			const descriptions: string[] = [];
			s.faux.setResponses([
				fauxAssistantMessage([fauxToolCall("demo_tool", {})], {
					stopReason: "toolUse",
				}),
				(input) => {
					descriptions.push(JSON.stringify(input.messages));
					return fauxAssistantMessage("done");
				},
			]);
			await s.call("input", {
				project: "p",
				conversation,
				text: "go",
				requestId: "old",
			});
			await idle(s);
			assert.match(descriptions[0] ?? "", /old/);
		} finally {
			await s.close();
		}
	});
}

test("reload replaces a tool while its old call completes and streams stay open", {
	timeout: 5000,
}, async (t) => {
	const get = capture(t);
	const old = version("old");
	const next = version("new");
	next.held.release();
	let current = old.module;
	const s = await start({
		source: () => ({ modules: { demo: current }, failures: [] }),
	});
	try {
		await bind(s);
		const openProject = get().get("p");
		const conversation = await create(s);
		const watch = s.watch("open", { project: "p", conversation });
		await watch.until((w) => w.value !== undefined);
		const outputs: string[] = [];
		s.faux.setResponses([
			fauxAssistantMessage([fauxToolCall("demo_tool", {})], {
				stopReason: "toolUse",
			}),
			(input) => {
				outputs.push(JSON.stringify(input.messages));
				return fauxAssistantMessage([fauxToolCall("demo_tool", {})], {
					stopReason: "toolUse",
				});
			},
			(input) => {
				outputs.push(JSON.stringify(input.messages));
				return fauxAssistantMessage("done");
			},
		]);
		await s.call("input", {
			project: "p",
			conversation,
			text: "go",
			requestId: "tools",
		});
		await old.entered.promise;
		current = next.module;
		assert.equal((await reload(s)).result?.status, "applied");
		assert.equal(get().get("p"), openProject);
		assert.equal(watch.closed, false);
		old.held.release();
		await idle(s);
		assert.match(outputs[0] ?? "", /old/);
		assert.match(outputs[1] ?? "", /new/);
		watch.close();
	} finally {
		old.held.release();
		await s.close();
	}
});

for (const mode of ["first", "sleep"])
	test(`reload hands a ${mode} task to the new next phase`, {
		timeout: 5000,
	}, async (t) => {
		const get = capture(t);
		const old = version("old");
		const next = version("new");
		let current = old.module;
		let now = 1000;
		const s = await start({
			source: () => ({ modules: { demo: current }, failures: [] }),
			now: () => now,
		});
		try {
			await bind(s);
			const conversation = await create(s);
			const open = get().get("p");
			assert.ok(open);
			const harness = open.store.harness;
			const id = await harness.commit(
				(tx) =>
					tx.createTask(
						old.task,
						{ mode },
						{
							ownership: { kind: "conversation" },
							conversationId: conversation,
							background: true,
						},
					),
				context,
			);
			await until(
				"task is held",
				async () =>
					(await harness.getTask(id, context))?.state.status ===
					(mode === "first" ? "running" : "sleeping"),
			);
			current = next.module;
			assert.equal((await reload(s)).result?.status, "applied");
			old.held.release();
			now += 2000;
			await until(
				"task completed",
				async () =>
					(await harness.getTask(id, context))?.state.status === "terminal",
			);
			const history = (await s.call("history", { project: "p", conversation }))
				.body.result;
			assert.match(JSON.stringify(history), /new/);
			assert.doesNotMatch(JSON.stringify(history), /"label":"old"/);
		} finally {
			old.held.release();
			await s.close();
		}
	});

test("reload installs in every listed project and leaves unlisted projects untouched", async (t) => {
	const get = capture(t);
	const old = version("old");
	const next = version("new");
	let current = old.module;
	const s = await start({
		source: () => ({ modules: { demo: current }, failures: [] }),
	});
	try {
		await bind(s);
		await bind(s, "q");
		await bind(s, "r", []);
		const r = get().all().find((project) => project.name === "r");
		assert.ok(r);
		const registry = r.registry.snapshot();
		const defaults = [...r.selection.defaults];
		current = next.module;
		const report = await reload(s);
		assert.equal(report.result?.status, "applied");
		for (const name of ["p", "q"]) {
			const project = get().all().find((project) => project.name === name);
			assert.ok(project);
			assert.equal(project.registry.snapshot().extension("demo"), next.module.extension);
			assert.ok(project.selection.defaults.includes(next.module.extension));
			assert.ok(!project.selection.defaults.includes(old.module.extension));
		}
		assert.equal(r.registry.snapshot(), registry);
		assert.deepEqual(r.selection.defaults, defaults);
		assert.deepEqual(report.result?.extensions, [
			{ name: "demo", status: "replaced", projects: ["p", "q"] },
		]);
	} finally {
		await s.close();
	}
});

test("reload reports only the projects publication installed in", async (t) => {
	const old = version("old");
	const next = version("new");
	let current = old.module;
	const publish = Projects.prototype.publish;
	t.mock.method(Projects.prototype, "publish", function (this: Projects, ...args: Parameters<typeof publish>) {
		const originalAll = this.all.bind(this);
		const all = t.mock.method(this, "all", () => originalAll().slice(0, 1));
		try {
			return publish.apply(this, args);
		} finally {
			all.mock.restore();
		}
	});
	const s = await start({
		source: () => ({ modules: { demo: current }, failures: [] }),
	});
	try {
		await bind(s);
		await bind(s, "q");
		current = next.module;
		assert.deepEqual((await reload(s)).result?.extensions, [
			{ name: "demo", status: "replaced", projects: ["p"] },
		]);
	} finally {
		await s.close();
	}
});

test("reload refreshes schemas for extensions options setOptions and create", async () => {
	const old = version("old");
	let current: ExtensionModule = {
		...old.module,
		entry: { model: { provider: "faux", modelId: "a" } },
	};
	const s = await start({
		source: () => ({ modules: { demo: current }, failures: [] }),
	});
	try {
		await bind(s);
		await patch(s, { label: "saved" });
		current = { ...current, options: contract(obj({ replacement: str() })) };
		assert.equal((await reload(s)).result?.status, "applied");
		assert.match(
			JSON.stringify((await s.call("extensions", {})).body),
			/replacement/,
		);
		const view = (await s.call("options", { project: "p" })).body.result
			.items[0];
		assert.ok(view.errors.length > 0);
		assert.equal(
			(await s.call("create", { project: "p", workflow: "demo" })).body.refused
				?.code,
			"options_invalid",
		);
		assert.equal(
			(await patch(s, { label: null, replacement: "fixed" })).status,
			200,
		);
		assert.equal(
			(await s.call("create", { project: "p", workflow: "demo" })).status,
			200,
		);
	} finally {
		await s.close();
	}
});

test("reload keeps absent names and names skipped stores but not stores since bound", async () => {
	const home = await newHome();
	await mkdir(path.join(home, "projects", "skipped"), { recursive: true });
	const old = version("old");
	let current = { demo: old.module };
	const s = await start({
		home,
		source: () => ({ modules: current, failures: [] }),
	});
	try {
		await bind(s);
		current = {} as typeof current;
		const report = await reload(s);
		assert.deepEqual(report.result?.extensions, [
			{ name: "demo", status: "kept", projects: [] },
		]);
		assert.deepEqual(
			report.result?.skipped.map((p) => p.project),
			["skipped"],
		);
		assert.deepEqual(
			(await s.call("projects", {})).body.result.items[0].missing,
			[],
		);
		await bind(s, "skipped");
		assert.deepEqual((await reload(s)).result?.skipped, []);
	} finally {
		await s.close();
	}
});

test("two reloads scan in order and a bind waits for the new catalogue", {
	timeout: 5000,
}, async () => {
	const held = latch();
	const entered = latch();
	let scans = 0;
	const old = version("old");
	const next = version("new");
	const s = await start({
		source: async () => {
			const scan = ++scans;
			if (scan === 2) {
				entered.release();
				await held.promise;
			}
			return { modules: scan === 1 ? {} : { demo: next.module }, failures: [] };
		},
	});
	try {
		await bind(s);
		const first = reload(s);
		await entered.promise;
		const second = reload(s);
		const bound = bind(s, "q");
		await s.call("models", {});
		await setImmediate();
		assert.equal(scans, 2);
		held.release();
		assert.equal((await first).result?.extensions[0]?.status, "added");
		assert.equal((await second).result?.extensions[0]?.status, "replaced");
		assert.deepEqual((await bound).body.result.project.missing, []);
		assert.equal(scans, 3);
	} finally {
		held.release();
		old.held.release();
		await s.close();
	}
});

test("setOptions captures its catalogue inside the queue after reload", {
	timeout: 5000,
}, async (t) => {
	const held = latch();
	const entered = latch();
	const accepted = latch();
	const old = version("old");
	let hold = false;
	let current: ExtensionModule = {
		...old.module,
		options: {
			...contract(),
			get: async (tx) => {
				if (hold) {
					hold = false;
					entered.release();
					await held.promise;
				}
				return contract().get(tx);
			},
		},
	};
	const s = await start({
		source: () => ({ modules: { demo: current }, failures: [] }),
	});
	try {
		await bind(s);
		hold = true;
		const first = patch(s, { label: "old-ok" });
		await entered.promise;
		current = { ...current, options: contract(obj({ replacement: str() })) };
		const reloading = reload(s);
		const call = calls.setOptions;
		assert.ok(call);
		const dispatch = call.dispatch;
		t.mock.method(call, "dispatch", (...args: Parameters<typeof dispatch>) => {
			const result = dispatch(...args);
			accepted.release();
			return result;
		});
		const second = patch(s, { label: "must-not-write" });
		await accepted.promise;
		held.release();
		assert.equal((await first).status, 200);
		assert.equal((await reloading).result?.status, "applied");
		assert.equal((await second).body.refused?.code, "bad_options");
		assert.match(
			JSON.stringify((await s.call("options", { project: "p" })).body),
			/old-ok/,
		);
	} finally {
		held.release();
		await s.close();
	}
});

test("a subscriber throw stops publication and requires restart on the same home", {
	timeout: 5000,
}, async (t) => {
	const get = capture(t);
	const old = version("old");
	const next = version("new");
	let current = old.module;
	const s = await start({
		source: () => ({ modules: { demo: current }, failures: [] }),
	});
	t.after(() => s.close().catch(() => {}));
	await bind(s);
	await bind(s, "q");
	const p = get().get("p");
	const q = get().get("q");
	assert.ok(p);
	assert.ok(q);
	const qBefore = q.registry.snapshot();
	const catalogueBefore = get().catalogue;
	p.registry.subscribe(() => {
		throw new Error("subscriber failed");
	});
	current = next.module;
	const report = await reload(s);
	assert.equal(report.result?.status, "restart_required");
	assert.deepEqual(report.result?.reached, { project: "p", extension: "demo" });
	assert.match(JSON.stringify(report), /restart/i);
	assert.equal(p.registry.snapshot().extension("demo"), next.module.extension);
	assert.equal(q.registry.snapshot(), qBefore);
	assert.equal(get().catalogue, catalogueBefore);
	assert.equal((await reload(s)).refused?.code, "busy");
	await assert.rejects(s.close(), /restart/i);
	const restarted = await start({
		home: s.home,
		token: s.token,
		source: () => ({ modules: { demo: next.module }, failures: [] }),
	});
	try {
		assert.deepEqual(
			(await restarted.call("projects", {})).body.result.items.map(
				(p: { project: string }) => p.project,
			),
			["p", "q"],
		);
	} finally {
		await restarted.close();
	}
});
