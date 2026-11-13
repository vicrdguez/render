// Host checks for the core design, on pi-durable 1.5.2 with SQLite files. Merged from the probes of the host arena
// (candidates 1 and 3) and the judge's uninstall check. H2, H6, H7, and H9 are new: they run moves that only the
// merged design makes. `options()`, `setOptions()`, and `create()` below are stand-ins shaped like the design in
// docs/core/host.md and docs/core/library.md. No Tau code exists.
// H1.  A store is closed while a timer sleeps, and the date passes. It is reopened with an empty registry and
//      resumed. The due task waits as blocked (missing_task). The host reads the project's workflow list from a
//      session document, installs the extension, and the task runs.
// H2.  Options. A helper defines one session document named by the workflow. A host commit reads the set keys,
//      merges a patch, checks the result with pi-schema and a `model` format, and stores the set keys only. A
//      missing required key does not refuse a patch. An unknown model and an unknown key do. `null` clears a key.
// H3.  Create. One host commit refuses while a required option is unset. Once it is set, one commit reads the
//      options, creates the conversation, calls the workflow's `entry(tx)`, which reads the options again after
//      the table write, and configures the agent. The first model request uses the model from the options.
// H4.  A steer sent during a tool round is in the next model request of the same run. A resend with the same
//      request ID returns the first submission.
// H5.  A model change during a run applies from the next model request.
// H6.  A steer marked "only if running" to an idle conversation is refused with ConversationIdle and writes nothing.
// H7.  A workflow dispatch overlaps a run that the owner started. The dispatch commit sets the model and submits.
//      The submission queues. The owner's run uses the new model from its next request. The queued input then
//      starts a run of its own.
// H8.  A run ends on a model error and leaves pi.live.runFailure. A continue starts a run that answers.
// H9.  A Stop ends the run that is working. A second Stop, sent later, ends a newer run.
// H10. A task whose phase throws ends faulted, and onReport hears it once the fault is stored. scanTasks({ kind,
//      status: "terminal" }) returns it with its error text. The same scan with no kind also returns every
//      finished built-in task.
// H11. Installing a second extension leaves a conversation that names its extensions unchanged, and reaches one
//      that names none.
// H12. Uninstalling an extension does not park a task that is running. The task goes on through its next phase.
//   PI_MODULES=/path/to/node_modules/@earendil-works node docs/core/spikes/host.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { compile, obj, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { configure, ConversationIdle, createRegistry, defineDoc, defineExtension, defineTask, defineTool } = d;
const { Harness, LiveDoc } = d;

const dir = mkdtempSync(join(tmpdir(), "render-host-"));
let clock = Date.UTC(2026, 10, 12);
const now = () => clock;
const WEEK = 7 * 24 * 3600 * 1000;
const WORKDIR = "/srv/export-tool";

const text = (t) => [{ type: "text", text: t }];
const terminal = (status, result) => ({
	status: "terminal",
	outcome: { status, ...(result === undefined ? {} : { result }) },
});
const abortPlain = (_t, runtime, c) => runtime.commit(() => terminal("aborted"), c);
const plain = (value) => JSON.parse(JSON.stringify(value));

// The standard library's part, as designed: one call defines the document and returns the reads and the write.
const modelRef = (value) => {
	const cut = value.indexOf("/");
	return { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
};
const defaultsOf = (schema) =>
	Object.fromEntries(
		Object.entries(schema.properties)
			.filter(([, property]) => "default" in property)
			.map(([key, property]) => [key, property.default]),
	);
function options(workflow, schema) {
	const Doc = defineDoc({
		kind: `${workflow}.options`,
		version: 1,
		scope: "session",
		initial: () => ({}),
		checkpointWhen: () => false,
	});
	const shape = compile(schema);
	const get = async (tx) => plain(await tx.doc(Doc));
	return {
		schema,
		get,
		set: async (tx, value) => {
			const doc = await tx.doc(Doc);
			for (const key of Object.keys(plain(doc))) delete doc[key];
			Object.assign(doc, value);
		},
		read: async (tx) => {
			const value = { ...defaultsOf(schema), ...(await get(tx)) };
			const errors = shape.errors(value);
			if (errors.length > 0) throw new Error(`options of ${workflow} do not fit: ${JSON.stringify(errors)}`);
			return value;
		},
	};
}

// The host's part, as designed. It knows the three members of `options` and `entry`, and no key of any value.
const checkerOf = (schema, models) =>
	compile(schema, {
		formats: {
			model: (value) => {
				const ref = modelRef(value);
				return models.getModel(ref.provider, ref.modelId) !== undefined;
			},
		},
	});
const setOptions = (harness, port, patch, models) =>
	harness.commit(async (tx) => {
		const merged = await port.get(tx);
		for (const [key, value] of Object.entries(patch)) {
			if (value === null) delete merged[key];
			else merged[key] = value;
		}
		const errors = checkerOf(port.schema, models)
			.errors({ ...defaultsOf(port.schema), ...merged })
			.filter((error) => error.keyword !== "required");
		if (errors.length > 0) return { refused: "bad_options", errors };
		await port.set(tx, merged);
		return { value: merged };
	}, ctx);
const create = (harness, module, workdir, models) =>
	harness.commit(async (tx) => {
		if (module.options !== undefined) {
			const value = { ...defaultsOf(module.options.schema), ...(await module.options.get(tx)) };
			const errors = checkerOf(module.options.schema, models).errors(value);
			if (errors.length > 0) return { refused: "options_invalid", errors };
		}
		const created = await tx.createConversation({ ownership: { kind: "ownerless" } });
		const entry = typeof module.entry === "function" ? await module.entry(tx) : module.entry;
		await configure(tx, created.id, { cwd: workdir, ...entry });
		return { conversation: created.id };
	}, ctx);

const Project = defineDoc({
	kind: "tau.project",
	version: 1,
	scope: "session",
	initial: () => ({ workflows: [] }),
	checkpointWhen: () => false,
});

// A stand-in workflow.
const WfOptions = options(
	"wf",
	obj({
		designer: str({ format: "model" }),
		reviewer: str({ format: "model" }),
		base: str({ minLength: 1, default: "main" }),
	}),
);
let holding;
let release;
const hold = defineTool({
	name: "hold",
	description: "Wait until the probe lets go.",
	parameters: obj({}),
	execute: async () => {
		holding();
		await new Promise((r) => (release = r));
		return { output: text("held") };
	},
});
const Due = defineTask({
	name: "wf.due",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: async (_task, runtime, c) => {
			await runtime.sleepUntil(runtime.now() + WEEK, { phase: "wake" }, c);
		},
		wake: async (_task, runtime, c) => {
			await runtime.commit(() => terminal("completed", "woke"), c);
		},
	},
	abort: abortPlain,
});
const Dispatch = defineTask({
	name: "wf.review_start",
	version: 1,
	initial: () => ({ phase: "send" }),
	phases: {
		send: async (task, runtime, c) => {
			const reviewer = await runtime.conversation(task.input.conversation, c);
			await runtime.commit(async (tx) => {
				const o = await WfOptions.read(tx);
				await configure(tx, task.input.conversation, { model: modelRef(o.reviewer) });
				const submission = await reviewer.submit(tx, {
					type: "input",
					content: "Review build B2.",
					requestId: "B2",
				});
				return terminal("completed", { submission });
			}, c);
		},
	},
	abort: abortPlain,
});
const Broken = defineTask({
	name: "wf.broken",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async () => {
			throw new Error("review_start cannot go on");
		},
	},
	abort: abortPlain,
});
const Wf = defineExtension({ name: "wf", tools: [hold], tasks: [Due, Dispatch, Broken] });
const wfModule = {
	extension: Wf,
	options: WfOptions,
	entry: async (tx) => ({
		model: modelRef((await WfOptions.read(tx)).designer),
		extensions: [Wf],
		tools: [hold],
	}),
};
const WORKFLOWS = { wf: wfModule };

const reports = [];
async function open(registry) {
	const faux = fauxProvider({ models: [{ id: "faux-a" }, { id: "faux-b" }, { id: "faux-c" }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const storage = await openNodeSqliteStorage(join(dir, "p.sqlite"));
	const harness = await Harness.open(
		storage,
		{ models, registry, now, settings: { retry: { enabled: false } }, onReport: (r) => reports.push(r) },
		ctx,
	);
	return { faux, models, harness };
}
const until = async (what, test) => {
	for (let i = 0; i < 400; i++) {
		if (await test()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	assert.fail(`never: ${what}`);
};
const inBackground = (conversationId) => ({ ownership: { kind: "conversation" }, conversationId, background: true });
const call = (name) => fauxAssistantMessage([fauxToolCall(name, {})], { stopReason: "toolUse" });
const requests = [];
const record = (reply) => (context, _options, _state, model) => {
	const seen = JSON.stringify(context);
	requests.push({
		model: model.id,
		steer: seen.includes("Use the existing serializer."),
		question: seen.includes("Why this serializer?"),
		dispatch: seen.includes("Review build B2."),
	});
	return reply;
};
const stopped = (_context, callOptions) =>
	new Promise((_, reject) => {
		callOptions?.signal?.addEventListener("abort", () => reject(new Error("stopped")));
	});

// H1
const first = createRegistry();
first.install(Wf);
let s = await open(first);
s.harness.resume();
const F = await s.harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
const due = await s.harness.commit(async (tx) => {
	Object.assign(await tx.doc(Project), { project: "p", workdir: WORKDIR, workflows: ["wf"] });
	return tx.createTask(Due, {}, inBackground(F.id));
}, ctx);
await until("the timer sleeps", async () => (await s.harness.getTask(due, ctx))?.state.status === "sleeping");
await s.harness.close(ctx);

clock += WEEK + 1;
const registry = createRegistry();
s = await open(registry);
s.harness.resume();
await new Promise((r) => setTimeout(r, 100));
const parked = (await s.harness.inspect(ctx)).tasks.find((item) => item.record.id === due);
assert.equal(parked?.state.kind, "blocked", "H1: the due task waits");
assert.equal(parked.state.reason, "missing_task");
const project = await s.harness.snapshot(Project, ctx);
assert.deepEqual(project.workflows, ["wf"]);
for (const name of project.workflows) registry.install(WORKFLOWS[name].extension);
const woke = await s.harness.waitForTask(due, ctx);
assert.equal(woke.state.outcome.result, "woke");
console.log("H1 ok: reopened with an empty registry, the due task was blocked (missing_task) and ran after install");

// H2
const { harness, models, faux } = s;
const set = (patch) => setOptions(harness, wfModule.options, patch, models);
assert.deepEqual(await set({ reviewer: "faux/faux-b" }), { value: { reviewer: "faux/faux-b" } });
const unknownModel = await set({ reviewer: "faux/none" });
assert.equal(unknownModel.refused, "bad_options");
assert.ok(unknownModel.errors.some((e) => e.path === "/reviewer" && e.keyword === "format"));
const unknownKey = await set({ extra: 1 });
assert.ok(unknownKey.errors.some((e) => e.path === "/extra" && e.keyword === "additionalProperties"));
assert.deepEqual(await set({ base: "trunk" }), { value: { reviewer: "faux/faux-b", base: "trunk" } });
assert.deepEqual(await set({ base: null }), { value: { reviewer: "faux/faux-b" } });
assert.deepEqual(await harness.commit((tx) => wfModule.options.get(tx), ctx), { reviewer: "faux/faux-b" });
console.log(
	"H2 ok: a patch was stored with a required key still unset; an unknown model and an unknown key were refused; " +
		"null cleared a key; only the set keys were stored",
);

// H3
const early = await create(harness, wfModule, WORKDIR, models);
assert.equal(early.refused, "options_invalid");
assert.ok(early.errors.some((e) => e.path === "/designer" && e.keyword === "required"));
await set({ designer: "faux/faux-a" });
assert.deepEqual(await harness.commit((tx) => wfModule.options.read(tx), ctx), {
	designer: "faux/faux-a",
	reviewer: "faux/faux-b",
	base: "main",
});
const made = await create(harness, wfModule, WORKDIR, models);
const D = await harness.conversation(made.conversation, ctx);
const agent = await D.agent(ctx);
assert.deepEqual(agent.model, { provider: "faux", modelId: "faux-a" });
assert.equal(agent.cwd, WORKDIR);
assert.deepEqual(agent.extensions.map((e) => e.name), ["wf"]);
console.log(
	"H3 ok: create refused while a required option was unset; then one commit read the options, created the " +
		"conversation, ran entry(tx), and set the model, the working directory, and the selection",
);

// H4 and H5
faux.setResponses([record(call("hold")), record(fauxAssistantMessage("Done."))]);
let held = new Promise((r) => (holding = r));
const prompt = await D.submit({ type: "input", content: "Add a --json flag.", requestId: "client:r1" }, ctx);
await held;
const steer = { type: "input", content: "Use the existing serializer.", whenBusy: "steer", requestId: "client:r2" };
const steered = await D.submit(steer, ctx);
const resent = await D.submit(steer, ctx);
assert.equal(resent.id, steered.id);
await D.configure({ model: { provider: "faux", modelId: "faux-c" } }, ctx);
release();
assert.equal((await prompt.wait(ctx)).status, "done");
assert.equal((await steered.wait(ctx)).status, "done");
await D.waitForIdle(ctx);
assert.deepEqual(requests.map((r) => r.steer), [false, true]);
console.log("H4 ok: a steer sent during a tool round was in the next request of the same run; a resend returned it");
assert.deepEqual(requests.map((r) => r.model), ["faux-a", "faux-c"]);
console.log("H5 ok: a model change during the run applied from the next model request");

// H6
const entriesBefore = (await D.entries({}, 100, undefined, ctx)).items.length;
await assert.rejects(
	D.submit({ type: "input", content: "Too late.", whenBusy: "steer", whenIdle: "reject" }, ctx),
	ConversationIdle,
);
assert.equal((await D.entries({}, 100, undefined, ctx)).items.length, entriesBefore);
console.log("H6 ok: a steer marked only-if-running to an idle conversation was refused and wrote nothing");

// H7
requests.length = 0;
faux.setResponses([
	record(call("hold")),
	record(fauxAssistantMessage("Because it exists.")),
	record(fauxAssistantMessage("Reviewed.")),
]);
held = new Promise((r) => (holding = r));
const question = await D.submit({ type: "input", content: "Why this serializer?", requestId: "client:r3" }, ctx);
await held;
const dispatch = await harness.commit((tx) => tx.createTask(Dispatch, { conversation: D.id }, inBackground(F.id)), ctx);
const dispatched = (await harness.waitForTask(dispatch, ctx)).state.outcome.result.submission;
const queued = await (await harness.submission(dispatched, ctx)).status(ctx);
assert.equal(queued.status, "queued");
release();
assert.equal((await question.wait(ctx)).status, "done");
assert.equal((await (await harness.submission(dispatched, ctx)).wait(ctx)).status, "done");
await D.waitForIdle(ctx);
assert.deepEqual(requests, [
	{ model: "faux-c", steer: true, question: true, dispatch: false },
	{ model: "faux-b", steer: true, question: true, dispatch: false },
	{ model: "faux-b", steer: true, question: true, dispatch: true },
]);
console.log(
	"H7 ok: a dispatch during an owner's run queued its input; the owner's run went from faux-c to faux-b at its " +
		"next request; the queued input then started its own run",
);

// H8
const I = await harness.createConversation(
	{ ownership: { kind: "ownerless" }, agent: { model: { provider: "faux", modelId: "faux-a" } } },
	ctx,
);
faux.setResponses([
	fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider said no" }),
	fauxAssistantMessage("Fixed."),
]);
const failed = await (await I.submit({ type: "input", content: "Fix finding 1." }, ctx)).wait(ctx);
assert.equal(failed.status, "unanswered");
await I.waitForIdle(ctx);
const live = await harness.snapshot(LiveDoc, I.id, ctx);
assert.equal(live.run, undefined);
assert.equal(live.runFailure.reason, "model_error");
assert.equal((await (await I.submit({ type: "continue" }, ctx)).wait(ctx)).status, "done");
assert.equal((await harness.snapshot(LiveDoc, I.id, ctx)).runFailure, undefined);
console.log(`H8 ok: the run ended unanswered (${failed.reason}), runFailure said model_error, and a continue answered`);

// H9
faux.setResponses([stopped, stopped]);
const running = async () => (await harness.snapshot(LiveDoc, I.id, ctx))?.run !== undefined;
const one = await I.submit({ type: "input", content: "First." }, ctx);
await until("run one works", running);
await I.abort(ctx);
const two = await I.submit({ type: "input", content: "Second." }, ctx);
await until("run two works", running);
await I.abort(ctx);
const ends = [await one.wait(ctx), await two.wait(ctx)].map((r) => `${r.status}:${r.reason}`);
assert.deepEqual(ends, ["unanswered:aborted", "unanswered:aborted"]);
console.log("H9 ok: a Stop ended the working run, and a second Stop sent later ended a newer run");

// H10
const broken = await harness.commit((tx) => tx.createTask(Broken, {}, inBackground(F.id)), ctx);
const dead = await harness.waitForTask(broken, ctx);
assert.equal(dead.state.outcome.status, "faulted");
const heardBy = (r) => r.kind === "task_faulted" && r.task?.id === broken;
const heardAtOnce = reports.some(heardBy);
await until("onReport hears the fault", () => reports.some(heardBy));
assert.equal(reports.find(heardBy).reason, "threw");
const scan = (query) => harness.commit((tx) => tx.scanTasks(query, 1000), ctx);
const ofKind = (await scan({ kind: "wf.broken", status: "terminal" })).items;
assert.equal(ofKind.length, 1);
assert.equal(ofKind[0].state.outcome.status, "faulted");
assert.match(ofKind[0].state.outcome.error.message, /review_start cannot go on/);
const all = (await scan({ status: "terminal" })).items;
assert.equal(all.filter((t) => t.state.outcome.status === "faulted").length, 1);
const builtIn = all.filter((t) => t.kind.startsWith("pi.")).length;
console.log(
	`H10 ok: the task ended faulted, onReport heard it (${heardAtOnce ? "before" : "after"} waitForTask resolved), ` +
		`and the scan by kind returned it. A scan with no kind read ${all.length} finished tasks to find 1, ` +
		`${builtIn} of them pi-durable's own`,
);

// H11
const N = await harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
registry.install(defineExtension({ name: "wf2", tools: [] }));
assert.deepEqual((await D.agent(ctx)).extensions.map((e) => e.name), ["wf"]);
assert.deepEqual((await N.agent(ctx)).extensions.map((e) => e.name), ["wf", "wf2"]);
console.log("H11 ok: a second extension did not reach a conversation that names its extensions, and reached one that names none");

// H12
const steps = [];
let entered;
let go;
const TwoPhase = defineTask({
	name: "wf3.two",
	version: 1,
	initial: () => ({ phase: "first" }),
	phases: {
		first: async (_task, runtime, c) => {
			entered();
			await new Promise((r) => (go = r));
			steps.push("first");
			await runtime.commit(() => ({ status: "running", checkpoint: { phase: "second" } }), c);
		},
		second: async (_task, runtime, c) => {
			steps.push("second");
			await runtime.commit(() => terminal("completed"), c);
		},
	},
	abort: abortPlain,
});
const Wf3 = defineExtension({ name: "wf3", tasks: [TwoPhase] });
registry.install(Wf3);
const inFirst = new Promise((r) => (entered = r));
const two3 = await harness.commit((tx) => tx.createTask(TwoPhase, {}, inBackground(F.id)), ctx);
await inFirst;
registry.uninstall(Wf3);
go();
assert.equal((await harness.waitForTask(two3, ctx)).state.outcome.status, "completed");
assert.deepEqual(steps, ["first", "second"]);
console.log("H12 ok: a task that was running when its extension was uninstalled went on through its next phase");

await harness.close(ctx);
console.log("ok: checks H1-H12 passed");
