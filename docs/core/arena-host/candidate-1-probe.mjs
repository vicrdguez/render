// Host-layer probe for arena-host candidate 1, on pi-durable 1.5.2. Modelled on docs/core/spikes/substrate.mjs.
// H1. Start: open a SQLite store with an empty registry, read a `render.project` doc, install what it lists, resume.
//     A task created before the close shows `blocked: missing_task` until the install, then runs.
// H2. That task reads a `render.options` family member in its own commit, configures the reviewer conversation's
//     model from it, and submits to that conversation in the same commit. The run's first request uses that model.
// H3. A configure() of the conversation's model during a run reaches the next request of the same run.
// H4. A steer sent during a tool round is placed after the round and the run goes on. A resend with the same
//     requestId returns the same submission.
// H5. A run that fails on a model error leaves `pi.live.runFailure.reason = "model_error"`. A continue starts a run
//     that answers.
// H6. A task whose phase throws ends `faulted`. A scan by kind and terminal status finds it with its error. A scan by
//     terminal status alone also returns the built-in kinds.
// H7. pi-schema with a custom `model` format accepts a known model and rejects an unknown one at its JSON pointer.
// H8. Installing a second extension into a live registry leaves a conversation that names its extensions unchanged,
//     and adds it to a conversation that names none.
//   PI_MODULES=/path/to/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { compile, obj, str } = await import(`${base}/pi-schema/dist/index.js`);
const { configure, createRegistry, defineDoc, defineDocFamily, defineExtension, defineTask, defineTool, Harness, LiveDoc } =
	d;

const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), "probe-data-"));
const file = join(dir, "p.sqlite");
const out = (line) => console.log(line);

const Project = defineDoc({
	kind: "render.project",
	version: 1,
	scope: "session",
	initial: () => ({ workflows: [] }),
	checkpointWhen: () => false,
});
const Options = defineDocFamily({
	kind: "render.options",
	version: 1,
	scope: "session",
	family: true,
	initial: () => ({ values: {} }),
	checkpointWhen: () => false,
});
const modelRef = (s) => ({ provider: s.slice(0, s.indexOf("/")), modelId: s.slice(s.indexOf("/") + 1) });

const abort = async (_t, runtime, c) => {
	await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c);
};
// Like W1's `w1.review_start`: options read, model applied, and submission admitted in one commit.
const ReviewStart = defineTask({
	name: "wf.review_start",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async (task, runtime, c) => {
			const reviewer = await runtime.conversation(task.input.reviewer, c);
			await runtime.commit(async (tx) => {
				const options = await tx.doc(Options, "wf", null);
				const model = options.values.reviewer;
				await configure(tx, task.input.reviewer, { model: modelRef(model) });
				await reviewer.submit(tx, { type: "input", content: "Review build B1.", requestId: task.input.build });
				return { status: "terminal", outcome: { status: "completed", result: model } };
			}, c);
		},
	},
	abort,
});
const Boom = defineTask({
	name: "wf.boom",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async () => {
			throw new Error("review_start broke");
		},
	},
	abort,
});
let toolStarted;
let started = new Promise((r) => (toolStarted = r));
let release;
const gate = new Promise((r) => (release = r));
const wait = defineTool({
	name: "wait",
	description: "Wait",
	parameters: obj({}),
	execute: async () => {
		toolStarted();
		await gate;
		return { output: [{ type: "text", text: "waited" }] };
	},
});
const wf = defineExtension({ name: "wf", tools: [wait], tasks: [ReviewStart, Boom] });
const wf2 = defineExtension({ name: "wf2" });

const faux = fauxProvider({ models: [{ id: "m-a" }, { id: "m-b" }, { id: "m-c" }] });
const models = createModels();
models.setProvider(faux.provider);
const settings = { retry: { enabled: false } };
const open = async (registry) =>
	Harness.open(await openNodeSqliteStorage(file), { models, registry, settings }, ctx);

// First open: bind writes the project and options docs; a reviewer conversation and a task wait, unscheduled.
const reg1 = createRegistry();
reg1.install(wf);
let h = await open(reg1);
await h.commit(async (tx) => {
	(await tx.doc(Project)).workflows = ["wf"];
	(await tx.doc(Options, "wf", null)).values = { reviewer: "faux/m-b" };
}, ctx);
const R = await h.createConversation(
	{ ownership: { kind: "ownerless" }, agent: { model: modelRef("faux/m-a"), extensions: [wf] } },
	ctx,
);
const reviewTask = await R.commit(
	(tx) =>
		tx.createTask(ReviewStart, { reviewer: R.id, build: "B1" }, { ownership: { kind: "conversation" }, background: true }),
	ctx,
);
await h.close(ctx);

// H1. Second open: empty registry, read the project doc, install, resume.
const reg2 = createRegistry();
h = await open(reg2);
const project = await h.snapshot(Project, ctx);
const before = (await h.inspect(ctx)).tasks.find((t) => t.record.id === reviewTask)?.state;
for (const name of project.workflows) reg2.install({ wf, wf2 }[name]);
const afterInstall = (await h.inspect(ctx)).tasks.find((t) => t.record.id === reviewTask)?.state;
assert.equal(before?.kind, "blocked");
assert.equal(before?.reason, "missing_task");
assert.equal(afterInstall?.kind, "pending");
out(`H1 ok: project.workflows=${JSON.stringify(project.workflows)}; before install ${before.kind}/${before.reason}; after install ${afterInstall.kind}`);

// H2, H3, H4. The task runs: first request on the option's model; mid-run configure and a steer during the tool.
faux.setResponses([
	fauxAssistantMessage(fauxToolCall("wait", {}), { stopReason: "toolUse" }),
	fauxAssistantMessage("Review done."),
]);
h.resume();
const settled = await h.waitForTask(reviewTask, ctx);
assert.equal(settled.state.outcome.status, "completed");
const r = await h.conversation(R.id, ctx);
await started;
await r.configure({ model: modelRef("faux/m-c") }, ctx);
const steer1 = await r.submit(
	{ type: "input", content: "Use the existing serializer.", whenBusy: "steer", requestId: "steer-1" },
	ctx,
);
const steer2 = await r.submit(
	{ type: "input", content: "Use the existing serializer.", whenBusy: "steer", requestId: "steer-1" },
	ctx,
);
release();
await r.waitForIdle(ctx);
const page = await r.entries({ order: "ascending" }, 100, undefined, ctx);
const rows = page.items.map((e) => {
	const m = e.model?.[0];
	if (m?.role === "assistant") return `assistant(${m.model})`;
	if (m?.role === "user") return `user(${typeof m.content === "string" ? m.content : m.content[0]?.text})`;
	if (m?.role === "toolResult") return "toolResult";
	return e.kind;
});
const transcript = rows.filter((x) => x !== "pi.system");
const models_ = transcript.filter((x) => x.startsWith("assistant")).map((x) => x.slice(10, -1));
assert.equal(settled.state.outcome.result, "faux/m-b");
assert.deepEqual(models_, ["m-b", "m-c"]);
assert.equal(steer1.id, steer2.id);
const iTool = transcript.indexOf("toolResult");
const iSteer = transcript.indexOf("user(Use the existing serializer.)");
assert.ok(iTool >= 0 && iSteer === iTool + 1 && transcript[iSteer + 1] === "assistant(m-c)");
out(`H2 ok: task result ${settled.state.outcome.result}; first request model ${models_[0]}`);
out(`H3 ok: configure during the tool round; request models in one run ${JSON.stringify(models_)}`);
out(`H4 ok: transcript ${JSON.stringify(transcript)}; resend returned the same submission ${steer1.id === steer2.id}`);

// H5. A model error, then a continue.
const X = await h.createConversation({ ownership: { kind: "ownerless" }, agent: { model: modelRef("faux/m-a") } }, ctx);
faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "overloaded" })]);
const failed = await (await X.submit({ type: "input", content: "Implement it.", requestId: "x-1" }, ctx)).wait(ctx);
const live = await h.snapshot(LiveDoc, X.id, ctx);
assert.equal(failed.status, "unanswered");
assert.equal(live.runFailure?.reason, "model_error");
faux.setResponses([fauxAssistantMessage("Implemented.")]);
const resumed = await (await X.submit({ type: "continue", requestId: "x-2" }, ctx)).wait(ctx);
assert.equal(resumed.status, "done");
out(`H5 ok: first run ${failed.status}/${failed.reason}, runFailure.reason=${live.runFailure.reason}; continue ${resumed.status}`);

// H6. A task that throws ends faulted; find it by scan.
const boom = await r.commit(
	(tx) => tx.createTask(Boom, {}, { ownership: { kind: "conversation" }, background: true }),
	ctx,
);
const boomSettled = await h.waitForTask(boom, ctx);
assert.equal(boomSettled.state.outcome.status, "faulted");
const [byKind, byStatus] = await h.commit(
	async (tx) => [
		await tx.scanTasks({ kind: "wf.boom", status: "terminal", order: "descending" }, 10),
		await tx.scanTasks({ status: "terminal" }, 100),
	],
	ctx,
);
const faulted = byKind.items.filter((t) => t.state.outcome.status === "faulted");
assert.equal(faulted.length, 1);
assert.equal(faulted[0].state.outcome.error.message, "review_start broke");
const kinds = [...new Set(byStatus.items.map((t) => t.kind))].sort();
assert.ok(kinds.includes("pi.generation") && kinds.includes("pi.tool"));
out(
	`H6 ok: by kind ${faulted.length} faulted, error "${faulted[0].state.outcome.error.message}", endedAt set ${typeof faulted[0].endedAt === "number"}; terminal kinds by status alone ${JSON.stringify(kinds)}`,
);

// H7. pi-schema with a custom `model` format.
const W1Options = obj({ reviewer: str({ format: "model" }), base: str({ minLength: 1 }) });
const check = compile(W1Options, { formats: { model: (s) => models.getModel(modelRef(s).provider, modelRef(s).modelId) !== undefined } });
assert.equal(check.check({ reviewer: "faux/m-c", base: "main" }), true);
const errors = check.errors({ reviewer: "faux/zz", base: "main", extra: 1 });
out(`H7 ok: known model accepted; errors for unknown model and extra field ${JSON.stringify(errors)}`);
assert.ok(errors.some((e) => e.path === "/reviewer" && e.keyword === "format"));

// H8. A live install does not reach a conversation that names its extensions.
reg2.install(wf2);
const named = (await r.agent(ctx)).extensions.map((e) => e.name);
const unnamed = (await (await h.conversation(X.id, ctx)).agent(ctx)).extensions.map((e) => e.name);
assert.deepEqual(named, ["wf"]);
assert.deepEqual(unnamed, ["wf", "wf2"]);
out(`H8 ok: named selection ${JSON.stringify(named)}; no selection ${JSON.stringify(unnamed)}`);

await h.close(ctx);
out("ok: checks H1-H8 passed");
