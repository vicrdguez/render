// Host checks for the Render core design, on pi-durable 1.5.2 with SQLite files. Written by arena candidate 3.
// Each check is a move the host design leans on that no earlier spike ran.
// H1. A store is closed while a timer sleeps, and the date passes. It is reopened with an empty registry and
//     resumed. The due task waits as blocked (missing_task). The host then reads the project's workflow list from
//     a session document and installs the extension, and the task runs.
// H2. One task commit creates a conversation, then reads a session document keyed by a workflow name, then sets
//     the conversation's model from it with configure(tx). The document read after the table write is legal.
// H3. The host steers that conversation while its run is in a tool round. The next model request holds the steer.
// H4. The host changes that conversation's model during the same run. The next model request uses the new model.
// H5. A run ends on a model error and leaves pi.live.runFailure. A continue starts a run that answers.
// H6. A task whose phase throws ends faulted, and onReport hears it once the fault is stored. scanTasks({ kind,
//     status: "terminal" }) returns it with its error text. The same scan with no kind also returns every
//     finished built-in task.
//   PI_MODULES=/path/to/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { obj } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { configure, createRegistry, defineDoc, defineDocFamily, defineExtension, defineTask, defineTool, Harness } = d;
const { LiveDoc } = d;

const dir = mkdtempSync(join(tmpdir(), "render-host-"));
let clock = Date.UTC(2026, 10, 12);
const now = () => clock;
const WEEK = 7 * 24 * 3600 * 1000;
const B = { provider: "faux", modelId: "faux-b" };
const C = { provider: "faux", modelId: "faux-c" };

const Project = defineDoc({
	kind: "probe.project",
	version: 1,
	scope: "session",
	initial: () => ({ workflows: [] }),
	checkpointWhen: () => false,
});
const Options = defineDocFamily({
	kind: "probe.options",
	version: 1,
	scope: "session",
	family: true,
	initial: (seed) => ({ value: seed }),
	checkpointWhen: () => false,
});

const text = (t) => [{ type: "text", text: t }];
const terminal = (status, result) => ({
	status: "terminal",
	outcome: { status, ...(result === undefined ? {} : { result }) },
});
const abortPlain = (_t, runtime, c) => runtime.commit(() => terminal("aborted"), c);

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

const Sleeper = defineTask({
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
const Spawn = defineTask({
	name: "wf.spawn",
	version: 1,
	initial: () => ({ phase: "make" }),
	phases: {
		make: async (_task, runtime, c) => {
			await runtime.commit(async (tx) => {
				const created = await tx.createConversation({ ownership: { kind: "ownerless" } });
				const options = await tx.doc(Options, "wf", {});
				await configure(tx, created.id, { model: options.value.reviewerModel, extensions: [Wf], tools: [hold] });
				return terminal("completed", { id: created.id });
			}, c);
		},
	},
	abort: abortPlain,
});
const Thrower = defineTask({
	name: "wf.review_start",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async () => {
			throw new Error("review_start cannot go on");
		},
	},
	abort: abortPlain,
});
const Wf = defineExtension({ name: "wf", tools: [hold], tasks: [Sleeper, Spawn, Thrower] });
const installable = { wf: Wf };

const reports = [];
async function open(registry) {
	const faux = fauxProvider({ models: [{ id: "faux-b" }, { id: "faux-c" }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const storage = await openNodeSqliteStorage(join(dir, "p.sqlite"));
	const harness = await Harness.open(
		storage,
		{ models, registry, now, settings: { retry: { enabled: false } }, onReport: (r) => reports.push(r) },
		ctx,
	);
	return { faux, harness };
}
const until = async (what, test) => {
	for (let i = 0; i < 400; i++) {
		if (await test()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	assert.fail(`never: ${what}`);
};
const inBackground = (conversationId) => ({ ownership: { kind: "conversation" }, conversationId, background: true });

// H1
const first = createRegistry();
first.install(Wf);
let s = await open(first);
s.harness.resume();
const F = await s.harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
const due = await s.harness.commit(async (tx) => {
	(await tx.doc(Project)).workflows = ["wf"];
	return tx.createTask(Sleeper, {}, inBackground(F.id));
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
for (const name of project.workflows) registry.install(installable[name]);
const woke = await s.harness.waitForTask(due, ctx);
assert.equal(woke.state.outcome.status, "completed");
assert.equal(woke.state.outcome.result, "woke");
console.log("H1 ok: reopened with an empty registry, the due task was blocked (missing_task) and ran after install");

// H2
await s.harness.commit(async (tx) => {
	(await tx.doc(Options, "wf", {})).value = { reviewerModel: B };
}, ctx);
const spawn = await s.harness.commit((tx) => tx.createTask(Spawn, {}, inBackground(F.id)), ctx);
const spawned = await s.harness.waitForTask(spawn, ctx);
assert.equal(spawned.state.outcome.status, "completed", JSON.stringify(spawned.state.outcome));
const R = await s.harness.conversation(spawned.state.outcome.result.id, ctx);
assert.deepEqual((await R.agent(ctx)).model, B);
console.log("H2 ok: one commit created a conversation, read the options document, and set the model from it");

// H3 and H4
const requests = [];
const record = (reply) => (context, _options, _state, model) => {
	requests.push({ model: model.id, steer: JSON.stringify(context).includes("Use the existing serializer.") });
	return reply;
};
s.faux.setResponses([
	record(fauxAssistantMessage([fauxToolCall("hold", {})], { stopReason: "toolUse" })),
	record(fauxAssistantMessage("Reviewed.")),
]);
const held = new Promise((r) => (holding = r));
const review = await R.submit({ type: "input", content: "Review commit S1." }, ctx);
await held;
const steer = await R.submit({ type: "input", content: "Use the existing serializer.", whenBusy: "steer" }, ctx);
await R.configure({ model: C }, ctx);
release();
assert.equal((await review.wait(ctx)).status, "done");
assert.equal((await steer.wait(ctx)).status, "done");
await R.waitForIdle(ctx);
assert.equal(requests.length, 2, "one run answered both inputs");
assert.deepEqual(requests.map((r) => r.steer), [false, true]);
console.log("H3 ok: a steer sent during a tool round was in the next model request of the same run");
assert.deepEqual(requests.map((r) => r.model), ["faux-b", "faux-c"]);
console.log("H4 ok: a model change during the run applied from the next model request");

// H5
const I = await s.harness.createConversation({ ownership: { kind: "ownerless" }, agent: { model: B } }, ctx);
s.faux.setResponses([
	fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider said no" }),
	fauxAssistantMessage("Fixed."),
]);
const failed = await (await I.submit({ type: "input", content: "Fix finding 1." }, ctx)).wait(ctx);
assert.equal(failed.status, "unanswered");
await I.waitForIdle(ctx);
const live = await s.harness.snapshot(LiveDoc, I.id, ctx);
assert.equal(live.run, undefined);
assert.equal(live.runFailure.reason, "model_error");
const resumed = await (await I.submit({ type: "continue" }, ctx)).wait(ctx);
assert.equal(resumed.status, "done");
assert.equal((await s.harness.snapshot(LiveDoc, I.id, ctx)).runFailure, undefined);
console.log(`H5 ok: the run ended unanswered (${failed.reason}), runFailure said model_error, and a continue answered`);

// H6
const thrower = await s.harness.commit((tx) => tx.createTask(Thrower, {}, inBackground(F.id)), ctx);
const dead = await s.harness.waitForTask(thrower, ctx);
assert.equal(dead.state.outcome.status, "faulted");
const heardAtOnce = reports.some((r) => r.kind === "task_faulted" && r.task?.id === thrower);
await until("onReport hears the fault", () => reports.some((r) => r.kind === "task_faulted" && r.task?.id === thrower));
const heard = reports.find((r) => r.kind === "task_faulted" && r.task?.id === thrower);
assert.equal(heard.reason, "threw");
const scan = (query) => s.harness.commit((tx) => tx.scanTasks(query, 1000), ctx);
const ofKind = (await scan({ kind: "wf.review_start", status: "terminal" })).items;
assert.equal(ofKind.length, 1);
assert.equal(ofKind[0].id, thrower);
assert.equal(ofKind[0].state.outcome.status, "faulted");
assert.match(ofKind[0].state.outcome.error.message, /review_start cannot go on/);
const all = (await scan({ status: "terminal" })).items;
const faulted = all.filter((t) => t.state.outcome.status === "faulted");
assert.equal(faulted.length, 1);
const kinds = {};
for (const t of all) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
console.log(
	`H6 ok: the task ended faulted, onReport heard it (${heardAtOnce ? "before" : "after"} waitForTask resolved), ` +
		`and the scan by kind returned it. ` +
		`A scan with no kind read ${all.length} finished tasks to find 1: ${JSON.stringify(kinds)}`,
);

await s.harness.close(ctx);
console.log("ok: checks H1-H6 passed");
