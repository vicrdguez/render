// Walk checks on pi-durable 1.5.2. Throwaway probe for arena candidate 3. Each check is one move the W1 or W2 walk
// leans on that `docs/core/spikes/substrate.mjs` did not run.
// A. A tool commit appends a basis entry, then writes a decision doc, a work doc and an event entry. Its result sets
//    `control.terminate` and the run ends with no second model request.
// B. A `then`-shaped task, created by an unbound commit in a named conversation, admits an input to that conversation
//    and goes terminal in one commit. The conversation then runs that input.
// C. A task creates a conversation it owns, sets its agent with `configure(tx, id, change)` and writes that
//    conversation's doc, all in one commit. It then submits with a request ID, waits, and reads the hand-off doc.
// D. The Harness closes while that task waits on a model request. After reopen the phase runs again, the same request
//    ID returns the first submission, and the conversation holds the input once.
// E. `Conversation.abort()` runs a task's abort handler, whose commit withdraws a decision doc. A `background` task in
//    the same conversation keeps sleeping until `abort({ background: true })`.
// F. A `{ type: "write", entry }` submission stores an entry and starts no model request.
//   PI_MODULES=/path/to/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } = await import(
	`${base}/pi-ai/dist/providers/faux.js`
);
const { obj, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { configure, createRegistry, defineDoc, defineEntry, defineExtension, defineTask, defineTool, Harness } = d;

const dir = mkdtempSync(join(tmpdir(), "render-walk-"));
const clock = Date.UTC(2026, 10, 11);
const now = () => clock;
const WEEK = 7 * 24 * 3600 * 1000;

const Decisions = defineDoc({
	kind: "probe.decisions",
	version: 1,
	scope: "session",
	initial: () => ({ items: {}, log: 0 }),
	checkpointWhen: () => false,
});
const perConversation = { version: 1, scope: "conversation", history: "latest", fork: "initial" };
const Work = defineDoc({ ...perConversation, kind: "probe.work", initial: () => ({}), checkpointWhen: () => false });
const Job = defineDoc({ ...perConversation, kind: "probe.job", initial: () => ({}), checkpointWhen: () => false });
const Design = defineEntry("probe.design");
const Event = defineEntry("probe.event");

const text = (t) => [{ type: "text", text: t }];
const terminal = (status, result) => ({ status: "terminal", outcome: { status, ...(result ? { result } : {}) } });
const abortPlain = (_t, runtime, c) => runtime.commit(() => terminal("aborted"), c);

const propose = defineTool({
	name: "propose",
	description: "Record a design and ask for a decision.",
	parameters: obj({ text: str() }),
	execute: async (args, api, c) => {
		await api.commit(async (tx) => {
			const work = await tx.doc(Work, api.conversationId);
			const decisions = await tx.doc(Decisions);
			const basis = await tx.appendEntry(Design, api.conversationId, { data: { text: args.text } });
			decisions.items["w1:x#1"] = { status: "open", basis: basis.id, conversation: api.conversationId };
			work.proposed = basis.id;
			await tx.appendEntry(Event, decisions.log, { data: { text: "design proposed", at: api.now() } });
		}, c);
		return { output: text("Recorded."), control: { terminate: true } };
	},
});
const handOff = defineTool({
	name: "hand_off",
	description: "Hand the work off.",
	parameters: obj({ sha: str() }),
	execute: async (args, api, c) => {
		await api.commit(async (tx) => {
			(await tx.doc(Job, api.conversationId)).sha = args.sha;
		}, c);
		return { output: text("Handed off."), control: { terminate: true } };
	},
});

const Then = defineTask({
	name: "probe.then",
	version: 1,
	initial: () => ({ phase: "route" }),
	phases: {
		route: async (task, runtime, c) => {
			const handle = await runtime.conversation(runtime.conversationId, c);
			await runtime.commit(async (tx) => {
				await handle.submit(tx, { type: "input", content: "Revise: use NDJSON", requestId: `then:${task.id}` });
				(await tx.doc(Work, runtime.conversationId)).stage = "design";
				return terminal("completed", true);
			}, c);
		},
	},
	abort: abortPlain,
});

const drives = [];
const Build = defineTask({
	name: "probe.build",
	version: 1,
	initial: () => ({ phase: "start" }),
	phases: {
		start: async (task, runtime, c) => {
			await runtime.commit(async (tx) => {
				const child = await tx.createConversation({ ownership: { kind: "task", taskId: task.id } });
				await configure(tx, child.id, { instructions: "You are the implementer.", tools: [handOff] });
				(await tx.doc(Job, child.id)).design = task.input.design;
				return { status: "running", checkpoint: { phase: "drive", child: child.id } };
			}, c);
		},
		drive: async (task, runtime, c) => {
			const { child } = task.state.checkpoint;
			const conversation = await runtime.conversation(child, c);
			const request = { type: "input", content: "Implement the design.", requestId: `build:${task.id}:1` };
			const submission = await conversation.submit(request, c);
			drives.push(task.id);
			const settled = await submission.wait(c);
			await runtime.commit(async (tx) => {
				const job = await tx.doc(Job, child);
				return terminal("completed", { status: settled.status, sha: job.sha ?? null, design: job.design, child });
			}, c);
		},
	},
	abort: abortPlain,
});

const Hold = defineTask({
	name: "probe.hold",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: (_task, runtime, c) => runtime.sleepUntil(runtime.now() + WEEK, { phase: "never" }, c),
		never: (_task, runtime, c) => runtime.commit(() => terminal("completed", true), c),
	},
	abort: (task, runtime, c) =>
		runtime.commit(async (tx) => {
			if (task.input.withdraw) (await tx.doc(Decisions)).items[task.input.withdraw].status = "withdrawn";
			return terminal("aborted");
		}, c),
});

const registry = createRegistry();
registry.install(defineExtension({ name: "probe", tools: [propose, handOff], tasks: [Then, Build, Hold] }));

async function open(responses) {
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	faux.setResponses(responses);
	const storage = await openNodeSqliteStorage(join(dir, "walk.sqlite"));
	const harness = await Harness.open(storage, { models, registry, now }, ctx);
	const root = await harness.root(ctx, { agent: { model: { provider: "faux", modelId: "faux-1" } } });
	return { faux, harness, root };
}
const call = (name, args) => fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
const userTexts = async (conversation) => {
	const page = await conversation.entries({ order: "ascending" }, 200, undefined, ctx);
	return page.items.filter((e) => e.kind === "pi.user").map((e) => JSON.stringify(e.model ?? e.data));
};
const sleepingSoon = async (harness, id) => {
	for (let i = 0; i < 200; i++) {
		if ((await harness.getTask(id, ctx))?.state.status === "sleeping") return;
		await new Promise((r) => setTimeout(r, 5));
	}
	assert.fail("task never slept");
};

let gateReached;
const reached = new Promise((r) => (gateReached = r));
const gate = (_context, options) => {
	gateReached();
	return new Promise((_, reject) => {
		options?.signal?.addEventListener("abort", () => reject(new Error("stopped by close")));
	});
};
let s = await open([
	call("propose", { text: "design v1" }),
	fauxAssistantMessage([fauxText("revised")]),
	call("hand_off", { sha: "abc123" }),
	gate,
]);
const log = await s.harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
await s.harness.commit(async (tx) => {
	(await tx.doc(Decisions)).log = log.id;
}, ctx);

// A
await (await s.root.submit({ type: "input", content: "Add a --json flag." }, ctx)).wait(ctx);
await s.root.waitForIdle(ctx);
assert.equal(s.faux.state.callCount, 1, "A: terminate ends the run after one model request");
const afterA = await s.harness.commit(async (tx) => JSON.parse(JSON.stringify((await tx.doc(Decisions)).items)), ctx);
assert.equal(afterA["w1:x#1"].status, "open");
assert.equal((await log.entries({ order: "ascending" }, 10, undefined, ctx)).items.length, 1, "A: one event");

// B
const thenId = await s.harness.commit(
	(tx) => tx.createTask(Then, { choice: "revise" }, { ownership: { kind: "conversation" }, conversationId: s.root.id }),
	ctx,
);
await s.harness.waitForTask(thenId, ctx);
await s.root.waitForIdle(ctx);
assert.equal(s.faux.state.callCount, 2, "B: the admitted input started one run");
assert.equal((await userTexts(s.root)).filter((t) => t.includes("Revise: use NDJSON")).length, 1, "B: input placed once");

// C
const build = (design) =>
	s.harness.commit(
		(tx) => tx.createTask(Build, { design }, { ownership: { kind: "conversation" }, conversationId: s.root.id }),
		ctx,
	);
const buildC = await build(41);
const doneC = await s.harness.waitForTask(buildC, ctx);
assert.deepEqual(
	{ ...doneC.state.outcome.result, child: 0 },
	{ status: "done", sha: "abc123", design: 41, child: 0 },
	"C: hand-off doc read after the wait",
);
const childC = await s.harness.conversation(doneC.state.outcome.result.child, ctx);
const agentC = await childC.agent(ctx);
assert.deepEqual(
	agentC.tools.map((t) => t.name),
	["hand_off"],
	"C: the child has exactly the role's tools",
);
assert.equal((await s.harness.getTask(buildC, ctx))?.state.status ?? "gone", "terminal");

// D
const buildD = await build(42);
await reached;
assert.equal(drives.filter((id) => id === buildD).length, 1);
await s.harness.close(ctx);
s = await open([call("hand_off", { sha: "def456" })]);
const doneD = await s.harness.waitForTask(buildD, ctx);
assert.equal(doneD.state.outcome.result.sha, "def456", "D: the build finished after reopen");
assert.equal(drives.filter((id) => id === buildD).length, 2, "D: the drive phase ran again");
const childD = await s.harness.conversation(doneD.state.outcome.result.child, ctx);
assert.equal((await userTexts(childD)).filter((t) => t.includes("Implement the design.")).length, 1, "D: input once");

// E
const work = await s.harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
const owned = { ownership: { kind: "conversation" }, conversationId: work.id };
const [holdId, timerId] = await s.harness.commit(async (tx) => {
	(await tx.doc(Decisions)).items["w1:y#1"] = { status: "open" };
	const hold = await tx.createTask(Hold, { withdraw: "w1:y#1" }, owned);
	const timer = await tx.createTask(Hold, {}, { ...owned, background: true });
	return [hold, timer];
}, ctx);
await sleepingSoon(s.harness, holdId);
await sleepingSoon(s.harness, timerId);
await work.abort(ctx);
const afterE = await s.harness.commit(async (tx) => JSON.parse(JSON.stringify((await tx.doc(Decisions)).items)), ctx);
assert.equal(afterE["w1:y#1"].status, "withdrawn", "E: the abort handler withdrew the decision");
assert.equal((await s.harness.getTask(timerId, ctx)).state.status, "sleeping", "E: a background task survives abort()");
await work.abort(ctx, { background: true });
const timerAfter = await s.harness.getTask(timerId, ctx);
assert.notEqual(timerAfter?.state.status, "sleeping", "E: abort({ background: true }) reaches it");

// F
const before = s.faux.state.callCount;
const write = await s.root.submit({ type: "write", entry: { kind: "probe.note", data: { text: "a note" } } }, ctx);
const settledF = await write.wait(ctx);
await s.root.waitForIdle(ctx);
assert.equal(s.faux.state.callCount, before, "F: a write starts no model request");
assert.equal(settledF.status, "done");

await s.harness.close(ctx);
console.log("ok: checks A-F passed");
