// Probe for candidate 3 of the extension arena, on pi-durable 1.5.2 with SQLite files under the system temp
// directory. Modelled on docs/core/spikes/host.mjs. Every "host" and "W1" part below is a stand-in shaped like the
// design in design.md. No Tau code exists.
// X1.  The project default. The host passes `settings.extensions` as a getter. A conversation with no stored
//      selection follows it, `{ add: [W1] }` gets the default plus W1, and an exact array gets only its names.
// X2.  The designer searches. The tool reads its options from a session document and its result holds no key. The
//      host then adds an extension while the designer's run is in a tool round. The next request of the same run
//      offers the new tool, and the transcript records it. The closed reviewer is unchanged.
// X3.  A closed W2 agent is asked to search. Its call ends as `tool_unavailable` and the run goes on. Adding
//      websearch to the project does not reach it, and reaches a bare conversation.
// X4.  The store is reopened without the websearch code. Conversations resolve without the tool, an exact array
//      that names it resolves without it, the transcript records the removal, the options document is still stored,
//      and a call to the tool ends as `tool_unavailable`. After a reinstall the tool is back.
// X5.  Two tool calls of one round run in call order when one is `sequential`. The same two as nested calls of one
//      tool overlap. `callers: ["model"]` refuses the nested call.
// X6.  A lane dispatch. One tool commit reads an entry of another conversation, submits to the worker, appends the
//      brief entry, and writes documents. The lane used two model requests and is idle while the worker runs.
// X7.  A `write` with a model message to the idle lane starts no run and is in its next context. While a lane run
//      works, such a write is placed inside that run, and a second input queues and gets a run of its own.
// X8.  A note written to a session document reaches a running worker at its next model request, as a prompt section.
// X9.  The lane's run fails on a model error while a worker is in a tool call. The store is closed and reopened.
//      The worker's run goes on. The lane still shows the failure, and a continue dispatches.
// X10. Compaction of the lane. The summary request's token limit, what the next context holds, and what stays stored.
// X11. A tool that returns `control.handoff` starts a new context in the same conversation.
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
const { compile, obj, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { CodingTools } = await import(`${base}/pi-durable/dist/tools/index.js`);
const { createRegistry, defineDoc, defineExtension, defineTool, section, Harness, LiveDoc } = d;

const dir = mkdtempSync(join(tmpdir(), "tau-ext-c3-"));
const text = (t) => [{ type: "text", text: t }];
const plain = (value) => JSON.parse(JSON.stringify(value));
const names = (items) => items.map((item) => item.name);
const MODEL = { provider: "faux", modelId: "faux-a" };
const KEY = "sk-secret-123";
const sessionDoc = (kind, initial) =>
	defineDoc({ kind, version: 1, scope: "session", initial, checkpointWhen: () => false });
const until = async (what, test) => {
	for (let i = 0; i < 600; i++) {
		if (await test()) return;
		await new Promise((r) => setTimeout(r, 5));
	}
	assert.fail(`never: ${what}`);
};
const gate = () => {
	let open;
	const promise = new Promise((r) => (open = r));
	return { promise, open };
};
const orStopped = (promise, signal) =>
	Promise.race([
		promise,
		new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("stopped")), { once: true })),
	]);

// --- Stand-in extensions ---------------------------------------------------------------------------------------

// websearch: one tool, and options in a session document named by the extension.
const WebSearchOptions = sessionDoc("websearch.options", () => ({}));
const webSearchSchema = obj({ provider: str(), apiKey: str({ format: "secret" }) });
const webSearch = defineTool({
	name: "web_search",
	description: "Search the web.",
	parameters: obj({ query: str() }),
	replay: "safe",
	execute: async (args, api, c) => {
		const o = (await api.snapshot(WebSearchOptions, c)) ?? {};
		if (o.provider === undefined || o.apiKey === undefined) {
			return { isError: true, output: text("websearch is not set up for this project") };
		}
		return { output: text(`results for ${args.query} via ${o.provider}`) };
	},
});
const WebSearch = defineExtension({ name: "websearch", tools: [webSearch] });

// W1: role tools, lane tools, and a section that renders the notes.
const log = [];
const toolGates = new Map();
const Lane = sessionDoc("w1.lane", () => ({ notes: [] }));
const Work = sessionDoc("w1.work", () => ({ items: {}, receipts: {} }));
const slow = (name, extra = {}) =>
	defineTool({
		name,
		description: name,
		parameters: obj({}),
		...extra,
		execute: async () => {
			log.push(`${name}:start`);
			await new Promise((r) => setTimeout(r, 40));
			log.push(`${name}:end`);
			return { output: text("published") };
		},
	});
const publish = slow("publish", { executionMode: "sequential" });
const publishModelOnly = slow("publish_m", { executionMode: "sequential", callers: ["model"] });
const touch = defineTool({
	name: "touch",
	description: "touch",
	parameters: obj({}),
	execute: async () => {
		log.push("touch");
		return { output: text("touched") };
	},
});
const showDiff = defineTool({
	name: "show_diff",
	description: "Show the diff at the published SHA.",
	parameters: obj({}),
	execute: async () => ({ output: text("diff") }),
});
const hold = defineTool({
	name: "hold",
	description: "Work until the probe lets go.",
	parameters: obj({}),
	execute: async (_args, api, c) => {
		const held = toolGates.get(api.conversationId);
		if (held !== undefined) await orStopped(held.promise, c.abortSignal);
		return { output: text("worked") };
	},
});
const dispatch = defineTool({
	name: "dispatch",
	description: "Hand a work item to its worker, with a brief.",
	parameters: obj({ work: str(), brief: str() }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: async (args, api, c) => {
		const before = await api.snapshot(Work, c);
		const item = before?.items[args.work];
		if (item === undefined) return { isError: true, output: text(`no work item ${args.work}`) };
		const worker = await api.conversation(item.worker, c);
		const result = await api.commit(async (tx) => {
			const work = await tx.doc(Work);
			if (work.receipts[api.taskId] !== undefined) return work.receipts[api.taskId];
			const current = work.items[args.work];
			if (current.stage !== "briefing") return `refused: item ${args.work} is ${current.stage}`;
			const design = await tx.entry(current.design); // a table read, in another conversation
			await worker.submit(tx, {
				type: "input",
				content: `${design.data.text}\n\nBrief from the lane:\n${args.brief}`,
				requestId: `dispatch:${current.design}`,
			});
			const brief = await tx.appendEntry(api.conversationId, {
				kind: "w1.brief",
				data: { text: args.brief, work: args.work, design: current.design },
			});
			current.stage = "building";
			current.brief = brief.id;
			work.receipts[api.taskId] = `dispatched item ${args.work}`;
			return work.receipts[api.taskId];
		}, c);
		return { output: text(result) };
	},
});
const note = defineTool({
	name: "note",
	description: "Keep a standing note for this role.",
	parameters: obj({ text: str() }),
	replay: "safe",
	execute: async (args, api, c) => {
		await api.commit(async (tx) => {
			const lane = await tx.doc(Lane);
			if (!lane.notes.includes(args.text)) lane.notes.push(args.text);
		}, c);
		return { output: text("noted") };
	},
});
const fresh = defineTool({
	name: "fresh",
	description: "Start a new context.",
	parameters: obj({}),
	execute: async () => ({
		output: text("fresh"),
		control: { handoff: "Fresh start. The notes section holds what stays.", terminate: true },
	}),
});
const W1 = defineExtension({
	name: "w1",
	tools: [publish, publishModelOnly, touch, showDiff, hold, dispatch, note, fresh],
	sections: [
		section("w1_notes", async (input, c) => {
			const lane = await input.read.snapshot(Lane, c);
			return lane === undefined || lane.notes.length === 0 ? undefined : lane.notes.join("\n");
		}),
	],
});

// A stand-in for codemode: a tool that makes two nested calls at once.
const script = defineTool({
	name: "codemode",
	description: "Run a script that calls tools.",
	parameters: obj({ first: str() }),
	callers: ["model"],
	execute: async (args, api, c) => {
		const results = await Promise.all([api.executeTool(args.first, {}, c), api.executeTool("touch", {}, c)]);
		return { output: text(JSON.stringify(results.map((r) => r.isError))) };
	},
});
const Codemode = defineExtension({ name: "codemode", tools: [script] });

const recordForecast = defineTool({
	name: "record_forecast",
	description: "Record a forecast.",
	parameters: obj({}),
	execute: async () => ({ output: text("recorded") }),
});
const W2 = defineExtension({ name: "w2", tools: [recordForecast] });

// --- The host's part, as designed --------------------------------------------------------------------------------

// The import map. `entry` marks a workflow.
const MODULES = {
	websearch: { extension: WebSearch, options: { schema: webSearchSchema, doc: WebSearchOptions } },
	codemode: { extension: Codemode },
	w1: { extension: W1, entry: {} },
	w2: { extension: W2, entry: {} },
};
const Project = sessionDoc("tau.project", () => ({ extensions: [] }));
// The project default: coding-tools, then the project's extensions that the server has and that are not workflows.
const defaultOf = (project, modules) => [
	CodingTools,
	...project.extensions.flatMap((name) => {
		const module = modules[name];
		return module === undefined || module.entry !== undefined ? [] : [module.extension];
	}),
];
// What the `options` call returns: a value with the format `secret` is shown as `true`.
const optionsView = (schema, value) =>
	Object.fromEntries(
		Object.entries(value).map(([key, v]) => [key, schema.properties[key]?.format === "secret" ? true : v]),
	);

// One scripted model per project. A request is routed by the conversation's instructions.
const scripts = new Map();
const requests = [];
const replay = (context) => {
	const tools = new Set();
	const sections = {};
	for (const message of context.messages) {
		if (message.role !== "system") continue;
		for (const tool of message.toolsAdded ?? []) tools.add(tool.name);
		for (const tool of message.toolsRemoved ?? []) tools.delete(tool.name);
		for (const [key, value] of Object.entries(message.sections ?? {})) {
			if (value === null) delete sections[key];
			else sections[key] = value;
		}
	}
	return { tools: [...tools], sections };
};
const said = (message) =>
	typeof message.content === "string"
		? message.content
		: message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
const route = async (context, options) => {
	const first = context.messages[0];
	if (first?.role === "system" && said(first).includes("summarization")) {
		requests.push({ role: "summarizer", maxTokens: options?.maxTokens, source: said(context.messages[1]) });
		return fauxAssistantMessage("## Goal\nHand build work to workers.\n\n## Progress\nItems 1 to 4 were dispatched.");
	}
	const { tools, sections } = replay(context);
	const role = /ROLE:(\S+)/.exec(sections.instructions ?? "")?.[1] ?? "none";
	const body = context.messages.filter((message) => message.role !== "system");
	const seen = { role, tools, sections, body, all: body.map(said).join("\n"), last: body.at(-1) };
	requests.push(seen);
	const act = scripts.get(role);
	assert.ok(act, `no script for ${role}`);
	return act(seen, options);
};
const call = (name, args = {}) => fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
const toolResults = (context) => context.messages.filter((message) => message.role === "toolResult");

async function openProject(file, registry, project) {
	const faux = fauxProvider({ models: [{ id: "faux-a" }] });
	faux.setResponses(Array.from({ length: 400 }, () => route));
	const models = createModels();
	models.setProvider(faux.provider);
	const storage = await openNodeSqliteStorage(join(dir, file));
	const harness = await Harness.open(
		storage,
		{
			models,
			registry,
			// Read at each use, so a change to the project's list is live.
			settings: () => ({ extensions: defaultOf(project.value, project.modules), retry: { enabled: false } }),
		},
		ctx,
	);
	return { harness, faux };
}
const bare = (harness, role) =>
	harness.createConversation(
		{ ownership: { kind: "ownerless" }, agent: { model: MODEL, cwd: "/srv/p", instructions: `ROLE:${role}` } },
		ctx,
	);
const made = (harness, role, agent) =>
	harness.createConversation(
		{ ownership: { kind: "ownerless" }, agent: { model: MODEL, instructions: `ROLE:${role}`, ...agent } },
		ctx,
	);
const ask = async (conversation, content) => (await conversation.submit({ type: "input", content }, ctx)).wait(ctx);
const toolsOf = async (conversation) => names((await conversation.agent(ctx)).tools);
const requestsOf = (role) => requests.filter((r) => r.role === role);

// --- X1 ------------------------------------------------------------------------------------------------------------
const P = { value: { extensions: ["websearch", "w1"] }, modules: MODULES };
const registryP = createRegistry();
registryP.install(CodingTools);
for (const name of P.value.extensions) registryP.install(MODULES[name].extension);
let p = await openProject("p.sqlite", registryP, P);
let harness = p.harness;
harness.resume();
await harness.commit(async (tx) => {
	Object.assign(await tx.doc(Project), plain(P.value));
	Object.assign(await tx.doc(WebSearchOptions), { provider: "exa", apiKey: KEY });
}, ctx);

let B = await bare(harness, "bare");
let D = await made(harness, "designer", {
	extensions: { add: [W1] },
	tools: {
		remove: [...CodingTools.tools.filter((t) => ["write", "edit"].includes(t.name)), publishModelOnly, showDiff, dispatch, note, fresh],
	},
});
const R = await made(harness, "reviewer", { extensions: [W1], tools: [showDiff] });
assert.deepEqual(names((await B.agent(ctx)).extensions), ["coding-tools", "websearch"]);
assert.deepEqual(await toolsOf(B), ["read", "write", "edit", "bash", "web_search"]);
assert.deepEqual(names((await D.agent(ctx)).extensions), ["coding-tools", "websearch", "w1"]);
assert.deepEqual(await toolsOf(D), ["read", "bash", "web_search", "publish", "touch", "hold"]);
assert.deepEqual(await toolsOf(R), ["show_diff"]);
console.log(
	"X1 ok: with the default [coding-tools, websearch], a conversation with no stored selection got " +
		`${(await toolsOf(B)).join(", ")}; { add: [w1] } got the default plus w1; the exact array [w1] got show_diff only`,
);

// --- X2 ------------------------------------------------------------------------------------------------------------
assert.deepEqual(compile(webSearchSchema).errors({ provider: "exa", apiKey: KEY }), []);
assert.deepEqual(optionsView(webSearchSchema, await harness.snapshot(WebSearchOptions, ctx)), {
	provider: "exa",
	apiKey: true,
});
scripts.set("designer", (seen) => {
	const done = seen.all.includes("worked") ? 2 : seen.all.includes("results for") ? 1 : 0;
	return [call("web_search", { query: "ndjson" }), call("hold"), fauxAssistantMessage("Design v1.")][done];
});
toolGates.set(D.id, gate());
const designing = await D.submit({ type: "input", content: "Add a --json flag." }, ctx);
await until("the designer holds", () => requestsOf("designer").length === 2);
// The host adds codemode while the designer's run is in a tool round: one commit on `Project`, then an install.
await harness.commit(async (tx) => {
	(await tx.doc(Project)).extensions.push("codemode");
}, ctx);
registryP.install(Codemode);
P.value.extensions.push("codemode");
toolGates.get(D.id).open();
assert.equal((await designing.wait(ctx)).status, "done");
await D.waitForIdle(ctx);
const designerSaw = requestsOf("designer").map((r) => r.tools.includes("codemode"));
assert.deepEqual(designerSaw, [false, false, true]);
const transcript = JSON.stringify((await D.entries({}, 200, undefined, ctx)).items);
assert.ok(transcript.includes("results for ndjson via exa"));
assert.ok(!transcript.includes(KEY));
const added = (await D.context(ctx)).messages.filter(
	(m) => m.role === "system" && (m.toolsAdded ?? []).some((tool) => tool.name === "codemode"),
);
assert.equal(added.length, 1);
assert.deepEqual(await toolsOf(R), ["show_diff"]);
assert.ok((await toolsOf(B)).includes("codemode"));
console.log(
	"X2 ok: the designer searched, and its transcript holds the result and not the key; a `secret` format with no " +
		"checker passed pi-schema; an extension added during the designer's tool round was offered from the next " +
		"request of the same run, and one system message in the transcript records it; the reviewer still has show_diff only",
);

// --- X3 ------------------------------------------------------------------------------------------------------------
const Q = { value: { extensions: ["w2"] }, modules: MODULES };
const registryQ = createRegistry();
registryQ.install(CodingTools);
registryQ.install(W2);
const q = await openProject("q.sqlite", registryQ, Q);
q.harness.resume();
const F = await made(q.harness, "forecaster", { extensions: [W2], tools: [recordForecast] });
scripts.set("forecaster", (seen) =>
	seen.last.role === "toolResult" ? fauxAssistantMessage("I have no search tool.") : call("web_search", { query: "pi 2.0" }),
);
assert.equal((await ask(F, "Search for the pi-durable roadmap.")).status, "done");
const refusal = toolResults(await F.context(ctx)).map(said)[0];
assert.match(refusal, /Tool web_search is not available/);
registryQ.install(WebSearch);
Q.value.extensions.push("websearch");
assert.deepEqual(await toolsOf(F), ["record_forecast"]);
const BQ = await bare(q.harness, "bareq");
assert.ok((await toolsOf(BQ)).includes("web_search"));
scripts.set("bareq", (seen) =>
	seen.last.role === "toolResult" ? fauxAssistantMessage("Not set up.") : call("web_search", { query: "pi 2.0" }),
);
await ask(BQ, "Search.");
const unset = toolResults(await BQ.context(ctx)).map(said)[0];
assert.match(unset, /not set up/);
await q.harness.close(ctx);
console.log(
	`X3 ok: the closed W2 agent's call ended with "${refusal}" and the run went on to an answer; after websearch was ` +
		"added to Q the W2 agent still had record_forecast only, and a bare conversation had web_search, which said " +
		`"${unset}" until its options are set`,
);

// --- X4 ------------------------------------------------------------------------------------------------------------
const X = await made(harness, "exact", { extensions: [CodingTools, WebSearch] });
const ids = { B: B.id, D: D.id, X: X.id };
await harness.close(ctx);
const { websearch: _gone, ...WITHOUT } = MODULES;
P.modules = WITHOUT;
const registryP2 = createRegistry();
p = await openProject("p.sqlite", registryP2, P);
harness = p.harness;
P.value = plain(await harness.snapshot(Project, ctx)); // the host reads the list from the store
registryP2.install(CodingTools);
const missing = [];
for (const name of P.value.extensions) {
	if (WITHOUT[name] === undefined) missing.push(name);
	else registryP2.install(WITHOUT[name].extension);
}
harness.resume();
assert.deepEqual(P.value.extensions, ["websearch", "w1", "codemode"]);
assert.deepEqual(missing, ["websearch"]);
B = await harness.conversation(ids.B, ctx);
D = await harness.conversation(ids.D, ctx);
assert.deepEqual(await toolsOf(B), ["read", "write", "edit", "bash", "codemode"]);
assert.ok(!(await toolsOf(D)).includes("web_search"));
assert.deepEqual(names((await (await harness.conversation(ids.X, ctx)).agent(ctx)).extensions), ["coding-tools"]);
assert.equal((await harness.snapshot(WebSearchOptions, ctx)).apiKey, KEY);
scripts.set("bare", (seen) =>
	seen.last.role === "toolResult" ? fauxAssistantMessage("Done.") : call("web_search", { query: "again" }),
);
assert.equal((await ask(B, "Search again.")).status, "done");
const gone = toolResults(await B.context(ctx)).map(said)[0];
assert.match(gone, /Tool web_search is not available/);
// B never ran before the restart, so its first prompt simply lacks the tool. D ran with it, so D's next request
// records the removal.
scripts.set("designer", () => fauxAssistantMessage("Still here."));
await ask(D, "Are you there?");
const removed = (await D.context(ctx)).messages.filter(
	(m) => m.role === "system" && (m.toolsRemoved ?? []).some((tool) => tool.name === "web_search"),
);
assert.ok(removed.length >= 1);
registryP2.install(WebSearch);
P.modules = MODULES;
assert.ok((await toolsOf(B)).includes("web_search"));
console.log(
	"X4 ok: reopened without the websearch code, both conversations resolved without web_search, an exact array " +
		`that names websearch resolved to coding-tools alone, a call ended with "${gone}", the designer's transcript ` +
		`records the removal (${removed.length} system messages name it), and the options document still held the key; after a reinstall ` +
		"the tool was back",
);

// --- X5 ------------------------------------------------------------------------------------------------------------
const C5 = await made(harness, "scripter", { extensions: { add: [W1] } });
const two = fauxAssistantMessage([fauxToolCall("publish", {}), fauxToolCall("touch", {})], { stopReason: "toolUse" });
let step = 0;
scripts.set("scripter", (seen) => (seen.last.role === "toolResult" ? fauxAssistantMessage("ok") : step));
step = two;
await ask(C5, "Publish and touch in one round.");
const direct = log.splice(0);
step = call("codemode", { first: "publish" });
await ask(C5, "Publish and touch from a script.");
const nested = log.splice(0);
step = call("codemode", { first: "publish_m" });
await ask(C5, "Publish (model only) and touch from a script.");
const guarded = log.splice(0);
const guardedResult = toolResults(await C5.context(ctx)).map(said).at(-1);
assert.deepEqual(direct, ["publish:start", "publish:end", "touch"]);
assert.ok(nested.indexOf("touch") < nested.indexOf("publish:end"), "the nested calls overlap");
assert.deepEqual(guarded, ["touch"]);
assert.equal(guardedResult, "[true,false]");
console.log(
	`X5 ok: one round with a sequential tool ran ${direct.join(" > ")}; the same two as nested calls of one tool ran ` +
		`${nested.join(" > ")}; with callers: ["model"] the nested call was refused and only ${guarded.join(", ")} ran`,
);

// --- X6 ------------------------------------------------------------------------------------------------------------
// The lane acts on its newest request. A report that was placed after the tool round is not a request.
const isRequest = (message) =>
	message.role === "user" && /reached build|Stop using the old serializer|Start fresh/.test(said(message));
const laneScript = (seen) => {
	const at = seen.body.findLastIndex(isRequest);
	if (seen.body.slice(at).some((message) => message.role === "toolResult")) return fauxAssistantMessage("Handed over.");
	const asked = said(seen.body[at]);
	if (asked.includes("Stop using the old serializer")) return call("note", { text: "Do not use the old serializer." });
	if (asked.includes("Start fresh")) return call("fresh");
	const item = /Item (\d+) reached build/.exec(asked)?.[1];
	assert.ok(item, `the lane was asked: ${asked}`);
	return call("dispatch", { work: item, brief: `Brief for item ${item}: reuse the export module. ${"x".repeat(600)}` });
};
scripts.set("lane", laneScript);
scripts.set("worker", (seen) => (seen.last.role === "toolResult" ? fauxAssistantMessage("Built.") : call("hold")));
const Dw = await made(harness, "designs", { extensions: [] }); // holds the design entries; never runs
let N = await made(harness, "lane", { extensions: [W1], tools: [dispatch, note, fresh] });
const workers = {};
// `w1.prepare`, phase 1 and phase 2, as two host commits.
async function reachBuild(item, title, held = false) {
	const worker = await made(harness, "worker", { extensions: [W1], tools: [hold] });
	workers[item] = worker.id;
	if (held) toolGates.set(worker.id, gate());
	await harness.commit(async (tx) => {
		const design = await tx.appendEntry(Dw.id, { kind: "w1.design", data: { text: `Design for item ${item}: ${title}` } });
		(await tx.doc(Work)).items[item] = { stage: "preparing", worker: worker.id, design: design.id };
	}, ctx);
	return harness.commit(async (tx) => {
		const work = await tx.doc(Work);
		const id = await N.submit(tx, {
			type: "input",
			content: `Item ${item} reached build. ${title}`,
			requestId: `build:${work.items[item].design}`,
		});
		work.items[item].stage = "briefing";
		return id;
	}, ctx);
}
const stageOf = async (item) => (await harness.snapshot(Work, ctx)).items[item].stage;
const busy = async (id) => (await harness.snapshot(LiveDoc, id, ctx))?.run !== undefined;
const settle = async (id) => (await harness.submission(id, ctx)).wait(ctx);

const first = await reachBuild("1", "Add a --json flag.", true);
assert.equal((await settle(first)).status, "done");
await N.waitForIdle(ctx);
await until("worker 1 works", () => busy(workers["1"]));
assert.equal(requestsOf("lane").length, 2);
assert.equal(await busy(N.id), false);
assert.equal(await stageOf("1"), "building");
const worker1 = await harness.conversation(workers["1"], ctx);
const brief1 = (await N.entries({}, 100, undefined, ctx)).items.find((entry) => entry.kind === "w1.brief");
const handed = (await worker1.context(ctx)).messages.filter((m) => m.role === "user").map(said)[0];
assert.match(handed, /^Design for item 1: Add a --json flag\.\n\nBrief from the lane:\nBrief for item 1/);
assert.equal(brief1.data.work, "1");
console.log(
	"X6 ok: one tool commit read the design entry of another conversation, submitted to the worker, appended the " +
		`brief entry, and wrote the documents; the dispatch took ${requestsOf("lane").length} model requests on the lane, ` +
		"and the lane was idle while the worker ran",
);

// --- X7 ------------------------------------------------------------------------------------------------------------
const report = (id, line) => ({
	type: "write",
	requestId: `report:${id}`,
	entry: { kind: "w1.report", data: { text: line }, model: [{ role: "user", content: text(line), timestamp: Date.now() }] },
});
const laneRequests = requestsOf("lane").length;
await (await N.submit(report("B1", "Item 1: build B1 published at S1."), ctx)).wait(ctx);
await new Promise((r) => setTimeout(r, 60));
assert.equal(await busy(N.id), false);
assert.equal(requestsOf("lane").length, laneRequests);
assert.ok((await N.context(ctx)).messages.map((m) => (m.role === "system" ? "" : said(m))).join("\n").includes("build B1 published"));
// Item 2 reaches build. While the lane's run works, item 1's review fails and item 3 reaches build.
const laneGate = gate();
scripts.set("lane", async (seen, options) => {
	if (seen.last.role !== "toolResult" && said(seen.last).includes("Item 2")) await orStopped(laneGate.promise, options?.signal);
	return laneScript(seen);
});
const second = await reachBuild("2", "Add a --csv flag.");
await until("the lane works on item 2", () => requestsOf("lane").length === laneRequests + 1);
const failedReview = await N.submit(report("R1", "Item 1: review R1 failed. Finding: partial writes."), ctx);
const third = await reachBuild("3", "Add a --tsv flag.");
assert.equal((await (await harness.submission(third, ctx)).status(ctx)).status, "queued");
laneGate.open();
assert.equal((await settle(second)).status, "done");
assert.equal((await failedReview.wait(ctx)).status, "done");
assert.equal((await settle(third)).status, "done");
await N.waitForIdle(ctx);
const after = requestsOf("lane").slice(laneRequests);
const sawFinding = after.map((r) => r.all.includes("review R1 failed"));
const sawItem3 = after.map((r) => r.all.includes("Item 3 reached build"));
assert.deepEqual(sawFinding, [false, true, true, true]);
assert.deepEqual(sawItem3, [false, false, true, true]);
assert.deepEqual([await stageOf("2"), await stageOf("3")], ["building", "building"]);
console.log(
	"X7 ok: a write with a model message to the idle lane started no run and was in its context; a write sent " +
		"during the run for item 2 was placed inside that run after its tool round; item 3's input queued and got a " +
		"run of its own afterwards. Two dispatches took 4 lane requests",
);

// --- X8 ------------------------------------------------------------------------------------------------------------
// Worker 1 is still inside its tool call. The owner tells the lane, the lane calls `note`, and the worker goes on.
scripts.set("lane", laneScript);
const worker1Before = requestsOf("worker").filter((r) => r.all.includes("item 1")).length;
assert.equal((await ask(N, "Stop using the old serializer everywhere.")).status, "done");
assert.deepEqual((await harness.snapshot(Lane, ctx)).notes, ["Do not use the old serializer."]);
toolGates.get(workers["1"]).open();
await worker1.waitForIdle(ctx);
const worker1Requests = requestsOf("worker").filter((r) => r.all.includes("item 1"));
assert.equal(worker1Before, 1);
assert.equal(worker1Requests.length, 2);
assert.equal(worker1Requests[0].sections["w1_notes"], undefined);
assert.match(worker1Requests[1].sections["w1_notes"], /Do not use the old serializer\./);
console.log(
	"X8 ok: the lane wrote a note to a session document, and a worker that was in a tool call had the note as a " +
		"prompt section in its next model request",
);

// --- X9 ------------------------------------------------------------------------------------------------------------
scripts.set("lane", () => fauxAssistantMessage("", { stopReason: "error", errorMessage: "provider said no" }));
// Worker 5 stands for a worker that is running: start it by hand and let it hold.
const running = await made(harness, "worker", { extensions: [W1], tools: [hold] });
toolGates.set(running.id, gate());
const runningWork = await running.submit({ type: "input", content: "Build item 9." }, ctx);
await until("the worker holds", () => busy(running.id));
const fourth = await reachBuild("4", "Add a --yaml flag.");
const failed = await settle(fourth);
assert.equal(failed.status, "unanswered");
await N.waitForIdle(ctx);
assert.equal((await harness.snapshot(LiveDoc, N.id, ctx)).runFailure.reason, "model_error");
assert.equal(await busy(running.id), true);
const laneId = N.id;
await harness.close(ctx);
toolGates.delete(running.id);
p = await openProject("p.sqlite", registryP2, P);
harness = p.harness;
harness.resume();
const again = await harness.conversation(running.id, ctx);
assert.equal((await (await harness.submission(runningWork.id, ctx)).wait(ctx)).status, "done");
await again.waitForIdle(ctx);
const cut = toolResults(await again.context(ctx)).map(said)[0];
N = await harness.conversation(laneId, ctx);
const liveLane = await harness.snapshot(LiveDoc, laneId, ctx);
assert.equal(liveLane.run, undefined);
assert.equal(liveLane.runFailure.reason, "model_error");
assert.equal(await stageOf("4"), "briefing");
scripts.set("lane", laneScript);
assert.equal((await (await N.submit({ type: "continue" }, ctx)).wait(ctx)).status, "done");
await until("item 4 is building", async () => (await stageOf("4")) === "building");
await N.waitForIdle(ctx);
await (await harness.conversation(workers["4"], ctx)).waitForIdle(ctx);
console.log(
	`X9 ok: the lane's run ended unanswered (${failed.reason}) while a worker was in a tool call; after a close and ` +
		`a reopen the worker's call ended with "${cut}" and its run went on to an answer; the lane still showed ` +
		"model_error, item 4 was still at briefing, and a continue dispatched it",
);

// --- X10 -----------------------------------------------------------------------------------------------------------
await N.configure({ compaction: { keepRecentTokens: 100 } }, ctx);
const entriesBefore = (await N.entries({}, 500, undefined, ctx)).items.length;
const messagesBefore = (await N.context(ctx)).messages.length;
const compaction = await harness.waitForTask(await N.compact(undefined, ctx), ctx);
assert.equal(compaction.state.outcome.status, "completed");
await (await harness.submission(compaction.state.outcome.result.submissionId, ctx)).wait(ctx);
const summarizer = requests.find((r) => r.role === "summarizer");
const compacted = await N.context(ctx);
const seenNow = compacted.messages.map((m) => (m.role === "system" ? "" : said(m))).join("\n");
assert.equal(summarizer.maxTokens, Math.floor(0.8 * 16384));
assert.ok(seenNow.includes("<summary>"));
assert.ok(!seenNow.includes("Item 1 reached build"));
assert.ok(!summarizer.source.includes("</w1_notes>"));
const kinds = (await N.entries({}, 500, undefined, ctx)).items.map((entry) => entry.kind);
assert.equal(kinds.filter((kind) => kind === "w1.brief").length, 4);
const fifth = await reachBuild("5", "Add a --xml flag.");
assert.equal((await settle(fifth)).status, "done");
await N.waitForIdle(ctx);
const afterCompaction = requestsOf("lane").at(-1);
assert.match(afterCompaction.sections["w1_notes"], /Do not use the old serializer\./);
assert.ok(afterCompaction.all.includes("<summary>"));
assert.ok(!afterCompaction.all.includes("Item 1 reached build"));
console.log(
	`X10 ok: the summary request asked for at most ${summarizer.maxTokens} tokens; the lane's context went from ` +
		`${messagesBefore} messages to ${compacted.messages.length}, starts with the summary, and no longer holds item 1's ` +
		`input or brief; all ${entriesBefore} earlier entries and the 4 brief entries are still stored; the notes ` +
		"section was in the next request, and the summarizer was not shown it",
);

// --- X11 -----------------------------------------------------------------------------------------------------------
const storedBefore = (await N.entries({}, 500, undefined, ctx)).items.length;
assert.equal((await ask(N, "Start fresh.")).status, "done");
await N.waitForIdle(ctx);
const freshContext = (await N.context(ctx)).messages.map((m) => (m.role === "system" ? "" : said(m))).join("\n");
assert.ok(freshContext.includes("Fresh start."));
assert.ok(!freshContext.includes("<summary>"));
assert.ok((await N.entries({}, 500, undefined, ctx)).items.length > storedBefore);
const sixth = await reachBuild("6", "Add a --toml flag.");
assert.equal((await settle(sixth)).status, "done");
await N.waitForIdle(ctx);
const afterFresh = requestsOf("lane").at(-1);
assert.match(afterFresh.sections["w1_notes"], /Do not use the old serializer\./);
assert.ok(!afterFresh.all.includes("Item 5 reached build"));
console.log(
	"X11 ok: a tool that returned control.handoff started a new context in the same conversation: the summary and " +
		"the earlier items were gone from it, every entry was still stored, and the next request still had the notes section",
);

for (const id of Object.values(workers)) await (await harness.conversation(id, ctx)).waitForIdle(ctx);
await harness.close(ctx);
console.log("ok: checks X1-X11 passed");
