// Throwaway probe. No Tau implementation. Data lives under os.tmpdir().
// PI_MODULES=/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base);
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { obj } = await import(`${base}/pi-schema/dist/index.js`);
const { Harness, createRegistry, defineExtension, defineTool, defineDoc } = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const dir = mkdtempSync(join(tmpdir(), "tau-wire-"));
const db = join(dir, "store.sqlite");
const gate = Promise.withResolvers();
const registry = createRegistry();
const extension = defineExtension({
	name: "probe",
	tools: [defineTool({
		name: "hold",
		description: "Hold for the probe",
		parameters: obj({}),
		execute: async (_args, api) => {
			api.output("tool-output\n");
			await gate.promise;
			return { output: [{ type: "text", text: "tool-result" }] };
		},
	})],
});
registry.install(extension);
const models = createModels();
const faux = fauxProvider({ tokensPerSecond: 120, tokenSize: { min: 1, max: 1 } });
faux.setResponses([
	fauxAssistantMessage([
		fauxText("This response is long enough to expose a partial before the tool call starts. The probe waits for that state."),
		fauxToolCall("hold", {}, { id: "call-1" }),
	], { stopReason: "toolUse" }),
	fauxAssistantMessage([fauxText("The tool and steer both finished.")]),
]);
models.setProvider(faux.provider);
let harness = await Harness.open(await openNodeSqliteStorage(db), { models, registry }, ctx);
const root = await harness.root(ctx, { agent: { model: { provider: "faux", modelId: "faux-1" }, extensions: [extension] } });
let conversationId = root.id;
const streams = new Set();
const server = createServer(async (req, res) => {
	if (req.method !== "POST" || req.headers.authorization !== "Bearer probe") {
		res.writeHead(401).end();
		return;
	}
	let watch;
	try {
		watch = await (await harness.conversation(conversationId, ctx)).watch(ctx);
		streams.add(watch);
		res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
		let seq = 0;
		const send = async (kind, value) => {
			if (res.destroyed) return;
			const bytes = `data: ${JSON.stringify({ kind, seq: seq++, value })}\n\n`;
			if (!res.write(bytes)) await once(res, "drain");
		};
		res.on("close", () => { streams.delete(watch); void watch.stop(); });
		await send("snapshot", watch.value);
		watch.start(async call => {
			assert.equal(call.kind, "value");
			await send("value", call.value);
		});
		await watch.closed;
		streams.delete(watch);
		if (!res.destroyed) res.end();
	} catch (error) {
		if (!res.destroyed) res.destroy(error);
		await watch?.stop();
	}
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const clients = [];
async function connect() {
	const abort = new AbortController();
	const response = await fetch(url, { method: "POST", headers: { Authorization: "Bearer probe" }, signal: abort.signal });
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("content-type"), "text/event-stream");
	const frames = [];
	const waiters = new Set();
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const pump = (async () => {
		let pending = "";
		try {
			for (;;) {
				const part = await reader.read();
				if (part.done) break;
				pending += decoder.decode(part.value, { stream: true });
				let end;
				while ((end = pending.indexOf("\n\n")) !== -1) {
					const frame = JSON.parse(pending.slice(6, end));
					pending = pending.slice(end + 2);
					assert.equal(frame.seq, frames.length);
					frames.push(frame);
					for (const notify of [...waiters]) notify();
				}
			}
		} catch (error) {
			if (!abort.signal.aborted) throw error;
		}
	})();
	const wait = predicate => {
		const timeoutError = new Error("frame wait timed out");
		const found = frames.find(predicate);
		if (found) return Promise.resolve(found);
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => { waiters.delete(notify); reject(timeoutError); }, 8000);
			const notify = () => {
				const match = frames.find(predicate);
				if (match) { clearTimeout(timeout); waiters.delete(notify); resolve(match); }
			};
			waiters.add(notify);
		});
	};
	const client = { frames, wait, close: async () => { abort.abort(); await pump; } };
	clients.push(client);
	await wait(f => f.kind === "snapshot");
	return client;
}
const live = f => f.value.docs["pi.live"] ?? {};
const queued = f => f.value.docs["pi.inbox"]?.items ?? [];
try {
	const first = await connect();
	assert.equal(first.frames[0].seq, 0);
	const draft = { type: "input", requestId: "client:r1", content: "Run the hold tool." };
	const submission = await root.submit(draft, ctx);
	await first.wait(f => live(f).generation?.message?.content?.some(b => b.type === "text" && b.text.length > 0));
	await first.wait(f => live(f).tools?.some(t => t.status === "running" && t.output?.includes("tool-output")));
	await root.submit({ type: "input", requestId: "client:s1", content: "Be brief.", whenBusy: "steer", whenIdle: "reject" }, ctx);
	await first.wait(f => queued(f).some(item => item.mode === "steer"));
	const late = await connect();
	assert.equal(late.frames.length >= 1, true);
	assert.ok(live(late.frames[0]).tools?.some(t => t.output?.includes("tool-output")));
	assert.ok(queued(late.frames[0]).some(item => item.mode === "steer"));
	await late.close();
	gate.resolve();
	await submission.wait(ctx);
	await harness.waitForIdle(ctx);
	await first.wait(f => !live(f).run && f.value.entries.some(e => e.kind === "pi.tool-result"));
	console.log("PASS HTTP SSE snapshot, partial text, tool output, queued steer, run end");
	assert.equal((await root.submit(draft, ctx)).id, submission.id);
	console.log("PASS input resend returns first submission");
	console.log("PASS late join starts with current tool and queue");

	const Notes = defineDoc({ kind: "probe.notes", version: 1, scope: "session", initial: () => ({ text: "zero" }), checkpointWhen: () => false });
	await harness.commit(async tx => { await tx.doc(Notes); }, ctx);
	const notes = await harness.watchDoc(Notes, ctx);
	const entered = Promise.withResolvers();
	const unblock = Promise.withResolvers();
	const folded = Promise.withResolvers();
	let calls = 0;
	notes.start(async call => {
		assert.equal(call.kind, "value");
		calls++;
		if (calls === 1) { entered.resolve(); await unblock.promise; }
		else { assert.equal(call.value.text, "three"); folded.resolve(); }
	});
	await harness.commit(async tx => { (await tx.doc(Notes)).text = "hold"; }, ctx);
	await entered.promise;
	for (const text of ["one", "two", "three"]) await harness.commit(async tx => { (await tx.doc(Notes)).text = text; }, ctx);
	unblock.resolve();
	await folded.promise;
	assert.equal(calls, 2);
	await notes.stop();
	console.log("PASS busy watch folds three commits into one value");
	const entries = first.frames.at(-1).value.entries;
	await first.close();
	await harness.close(ctx);
	harness = await Harness.open(await openNodeSqliteStorage(db), { models, registry }, ctx);
	const reopened = await connect();
	assert.deepEqual(reopened.frames[0].value.entries, entries);
	assert.equal(live(reopened.frames[0]).run, undefined);
	await reopened.close();
	console.log("PASS SQLite reopen starts with current state");
} finally {
	gate.resolve();
	for (const client of clients) await client.close();
	for (const stream of streams) await stream.stop();
	server.closeAllConnections();
	await new Promise(resolve => server.close(resolve));
	await harness.close(ctx);
	rmSync(dir, { recursive: true, force: true });
}
