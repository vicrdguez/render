// Protocol checks for the core design, on pi-durable 1.5.2 with SQLite files and real HTTP on 127.0.0.1. The server
// below is a stand-in shaped like docs/core/protocol.md: `node:http`, one POST per call, and a server-sent event
// stream for a watch. The client applies the seven ops with its own code, as a client in another language would.
// No Tau code exists.
// W1. Pairing. A code from the local admin gets a token once. The server keeps a hash and no token.
// W2. Replies. No token is `unauthorized`. An unknown call is `unknown_call` and lists the calls. An unknown field is
//     `bad_request` with its path. A reply whose body is none of the three shapes counts as unknown, whatever its
//     status.
// W3. Request IDs. A resend from the same device returns the first submission. The same ID from another device is
//     a different submission.
// W4. A watched run. The first frame replaces the whole value. Later frames are ops. The value the client builds
//     equals the first frame of a new watch.
// W5. A slow client. It stops reading while 300 large entries land. It gets fewer frames than commits, the window
//     no longer joins what it held, and `history` fills the gap that `before` shows.
// W6. `after`. A watch opened with the newest entry the client holds starts with only the entries after it.
// W7. Inbox. Two stores under their project names. A change arrives as ops under the project. A project that is
//     bound while the stream is open arrives too.
// W8. Revoking a device ends its streams with a reason, and its next call is `unauthorized`.
// W9. A clean stop ends the open streams with a reason.
//   PI_MODULES=/path/to/node_modules/@earendil-works node docs/core/spikes/wire.mjs
import assert from "node:assert/strict";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxToolCall } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { compile, int, obj, oneOf, opt, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { createRegistry, defineDoc, defineExtension, defineTool, Harness } = d;

const dir = mkdtempSync(join(tmpdir(), "tau-wire-"));
const sha = (value) => createHash("sha256").update(value).digest();
const text = (t) => [{ type: "text", text: t }];

// ---- the stores -----------------------------------------------------------------------------------------------
const OpenList = defineDoc({
	kind: "tau.open",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});
const count = defineTool({
	name: "count",
	description: "Counts to three.",
	parameters: obj({}),
	execute: async (_args, api) => {
		for (const n of ["1\n", "2\n", "3\n"]) await api.appendOutput?.(n);
		return { output: text("1 2 3") };
	},
});
const Probe = defineExtension({ name: "probe", tools: [count] });
const faux = fauxProvider({ models: [{ id: "m" }] });
const models = createModels();
models.setProvider(faux.provider);
const projects = new Map();
async function bind(project) {
	const registry = createRegistry();
	registry.install(Probe);
	const storage = await openNodeSqliteStorage(join(dir, `${project}.sqlite`));
	const harness = await Harness.open(storage, { models, registry, settings: { retry: { enabled: false } } }, ctx);
	await harness.commit(async (tx) => void (await tx.doc(OpenList)), ctx);
	projects.set(project, harness);
	for (const join_ of inboxes) await join_(project, harness);
	return harness;
}

// ---- the stand-in server --------------------------------------------------------------------------------------
const devices = new Map();
const codes = new Map();
const streams = new Set();
const inboxes = new Set();
const admin = {
	pair(device) {
		const code = randomBytes(5).toString("hex").toUpperCase();
		codes.set(sha(code).toString("hex"), { device, expires: Date.now() + 600_000 });
		return code;
	},
	revoke(device) {
		devices.get(device).revoked = true;
		for (const stream of [...streams]) if (stream.device === device) stream.end("revoked");
	},
};
const deviceOf = (header) => {
	const match = /^Bearer tau\.([a-z][a-z0-9-]*)\.([A-Za-z0-9_-]+)$/.exec(header ?? "");
	const known = match === null ? undefined : devices.get(match[1]);
	if (known === undefined || known.revoked) return undefined;
	return timingSafeEqual(known.hash, sha(match[2])) ? match[1] : undefined;
};
const reply = (res, status, body) => {
	res.writeHead(status, { "Content-Type": "application/json", "Tau-Protocol": "1" });
	res.end(JSON.stringify(body));
};
const refused = (res, status, code, message, more = {}) => reply(res, status, { refused: { code, message, ...more } });
const cursorOut = (query, next) =>
	next === undefined ? {} : { next: Buffer.from(JSON.stringify({ query, next })).toString("base64url") };

function startStream(req, res, device, watch, prefix = []) {
	res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Tau-Protocol": "1" });
	const send = (frame) =>
		new Promise((resolve) => {
			if (res.write(`data: ${JSON.stringify(frame)}\n\n`)) resolve();
			else res.once("drain", resolve);
		});
	const sent = { queue: Promise.resolve() };
	const push = (frame) => (sent.queue = sent.queue.then(() => send(frame)));
	const under = (ops) => ops.map((op) => (op[0] === "r" ? ["s", prefix, op[1]] : [op[0], [...prefix, ...op[1]], ...op.slice(2)]));
	const stream = {
		device,
		push,
		under,
		end(reason) {
			streams.delete(stream);
			for (const stop of stream.stops) stop();
			res.write(`data: ${JSON.stringify({ end: { reason } })}\n\n`);
			res.end();
		},
		stops: [],
	};
	streams.add(stream);
	req.on("close", () => {
		streams.delete(stream);
		for (const stop of stream.stops) stop();
	});
	if (watch !== undefined) {
		push({ ops: [["r", watch.value]] });
		watch.start(async (call) => {
			if (call.kind === "value" && call.ops.length > 0) await push({ ops: call.ops });
		});
		stream.stops.push(() => void watch.stop());
	}
	return stream;
}

const calls = {
	input: {
		schema: obj({
			project: str(),
			conversation: int(),
			text: str(),
			requestId: str({ minLength: 1 }),
			whenBusy: opt(oneOf(["steer", "followUp"])),
			whenIdle: opt(oneOf(["reject"])),
		}),
		async run(body, device, harness) {
			const conversation = await harness.conversation(body.conversation, ctx);
			const submission = await conversation.submit(
				{
					type: "input",
					content: body.text,
					requestId: `client:${device}:${body.requestId}`,
					...(body.whenBusy === undefined ? {} : { whenBusy: body.whenBusy }),
					...(body.whenIdle === undefined ? {} : { whenIdle: body.whenIdle }),
				},
				ctx,
			);
			return { result: { submission: await submission.status(ctx) } };
		},
	},
	history: {
		schema: obj({
			project: str(),
			conversation: int(),
			cursor: opt(str()),
			limit: opt(int({ minimum: 1, maximum: 500 })),
			minEntryId: opt(int()),
			maxEntryId: opt(int()),
			order: opt(oneOf(["ascending", "descending"])),
		}),
		async run(body, _device, harness) {
			const conversation = await harness.conversation(body.conversation, ctx);
			const held = body.cursor === undefined ? undefined : JSON.parse(Buffer.from(body.cursor, "base64url").toString());
			const query = held?.query ?? { minEntryId: body.minEntryId, maxEntryId: body.maxEntryId, order: body.order };
			const page = await conversation.entries(query, body.limit ?? 50, held?.next, ctx);
			return { result: { items: page.items, ...cursorOut(query, page.next) } };
		},
	},
	open: {
		schema: obj({ project: str(), conversation: int(), after: opt(int()) }),
		async stream(body, device, harness, req, res) {
			const conversation = await harness.conversation(body.conversation, ctx);
			const window = body.after === undefined ? undefined : { from: body.after + 1 };
			startStream(req, res, device, await conversation.watch(ctx, window));
		},
	},
	inbox: {
		schema: obj({}),
		async stream(_body, device, _harness, req, res) {
			const stream = startStream(req, res, device, undefined);
			const value = {};
			const watches = [];
			for (const [project, harness] of projects) {
				const watch = await harness.watchDoc(OpenList, ctx);
				value[project] = watch.value;
				watches.push([project, watch]);
			}
			stream.push({ ops: [["r", value]] });
			const follow = (project, watch) => {
				watch.start(async (call) => {
					if (call.kind !== "value" || call.ops.length === 0) return;
					await stream.push({ ops: call.ops.map((op) => (op[0] === "r" ? ["s", [project], op[1]] : [op[0], [project, ...op[1]], ...op.slice(2)])) });
				});
				stream.stops.push(() => void watch.stop());
			};
			for (const [project, watch] of watches) follow(project, watch);
			const join_ = async (project, harness) => {
				const watch = await harness.watchDoc(OpenList, ctx);
				await stream.push({ ops: [["s", [project], watch.value]] });
				follow(project, watch);
			};
			inboxes.add(join_);
			stream.stops.push(() => inboxes.delete(join_));
		},
	},
};

const server = http.createServer(async (req, res) => {
	try {
		const name = /^\/v1\/([a-zA-Z]*)$/.exec(req.url ?? "")?.[1];
		if (req.method !== "POST" || name === undefined) return refused(res, 404, "unknown_call", "No such path.");
		const chunks = [];
		for await (const chunk of req) chunks.push(chunk);
		const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
		if (name === "pair") {
			const key = sha(String(body.code)).toString("hex");
			const pending = codes.get(key);
			codes.delete(key);
			if (pending === undefined || pending.expires < Date.now()) return refused(res, 401, "bad_code", "That code does not work.");
			const secret = randomBytes(32).toString("base64url");
			devices.set(pending.device, { hash: sha(secret), revoked: false });
			return reply(res, 200, { result: { device: pending.device, token: `tau.${pending.device}.${secret}` } });
		}
		const device = deviceOf(req.headers.authorization);
		if (device === undefined) return refused(res, 401, "unauthorized", "Send a valid device token.");
		const call = calls[name];
		if (call === undefined) {
			return refused(res, 404, "unknown_call", `This server has no call ${name}.`, { calls: Object.keys(calls) });
		}
		const errors = compile(call.schema).errors(body);
		if (errors.length > 0) return refused(res, 400, "bad_request", "The body does not fit the call.", { errors });
		const harness = body.project === undefined ? undefined : projects.get(body.project);
		if (body.project !== undefined && harness === undefined) return refused(res, 404, "unknown_project", "No such project.");
		if (call.stream !== undefined) return await call.stream(body, device, harness, req, res);
		return reply(res, 200, await call.run(body, device, harness));
	} catch (error) {
		return reply(res, 500, { unknown: { code: "failed", message: String(error?.message ?? error) } });
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---- a client that knows only the protocol ---------------------------------------------------------------------
const parse = (status, raw) => {
	let body;
	try {
		body = JSON.parse(raw);
	} catch {
		return { unknown: { code: "not_tau", message: `status ${status}` } };
	}
	const keys = body !== null && typeof body === "object" ? Object.keys(body) : [];
	if (keys.length === 1 && ["result", "refused", "unknown"].includes(keys[0])) return body;
	return { unknown: { code: "not_tau", message: `status ${status}` } };
};
const post = async (name, body, token, at = origin) => {
	const res = await fetch(`${at}/v1/${name}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
		body: JSON.stringify(body),
	});
	return { status: res.status, ...parse(res.status, await res.text()) };
};
const at = (root, path) => path.reduce((value, key) => value[key], root);
function applyOps(root, ops) {
	for (const op of ops) {
		if (op[0] === "r") {
			root = op[1];
			continue;
		}
		const path = op[1];
		assert.ok(path.every((seg) => !["__proto__", "constructor", "prototype"].includes(seg)));
		if (op[0] === "p") {
			at(root, path).splice(op[2], op[3], ...op[4]);
			continue;
		}
		if (op[0] === "m") {
			const list = at(root, path);
			const old = list.slice();
			for (let i = 0; i < op[2].length; i++) list[i] = old[op[2][i]];
			continue;
		}
		const parent = at(root, path.slice(0, -1));
		const key = path.at(-1);
		if (op[0] === "s") parent[key] = op[2];
		else if (op[0] === "d") Array.isArray(parent) ? parent.splice(key, 1) : delete parent[key];
		else if (op[0] === "a") parent[key] = `${parent[key]}${op[2]}`;
		else if (op[0] === "t") parent[key] = parent[key].slice(op[2]);
		else assert.fail(`unknown op ${op[0]}`);
	}
	return root;
}
function watch(name, body, token) {
	const state = { value: undefined, frames: 0, end: undefined, held: new Map(), newest: 0, gaps: [], paused: false };
	const waiters = new Set();
	const wake = () => {
		for (const waiter of [...waiters]) if (waiter.test(state)) (waiters.delete(waiter), waiter.resolve());
	};
	const req = http.request(
		`${origin}/v1/${name}`,
		{ method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
		(res) => {
			state.res = res;
			let pending = "";
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				pending += chunk;
				for (let cut = pending.indexOf("\n\n"); cut >= 0; cut = pending.indexOf("\n\n")) {
					const line = pending.slice(0, cut);
					pending = pending.slice(cut + 2);
					if (!line.startsWith("data: ")) continue;
					const frame = JSON.parse(line.slice(6));
					state.frames++;
					if (frame.end !== undefined) {
						state.end = frame.end.reason;
						continue;
					}
					const before = state.newest;
					state.value = applyOps(state.value, frame.ops);
					if (Array.isArray(state.value?.entries)) {
						for (const entry of state.value.entries) state.held.set(entry.id, entry);
						for (const id of state.held.keys()) state.newest = Math.max(state.newest, id);
						if (before > 0 && state.value.before !== undefined && state.value.before > before) {
							state.gaps.push({ minEntryId: before + 1, maxEntryId: state.value.before });
						}
					}
				}
				wake();
			});
			res.on("end", wake);
			res.on("error", wake);
		},
	);
	req.end(JSON.stringify(body));
	state.until = (test) => (test(state) ? Promise.resolve() : new Promise((resolve) => waiters.add({ test, resolve })));
	state.close = () => req.destroy();
	return state;
}
const quiet = () => new Promise((r) => setTimeout(r, 150));

// ---- the checks -----------------------------------------------------------------------------------------------
const P = await bind("p");
const Q = await bind("q");
P.resume();

// W1
const code = admin.pair("laptop");
const paired = await post("pair", { code });
const token = paired.result.token;
assert.match(token, /^tau\.laptop\.[A-Za-z0-9_-]{43}$/);
assert.equal((await post("pair", { code })).refused.code, "bad_code");
assert.ok(!JSON.stringify([...devices.values()].map((v) => v.hash.toString("hex"))).includes(token.split(".")[2]));
const phone = (await post("pair", { code: admin.pair("phone") })).result.token;
console.log("W1 ok: a pairing code gave a token once; the server kept a hash and no token");

// W2
assert.equal((await post("history", { project: "p", conversation: 1 })).refused.code, "unauthorized");
const gone = await post("workflows", {}, token);
assert.equal(gone.refused.code, "unknown_call");
assert.deepEqual(gone.refused.calls, Object.keys(calls));
const extra = await post("input", { project: "p", conversation: 1, text: "x", requestId: "r", by: "me" }, token);
assert.equal(extra.refused.code, "bad_request");
assert.ok(extra.refused.errors.some((e) => e.path === "/by"));
const proxy = http.createServer((_req, res) => res.writeHead(409, { "Content-Type": "text/html" }).end("<h1>Conflict</h1>"));
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const strange = await post("input", {}, token, `http://127.0.0.1:${proxy.address().port}`);
assert.equal(strange.status, 409);
assert.equal(strange.unknown.code, "not_tau");
proxy.close();
console.log("W2 ok: unauthorized, unknown_call with the calls, bad_request with a path; a 409 that is not Tau's counted as unknown");

// W3
const model = { provider: "faux", modelId: "m" };
const C = await P.createConversation({ ownership: { kind: "ownerless" }, agent: { model, extensions: [Probe] } }, ctx);
faux.setResponses([fauxAssistantMessage("One."), fauxAssistantMessage("Two.")]);
const send = (who, textOf) => post("input", { project: "p", conversation: C.id, text: textOf, requestId: "r1" }, who);
const first = await send(token, "From the laptop.");
const again = await send(token, "From the laptop.");
const other = await send(phone, "From the phone.");
assert.equal(again.result.submission.id, first.result.submission.id);
assert.notEqual(other.result.submission.id, first.result.submission.id);
assert.equal(first.result.submission.requestId, "client:laptop:r1");
await C.waitForIdle(ctx);
console.log("W3 ok: a resend returned the first submission; the same request ID from another device was its own submission");

// W4
const live = watch("open", { project: "p", conversation: C.id }, token);
await live.until((s) => s.value !== undefined);
faux.setResponses([
	fauxAssistantMessage([fauxToolCall("count", {})], { stopReason: "toolUse" }),
	fauxAssistantMessage("Counted to three."),
]);
await post("input", { project: "p", conversation: C.id, text: "Count.", requestId: "r2" }, token);
await C.waitForIdle(ctx);
await quiet();
const fresh = watch("open", { project: "p", conversation: C.id }, token);
await fresh.until((s) => s.value !== undefined);
assert.ok(live.frames > 3);
assert.deepEqual(live.value, fresh.value);
fresh.close();
console.log(`W4 ok: ${live.frames} frames; the value built from the ops equalled the first frame of a new watch`);

// W5
const big = "x".repeat(16_000);
const commits = 300;
live.res.pause();
for (let i = 0; i < commits; i++) {
	await C.submit({ type: "write", entry: { kind: "probe.note", data: { i, big } } }, ctx);
}
const framesBefore = live.frames;
live.res.resume();
const all = (await C.entries({ order: "ascending" }, 1000, undefined, ctx)).items.map((e) => e.id);
await live.until((s) => s.newest === all.at(-1));
await quiet();
const framesFor = live.frames - framesBefore;
assert.ok(framesFor < commits, `${framesFor} frames`);
assert.ok(live.gaps.length > 0, "the window left a gap");
for (const gap of live.gaps) {
	let cursor;
	do {
		const page = await post("history", { project: "p", conversation: C.id, ...(cursor ? { cursor } : { ...gap, order: "ascending" }), limit: 100 }, token);
		for (const entry of page.result.items) live.held.set(entry.id, entry);
		cursor = page.result.next;
	} while (cursor !== undefined);
}
assert.deepEqual([...live.held.keys()].sort((a, b) => a - b), all);
console.log(
	`W5 ok: ${commits} commits reached a client that had stopped reading as ${framesFor} frames; ` +
		`before showed ${live.gaps.length} gap, and history filled it to all ${all.length} entries`,
);
live.close();

// W6
const newest = all.at(-1);
await C.submit({ type: "write", entry: { kind: "probe.note", data: { i: "late" } } }, ctx);
const resumed = watch("open", { project: "p", conversation: C.id, after: newest }, token);
await resumed.until((s) => s.value !== undefined);
assert.equal(resumed.value.entries.length, 1);
assert.equal(resumed.value.before, newest);
assert.ok(resumed.value.docs["pi.agent"] !== undefined);
resumed.close();
console.log("W6 ok: a watch opened with `after` started with the one entry the client lacked, and the documents as they are now");

// W7
const setOpen = (harness, subject, value) =>
	harness.commit(async (tx) => {
		const doc = await tx.doc(OpenList);
		if (value === undefined) delete doc[subject];
		else doc[subject] = value;
	}, ctx);
await setOpen(P, "w1:42:design", { id: "w1:42:design#3", title: "Design v2", requestedAt: 5, conversation: C.id });
const inbox = watch("inbox", {}, phone);
await inbox.until((s) => s.value !== undefined);
assert.deepEqual(Object.keys(inbox.value), ["p", "q"]);
await setOpen(Q, "w2:f1", { id: "w2:f1#1", title: "Did it ship?", requestedAt: 7, conversation: 1 });
await inbox.until((s) => s.value.q["w2:f1"] !== undefined);
await setOpen(P, "w1:42:design", undefined);
await inbox.until((s) => s.value.p["w1:42:design"] === undefined);
const R = await bind("r");
await setOpen(R, "w2:f9", { id: "w2:f9#1", title: "New project", requestedAt: 9, conversation: 1 });
await inbox.until((s) => s.value.r?.["w2:f9"] !== undefined);
assert.deepEqual(inbox.value, { p: {}, q: { "w2:f1": { id: "w2:f1#1", title: "Did it ship?", requestedAt: 7, conversation: 1 } }, r: { "w2:f9": { id: "w2:f9#1", title: "New project", requestedAt: 9, conversation: 1 } } });
console.log("W7 ok: the inbox held each store under its project; changes came as ops; a project bound later joined the stream");

// W8
admin.revoke("phone");
await inbox.until((s) => s.end !== undefined);
assert.equal(inbox.end, "revoked");
assert.equal((await post("history", { project: "p", conversation: C.id }, phone)).refused.code, "unauthorized");
console.log("W8 ok: revoking the phone ended its stream with `revoked`, and its next call was unauthorized");

// W9
const last = watch("open", { project: "p", conversation: C.id, after: newest }, token);
await last.until((s) => s.value !== undefined);
for (const stream of [...streams]) stream.end("stopping");
await last.until((s) => s.end !== undefined);
assert.equal(last.end, "stopping");
console.log("W9 ok: a clean stop ended the open stream with `stopping`");

server.close();
server.closeAllConnections();
for (const harness of projects.values()) await harness.close(ctx);
console.log("ok: checks W1-W9 passed");
