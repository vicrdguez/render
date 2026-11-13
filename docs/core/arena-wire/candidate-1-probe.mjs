// Transport probe for candidate 1 of the protocol arena. It runs the moves the design leans on, over a real
// node:http listener on 127.0.0.1 with a port the system picks, against pi-durable 1.5.2 with SQLite files in the
// system temp directory. The server half is a stand-in shaped like the design: POST /v1/<call> with a JSON body,
// a `result` or `refused` reply, and streams as text/event-stream whose first message is the value and whose later
// messages are pi-durable's ops. The client half uses fetch and Chord's applyImmutable. No Tau code exists.
//
// W1. open over SSE: the exact bytes of the first messages while a run streams text, runs a tool with output, and
//     takes a queued steer. The client's applied value equals a fresh server view at the end.
// W2. A resent input with the same request ID returns the first submission.
// W3. A tool that prints 4 MB: what its running output costs a stream.
// W3b. A slow client. One stream is not read for 3 s while a 3 MB answer streams. The server's write waits for
//     drain, pi-durable folds meanwhile, the slow stream gets fewer messages, and both clients end on the same value.
// W4. Reconnect with `from`: after 3 missed entries the first message holds exactly those; after 120 it holds the
//     newest 50 and `before` marks the gap.
// W5. A history cursor taken before a restart pages on after it, with no gap and no overlap.
// W6. A harness close ends an open stream with an `end` message; a new stream after reopen starts with the value.
// W7. inbox: two stores' open lists merged into one value by prefixing each store's ops with its project.
// W8. Revoking a device ends its open stream with `end` and refuses its next call with 401.
// W9. Envelope: unknown call, unknown protocol version, an unknown body field, and a refused steer to an idle
//     conversation each give a `refused` reply with the stated code.
//   PI_MODULES=/path/to/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { applyImmutable } = await import(`${base}/chord/dist/delta/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } = await import(
	`${base}/pi-ai/dist/providers/faux.js`
);
const { compile, int, obj, oneOf, opt, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { ConversationIdle, createRegistry, defineDoc, defineExtension, defineTool, Harness } = d;

const dir = mkdtempSync(join(tmpdir(), "tau-wire-"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the stores
let toolStarted;
let toolGo;
const count = defineTool({
	name: "count",
	description: "Counts to three.",
	parameters: obj({}),
	execute: async (_args, api) => {
		toolStarted();
		await new Promise((r) => (toolGo = r));
		for (const n of [1, 2, 3]) {
			api.output(`${n}\n`);
			await sleep(150);
		}
		return {};
	},
});
const flood = defineTool({
	name: "flood",
	description: "Prints 4 MB.",
	parameters: obj({}),
	execute: async (_args, api) => {
		const chunk = `${"x".repeat(16 * 1024 - 1)}\n`;
		for (let i = 0; i < 256; i++) {
			api.output(chunk);
			if (i % 16 === 0) await sleep(10);
		}
		return {};
	},
});
const Tools = defineExtension({ name: "probe", tools: [count, flood] });
const OpenList = defineDoc({
	kind: "tau.open",
	version: 1,
	scope: "session",
	initial: () => ({ open: {} }),
	checkpointWhen: () => false,
});

const faux = fauxProvider({ tokensPerSecond: 40, tokenSize: { min: 1, max: 1 } });
const quick = fauxProvider({ provider: "quick", api: "quick", tokensPerSecond: 250_000, tokenSize: { min: 500, max: 500 } });
const models = createModels();
models.setProvider(faux.provider);
models.setProvider(quick.provider);
const MODEL = { provider: "faux", modelId: "faux-1" };
const QUICK = { provider: "quick", modelId: quick.models[0].id };
async function openStore(name) {
	const registry = createRegistry();
	registry.install(Tools);
	const storage = await openNodeSqliteStorage(join(dir, `${name}.sqlite`));
	const harness = await Harness.open(storage, { models, registry, settings: { retry: { enabled: false } } }, ctx);
	harness.resume();
	await harness.commit(async (tx) => {
		await tx.doc(OpenList);
	}, ctx);
	return harness;
}
const projects = new Map([
	["p", await openStore("p")],
	["q", await openStore("q")],
]);

// ---------------------------------------------------------------- the server stand-in
const devices = new Map(); // device -> sha256 of the secret
const streamsOf = new Map(); // device -> Set of end functions
function mint(device) {
	const secret = randomBytes(32).toString("base64url");
	devices.set(device, createHash("sha256").update(secret).digest());
	return `tau.${device}.${secret}`;
}
function authenticate(header) {
	const match = /^Bearer tau\.([a-z0-9-]+)\.([A-Za-z0-9_-]{43})$/.exec(header ?? "");
	if (!match) return undefined;
	const stored = devices.get(match[1]);
	const given = createHash("sha256").update(match[2]).digest();
	return stored !== undefined && timingSafeEqual(stored, given) ? match[1] : undefined;
}
function revoke(device) {
	devices.delete(device);
	for (const end of streamsOf.get(device) ?? []) end("revoked");
}

const refused = (status, code, message, more = {}) => ({ status, body: { refused: { code, message, ...more } } });
const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const decodeCursor = (text) => JSON.parse(Buffer.from(text, "base64url").toString("utf8"));

const shapes = {
	open: compile(obj({ project: str(), conversation: int(), from: opt(int()) })),
	input: compile(
		obj({
			project: str(),
			conversation: int(),
			text: str({ minLength: 1 }),
			requestId: str({ minLength: 1, maxLength: 128 }),
			whenBusy: opt(oneOf(["steer", "followUp"])),
			whenIdle: opt(oneOf(["reject"])),
		}),
	),
	history: compile(
		obj({
			project: str(),
			conversation: int(),
			cursor: opt(str()),
			minEntryId: opt(int()),
			maxEntryId: opt(int()),
			order: opt(oneOf(["ascending", "descending"])),
			limit: opt(int({ minimum: 1, maximum: 500 })),
		}),
	),
	inbox: compile(obj({})),
};
const CALLS = Object.keys(shapes);

const counters = new Map(); // a label per stream -> { messages, bytes, drains, waitedMs }
function sse(res, device, label) {
	let open = true;
	const stats = { messages: 0, bytes: 0, drains: 0, waitedMs: 0 };
	if (label) counters.set(label, stats);
	res.writeHead(200, {
		"content-type": "text/event-stream",
		"cache-control": "no-store",
		"x-accel-buffering": "no",
	});
	const stops = [];
	const end = (reason) => {
		if (!open) return;
		open = false;
		res.end(`data: ${JSON.stringify({ kind: "end", reason })}\n\n`);
		for (const stop of stops) stop();
	};
	if (!streamsOf.has(device)) streamsOf.set(device, new Set());
	streamsOf.get(device).add(end);
	res.on("close", () => {
		open = false;
		streamsOf.get(device).delete(end);
		for (const stop of stops) stop();
	});
	return {
		onStop: (stop) => stops.push(stop),
		end,
		async send(message) {
			if (!open) return;
			const text = `data: ${JSON.stringify(message)}\n\n`;
			stats.messages++;
			stats.bytes += Buffer.byteLength(text);
			if (res.write(text)) return;
			stats.drains++;
			const start = Date.now();
			await new Promise((resolve) => {
				const done = () => {
					clearTimeout(timer);
					res.off("drain", done);
					res.off("close", done);
					resolve();
				};
				const timer = setTimeout(() => res.destroy(), 60_000);
				res.on("drain", done);
				res.on("close", done);
			});
			stats.waitedMs += Date.now() - start;
		},
	};
}
// A path segment of a doc watch's op, moved under `prefix` (as pi-durable's view.ts does for its documents).
function prefixed(op, prefix) {
	switch (op[0]) {
		case "r":
			return ["s", prefix, op[1]];
		case "p":
			return ["p", [...prefix, ...op[1]], op[2], op[3], op[4]];
		case "m":
			return ["m", [...prefix, ...op[1]], op[2]];
		default:
			return [op[0], [...prefix, ...op[1]], ...op.slice(2)];
	}
}

async function handle(call, body, device, res, label) {
	const harness = projects.get(body.project);
	if (call !== "inbox" && harness === undefined) return refused(404, "unknown_project", `No project ${body.project}.`);
	if (call === "open") {
		const conversation = await harness.conversation(body.conversation, ctx);
		if (!conversation) return refused(404, "unknown_conversation", `No conversation ${body.conversation}.`);
		const watch = await conversation.watch(ctx, body.from === undefined ? undefined : { from: body.from });
		const out = sse(res, device, label);
		out.onStop(() => void watch.stop());
		await out.send({ kind: "value", value: watch.value });
		watch.start(async (c) => {
			if (c.kind === "value") await out.send({ kind: "ops", ops: c.ops });
		});
		watch.closed.then((end) => out.end(end.kind === "stopped" ? "stopped" : "closed"));
		return undefined;
	}
	if (call === "inbox") {
		const out = sse(res, device, label);
		const watches = [];
		for (const [project, h] of projects) watches.push([project, await h.watchDoc(OpenList, ctx)]);
		out.onStop(() => watches.forEach(([, w]) => void w.stop()));
		await out.send({ kind: "value", value: Object.fromEntries(watches.map(([p, w]) => [p, w.value])) });
		for (const [project, watch] of watches) {
			watch.start(async (c) => {
				if (c.kind === "value") await out.send({ kind: "ops", ops: c.ops.map((op) => prefixed(op, [project])) });
			});
		}
		return undefined;
	}
	if (call === "input") {
		const conversation = await harness.conversation(body.conversation, ctx);
		if (!conversation) return refused(404, "unknown_conversation", `No conversation ${body.conversation}.`);
		const draft = {
			type: "input",
			content: body.text,
			requestId: `client:${body.requestId}`,
			...(body.whenBusy ? { whenBusy: body.whenBusy } : {}),
			...(body.whenIdle ? { whenIdle: body.whenIdle } : {}),
		};
		try {
			const record = await (await conversation.submit(draft, ctx)).status(ctx);
			const { trace: _trace, ...rest } = record;
			return { status: 200, body: { result: { submission: { ...rest, requestId: body.requestId } } } };
		} catch (error) {
			if (error instanceof ConversationIdle) return refused(409, "not_running", "Nothing is running.");
			throw error;
		}
	}
	if (call === "history") {
		const conversation = await harness.conversation(body.conversation, ctx);
		if (!conversation) return refused(404, "unknown_conversation", `No conversation ${body.conversation}.`);
		const state = body.cursor
			? decodeCursor(body.cursor)
			: {
					q: Object.fromEntries(
						["minEntryId", "maxEntryId", "order"].filter((k) => body[k] !== undefined).map((k) => [k, body[k]]),
					),
					c: undefined,
				};
		const page = await conversation.entries(state.q, body.limit ?? 50, state.c, ctx);
		const next = page.next === undefined ? {} : { next: encodeCursor({ q: state.q, c: page.next }) };
		return { status: 200, body: { result: { items: page.items, ...next } } };
	}
	throw new Error(`no handler for ${call}`);
}

const server = createServer(async (req, res) => {
	const reply = ({ status, body }) => {
		res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
		res.end(JSON.stringify(body));
	};
	try {
		const url = new URL(req.url, "http://127.0.0.1");
		const label = req.headers["x-probe-label"];
		const device = authenticate(req.headers.authorization);
		if (device === undefined) return reply(refused(401, "unauthorized", "Send a valid device token."));
		const route = /^\/v(\d+)\/([A-Za-z]*)$/.exec(url.pathname);
		if (req.method !== "POST" || !route || route[1] !== "1")
			return reply(refused(404, "unsupported_protocol", "This server speaks protocol 1.", { supported: [1] }));
		const call = route[2];
		if (!CALLS.includes(call))
			return reply(refused(404, "unknown_call", `This server has no call ${call}.`, { calls: CALLS }));
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
		const errors = shapes[call].errors(body);
		if (errors.length > 0) return reply(refused(400, "bad_request", "The body does not fit the call.", { errors }));
		const answer = await handle(call, body, device, res, label);
		if (answer !== undefined) reply(answer);
	} catch (error) {
		if (!res.headersSent)
			reply({ status: 503, body: { unknown: { code: "server_error", message: String(error?.message) } } });
		else res.destroy();
	}
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = `http://127.0.0.1:${server.address().port}`;

// ---------------------------------------------------------------- the client half
const laptop = mint("laptop");
const phone = mint("phone");
async function call(token, name, body, path = `/v1/${name}`) {
	const res = await fetch(`${origin}${path}`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return { status: res.status, body: await res.json() };
}
// Opens a stream and keeps its raw messages and the value the client builds from them.
function watchStream(token, name, body, { label, holdMs = 0 } = {}) {
	const controller = new AbortController();
	const state = { raw: [], messages: [], value: undefined, ended: undefined, error: undefined };
	state.done = (async () => {
		const res = await fetch(`${origin}/v1/${name}`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/json",
				...(label ? { "x-probe-label": label } : {}),
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		state.status = res.status;
		if (!res.headers.get("content-type")?.startsWith("text/event-stream")) {
			state.reply = await res.json();
			return;
		}
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		if (holdMs > 0) await sleep(holdMs);
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let cut;
			while ((cut = buffer.indexOf("\n\n")) >= 0) {
				const block = buffer.slice(0, cut + 2);
				buffer = buffer.slice(cut + 2);
				if (block.startsWith(":")) continue;
				state.raw.push(block);
				const message = JSON.parse(block.slice("data: ".length));
				state.messages.push(message);
				if (message.kind === "value") state.value = message.value;
				else if (message.kind === "ops") state.value = applyImmutable(state.value, message.ops);
				else if (message.kind === "end") state.ended = message.reason;
			}
		}
	})().catch((error) => {
		state.error = error.name;
	});
	state.stop = () => controller.abort();
	return state;
}
const until = async (what, test) => {
	for (let i = 0; i < 600; i++) {
		if (await test()) return;
		await sleep(10);
	}
	assert.fail(`never: ${what}`);
};

// W1 and W2
const P = projects.get("p");
const C = await P.createConversation(
	{ ownership: { kind: "ownerless" }, agent: { model: MODEL, extensions: [Tools], tools: [count] } },
	ctx,
);
faux.setResponses([
	fauxAssistantMessage([fauxToolCall("count", {}, { id: "call-1" })], { stopReason: "toolUse" }),
	fauxAssistantMessage([fauxText("Counted to three, using the existing serializer.")]),
]);
const started = new Promise((r) => (toolStarted = r));
const live = watchStream(laptop, "open", { project: "p", conversation: C.id });
await until("first message", () => live.messages.length >= 1);
const first = await call(laptop, "input", {
	project: "p",
	conversation: C.id,
	text: "Count to three, then tell me.",
	requestId: "r-1",
});
assert.equal(first.status, 200);
await started;
const steerBody = {
	project: "p",
	conversation: C.id,
	text: "Use the existing serializer.",
	requestId: "r-2",
	whenBusy: "steer",
};
const steer = await call(laptop, "input", steerBody);
const again = await call(laptop, "input", steerBody);
assert.equal(again.body.result.submission.id, steer.body.result.submission.id);
console.log(
	`W2 ok: a resent input with request ID r-2 returned submission ${again.body.result.submission.id} again, status ` +
		`${steer.body.result.submission.status}`,
);
toolGo();
await C.waitForIdle(ctx);
await sleep(50);
live.stop();
await live.done;
const fresh = await C.watch(ctx);
assert.deepEqual(live.value, fresh.value);
await fresh.stop();
console.log(`W1 ok: ${live.messages.length} messages, ${live.raw.reduce((n, b) => n + Buffer.byteLength(b), 0)} bytes; the applied value equals a fresh view`);
for (const [i, block] of live.raw.slice(0, 3).entries())
	console.log(`W1 message ${i + 1}, ${Buffer.byteLength(block)} bytes:\n${JSON.stringify(block)}`);
const verbs = live.messages.slice(1).map((m) =>
	m.kind === "ops" ? m.ops.map((op) => `${op[0]}:${Array.isArray(op[1]) ? op[1].slice(0, 4).join("/") : ""}`).join(" ") : m.kind,
);
console.log(`W1 every later message, by op and path:\n  ${verbs.join("\n  ")}`);
const steerQueued = live.messages.some(
	(m) => m.kind === "ops" && m.ops.some((op) => JSON.stringify(op).includes("Use the existing serializer.") && JSON.stringify(op[1]).includes("pi.inbox")),
);
console.log(`W1 the steer showed in pi.inbox before it was placed: ${steerQueued}`);
const rawWhere = (test) => live.raw.find((block, i) => live.messages[i].kind === "ops" && test(live.messages[i].ops));
console.log(
	`W1 the queued steer:\n${JSON.stringify(rawWhere((ops) => ops.length === 1 && ops[0][0] === "p" && ops[0][1][1] === "pi.inbox"))}`,
);
console.log(`W1 tool output:\n${JSON.stringify(rawWhere((ops) => ops.length === 1 && ops[0][0] === "a" && ops[0][1][2] === "tools"))}`);
console.log(
	`W1 partial answer text:\n${JSON.stringify(rawWhere((ops) => ops.length === 1 && ops[0][0] === "a" && ops[0][1][2] === "generation"))}`,
);
console.log(`W1 the end of the run:\n${JSON.stringify(live.raw.at(-1))}`);

// W3
const F = await P.createConversation(
	{ ownership: { kind: "ownerless" }, agent: { model: MODEL, extensions: [Tools], tools: [flood] } },
	ctx,
);
faux.setResponses([
	fauxAssistantMessage([fauxToolCall("flood", {}, { id: "call-2" })], { stopReason: "toolUse" }),
	fauxAssistantMessage([fauxText("Done.")]),
]);
const fast = watchStream(laptop, "open", { project: "p", conversation: F.id }, { label: "fast" });
const slow = watchStream(phone, "open", { project: "p", conversation: F.id }, { label: "slow", holdMs: 2000 });
await until("both streams", () => counters.has("fast") && counters.has("slow"));
await F.submit({ type: "input", content: "Flood.", requestId: "client:f-1" }, ctx);
await F.waitForIdle(ctx);
await sleep(2500);
fast.stop();
slow.stop();
await Promise.all([fast.done, slow.done]);
assert.deepEqual(slow.value, fast.value);
const fastStats = counters.get("fast");
const slowStats = counters.get("slow");
console.log(
	`W3 ok: a tool printed 4 MB; the stream read at once got ${fastStats.messages} messages, ${fastStats.bytes} bytes; ` +
		`the stream read after 2 s got ${slowStats.messages} messages, ${slowStats.bytes} bytes; both ended on the same value`,
);

// W3b
const A = await P.createConversation({ ownership: { kind: "ownerless" }, agent: { model: QUICK } }, ctx);
quick.setResponses([fauxAssistantMessage([fauxText("y".repeat(3 * 1024 * 1024))])]);
const fastA = watchStream(laptop, "open", { project: "p", conversation: A.id }, { label: "fastA" });
const slowA = watchStream(phone, "open", { project: "p", conversation: A.id }, { label: "slowA", holdMs: 3000 });
await until("both streams", () => counters.has("fastA") && counters.has("slowA"));
const t0 = Date.now();
await A.submit({ type: "input", content: "Write 3 MB.", requestId: "client:a-1" }, ctx);
await A.waitForIdle(ctx);
const runMs = Date.now() - t0;
await sleep(3500);
fastA.stop();
slowA.stop();
await Promise.all([fastA.done, slowA.done]);
assert.deepEqual(slowA.value, fastA.value);
const fa = counters.get("fastA");
const sa = counters.get("slowA");
console.log(
	`W3b ok: a 3 MB answer streamed for ${runMs} ms. Fast stream: ${fa.messages} messages, ${fa.bytes} bytes, ` +
		`${fa.drains} waits for drain. Slow stream, not read for 3 s: ${sa.messages} messages, ${sa.bytes} bytes, ` +
		`${sa.drains} waits for drain (${sa.waitedMs} ms in all). Both clients ended on the same value`,
);

// W4
const write = (conversation, n) =>
	Promise.all(
		Array.from({ length: n }, (_, i) =>
			conversation.submit({ type: "write", entry: { kind: "probe.note", data: { text: `note ${i}` } } }, ctx),
		),
	);
const newest = live.value.entries.at(-1).id;
await write(C, 3);
const short = watchStream(laptop, "open", { project: "p", conversation: C.id, from: newest + 1 });
await until("short resume", () => short.messages.length >= 1);
short.stop();
const shortValue = short.messages[0].value;
assert.equal(shortValue.entries.length, 3);
assert.equal(shortValue.before, newest);
const newest2 = shortValue.entries.at(-1).id;
await write(C, 120);
const long = watchStream(laptop, "open", { project: "p", conversation: C.id, from: newest2 + 1 });
await until("long resume", () => long.messages.length >= 1);
long.stop();
const longValue = long.messages[0].value;
console.log(
	`W4 ok: after 3 missed entries the first message held ${shortValue.entries.length} entries with before=${shortValue.before} ` +
		`(the newest the client had); after 120 it held ${longValue.entries.length}, before=${longValue.before}, so ` +
		`the entries after ${newest2} up to ${longValue.before} are a gap for history`,
);

// W5 and W6
const page1 = await call(laptop, "history", {
	project: "p",
	conversation: C.id,
	maxEntryId: longValue.before,
	order: "descending",
	limit: 40,
});
const cursor = page1.body.result.next;
const during = watchStream(laptop, "open", { project: "p", conversation: C.id });
await until("stream before restart", () => during.messages.length >= 1);
await P.close(ctx);
await during.done;
projects.set("p", await openStore("p"));
const after = watchStream(laptop, "open", { project: "p", conversation: C.id });
await until("stream after restart", () => after.messages.length >= 1);
after.stop();
console.log(
	`W6 ok: closing the harness ended the open stream with ${JSON.stringify(during.messages.at(-1))}; ` +
		`a new stream after reopen started with kind "${after.messages[0].kind}" holding ${after.messages[0].value.entries.length} entries`,
);
const page2 = await call(laptop, "history", { project: "p", conversation: C.id, cursor, limit: 40 });
const all = await (await projects.get("p").conversation(C.id, ctx)).entries(
	{ maxEntryId: longValue.before, order: "descending" },
	80,
	undefined,
	ctx,
);
assert.deepEqual(
	[...page1.body.result.items, ...page2.body.result.items].map((e) => e.id),
	all.items.map((e) => e.id),
);
console.log(
	`W5 ok: cursor ${JSON.stringify(cursor)} (${JSON.stringify(decodeCursor(cursor))}) paged on after the reopen; ` +
		`pages of ${page1.body.result.items.length} and ${page2.body.result.items.length} entries equal one scan, ` +
		`which found ${all.items.length}`,
);

// W7
const inbox = watchStream(phone, "inbox", {});
await until("inbox value", () => inbox.messages.length >= 1);
const open = (harness, subject, decision) =>
	harness.commit(async (tx) => {
		const doc = await tx.doc(OpenList);
		if (decision === null) delete doc.open[subject];
		else doc.open[subject] = decision;
	}, ctx);
await open(projects.get("p"), "w1:42:design", {
	id: "w1:42:design#3",
	title: "Design v2 of --json",
	requestedAt: 1763020800000,
	conversation: 7,
});
await open(projects.get("q"), "w2:f1:resolve", {
	id: "w2:f1:resolve#1",
	title: "Did pi-durable ship 2.0?",
	requestedAt: 1763024400000,
	conversation: 3,
});
await open(projects.get("p"), "w1:42:design", null);
await sleep(100);
inbox.stop();
await inbox.done;
const merged = {
	p: await projects.get("p").snapshot(OpenList, ctx),
	q: await projects.get("q").snapshot(OpenList, ctx),
};
assert.deepEqual(inbox.value, JSON.parse(JSON.stringify(merged)));
console.log(`W7 ok: the merged inbox value equals both stores' open lists; message 3 was:\n${JSON.stringify(inbox.raw[2])}`);

// W8
const stolen = watchStream(phone, "open", { project: "p", conversation: C.id });
await until("phone stream", () => stolen.messages.length >= 1);
revoke("phone");
await stolen.done;
const refusedAfter = await call(phone, "input", { project: "p", conversation: C.id, text: "x", requestId: "r-9" });
assert.equal(refusedAfter.status, 401);
console.log(
	`W8 ok: revoking the phone ended its stream with ${JSON.stringify(stolen.messages.at(-1))}; its next call got ` +
		`${refusedAfter.status} ${JSON.stringify(refusedAfter.body)}`,
);

// W9
const C2 = projects.get("p");
const idle = await call(laptop, "input", { ...steerBody, requestId: "r-3", whenIdle: "reject" });
const gone = await call(laptop, "workflows", {});
const v2 = await call(laptop, "open", {}, "/v2/open");
const extra = await call(laptop, "input", { ...steerBody, requestId: "r-4", by: "laptop" });
assert.equal(idle.body.refused.code, "not_running");
assert.equal(gone.body.refused.code, "unknown_call");
assert.equal(v2.body.refused.code, "unsupported_protocol");
assert.equal(extra.body.refused.code, "bad_request");
assert.ok(C2);
for (const [what, r] of [
	["steer, only if running, to an idle conversation", idle],
	["a call this server lacks", gone],
	["protocol 2", v2],
	["a body field `by`", extra],
])
	console.log(`W9 ${what}: ${r.status} ${JSON.stringify(r.body)}`);

server.close();
for (const harness of projects.values()) await harness.close(ctx);
console.log("ok: checks W1-W9 passed");
