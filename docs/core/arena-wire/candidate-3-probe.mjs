// Wire probe for candidate 3 of the protocol arena. Throwaway. No Tau code exists, and none of this is Tau code.
// It runs the moves that design.md leans on, on pi-durable 1.5.2 with SQLite files, over real HTTP on 127.0.0.1.
// The server is a child process, so that a restart is a real SIGKILL or SIGTERM and not a function call.
//
// What is real: node:http, pi-durable's Conversation.watch(), watchDoc(), entries(), submit(), Chord's apply(),
// pi-schema's compile(), and the bytes on the socket.
// What is a stand-in: the store layer (one session document for the open list, one for the decisions, and no
// `then` task), setOptions (copied from docs/core/spikes/host.mjs, H2), and the /probe/* paths, which only
// drive the server from the test and are not part of the protocol.
//
//   PI_MODULES=/path/to/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (value) => JSON.parse(JSON.stringify(value));
const toCursor = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

// ------------------------------------------------------------------------------------------------ the server

class Refusal extends Error {
	constructor(status, code, message, data) {
		super(message);
		Object.assign(this, { status, code, data });
	}
}

async function serve(dataDir, wantPort, tickMs) {
	const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
	const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
	const faux$ = await import(`${base}/pi-ai/dist/providers/faux.js`);
	const { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } = faux$;
	const { arr, compile, equal, int, map, obj, oneOf, opt, str, unknown } = await import(
		`${base}/pi-schema/dist/index.js`
	);
	const d = await import(`${base}/pi-durable/dist/index.js`);
	const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
	const { createRegistry, defineDoc, defineExtension, defineTool, Harness } = d;

	// Devices and pairing codes are files. The directory is the list.
	const devicesDir = join(dataDir, "devices");
	const pairingDir = join(dataDir, "pairing");
	mkdirSync(devicesDir, { recursive: true });
	mkdirSync(pairingDir, { recursive: true });
	let devices = new Map();
	let seen = -1;
	let reloads = 0;
	const loadDevices = () => {
		const mtime = statSync(devicesDir).mtimeMs;
		if (mtime === seen) return;
		seen = mtime;
		reloads++;
		devices = new Map();
		for (const file of readdirSync(devicesDir)) {
			if (!file.endsWith(".json")) continue;
			const record = JSON.parse(readFileSync(join(devicesDir, file), "utf8"));
			devices.set(record.device, record);
		}
	};
	const deviceOf = (req) => {
		loadDevices();
		const header = req.headers.authorization ?? "";
		if (!header.startsWith("Bearer ")) return undefined;
		const token = header.slice(7);
		const dot = token.indexOf(".");
		const record = devices.get(token.slice(0, Math.max(dot, 0)));
		if (dot < 1 || record?.hash === undefined) return undefined;
		const given = Buffer.from(sha(token.slice(dot + 1)), "hex");
		const stored = Buffer.from(record.hash, "hex");
		return given.length === stored.length && timingSafeEqual(given, stored) ? record : undefined;
	};
	const pair = (code) => {
		const file = join(pairingDir, `${sha(code.replaceAll("-", "").toUpperCase())}.json`);
		let pending;
		try {
			pending = JSON.parse(readFileSync(file, "utf8"));
			unlinkSync(file); // read and delete in one synchronous step: a code works once
		} catch {
			throw new Refusal(401, "bad_code", "No such pairing code.");
		}
		if (pending.expires < Date.now()) throw new Refusal(401, "bad_code", "No such pairing code.");
		const device = `d_${randomBytes(5).toString("hex")}`;
		const secret = randomBytes(32).toString("base64url");
		const record = { device, name: pending.name, hash: sha(secret), createdAt: Date.now() };
		writeFileSync(join(devicesDir, `.${device}.tmp`), JSON.stringify(record), { mode: 0o600 });
		renameSync(join(devicesDir, `.${device}.tmp`), join(devicesDir, `${device}.json`));
		return { device, name: pending.name, token: `${device}.${secret}` };
	};

	// pi-durable: one faux provider, one tool, one store per project.
	const text = (t) => [{ type: "text", text: t }];
	const shout = defineTool({
		name: "shout",
		description: "Print the test output slowly.",
		parameters: obj({}),
		execute: async (_args, api) => {
			for (const line of ["compiling\n", "12 tests passed\n", "done\n"]) {
				api.output(line);
				await sleep(250);
			}
			return { output: text("12 tests passed") };
		},
	});
	const Tools = defineExtension({ name: "probe-tools", tools: [shout] });
	const registry = createRegistry();
	registry.install(Tools);
	const faux = fauxProvider({ models: [{ id: "faux-a" }], tokensPerSecond: 40, tokenSize: { min: 1, max: 1 } });
	const models = createModels();
	models.setProvider(faux.provider);
	const modelRef = (value) => {
		const cut = value.indexOf("/");
		return { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
	};

	const doc = (kind) =>
		defineDoc({ kind, version: 1, scope: "session", initial: () => ({}), checkpointWhen: () => false });
	const StoreDoc = doc("tau.store"); // { log: ConversationId }
	const OpenDoc = doc("tau.decisions.open"); // { [subject]: Decision }, the open list
	const DecisionsDoc = doc("tau.decisions"); // { [id]: Decision }, a stand-in for the document family
	const OptionsDoc = doc("w1.options");
	const W1Options = obj({
		designer: str({ format: "model" }),
		reviewer: str({ format: "model" }),
		base: str({ minLength: 1, default: "main" }),
	});

	const projects = new Map();
	for (const name of ["p", "q"]) {
		mkdirSync(join(dataDir, "projects", name), { recursive: true });
		const storage = await openNodeSqliteStorage(join(dataDir, "projects", name, "store.sqlite"));
		const harness = await Harness.open(storage, { models, registry, settings: { retry: { enabled: false } } }, ctx);
		const log = await harness.commit(async (tx) => {
			const store = await tx.doc(StoreDoc);
			await tx.doc(OpenDoc);
			await tx.doc(DecisionsDoc);
			if (store.log !== undefined) return store.log;
			const created = await tx.createConversation({ ownership: { kind: "ownerless" } });
			store.log = created.id;
			return created.id;
		}, ctx);
		harness.resume();
		projects.set(name, { name, harness, log });
	}
	const projectOf = (name) => {
		const project = projects.get(name);
		if (project === undefined) throw new Refusal(409, "unknown_project", `No project ${name}.`);
		return project;
	};
	const conversationOf = async (project, id, allowLog = false) => {
		const found = id === project.log && !allowLog ? undefined : await project.harness.conversation(id, ctx);
		if (found === undefined) throw new Refusal(409, "unknown_conversation", `No conversation ${id}.`);
		return found;
	};

	// A watch as the wire sees it: the value now, a way to start the changes, a way to stop, and its end.
	const viewWatch = async (conversation, after) => {
		const watch = await conversation.watch(ctx, after === undefined ? undefined : { from: after + 1 });
		return {
			value: watch.value,
			start: (send) =>
				watch.start(async (call) => {
					if (call.kind === "value") await send(call.ops);
				}),
			stop: () => watch.stop(),
			closed: watch.closed,
		};
	};
	// As prefixed() in pi-durable's src/harness/view.ts:372-392.
	const prefixed = (op, prefix) =>
		op[0] === "r" ? ["s", prefix, op[1]] : [op[0], [...prefix, ...op[1]], ...op.slice(2)];
	const inboxWatch = async () => {
		const parts = [];
		for (const project of projects.values()) {
			const watch = await project.harness.watchDoc(OpenDoc, ctx);
			assert.ok(watch, "the open list exists");
			parts.push({ name: project.name, watch });
		}
		return {
			value: Object.fromEntries(parts.map((part) => [part.name, part.watch.value])),
			start: (send) => {
				for (const part of parts) {
					part.watch.start(async (call) => {
						if (call.kind === "value") await send(call.ops.map((op) => prefixed(op, [part.name])));
					});
				}
			},
			stop: () => Promise.all(parts.map((part) => part.watch.stop())),
			closed: Promise.race(parts.map((part) => part.watch.closed)),
		};
	};

	const refuse = (code, message, data) => ({ refuse: [409, code, message, data] });
	const settle = (out) => {
		if (out.refuse !== undefined) throw new Refusal(...out.refuse);
		return out;
	};
	const CALLS = {
		setOptions: {
			params: obj({ project: str(), workflow: str(), patch: map(unknown()) }),
			run: async (q) =>
				settle(
					await projectOf(q.project).harness.commit(async (tx) => {
						const stored = await tx.doc(OptionsDoc);
						const merged = plain(stored);
						for (const [key, value] of Object.entries(q.patch)) {
							if (value === null) delete merged[key];
							else merged[key] = value;
						}
						const check = compile(W1Options, {
							formats: {
								model: (value) => {
									const ref = modelRef(value);
									return models.getModel(ref.provider, ref.modelId) !== undefined;
								},
							},
						});
						const errors = check.errors({ base: "main", ...merged }).filter((e) => e.keyword !== "required");
						if (errors.length > 0) {
							return refuse("bad_options", `${errors.length} options do not fit.`, { errors });
						}
						for (const key of Object.keys(plain(stored))) delete stored[key];
						Object.assign(stored, merged);
						return { set: merged };
					}, ctx),
				),
		},
		create: {
			params: obj({ project: str(), model: str() }),
			run: async (q) => {
				const ref = modelRef(q.model);
				if (models.getModel(ref.provider, ref.modelId) === undefined) {
					throw new Refusal(409, "unknown_model", `The server has no model ${q.model}.`);
				}
				const created = await projectOf(q.project).harness.createConversation(
					{ ownership: { kind: "ownerless" }, agent: { model: ref, cwd: "/srv/p", extensions: [Tools] } },
					ctx,
				);
				return { conversation: created.id };
			},
		},
		input: {
			params: obj({
				project: str(),
				conversation: int(),
				text: str(),
				requestId: str(),
				whenBusy: opt(oneOf(["steer", "followUp"])),
				whenIdle: opt(oneOf(["reject"])),
			}),
			run: async (q) => {
				const conversation = await conversationOf(projectOf(q.project), q.conversation);
				const draft = { type: "input", content: q.text, requestId: `client:${q.requestId}` };
				if (q.whenBusy !== undefined) draft.whenBusy = q.whenBusy;
				if (q.whenIdle !== undefined) draft.whenIdle = q.whenIdle;
				const submission = await conversation.submit(draft, ctx);
				return { submission: await submission.status(ctx) };
			},
		},
		open: {
			params: obj({ project: str(), conversation: int(), after: opt(int()) }),
			acquire: async (q) => viewWatch(await conversationOf(projectOf(q.project), q.conversation), q.after),
		},
		timeline: {
			params: obj({ project: str(), after: opt(int()) }),
			acquire: async (q) => {
				const project = projectOf(q.project);
				return viewWatch(await conversationOf(project, project.log, true), q.after);
			},
		},
		inbox: { params: obj({}), acquire: () => inboxWatch() },
		history: {
			params: obj({
				project: str(),
				conversation: int(),
				minEntryId: opt(int()),
				maxEntryId: opt(int()),
				order: opt(oneOf(["ascending", "descending"])),
				limit: opt(int({ minimum: 1, maximum: 500 })),
				cursor: opt(str()),
			}),
			run: async (q) => {
				const conversation = await conversationOf(projectOf(q.project), q.conversation, true);
				const query = {};
				for (const key of ["minEntryId", "maxEntryId", "order"]) if (q[key] !== undefined) query[key] = q[key];
				let cursor;
				if (q.cursor !== undefined) {
					try {
						cursor = JSON.parse(Buffer.from(q.cursor, "base64url").toString("utf8"));
						assert.ok(cursor !== null && typeof cursor === "object" && !Array.isArray(cursor));
					} catch {
						throw new Refusal(400, "bad_cursor", "The server cannot read this cursor. Start from the first page.");
					}
				}
				const page = await conversation.entries(query, q.limit ?? 50, cursor, ctx);
				return { items: page.items, ...(page.next === undefined ? {} : { next: toCursor(page.next) }) };
			},
		},
		decision: {
			params: obj({ project: str(), decision: str() }),
			run: async (q) =>
				settle(
					await projectOf(q.project).harness.commit(async (tx) => {
						const record = (await tx.doc(DecisionsDoc))[q.decision];
						if (record === undefined) return refuse("unknown_decision", `No decision ${q.decision}.`);
						return { decision: plain(record), text: (await tx.entry(record.basis)).data.text };
					}, ctx),
				),
		},
		answer: {
			params: obj({
				project: str(),
				decision: str(),
				basis: int(),
				choice: str(),
				annotations: arr(
					obj({ text: str(), range: opt(obj({ start: int({ minimum: 0 }), end: int({ minimum: 0 }) })) }),
				),
			}),
			// Four rows of the `answer` table in primitives.md. No `then` task is created here.
			run: async (q, device) =>
				settle(
					await projectOf(q.project).harness.commit(async (tx) => {
						const all = await tx.doc(DecisionsDoc);
						const open = await tx.doc(OpenDoc);
						const record = all[q.decision];
						if (record === undefined) return refuse("unknown_decision", `No decision ${q.decision}.`);
						if (record.status === "answered") {
							const same =
								record.basis === q.basis &&
								record.choice === q.choice &&
								equal(plain(record.annotations), q.annotations);
							if (same) return { decision: plain(record), repeated: true };
							return refuse("conflict", "This decision has another answer.", { decision: plain(record) });
						}
						if (record.basis !== q.basis) return refuse("stale_basis", "The decision has another basis.");
						if (!record.choices.includes(q.choice)) return refuse("unknown_choice", `No choice ${q.choice}.`);
						const basis = (await tx.entry(record.basis)).data.text;
						for (const [index, note] of q.annotations.entries()) {
							if (note.range !== undefined && !(note.range.start <= note.range.end && note.range.end <= basis.length)) {
								return refuse("bad_annotation", `Annotation ${index} does not fit the basis.`);
							}
						}
						Object.assign(record, {
							status: "answered",
							choice: q.choice,
							annotations: q.annotations,
							by: device.device, // from the token, never from the body
							at: Date.now(),
						});
						delete open[record.subject];
						return { decision: plain(record) };
					}, ctx),
				),
		},
	};
	for (const def of Object.values(CALLS)) def.check = compile(def.params);

	// Probe-only controls. Not part of the protocol.
	const PROBE = {
		script: async () => {
			faux.setResponses([
				fauxAssistantMessage([fauxText("I will run the tests first."), fauxToolCall("shout", {}, { id: "call-1" })], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage("All 12 tests pass."),
			]);
			return {};
		},
		append: async (q) => {
			const conversation = await conversationOf(projectOf(q.project), q.conversation);
			const pad = "x".repeat(q.bytes);
			const started = Date.now();
			for (let n = q.from; n < q.from + q.count; n++) {
				await conversation.commit((tx) => tx.appendEntry(conversation.id, { kind: "probe.line", data: { n, pad } }), ctx);
				if (q.paced) await new Promise((resolve) => setImmediate(resolve)); // let the sockets and the listeners run
			}
			return { ms: Date.now() - started };
		},
		emit: async (q) => {
			const project = projectOf(q.project);
			for (let n = 1; n <= q.count; n++) {
				await project.harness.commit(
					(tx) => tx.appendEntry(project.log, { kind: "w1.note", data: { text: `event ${n}`, at: Date.now() } }),
					ctx,
				);
			}
			return {};
		},
		request: async (q) =>
			projectOf(q.project).harness.commit(async (tx) => {
				const all = await tx.doc(DecisionsDoc);
				const open = await tx.doc(OpenDoc);
				const basis = await tx.appendEntry(q.conversation, { kind: "w1.design", data: { text: q.text } });
				const record = {
					id: q.id,
					subject: q.id.slice(0, q.id.indexOf("#")),
					title: q.title,
					basis: basis.id,
					choices: q.choices,
					conversation: q.conversation,
					then: { task: "w1.after_design" },
					requestedAt: Date.now(),
					status: "open",
				};
				all[record.id] = record;
				open[record.subject] = plain(record);
				return { basis: basis.id };
			}, ctx),
		stats: async () => ({ streams: stats, reloads }),
	};

	const reply = (res, status, body) => {
		res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
		res.end(JSON.stringify(body));
	};
	const fail = (res, error) => {
		let [status, code, message, data] = [500, "internal", "The server failed. The outcome is unknown.", undefined];
		if (error instanceof Refusal) ({ status, code, message, data } = error);
		else if (error instanceof d.ConversationBusy) [status, code, message] = [409, "busy", error.message];
		else if (error instanceof d.ConversationIdle) [status, code, message] = [409, "idle", error.message];
		else if (error instanceof d.StorageRequestError) [status, code, message] = [400, "bad_cursor", error.message];
		else console.error(error);
		if (res.headersSent) return res.destroy();
		reply(res, status, { error: { code, message, ...(data === undefined ? {} : { data }) } });
	};
	const readBody = async (req) => {
		let raw = "";
		for await (const chunk of req) raw += chunk;
		try {
			const body = JSON.parse(raw);
			assert.ok(body !== null && typeof body === "object" && !Array.isArray(body));
			return body;
		} catch {
			throw new Refusal(400, "bad_request", "The body is not one JSON object.");
		}
	};

	// The move the design leans on: one pi-durable watch, written to one HTTP response, with the listener waiting
	// for the socket. While it waits, pi-durable folds.
	const stats = [];
	const streams = new Set();
	async function pipe(req, res, device, def, params) {
		const stat = { label: req.headers["x-probe-label"] ?? "", frames: 0, bytes: 0, waits: 0, replaced: 0 };
		stats.push(stat);
		const watch = await def.acquire(params);
		res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" });
		const gone = new Promise((resolve) => res.once("close", resolve));
		const write = async (frame) => {
			if (res.destroyed || res.writableEnded) return;
			stat.bytes += Buffer.byteLength(frame);
			if (res.write(frame)) return;
			stat.waits++;
			stat.bytesBeforeFirstWait ??= stat.bytes;
			await Promise.race([new Promise((resolve) => res.once("drain", resolve)), gone]);
		};
		const send = (ops, first = false) => {
			stat.frames++;
			if (!first && ops[0]?.[0] === "r") stat.replaced++;
			return write(`data: ${JSON.stringify({ ops })}\n\n`);
		};
		const finish = (code, message) => {
			if (res.destroyed || res.writableEnded) return;
			res.end(`data: ${JSON.stringify({ error: { code, message } })}\n\n`);
		};
		const stream = { device: device.device, res, finish };
		streams.add(stream);
		res.once("close", () => void watch.stop());
		await send([["r", watch.value]], true);
		watch.start(send);
		const end = await watch.closed;
		stat.end = end.kind;
		streams.delete(stream);
		if (end.kind === "ended") finish("closing", "The server is stopping.");
		else if (end.kind === "failed") finish("failed", "The project's store failed.");
		else if (!res.writableEnded && !res.destroyed) res.end();
	}

	const server = http.createServer(async (req, res) => {
		try {
			const url = req.url ?? "/";
			if (req.method === "GET" && url === "/v1") {
				const calls = Object.fromEntries(
					Object.entries(CALLS).map(([name, def]) => [name, { watch: def.acquire !== undefined, params: def.params }]),
				);
				return reply(res, 200, { result: { protocol: 1, server: "probe", durable: "1.5.2", calls } });
			}
			if (req.method !== "POST") throw new Refusal(404, "unknown_call", `This server has no ${req.method} ${url}.`);
			const body = await readBody(req);
			if (url === "/v1/pair") {
				if (typeof body.code !== "string") throw new Refusal(400, "bad_request", "Send a code.");
				return reply(res, 200, { result: pair(body.code) });
			}
			if (url.startsWith("/probe/")) return reply(res, 200, { result: await PROBE[url.slice(7)](body) });
			const match = /^\/v1\/(call|watch)\/([A-Za-z][A-Za-z0-9]*)$/.exec(url);
			if (match === null) throw new Refusal(404, "unknown_call", `This server has no path ${url}.`);
			const device = deviceOf(req);
			if (device === undefined) throw new Refusal(401, "unauthenticated", "Send a device token.");
			const def = CALLS[match[2]];
			if (def === undefined || (match[1] === "watch" && def.acquire === undefined)) {
				throw new Refusal(404, "unknown_call", `This server has no ${match[1]} named ${match[2]}.`);
			}
			const errors = def.check.errors(body);
			if (errors.length > 0) throw new Refusal(400, "bad_request", "The request does not fit the call.", { errors });
			if (match[1] === "watch") return await pipe(req, res, device, def, body);
			if (def.acquire !== undefined) {
				const watch = await def.acquire(body);
				await watch.stop();
				return reply(res, 200, { result: watch.value });
			}
			return reply(res, 200, { result: await def.run(body, device) });
		} catch (error) {
			fail(res, error);
		}
	});
	// The heartbeat tick also notices a revoked device. The design says 15 s. The probe passes a short tick.
	setInterval(() => {
		loadDevices();
		for (const stream of streams) {
			if (devices.get(stream.device)?.hash === undefined) stream.finish("revoked", "This device was revoked.");
			else if (!stream.res.writableNeedDrain) stream.res.write(":\n\n");
		}
	}, tickMs).unref();
	process.on("SIGTERM", async () => {
		for (const project of projects.values()) await project.harness.close(ctx);
		await sleep(100);
		process.exit(0);
	});
	server.listen(wantPort, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port })));
}

// ------------------------------------------------------------------------------------------------ the client

async function drive() {
	const { apply } = await import(`${base}/chord/dist/delta/index.js`);
	const began = Date.now();
	const dir = mkdtempSync(join(tmpdir(), "tau-wire-"));
	const say = (line) => console.log(line);
	const short = (text, max = 900) => (text.length <= max ? text : `${text.slice(0, max)}... (${text.length} bytes)`);

	let child;
	let url;
	const start = async (port = 0) => {
		child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--serve", dir, String(port), "200"], {
			stdio: ["ignore", "pipe", "inherit"],
		});
		const first = await new Promise((resolve) => child.stdout.once("data", (chunk) => resolve(String(chunk))));
		url = `http://127.0.0.1:${JSON.parse(first.split("\n")[0]).port}`;
		child.stdout.resume();
		return child;
	};
	const stop = async (signal) => {
		const exited = new Promise((resolve) => child.once("exit", resolve));
		child.kill(signal);
		await exited;
	};
	const post = async (path, body, token) => {
		const headers = { "content-type": "application/json" };
		if (token !== undefined) headers.authorization = `Bearer ${token}`;
		const res = await fetch(`${url}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
		const raw = await res.text();
		return { status: res.status, raw, body: JSON.parse(raw) };
	};
	const call = (name, body, token) => post(`/v1/call/${name}`, body, token);
	const ok = async (name, body, token) => {
		const res = await call(name, body, token);
		assert.equal(res.status, 200, `${name}: ${res.raw}`);
		return res.body.result;
	};
	const control = async (name, body) => (await post(`/probe/${name}`, body)).body.result;
	const watch = (name, body, token, label = "") => {
		const s = { frames: [], sizes: [], value: undefined, comments: 0, end: undefined, largest: 0 };
		const waiters = new Set();
		const wake = () => {
			for (const waiter of waiters) waiter();
		};
		const req = http.request(`${url}/v1/watch/${name}`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-probe-label": label },
		});
		s.done = new Promise((resolve) => {
			const finish = (how) => {
				s.end ??= how;
				wake();
				resolve(s.end);
			};
			req.on("error", (error) => finish(`socket error ${error.code}`));
			req.on("response", (res) => {
				s.res = res;
				s.status = res.statusCode;
				res.setEncoding("utf8");
				let pending = "";
				res.on("data", (chunk) => {
					pending += chunk;
					for (let cut = pending.indexOf("\n\n"); cut >= 0; cut = pending.indexOf("\n\n")) {
						const frame = pending.slice(0, cut);
						pending = pending.slice(cut + 2);
						if (frame.startsWith(":")) {
							s.comments++;
							continue;
						}
						assert.ok(frame.startsWith("data: "), frame);
						const message = JSON.parse(frame.slice(6));
						s.largest = Math.max(s.largest, frame.length);
						if (message.error !== undefined) s.end = `error frame ${message.error.code}`;
						else {
							if (s.keep !== false) s.frames.push(frame);
							s.count = (s.count ?? 0) + 1;
							if (s.count > 1 && message.ops[0]?.[0] === "r") s.replaced = (s.replaced ?? 0) + 1;
							s.value = apply(s.value, message.ops);
						}
					}
					wake();
				});
				res.on("end", () => finish("the server closed the stream with no error frame"));
				res.on("error", (error) => finish(`socket error ${error.code}`));
				res.on("close", () => finish("closed"));
			});
		});
		req.end(JSON.stringify(body));
		s.until = async (what, test) => {
			const deadline = Date.now() + 120_000;
			while (!test(s.value)) {
				assert.ok(s.end === undefined, `${what}: the stream ended (${s.end})`);
				assert.ok(Date.now() < deadline, `never: ${what}`);
				await new Promise((resolve) => {
					const waiter = () => {
						waiters.delete(waiter);
						resolve();
					};
					waiters.add(waiter);
					setTimeout(waiter, 500);
				});
			}
		};
		s.close = () => req.destroy();
		return s;
	};
	const mint = (name) => {
		// What `tau pair <name>` does on the server machine: one file, named by the hash of the code.
		const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
		const code = Array.from(randomBytes(8), (byte) => alphabet[byte % 32]).join("");
		const record = { name, expires: Date.now() + 600_000 };
		writeFileSync(join(dir, "pairing", `${sha(code)}.json`), JSON.stringify(record), { mode: 0o600 });
		return `${code.slice(0, 4)}-${code.slice(4)}`;
	};

	say(`node ${process.version}; typeof WebSocket = ${typeof WebSocket}; typeof EventSource = ${typeof EventSource}; ` +
		`node:http exports a WebSocket server: ${Object.keys(http).some((key) => /websocket.*server/i.test(key))}`);
	await start();

	// Step 1
	const paired = await post("/v1/pair", { code: mint("laptop") });
	const laptop = paired.body.result;
	assert.equal(paired.status, 200);
	const file = JSON.parse(readFileSync(join(dir, "devices", `${laptop.device}.json`), "utf8"));
	assert.ok(!JSON.stringify(file).includes(laptop.token.split(".")[1]));
	const codeTwice = mint("phone");
	const phone = (await post("/v1/pair", { code: codeTwice })).body.result;
	const again = await post("/v1/pair", { code: codeTwice });
	assert.equal(again.status, 401);
	say(`step 1 ok: POST /v1/pair gave ${paired.raw.replace(laptop.token.split(".")[1], "<43 characters>")}`);
	say(`  the device file holds ${Object.keys(file).join(", ")} and not the token; the same code again: ${again.status} ${again.raw}`);

	// Step 2
	const refused = await call("setOptions", { project: "p", workflow: "w1", patch: { reviewer: "faux/none", colour: "red" } }, laptop.token);
	assert.equal(refused.status, 409);
	assert.equal(refused.body.error.data.errors.length, 2);
	const C1 = (await ok("create", { project: "p", model: "faux/faux-a" }, laptop.token)).conversation;
	const C = (await ok("create", { project: "p", model: "faux/faux-a" }, laptop.token)).conversation;
	assert.notEqual(C1, C);
	say(`step 2 ok: setOptions was refused: ${refused.status} ${refused.raw}`);
	say(`  create sent twice made conversations ${C1} and ${C}`);

	// Step 3
	const A = watch("open", { project: "p", conversation: C }, laptop.token, "laptop");
	await A.until("the first frame", (value) => value !== undefined);
	await control("script", {});
	const inputBody = { project: "p", conversation: C, text: "Run the tests.", requestId: "r1" };
	const sent = await call("input", inputBody, laptop.token);
	const resent = await call("input", inputBody, laptop.token);
	assert.equal(sent.body.result.submission.id, resent.body.result.submission.id);
	say(`  input sent twice with requestId r1 gave submission ${sent.body.result.submission.id} both times: ${resent.raw}`);
	await A.until("the tool runs", (value) => value.docs["pi.live"]?.tools?.[0]?.status === "running");
	const steer = await call("input", { project: "p", conversation: C, text: "Also report the count.", requestId: "r2", whenBusy: "steer" }, laptop.token);
	assert.equal(steer.body.result.submission.status, "queued");
	await A.until("the steer is queued", (value) => value.docs["pi.inbox"]?.items?.length === 1);
	await A.until("the run ended", (value) => value.docs["pi.live"]?.run === undefined && value.entries.length >= 5);
	await sleep(1500);
	const now = await ok("open", { project: "p", conversation: C }, laptop.token);
	assert.deepEqual(A.value, now);
	const has = (frame, needle) => frame.includes(needle);
	const pick = (needle) => A.frames.find((frame, index) => index > 0 && has(frame, needle));
	say(`step 3 ok: ${A.frames.length} frames; the value built from them equals a new snapshot. Entries: ${now.entries.map((e) => e.kind).join(", ")}`);
	if (process.env.PROBE_DUMP) for (const [i, frame] of A.frames.entries()) say(`  [${i + 1}] ${frame}`);
	say(`  frame 1 (${A.frames[0].length} bytes): ${short(A.frames[0], 2400)}`);
	say(`  frame 2: ${short(A.frames[1])}`);
	say(`  frame 3: ${short(A.frames[2])}`);
	say(`  partial text: ${short(pick('"a",["docs","pi.live","generation"') ?? "none")}`);
	say(`  tool output:  ${short(pick('["a",["docs","pi.live","tools",0,"output"]') ?? "none")}`);
	say(`  steer queued: ${short(pick('"pi.inbox"') ?? "none")}`);
	say(`  run ended:    ${short(A.frames.findLast((frame) => has(frame, '["d",["docs","pi.live","run"]]')) ?? A.frames.at(-1))}`);
	say(`  the steer's reply was ${steer.raw}`);
	say(`  the stream also carried ${A.comments} comment lines, the heartbeat (every 200 ms in this probe, 15 s in the design)`);

	// Step 4
	const D = "w1:42:design#3";
	const design = "Add a --json flag to export.\nReuse the serializer.";
	const basis = (await control("request", { project: "p", conversation: C, id: D, title: "Design v3 is ready", text: design, choices: ["approve", "revise", "abort"] })).basis;
	await control("request", { project: "q", conversation: (await ok("create", { project: "q", model: "faux/faux-a" }, laptop.token)).conversation, id: "w2:f7:due#1", title: "Forecast F7 is due", text: "Rain by Friday.", choices: ["yes", "no"] });
	const I = watch("inbox", {}, phone.token, "phone inbox");
	await I.until("both projects", (value) => value?.p?.["w1:42:design"] !== undefined && value?.q?.["w2:f7:due"] !== undefined);
	const read = await call("decision", { project: "p", decision: D }, phone.token);
	assert.equal(read.body.result.text, design);
	const answerBody = { project: "p", decision: D, basis, choice: "revise", annotations: [{ text: "Name the flag --format json.", range: { start: 6, end: 12 } }, { text: "Good otherwise." }] };
	const first = await call("answer", answerBody, phone.token);
	const second = await call("answer", answerBody, phone.token);
	const other = await call("answer", { ...answerBody, choice: "approve" }, laptop.token);
	assert.equal(first.status, 200);
	assert.equal(second.body.result.repeated, true);
	assert.equal(other.status, 409);
	assert.equal(other.body.error.data.decision.by, phone.device);
	await I.until("the decision left the inbox", (value) => value.p["w1:42:design"] === undefined);
	const cut = new URL(`http://h/v1/decision/${D}`);
	say(`step 4 ok: inbox frame 1: ${short(I.frames[0], 700)}`);
	say(`  decision: ${short(read.raw, 500)}`);
	say(`  answer: ${first.status} ${short(first.raw, 600)}`);
	say(`  the same answer again: ${second.status}, repeated ${second.body.result.repeated}, by ${second.body.result.decision.by === phone.device ? "the phone" : "?"}`);
	say(`  the laptop with another choice: ${other.status} ${short(other.raw, 200)}`);
	say(`  inbox frame after the answer: ${I.frames.at(-1)}`);
	say(`  the same ID in a URL path: pathname ${cut.pathname}, hash ${cut.hash}`);

	// Step 5
	const L = A.value.entries.at(-1).id;
	A.close();
	await A.done;
	await control("append", { project: "p", conversation: C, from: 1, count: 30, bytes: 200 });
	const woke = watch("open", { project: "p", conversation: C, after: L }, laptop.token, "laptop wakes");
	await woke.until("the first frame", (value) => value !== undefined);
	assert.equal(woke.value.entries.length, 30);
	assert.equal(woke.value.before, L);
	const whole = await ok("open", { project: "p", conversation: C }, laptop.token);
	say(`step 5 ok: the laptop held entries up to ${L}. 30 entries later, open with after:${L} gave ${woke.value.entries.length} entries, before ${woke.value.before}, in ${woke.frames[0].length} bytes. ` +
		`open with no after gave ${whole.entries.length} entries in ${JSON.stringify(whole).length} bytes`);
	const L2 = woke.value.entries.at(-1).id;
	woke.close();
	await woke.done;
	const nothing = await call("open", { project: "p", conversation: C, after: L2 }, laptop.token);
	assert.equal(nothing.body.result.entries.length, 0);
	say(`  open with after:${L2} and nothing missed gave 0 entries in ${nothing.raw.length} bytes`);
	await control("append", { project: "p", conversation: C, from: 31, count: 150, bytes: 200 });
	const late = await ok("open", { project: "p", conversation: C, after: L2 }, laptop.token);
	assert.equal(late.entries.length, 50);
	assert.ok(late.before > L2);
	const missed = [];
	let pages = 0;
	for (let cursor; ; pages++) {
		const page = await ok("history", { project: "p", conversation: C, minEntryId: L2 + 1, maxEntryId: late.before, limit: 40, ...(cursor === undefined ? {} : { cursor }) }, laptop.token);
		missed.push(...page.items);
		if (page.next === undefined) break;
		cursor = page.next;
	}
	assert.equal(missed.length, 100);
	assert.deepEqual([...missed].reverse().map((e) => e.data.n).concat(late.entries.map((e) => e.data.n)), Array.from({ length: 150 }, (_, i) => i + 31));
	say(`  150 entries later, open with after:${L2} gave the newest ${late.entries.length} and before ${late.before}. history from ${L2 + 1} to ${late.before} gave the other ${missed.length} in ${pages + 1} pages`);

	// Step 6
	const C2 = (await ok("create", { project: "p", model: "faux/faux-a" }, laptop.token)).conversation;
	const fast = watch("open", { project: "p", conversation: C2 }, laptop.token, "fast");
	const slow = watch("open", { project: "p", conversation: C2 }, phone.token, "slow");
	fast.keep = false;
	slow.keep = false;
	await fast.until("the first frame", (value) => value !== undefined);
	await slow.until("the first frame", (value) => value !== undefined);
	slow.res.pause(); // the phone stops reading
	const N = 13_000;
	const took = (await control("append", { project: "p", conversation: C2, from: 1, count: N, bytes: 3000, paced: true })).ms;
	await fast.until("the fast client has it all", (value) => value.entries.at(-1)?.data.n === N);
	const before = (await control("stats", {})).streams.find((s) => s.label === "slow");
	slow.res.resume();
	await slow.until("the slow client has it all", (value) => value.entries.at(-1)?.data.n === N);
	assert.deepEqual(slow.value, fast.value);
	const after = (await control("stats", {})).streams.find((s) => s.label === "slow");
	say(`step 6 ok: ${N} commits of 3 KB in ${took} ms. The fast client got ${fast.count} frames, ${fast.replaced ?? 0} of them a root replacement. ` +
		`The slow client stopped reading and got ${slow.count} frames, ${slow.replaced ?? 0} of them a root replacement, the largest ${slow.largest} bytes. Both ended with the same value.`);
	say(`  with the slow client not reading, the server wrote ${before.bytes} bytes in ${before.frames} frames and then waited for drain; ` +
		`after the client read again it wrote ${after.bytes - before.bytes} bytes in ${after.frames - before.frames} frames`);
	fast.close();
	slow.close();

	// Steps 7 and 10
	await control("emit", { project: "p", count: 500 });
	const head = await ok("timeline", { project: "p" }, laptop.token);
	const LOG = head.conversation.id;
	const events = [...head.entries].reverse();
	const page1 = await ok("history", { project: "p", conversation: LOG, maxEntryId: head.before, limit: 100 }, laptop.token);
	const page2 = await ok("history", { project: "p", conversation: LOG, maxEntryId: head.before, limit: 100, cursor: page1.next }, laptop.token);
	events.push(...page1.items, ...page2.items);
	const three = [watch("open", { project: "p", conversation: C }, laptop.token), watch("inbox", {}, laptop.token), watch("timeline", { project: "p" }, laptop.token)];
	for (const each of three) await each.until("the first frame", (value) => value !== undefined);
	const port = Number(new URL(url).port);
	await stop("SIGKILL");
	const killed = await Promise.all(three.map((each) => each.done));
	await start(port);
	let cursor = page2.next;
	let more = 0;
	while (cursor !== undefined) {
		const page = await ok("history", { project: "p", conversation: LOG, maxEntryId: head.before, limit: 100, cursor }, laptop.token);
		events.push(...page.items);
		cursor = page.next;
		more++;
	}
	assert.deepEqual(events.map((e) => e.data.text), Array.from({ length: 500 }, (_, i) => `event ${500 - i}`));
	say(`step 7 ok: timeline gave the newest ${head.entries.length} events and before ${head.before}. Two pages of 100, then SIGKILL, then ${more} more pages with the cursor from page 2 (${page2.next} = ${Buffer.from(page2.next, "base64url")}): 500 events, none twice, none missing`);
	say(`step 10 ok (kill): the three streams ended: ${[...new Set(killed)].join("; ")}. The same token worked after the restart`);
	const reopened = [watch("open", { project: "p", conversation: C }, laptop.token), watch("inbox", {}, laptop.token), watch("timeline", { project: "p" }, laptop.token)];
	for (const each of reopened) await each.until("the first frame", (value) => value !== undefined);
	assert.ok(reopened.every((each) => each.frames[0].startsWith('data: {"ops":[["r",')));
	await stop("SIGTERM");
	const closed = await Promise.all(reopened.map((each) => each.done));
	say(`step 10 ok (SIGTERM): reopened, each first frame was a root replacement. On SIGTERM the three streams ended: ${[...new Set(closed)].join("; ")}`);
	await start(port);

	// Step 8
	const stolen = watch("inbox", {}, phone.token, "stolen phone");
	await stolen.until("the first frame", (value) => value !== undefined);
	const path = join(dir, "devices", `${phone.device}.json`);
	const { hash: _hash, ...kept } = JSON.parse(readFileSync(path, "utf8"));
	const mtime = statSync(join(dir, "devices")).mtimeMs;
	writeFileSync(`${path}.tmp`, JSON.stringify({ ...kept, revokedAt: Date.now() }), { mode: 0o600 }); // what `tau revoke phone` does
	renameSync(`${path}.tmp`, path);
	assert.notEqual(statSync(join(dir, "devices")).mtimeMs, mtime);
	const t0 = Date.now();
	const denied = await call("inbox", {}, phone.token);
	const ended = await stolen.done;
	const allowed = await call("inbox", {}, laptop.token);
	assert.equal(denied.status, 401);
	assert.equal(allowed.status, 200);
	say(`step 8 ok: after the device file was rewritten, the phone's next call got ${denied.status} ${denied.raw}; its open stream ended with "${ended}" ${Date.now() - t0} ms later (tick 200 ms in this probe); the laptop still got ${allowed.status}`);

	// Step 9
	const caps = await (await fetch(`${url}/v1`)).json();
	const gone = await call("workflows", {}, laptop.token);
	const extra = await call("input", { ...inputBody, device: "d_forged" }, laptop.token);
	const badCursor = await call("history", { project: "p", conversation: C, cursor: "bm9uc2Vuc2U" }, laptop.token);
	assert.equal(gone.status, 404);
	assert.equal(extra.status, 400);
	say(`step 9 ok: GET /v1 lists ${Object.keys(caps.result.calls).join(", ")}; input is ${JSON.stringify(caps.result.calls.input).slice(0, 150)}...`);
	say(`  a call this server does not have: ${gone.status} ${gone.raw}`);
	say(`  a field this server does not know: ${extra.status} ${extra.raw}`);
	say(`  a cursor it cannot read: ${badCursor.status} ${badCursor.raw}`);

	// Step 11
	const noToken = await call("answer", answerBody);
	assert.equal(noToken.status, 401);
	say(`step 11 ok: answer with no token: ${noToken.status} ${noToken.raw}`);

	await stop("SIGTERM");
	say(`ok: all steps ran in ${Date.now() - began} ms`);
}

if (process.argv[2] === "--serve") await serve(process.argv[3], Number(process.argv[4]), Number(process.argv[5]));
else await drive();
