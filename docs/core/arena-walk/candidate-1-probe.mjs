// Throwaway probe for the W1/W2 paper walk, candidate 1. Runs against pi-durable 1.5.2, in memory.
//   PI_MODULES=/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works node probe.mjs
// P1. Conversation.abort() (a client's Stop) aborts a non-background sleeping task of that conversation,
//     and leaves a background one sleeping.
// P2. An unbound host commit creates a background, conversation-owned task in a named conversation.
// P3. A host commit with no writes reads an entry of another conversation by ID (tx.entry is global).
// P4. In one commit, createConversation then configure(tx) works, and submit(tx) to it throws ReadAfterWrite.
// P5. A task phase can submit to another conversation and await Submission.wait() (the "driver" pattern).
import assert from "node:assert/strict";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { configure, createRegistry, defineEntry, defineExtension, defineTask, Harness, MemoryStorage, ReadAfterWrite } =
	d;

let clock = Date.UTC(2026, 10, 11);
const now = () => clock;
const DAY = 24 * 3600 * 1000;
const terminal = (status) => ({ status: "terminal", outcome: status === "completed" ? { status, result: null } : { status } });
const abort = (_t, runtime, c) => runtime.commit(() => terminal("aborted"), c);

const Sleeper = defineTask({
	name: "probe.sleep",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: (_t, runtime, c) => runtime.sleepUntil(runtime.now() + 7 * DAY, { phase: "done" }, c),
		done: (_t, runtime, c) => runtime.commit(() => terminal("completed"), c),
	},
	abort,
});
const seen = [];
const Driver = defineTask({
	name: "probe.driver",
	version: 1,
	initial: () => ({ phase: "drive" }),
	phases: {
		drive: async (task, runtime, c) => {
			const other = await runtime.conversation(task.input.conversation, c);
			const s = await other.submit({ type: "input", content: "work", requestId: "drive-1" }, c);
			const settled = await s.wait(c);
			seen.push(settled.status);
			await runtime.commit(() => terminal("completed"), c);
		},
	},
	abort,
});
const Basis = defineEntry("probe.basis");

const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([fauxAssistantMessage("done working")]);
const registry = createRegistry();
registry.install(defineExtension({ name: "probe", tasks: [Sleeper, Driver] }));
const harness = await Harness.open(new MemoryStorage(), { models, registry, now }, ctx);
const model = { provider: "faux", modelId: "faux-1" };
const chat = await harness.root(ctx, { agent: { model } });

// P1 and P2
const [plain, bg] = await harness.commit(async (tx) => [
	await tx.createTask(Sleeper, {}, { ownership: { kind: "conversation" }, conversationId: chat.id }),
	await tx.createTask(Sleeper, {}, { ownership: { kind: "conversation" }, conversationId: chat.id, background: true }),
], ctx);
harness.resume();
for (let i = 0; i < 100; i++) {
	const states = await Promise.all([plain, bg].map(async (id) => (await harness.getTask(id, ctx)).state.status));
	if (states.every((s) => s === "sleeping")) break;
	await new Promise((r) => setTimeout(r, 10));
}
await chat.abort(ctx);
const plainAfter = (await harness.getTask(plain, ctx)).state;
const bgAfter = (await harness.getTask(bg, ctx)).state;
assert.equal(plainAfter.status, "terminal");
assert.equal(plainAfter.outcome.status, "aborted", "Stop aborts a non-background sleeping task");
assert.equal(bgAfter.status, "sleeping", "Stop leaves a background sleeping task");
console.log("P1 ok: Stop aborted the plain sleeper; background sleeper:", bgAfter.status);
console.log("P2 ok: unbound commit created a background conversation-owned task");

// P3
const other = await harness.createConversation({ ownership: { kind: "ownerless" }, agent: { model } }, ctx);
const appended = await other.commit((tx) => tx.appendEntry(Basis, other.id, { data: { text: "design v1" } }), ctx);
const read = await harness.commit((tx) => tx.entry(Basis, appended.id), ctx);
assert.equal(read.data.text, "design v1");
console.log("P3 ok: a no-write host commit read entry", appended.id, "of conversation", other.id);

// P4
let submitThrew = false;
let configured;
await harness.commit(async (tx) => {
	const created = await tx.createConversation({ ownership: { kind: "ownerless" } });
	await configure(tx, created.id, { model, instructions: "You are the implementer." });
	configured = created.id;
	try {
		await chat.submit(tx, { type: "input", content: "hello" });
	} catch (error) {
		submitThrew = error instanceof ReadAfterWrite;
	}
}, ctx);
assert.ok(submitThrew, "submit(tx) after createConversation throws ReadAfterWrite");
const agent = await (await harness.conversation(configured, ctx)).agent(ctx);
assert.equal(agent.instructions, "You are the implementer.");
console.log("P4 ok: configure(tx) after createConversation works; submit(tx) after it throws ReadAfterWrite");

// P5
const worker = await harness.createConversation({ ownership: { kind: "ownerless" }, agent: { model } }, ctx);
const driver = await harness.commit(
	(tx) => tx.createTask(Driver, { conversation: worker.id }, { ownership: { kind: "conversation" }, conversationId: chat.id, background: true }),
	ctx,
);
await harness.waitForTask(driver, ctx);
assert.deepEqual(seen, ["done"]);
console.log("P5 ok: a task phase awaited another conversation's run:", seen[0]);

await harness.close(ctx);
console.log("ok: probe P1-P5 passed");
