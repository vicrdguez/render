// Extension and lane checks for candidate 1 of the extension arena, on pi-durable 1.5.2 with SQLite files.
// Modelled on docs/core/spikes/host.mjs. The extensions below are stand-ins: "coding-tools", "websearch", "w1", and
// "codemode" have the names of the real ones and tools that do nothing. No Tau code exists.
// E1. A project default through `settings.extensions` (a getter over an in-memory list). A conversation with no
//     selection gets the default. One with `{ add: [w1] }` and a `{ remove }` tool filter gets the default, w1, and
//     the tools left after the filter. One with an exact array gets only what it names.
// E2. A key stored as an option is read by the tool when it runs, and appears in no entry of the conversation.
// E3. While the designer's run holds inside a tool, the default gains "codemode". The request in flight did not
//     offer it, the next request of the same run does. The bare conversation gets it; the reviewer does not.
// E4. The store is closed and reopened without the websearch code and without it in the default. The stored
//     selections are unchanged, `web_search` is no longer offered, a call to it gets an error result, and the
//     options document is still in the store.
// E5. Lane: two follow-ups sent to one busy conversation start two runs, one after the other. The run for the
//     first follow-up does not see the second.
// E6. Lane: a `beforeCompact` hook supplies the summary from a document. No model request is made for it, the
//     context starts with that summary, and the old entries are still in storage.
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
const { obj, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { AgentDoc, CompactionEntry, CompactionTask, createRegistry, defineDoc, defineExtension, defineTool, hook } = d;
const { Harness } = d;

const dir = mkdtempSync(join(tmpdir(), "tau-ext-c1-"));
const text = (t) => [{ type: "text", text: t }];
const KEY = "sk-probe-secret-7f3a";
const model = { provider: "faux", modelId: "faux-a" };

// Stand-in extensions.
const noop = (name) =>
	defineTool({
		name,
		description: `${name} (stand-in)`,
		parameters: obj({}, { open: true }),
		execute: async () => ({ output: text(`${name} ran`) }),
	});
let holding;
let release;
const hold = defineTool({
	name: "hold",
	description: "Wait until the probe lets go.",
	parameters: obj({}),
	execute: async () => {
		holding();
		await new Promise((r) => (release = r));
		return { output: text("held") };
	},
});
const [read, write, edit, bash] = ["read", "write", "edit", "bash"].map(noop);
const CT = defineExtension({ name: "coding-tools", tools: [read, write, edit, bash, hold] });

// websearch: options in a session document named by the extension; the key is read when the tool runs.
const WsOptions = defineDoc({
	kind: "websearch.options",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});
const SECRET_KEYS = ["apiKey"]; // the keys whose schema format is `secret`
const webSearch = defineTool({
	name: "web_search",
	description: "Search the web.",
	parameters: obj({ query: str() }),
	replay: "safe",
	execute: async (args, api, c) => {
		const options = await api.snapshot(WsOptions, c);
		if (options?.apiKey === undefined) return { output: text("websearch is not set up in this project"), isError: true };
		const sent = options.apiKey === KEY; // the stand-in "provider" checks the key and never echoes it
		return { output: text(`${options.provider}: 3 results for "${args.query}" (auth ${sent ? "ok" : "bad"})`) };
	},
});
const WS = defineExtension({ name: "websearch", tools: [webSearch] });

const [publishDesign, publishBuild, showDiff, showFile, publishReview] = [
	"publish_design",
	"publish_build",
	"show_diff",
	"show_file",
	"publish_review",
].map(noop);
const W1 = defineExtension({ name: "w1", tools: [publishDesign, publishBuild, showDiff, showFile, publishReview] });
const CM = defineExtension({
	name: "codemode",
	tools: [noop("codemode")],
	sections: [{ key: "codemode", render: () => "Scripts call tools as tools.<name>(args)." }],
});

// The project default, as the host would keep it in memory from the `Project` document.
let projectDefault = [CT, WS];
const settings = {
	get extensions() {
		return projectDefault;
	},
	retry: { enabled: false },
};

const requests = [];
const offered = (context) => {
	const tools = new Set();
	for (const m of context.messages) {
		if (m.role !== "system") continue;
		for (const t of m.toolsAdded ?? []) tools.add(t.name);
		for (const t of m.toolsRemoved ?? []) tools.delete(t.name);
	}
	return [...tools].sort();
};
const record = (label, reply) => (context) => {
	requests.push({ label, tools: offered(context), seen: JSON.stringify(context) });
	return reply;
};
const call = (name, args = {}) => fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
const answer = (t) => fauxAssistantMessage(t);

async function open(registry) {
	const faux = fauxProvider({ models: [{ id: "faux-a" }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const storage = await openNodeSqliteStorage(join(dir, "p.sqlite"));
	const harness = await Harness.open(storage, { models, registry, settings }, ctx);
	return { faux, harness };
}
const toolNames = async (c) => (await c.agent(ctx)).tools.map((t) => t.name).sort();
const allEntries = async (c) => JSON.stringify((await c.entries({}, 1000, undefined, ctx)).items);

// E1
const registry = createRegistry();
for (const e of [CT, WS, W1]) registry.install(e);
let { faux, harness } = await open(registry);
harness.resume();
await harness.commit(async (tx) => Object.assign(await tx.doc(WsOptions), { provider: "stand-in", apiKey: KEY }), ctx);
const create = (agent) => harness.createConversation({ ownership: { kind: "ownerless" }, agent }, ctx);
const bare = await create({ model, cwd: "/srv/p" });
const designer = await create({
	model,
	extensions: { add: [W1] },
	tools: { remove: [write, edit, publishBuild, showDiff, showFile, publishReview] },
});
const reviewer = await create({ model, extensions: [W1], tools: [showDiff, showFile, publishReview] });
assert.deepEqual(await toolNames(bare), ["bash", "edit", "hold", "read", "web_search", "write"]);
assert.deepEqual(await toolNames(designer), ["bash", "hold", "publish_design", "read", "web_search"]);
assert.deepEqual(await toolNames(reviewer), ["publish_review", "show_diff", "show_file"]);
console.log(
	"E1 ok: no selection gave the project default; { add: [w1] } with a remove filter gave the default, w1, and the " +
		"filtered tools; the exact array gave only w1's review tools",
);

// E2
faux.setResponses([record("bare-1", call("web_search", { query: "pi-durable 2.0" })), record("bare-2", answer("Found it."))]);
await (await bare.submit({ type: "input", content: "When does pi-durable 2.0 ship?" }, ctx)).wait(ctx);
const bareLog = await allEntries(bare);
assert.match(bareLog, /3 results for/);
assert.match(bareLog, /auth ok/);
assert.ok(!bareLog.includes(KEY), "the key is in an entry");
const view = (doc) => Object.fromEntries(Object.entries(doc).filter(([k]) => !SECRET_KEYS.includes(k)));
assert.deepEqual(view(await harness.snapshot(WsOptions, ctx)), { provider: "stand-in" });
console.log("E2 ok: the tool read the key at run time; the key is in no entry; the host-style view left it out");

// E3
requests.length = 0;
faux.setResponses([record("d-1", call("hold")), record("d-2", answer("Design v1 written."))]);
const held = new Promise((r) => (holding = r));
const designRun = await designer.submit({ type: "input", content: "Add a --json flag." }, ctx);
await held;
registry.install(CM);
projectDefault = [CT, WS, CM];
release();
await designRun.wait(ctx);
assert.equal(requests.length, 2);
assert.ok(!requests[0].tools.includes("codemode"), "the request in flight offered codemode");
assert.ok(requests[1].tools.includes("codemode"), "the next request did not offer codemode");
assert.ok(requests[1].seen.includes("tools.<name>(args)"), "the codemode section was not sent");
assert.ok((await toolNames(bare)).includes("codemode"));
assert.deepEqual(await toolNames(reviewer), ["publish_review", "show_diff", "show_file"]);
console.log(
	"E3 ok: codemode joined the default mid-run; the request in flight did not offer it, the next request of the same " +
		"run did, with its section; the bare conversation got it; the reviewer did not",
);

// E4
await harness.close(ctx);
const without = createRegistry();
for (const e of [CT, W1, CM]) without.install(e);
projectDefault = [CT, CM];
({ faux, harness } = await open(without));
harness.resume();
const bare2 = await harness.conversation(bare.id, ctx);
const designer2 = await harness.conversation(designer.id, ctx);
assert.equal((await harness.snapshot(AgentDoc, bare.id, ctx)).extensions, undefined);
assert.deepEqual((await harness.snapshot(AgentDoc, designer.id, ctx)).extensions, { add: ["w1"] });
assert.ok(!(await toolNames(bare2)).includes("web_search"));
assert.ok(!(await toolNames(designer2)).includes("web_search"));
requests.length = 0;
faux.setResponses([record("b-1", call("web_search", { query: "again" })), record("b-2", answer("Search is gone."))]);
await (await bare2.submit({ type: "input", content: "Search again." }, ctx)).wait(ctx);
const result = (await bare2.entries({}, 1000, undefined, ctx)).items
	.filter((e) => e.kind === "pi.tool-result")
	.reduce((a, b) => (b.id > a.id ? b : a));
const resultText = JSON.stringify(result);
assert.match(resultText, /not available/);
assert.ok(!requests[0].tools.includes("web_search"));
assert.deepEqual(view(await harness.snapshot(WsOptions, ctx)), { provider: "stand-in" });
assert.equal((await harness.snapshot(WsOptions, ctx)).apiKey, KEY);
console.log(
	"E4 ok: reopened without websearch; stored selections unchanged ({ add: [w1] } and none); web_search not offered; " +
		"a call to it got an error result (not available); the options document and its key are still in the store",
);

// E5
const lane = await harness.createConversation(
	{ ownership: { kind: "ownerless" }, agent: { model, extensions: [CT], tools: [read, hold] } },
	ctx,
);
requests.length = 0;
faux.setResponses([
	record("lane-1", call("hold")),
	record("lane-2", answer("Item 3 dispatched.")),
	record("lane-3", answer("Item 2 dispatched.")),
	record("lane-4", answer("Item 1 fix dispatched.")),
]);
const laneHeld = new Promise((r) => (holding = r));
const first = await lane.submit({ type: "input", content: "Item 3: build design V3." }, ctx);
await laneHeld;
const item2 = await lane.submit({ type: "input", content: "Item 2: build design V2b." }, ctx);
const item1 = await lane.submit({ type: "input", content: "Item 1: review R1 failed." }, ctx);
assert.equal((await item2.status(ctx)).status, "queued");
assert.equal((await item1.status(ctx)).status, "queued");
release();
for (const s of [first, item2, item1]) assert.equal((await s.wait(ctx)).status, "done");
assert.deepEqual(
	requests.map((r) => r.label),
	["lane-1", "lane-2", "lane-3", "lane-4"],
);
assert.ok(requests[2].seen.includes("Item 2: build") && !requests[2].seen.includes("Item 1: review"));
assert.ok(requests[3].seen.includes("Item 1: review"));
console.log(
	"E5 ok: two follow-ups to a busy lane queued, then ran as two runs in order; the run for item 2 did not see item 1. " +
		`Requests: ${requests.length} for three inputs`,
);

// E6
const Notes = defineDoc({
	kind: "w1.notes",
	version: 1,
	scope: "session",
	initial: () => ({ text: "" }),
	checkpointWhen: () => false,
});
const Memo = defineExtension({
	name: "lane-memo",
	hooks: [
		hook(CompactionTask, {
			beforeCompact: async (_compaction, api, c) => ({ summary: (await api.snapshot(Notes, c)).text }),
		}),
	],
});
without.install(Memo);
await harness.commit(async (tx) => {
	(await tx.doc(Notes)).text = "Item 1: NDJSON, handed over at S2. Item 2: CSV, in review.";
}, ctx);
const lane2 = await harness.createConversation(
	{
		ownership: { kind: "ownerless" },
		agent: { model, extensions: [CT, Memo], tools: [read], compaction: { keepRecentTokens: 1 } },
	},
	ctx,
);
requests.length = 0;
faux.setResponses([answer("one"), answer("two"), answer("three")].map((r, i) => record(`l2-${i}`, r)));
for (const q of ["Item 1 used NDJSON.", "Item 2 adds CSV.", "Item 3 arrives."]) {
	await (await lane2.submit({ type: "input", content: q }, ctx)).wait(ctx);
}
const before = requests.length;
const compaction = await lane2.compact(undefined, ctx);
const done = await harness.waitForTask(compaction, ctx);
assert.equal(done.state.outcome.status, "completed");
await lane2.waitForIdle(ctx);
assert.equal(requests.length, before, "a model request was made for the summary");
const ctxView = await lane2.context(ctx);
assert.ok(CompactionEntry.is(ctxView.head), "the context does not start at a compaction");
const ctxText = JSON.stringify(ctxView.messages);
assert.ok(ctxText.includes("handed over at S2"));
assert.ok(!ctxText.includes("Item 1 used NDJSON."), "the first input is still in the model context");
assert.ok((await allEntries(lane2)).includes("Item 1 used NDJSON."), "the first input left storage");
console.log(
	"E6 ok: a beforeCompact hook supplied the summary from a document with no model request; the context starts " +
		"with it; the first input left the model context and is still in storage",
);

await harness.close(ctx);
console.log("ok: checks E1-E6 passed");
