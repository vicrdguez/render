import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { defineExtension, defineTask, defineTool, type ConversationId } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import type { ExtensionModule } from "../src/index.js";
import { Projects } from "../src/projects.js";
import { gate, modules } from "./extensions.js";
import { start, until, type Running } from "./helpers.js";

const reload = (s: Running) => (s.server as typeof s.server & { reload(): Promise<{ result?: { status: string } }> }).reload();
function latch() {
	let release = () => {};
	const promise = new Promise<void>(resolve => { release = resolve; });
	return { promise, release };
}
async function idle(s: Running) {
	await until("idle", async () => (await s.call("conversations", { project: "p" })).body.result.items.every((c: { state: string }) => c.state === "idle"));
}

test("new prose reaches new conversations and rendered inputs but not saved instructions", async () => {
	function prose(label: string): ExtensionModule {
		const extension = defineExtension({ name: "prose", sections: [{ key: "fresh", render: () => `input-${label}` }] });
		return { extension, entry: { model: { provider: "faux", modelId: "a" }, extensions: [extension], instructions: `instructions-${label}` } };
	}
	let current = prose("old");
	const s = await start({ source: () => ({ modules: { prose: current }, failures: [] }) });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: ["prose"] });
		const conversation = (await s.call("create", { project: "p", workflow: "prose" })).body.result.conversation;
		const prompts: string[] = [];
		const response = (input: { messages: unknown }) => { prompts.push(JSON.stringify(input.messages)); return fauxAssistantMessage("done"); };
		s.faux.setResponses([response, response, response]);
		await s.call("input", { project: "p", conversation, text: "before", requestId: "before" }); await idle(s);
		current = prose("new");
		assert.equal((await reload(s)).result?.status, "applied");
		await s.call("input", { project: "p", conversation, text: "after", requestId: "after" }); await idle(s);
		const newer = (await s.call("create", { project: "p", workflow: "prose" })).body.result.conversation;
		await s.call("input", { project: "p", conversation: newer, text: "new", requestId: "new" }); await idle(s);
		assert.match(prompts[0] ?? "", /instructions-old/); assert.match(prompts[0] ?? "", /input-old/);
		assert.match(prompts[1] ?? "", /input-new/); assert.match(prompts[1] ?? "", /instructions-old/); assert.doesNotMatch(prompts[1] ?? "", /instructions-new/);
		assert.match(prompts[2] ?? "", /instructions-new/);
	} finally { await s.close(); }
});

test("a newly found extension wakes a listed task and reaches a running agent only in selected projects", { timeout: 5000 }, async t => {
	let projects!: Projects; const original = Projects.prototype.start;
	t.mock.method(Projects.prototype, "start", function (this: Projects) { projects = this; return original.call(this); });
	const entered = latch(); const held = latch();
	const task = defineTask<Record<string, never>, { phase: "run" }, null>({ name: "late.task", version: 1, initial: () => ({ phase: "run" }), phases: { run: async (_task, runtime, c) => { await runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), c); } }, abort: async (_task, runtime, c) => { await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted", reason: "test" } }), c); } });
	const extension = defineExtension({ name: "late", tasks: [task], tools: [defineTool({ name: "late_tool", description: "late tool", parameters: obj({}), execute: async () => ({ output: [{ type: "text", text: "late-output" }] }) })] });
	let loaded = false;
	const s = await start({ source: () => ({ modules: loaded ? { late: { extension } } : {}, failures: [] }) });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: ["late"] });
		await s.call("bind", { project: "q", workdir: "/q", extensions: [] });
		const q = projects.get("q")!; const qSnapshot = q.registry.snapshot();
		const conversation = (await s.call("create", { project: "p", model: "faux/a" })).body.result.conversation as ConversationId;
		const harness = projects.get("p")!.store.harness;
		const id = await harness.commit(tx => tx.createTask(task, {}, { ownership: { kind: "conversation" }, conversationId: conversation, background: true }), context);
		await until("missing task", async () => (await harness.inspect(context)).tasks.some(t => t.record.id === id && t.state.kind === "blocked"));
		const prompts: string[] = [];
		s.faux.setResponses([async input => { prompts.push(JSON.stringify(input.messages)); entered.release(); await held.promise; return fauxAssistantMessage([fauxToolCall("read", { path: "missing-file" })], { stopReason: "toolUse" }); }, input => { prompts.push(JSON.stringify(input.messages)); return fauxAssistantMessage([fauxToolCall("late_tool", {})], { stopReason: "toolUse" }); }, fauxAssistantMessage("done")]);
		await s.call("input", { project: "p", conversation, text: "go", requestId: "late" }); await entered.promise;
		loaded = true; assert.equal((await reload(s)).result?.status, "applied");
		held.release(); await idle(s);
		await until("late task completes", async () => (await harness.getTask(id, context))?.state.status === "terminal");
		assert.doesNotMatch(prompts[0] ?? "", /late_tool/); assert.match(prompts[1] ?? "", /late_tool/);
		assert.equal(q.registry.snapshot(), qSnapshot);
		assert.equal(q.registry.snapshot().extension("late"), undefined);
	} finally { held.release(); await s.close(); }
});

test("input answer streams and a running tool proceed during an affected reload scan", { timeout: 5000 }, async () => {
	const entered = latch(); const held = latch(); let scanning = false;
	const s = await start({ source: async () => { if (scanning) { entered.release(); await held.promise; } return { modules, failures: [] }; } });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: ["flow"] });
		await s.call("setOptions", { project: "p", extension: "flow", patch: { designer: "faux/a" } });
		const conversation = (await s.call("create", { project: "p", workflow: "flow" })).body.result.conversation;
		const inbox = s.watch("inbox", {}); const open = s.watch("open", { project: "p", conversation }); await open.until(w => w.value !== undefined);
		s.faux.setResponses([fauxAssistantMessage([fauxToolCall("ask", { key: "reload" })], { stopReason: "toolUse" }), fauxAssistantMessage("asked")]);
		await s.call("input", { project: "p", conversation, text: "ask", requestId: "ask" });
		await inbox.until(w => w.value?.p?.["flow:reload"] !== undefined); await idle(s);
		const decision = (await s.call("decision", { project: "p", decision: "flow:reload#1" })).body.result.decision;
		gate.arm();
		s.faux.setResponses([fauxAssistantMessage([fauxToolCall("hold", {})], { stopReason: "toolUse" }), fauxAssistantMessage("done"), fauxAssistantMessage("followed")]);
		await s.call("input", { project: "p", conversation, text: "hold", requestId: "hold" }); await gate.entered;
		scanning = true; const pending = reload(s); await entered.promise;
		const frames = open.frames;
		assert.equal((await s.call("input", { project: "p", conversation, text: "later", requestId: "later", whenBusy: "followUp" })).status, 200);
		assert.equal((await s.call("answer", { project: "p", decision: decision.id, basis: decision.basis, choice: "approve", annotations: [] })).status, 200);
		gate.release(); await idle(s); await open.until(w => w.frames > frames); assert.equal(open.closed, false);
		held.release(); assert.equal((await pending).result?.status, "applied");
		open.close(); inbox.close();
	} finally { gate.release(); held.release(); await s.close(); }
});

for (const migrate of [false, true]) test(`a task version rise is allowed with migrate ${migrate}`, async () => {
	const abort = async () => {};
	const old = defineTask({ name: "upgrade.task", version: 1, initial: () => ({ phase: "old" }), phases: { old: async () => {} }, abort });
	const next = defineTask({ name: "upgrade.task", version: 2, initial: () => ({ phase: "new" }), phases: { new: async () => {} }, abort, ...(migrate ? { migrate: () => ({ input: {}, checkpoint: { phase: "new" } }) } : {}) });
	let task = old as typeof old | typeof next;
	const s = await start({ source: () => ({ modules: { upgrade: { extension: defineExtension({ name: "upgrade", tasks: [task] }) } }, failures: [] }) });
	try { task = next; assert.equal((await reload(s)).result?.status, "applied"); }
	finally { await s.close(); }
});
