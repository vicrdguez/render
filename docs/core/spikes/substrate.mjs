// Substrate checks for the core design, on pi-durable 1.5.2. Written by arena candidate 1, extended with check 7.
// 1. One process drives two SQLite-backed harnesses with separate registries. Both survive close and reopen.
// 2. An answer-shaped commit, not bound to a conversation, reads and writes a session doc and creates a task that is
//    found by name in the registry and owned by an explicit conversation.
// 3. After a table write in a commit, a table read throws ReadAfterWrite. Document access still works.
// 4. An ownerless event conversation takes typed entries and returns them after reopen.
// 5. `conversation.submit(tx, draft)` works before a table write and throws ReadAfterWrite after one.
// 6. A task sleeps on the Harness clock. The store closes, the clock moves a week, and on reopen the task wakes and
//    writes a decision-shaped doc.
// 7. Two answer-shaped commits race on one open decision. One wins, the other sees the winner's choice, and one
//    continuation task is created.
//   PI_MODULES=/path/to/node_modules/@earendil-works node docs/core/spikes/substrate.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { createRegistry, defineDoc, defineEntry, defineExtension, defineTask, Harness, ReadAfterWrite, section } = d;

const dir = mkdtempSync(join(tmpdir(), "render-probe-"));
let clock = Date.UTC(2026, 10, 10);
const now = () => clock;

const Decisions = defineDoc({
	kind: "probe.decisions",
	version: 1,
	scope: "session",
	initial: () => ({ items: {} }),
	checkpointWhen: () => false,
});
const Event = defineEntry("probe.event");
const seen = [];
const done = (runtime, c, result = true) =>
	runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result } }), c);
const abort = async (_t, runtime, c) => {
	await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c);
};
const Then = defineTask({
	name: "probe.then",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async (task, runtime, c) => {
			seen.push(task.input);
			await done(runtime, c);
		},
	},
	abort,
});
const WEEK = 7 * 24 * 3600 * 1000;
const Due = defineTask({
	name: "probe.due",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: async (_task, runtime, c) => {
			await runtime.sleepUntil(runtime.now() + WEEK, { phase: "ask" }, c);
		},
		ask: async (_task, runtime, c) => {
			await runtime.commit(async (tx) => {
				const doc = await tx.doc(Decisions);
				doc.items["w2:f1#1"] = { status: "open", choices: ["yes", "no", "void"], at: runtime.now() };
				return { status: "terminal", outcome: { status: "completed", result: true } };
			}, c);
		},
	},
	abort,
});

async function open(name, registry, responses) {
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	faux.setResponses(responses);
	const storage = await openNodeSqliteStorage(join(dir, `${name}.sqlite`));
	const harness = await Harness.open(storage, { models, registry, now }, ctx);
	const root = await harness.root(ctx, { agent: { model: { provider: "faux", modelId: "faux-1" } } });
	return { harness, root };
}

function registryFor(name) {
	const r = createRegistry();
	r.install(defineExtension({ name: `wf-${name}`, sections: [section("wf", () => name)], tasks: [Then, Due] }));
	return r;
}

const regA = registryFor("a");
const regB = registryFor("b");
let a = await open("a", regA, [fauxAssistantMessage("from A")]);
let b = await open("b", regB, [fauxAssistantMessage("from B")]);
const [sa, sb] = await Promise.all([
	a.root.submit({ type: "input", content: "hi A" }, ctx),
	b.root.submit({ type: "input", content: "hi B" }, ctx),
]);
await Promise.all([sa.wait(ctx), sb.wait(ctx)]);

const log = await a.harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
await a.harness.commit(async (tx) => {
	await tx.appendEntry(Event, log.id, { data: { what: "w1.started" } });
}, ctx);

let tableReadThrew = false;
let docAfterWrite = false;
await a.harness.commit(async (tx) => {
	const appended = await tx.appendEntry(Event, log.id, { data: { what: "basis" } });
	try {
		await tx.entry(appended.id);
	} catch (error) {
		tableReadThrew = error instanceof ReadAfterWrite;
	}
	const doc = await tx.doc(Decisions);
	doc.items["w1:design#1"] = { status: "open", basis: appended.id, then: "probe.then", conversation: a.root.id };
	docAfterWrite = true;
}, ctx);
assert.ok(tableReadThrew, "table read after write throws ReadAfterWrite");
assert.ok(docAfterWrite, "doc access after a table write works");

const taskId = await a.harness.commit(async (tx) => {
	const doc = await tx.doc(Decisions);
	const decision = doc.items["w1:design#1"];
	assert.equal(decision.status, "open");
	const then = regA.snapshot().task(decision.then);
	assert.ok(then, "then task resolved by name");
	doc.items["w1:design#1"] = { ...decision, status: "answered", choice: "approve" };
	return tx.createTask(then, { decision: "w1:design#1", choice: "approve" }, {
		ownership: { kind: "conversation" },
		conversationId: decision.conversation,
	});
}, ctx);
await a.harness.waitForTask(taskId, ctx);
assert.deepEqual(seen, [{ decision: "w1:design#1", choice: "approve" }]);

let submitAfterWriteThrew = false;
await a.harness.commit(async (tx) => {
	await a.root.submit(tx, { type: "write", entry: { kind: "probe.note", data: { n: 1 } }, requestId: "note-1" });
	await tx.appendEntry(Event, log.id, { data: { what: "after-submit" } });
}, ctx);
await a.harness.commit(async (tx) => {
	await tx.appendEntry(Event, log.id, { data: { what: "before-submit" } });
	try {
		await a.root.submit(tx, { type: "write", entry: { kind: "probe.note", data: { n: 2 } }, requestId: "note-2" });
	} catch (error) {
		submitAfterWriteThrew = error instanceof ReadAfterWrite;
	}
}, ctx);
assert.ok(submitAfterWriteThrew, "submit(tx) after a table write throws ReadAfterWrite");

await a.harness.commit(async (tx) => {
	const doc = await tx.doc(Decisions);
	doc.items["w1:merge#1"] = { status: "open", then: "probe.then", conversation: a.root.id };
}, ctx);
const answerOnce = (choice) =>
	a.harness.commit(async (tx) => {
		const doc = await tx.doc(Decisions);
		const decision = doc.items["w1:merge#1"];
		if (decision.status !== "open") return { won: false, choice: decision.choice };
		doc.items["w1:merge#1"] = { ...decision, status: "answered", choice };
		const task = await tx.createTask(regA.snapshot().task(decision.then), { decision: "w1:merge#1", choice }, {
			ownership: { kind: "conversation" },
			conversationId: decision.conversation,
		});
		return { won: true, choice, task };
	}, ctx);
const race = await Promise.all([answerOnce("approve"), answerOnce("revise")]);
const winner = race.find((r) => r.won);
const loser = race.find((r) => !r.won);
assert.ok(winner && loser, "one of two concurrent answers wins");
assert.equal(loser.choice, winner.choice, "the loser reads the winner's choice");
await a.harness.waitForTask(winner.task, ctx);
assert.equal(seen.filter((i) => i.decision === "w1:merge#1").length, 1, "one continuation task ran");

const dueId = await a.root.commit(
	(tx) => tx.createTask(Due, {}, { ownership: { kind: "conversation" } }),
	ctx,
);
a.harness.resume();
for (let i = 0; i < 50; i++) {
	const t = await a.harness.getTask(dueId, ctx);
	if (t?.state.status === "sleeping") break;
	await new Promise((r) => setTimeout(r, 20));
}
assert.equal((await a.harness.getTask(dueId, ctx)).state.status, "sleeping");
assert.equal(a.harness.wake().at, clock + WEEK, "wake() reports the sleep deadline");

const logIdA = log.id;
await a.harness.close(ctx);
await b.harness.close(ctx);
clock += WEEK + 1000;

a = await open("a", regA, []);
b = await open("b", regB, []);
a.harness.resume();
await a.harness.waitForTask(dueId, ctx);
const decisions = await a.harness.snapshot(Decisions, ctx);
assert.equal(decisions.items["w2:f1#1"].status, "open");
assert.equal(decisions.items["w1:design#1"].status, "answered");
const text = async (h) => {
	const page = await h.root.entries({ order: "ascending" }, 100, undefined, ctx);
	return JSON.stringify(page.items.map((e) => e.model ?? e.kind));
};
const [ta, tb] = [await text(a), await text(b)];
assert.ok(ta.includes("from A") && !ta.includes("from B"));
assert.ok(tb.includes("from B") && !tb.includes("from A"));
const events = await (await a.harness.conversation(logIdA, ctx)).entries({ order: "ascending" }, 10, undefined, ctx);
assert.deepEqual(
	events.items.map((e) => e.data?.what),
	["w1.started", "basis", "after-submit", "before-submit"],
);
await a.harness.close(ctx);
await b.harness.close(ctx);
console.log("ok: checks 1-7 passed");
