// Extension and Lane checks for the core design, on pi-durable 1.5.2 with SQLite files. Merged from the probes of
// the extension arena (the picker's, candidates 1 and 3) and the judge's four checks. The host parts are stand-ins
// shaped like docs/core/extensions.md. No Tau code exists.
// E1.  Selection. The host passes a project default as `settings.extensions`. A conversation with no selection
//      follows it, one with { add } gets the default plus its own, and one with an exact list gets exactly that list.
// E2.  A default that grows reaches the first two, also in the middle of a run, from the next model request. It
//      never reaches the exact list.
// E3.  An extension that is named but not installed is left out with no error, and comes back when installed.
// E4.  A secret. The host's reply for an option with the format `secret` says only that it is set. The tool reads
//      the key in its own commit, and no entry of the conversation holds it.
// E5.  With no default in the settings, a conversation with no selection gets every installed extension.
// E6.  A sequential tool keeps its round in order. The same two calls nested in one tool overlap. A tool with
//      callers: ["model"] refuses the nested call.
// E7.  An exact tool list does not hide a section of the same extension. A section that checks the tools does.
// E8.  A dispatch that ends its round takes one model request, and a second input that queued gets its own run.
// E9.  A `write` with a model message is in the next context and costs no model request.
// E10. A commit that appends an entry and then submits throws ReadAfterWrite.
// E11. A compaction is one extra model request. The next context starts with the summary and has lost the first
//      turn. Every entry is still stored.
// E12. A beforeCompact hook supplies the summary from a document, with no model request.
//   PI_MODULES=/path/to/node_modules/@earendil-works node docs/core/spikes/ext.mjs
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
const { CompactionTask, createRegistry, defineDoc, defineExtension, defineTool, Harness, hook, section } = d;

const dir = mkdtempSync(join(tmpdir(), "tau-ext-"));
const text = (t) => [{ type: "text", text: t }];
const model = { provider: "faux", modelId: "m" };
const ownerless = { kind: "ownerless" };
const faux = fauxProvider({ models: [{ id: "m", contextWindow: 200000, maxTokens: 4000 }] });
const models = createModels();
models.setProvider(faux.provider);
const open = async (file, registry, settings) => {
	const storage = await openNodeSqliteStorage(join(dir, file));
	return Harness.open(storage, { models, registry, settings }, ctx);
};
const names = async (conversation) => (await conversation.agent(ctx)).extensions.map((e) => e.name);
const call = (name, args = {}) => fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
const ask = async (conversation, content) => (await conversation.submit({ type: "input", content }, ctx)).wait(ctx);
const plainTool = (name) =>
	defineTool({ name, description: name, parameters: obj({}), execute: async () => ({ output: [] }) });

// The stand-in host: a module is { extension, entry?, options? }, and a workflow is a module with `entry`.
const KEY = "sk-probe-0123456789";
const SearchDoc = defineDoc({
	kind: "websearch.options",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});
const searchSchema = obj({ provider: str(), apiKey: str({ format: "secret" }) });
const search = defineTool({
	name: "web_search",
	description: "Search the web.",
	parameters: obj({ query: str() }),
	execute: async (args, api, c) => {
		const options = await api.commit(async (tx) => JSON.parse(JSON.stringify(await tx.doc(SearchDoc))), c);
		if (options.apiKey === undefined) return { output: text("websearch is not set up for this project."), isError: true };
		return { output: text(`3 results for "${args.query}" from ${options.provider}.`) };
	},
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
const Coding = defineExtension({ name: "coding-tools", tools: [plainTool("read"), hold] });
const Search = defineExtension({ name: "websearch", tools: [search] });
const Code = defineExtension({ name: "codemode", tools: [plainTool("run")] });
const W1 = defineExtension({ name: "w1", tools: [plainTool("publish_design")] });
const MODULES = {
	websearch: { extension: Search, options: { schema: searchSchema } },
	codemode: { extension: Code },
	w1: { extension: W1, entry: { extensions: { add: [W1] } } },
};
const defaultOf = (project) => [
	Coding,
	...project.extensions.map((name) => MODULES[name]).filter((m) => m.entry === undefined).map((m) => m.extension),
];
const forClient = (schema, value) =>
	Object.fromEntries(
		Object.entries(value).map(([key, v]) => [key, schema.properties[key]?.format === "secret" ? true : v]),
	);

// E1 to E3
const project = { extensions: ["websearch", "w1"] };
const registry = createRegistry();
for (const extension of [Coding, Search, W1]) registry.install(extension);
let defaults = defaultOf(project);
let h = await open("a.sqlite", registry, () => ({ extensions: defaults, retry: { enabled: false } }));
const create = (agent) => h.createConversation({ ownership: ownerless, agent: { model, ...agent } }, ctx);
const bare = await create({});
const designer = await create(MODULES.w1.entry);
const reviewer = await create({ extensions: [W1] });
assert.deepEqual(defaults.map((e) => e.name), ["coding-tools", "websearch"]);
assert.deepEqual(await names(bare), ["coding-tools", "websearch"]);
assert.deepEqual(await names(designer), ["coding-tools", "websearch", "w1"]);
assert.deepEqual(await names(reviewer), ["w1"]);
console.log("E1 ok: no selection follows the project default; { add } gets the default plus its own; a list gets the list");

const offered = [];
const record = (reply) => (context) => {
	offered.push(JSON.stringify(context).includes('"name":"run"'));
	return reply;
};
faux.setResponses([record(call("hold")), record(fauxAssistantMessage("Done."))]);
const held = new Promise((r) => (holding = r));
const running = await bare.submit({ type: "input", content: "Work." }, ctx);
await held;
project.extensions.push("codemode");
registry.install(Code);
defaults = defaultOf(project);
release();
assert.equal((await running.wait(ctx)).status, "done");
assert.deepEqual(offered, [false, true]);
assert.deepEqual(await names(designer), ["coding-tools", "websearch", "codemode", "w1"]);
assert.deepEqual(await names(reviewer), ["w1"]);
console.log("E2 ok: an extension added during a run was offered from that run's next request, and never to the exact list");

registry.uninstall(Search);
assert.deepEqual(await names(bare), ["coding-tools", "codemode"]);
registry.install(Search);
assert.deepEqual(await names(bare), ["coding-tools", "websearch", "codemode"]);
console.log("E3 ok: a named extension that is not installed was left out with no error, and came back when installed");

// E4
await h.commit(async (tx) => {
	Object.assign(await tx.doc(SearchDoc), { provider: "brave", apiKey: KEY });
}, ctx);
const stored = await h.commit(async (tx) => JSON.parse(JSON.stringify(await tx.doc(SearchDoc))), ctx);
assert.deepEqual(forClient(searchSchema, stored), { provider: "brave", apiKey: true });
faux.setResponses([call("web_search", { query: "tau" }), fauxAssistantMessage("Found it.")]);
assert.equal((await ask(bare, "Search for tau.")).status, "done");
const transcript = JSON.stringify((await bare.entries({}, 1000, undefined, ctx)).items);
assert.ok(transcript.includes('3 results for \\"tau\\" from brave.'));
assert.ok(!transcript.includes(KEY));
console.log("E4 ok: the reply for a client said only that the key is set; the tool read it; no entry held it");
await h.close(ctx);

// E5
h = await open("b.sqlite", registry, undefined);
const open4 = await h.createConversation({ ownership: ownerless, agent: { model } }, ctx);
assert.deepEqual((await names(open4)).sort(), ["codemode", "coding-tools", "w1", "websearch"]);
console.log("E5 ok: with no default in the settings, no selection means every installed extension");
await h.close(ctx);

// E6
const log = [];
const slow = (name, extra) =>
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
const touch = defineTool({
	name: "touch",
	description: "touch",
	parameters: obj({}),
	execute: async () => {
		log.push("touch");
		return { output: text("touched") };
	},
});
const script = defineTool({
	name: "script",
	description: "A stand-in for codemode: two nested calls at once.",
	parameters: obj({ first: str() }),
	execute: async (args, api, c) => {
		const results = await Promise.all([api.executeTool(args.first, {}, c), api.executeTool("touch", {}, c)]);
		return { output: text(JSON.stringify(results.map((r) => r.isError === true))) };
	},
});
const Pub = defineExtension({
	name: "pub",
	tools: [
		slow("publish", { executionMode: "sequential" }),
		slow("publish_m", { executionMode: "sequential", callers: ["model"] }),
		touch,
		script,
	],
});
const reg6 = createRegistry();
reg6.install(Pub);
h = await open("c.sqlite", reg6, { retry: { enabled: false } });
const P = await h.createConversation({ ownership: ownerless, agent: { model, extensions: [Pub] } }, ctx);
const round = async (first) => {
	faux.setResponses([first, fauxAssistantMessage("ok")]);
	await ask(P, "Go.");
	return log.splice(0);
};
const two = fauxAssistantMessage([fauxToolCall("publish", {}), fauxToolCall("touch", {})], { stopReason: "toolUse" });
const direct = await round(two);
const nested = await round(call("script", { first: "publish" }));
const guarded = await round(call("script", { first: "publish_m" }));
assert.deepEqual(direct, ["publish:start", "publish:end", "touch"]);
assert.ok(nested.indexOf("touch") < nested.indexOf("publish:end"));
assert.deepEqual(guarded, ["touch"]);
console.log(
	`E6 ok: one round ran ${direct.join(" > ")}; nested in one tool they ran ${nested.join(" > ")}; ` +
		'with callers: ["model"] the nested publish was refused',
);
await h.close(ctx);

// E7 to E10
let requests = 0;
const dispatch = defineTool({
	name: "dispatch",
	description: "Hand work to a worker and end the run.",
	parameters: obj({}),
	execute: async () => ({ output: text("sent"), control: { terminate: true } }),
});
const showDiff = plainTool("show_diff");
const Lane = defineExtension({
	name: "lane",
	tools: [dispatch, showDiff],
	sections: [
		section("notes", () => "NOTE-FOR-EVERYONE"),
		section("guarded", (input) => (input.agent.tools.some((t) => t.name === "dispatch") ? "NOTE-FOR-LANE" : undefined)),
	],
});
const reg7 = createRegistry();
reg7.install(Lane);
h = await open("d.sqlite", reg7, { retry: { enabled: false } });
const seen = [];
const counted = (reply) => (context) => {
	requests++;
	seen.push(JSON.stringify(context));
	return reply;
};
const closed = await h.createConversation(
	{ ownership: ownerless, agent: { model, extensions: [Lane], tools: [showDiff] } },
	ctx,
);
faux.setResponses([counted(fauxAssistantMessage("reviewed"))]);
await ask(closed, "Review.");
assert.deepEqual((await closed.agent(ctx)).tools.map((t) => t.name), ["show_diff"]);
assert.ok(seen.at(-1).includes("NOTE-FOR-EVERYONE"));
assert.ok(!seen.at(-1).includes("NOTE-FOR-LANE"));
console.log("E7 ok: an exact tool list still got the extension's plain section, and not the one that checks the tools");

const lane = await h.createConversation(
	{ ownership: ownerless, agent: { model, extensions: [Lane], tools: [dispatch] } },
	ctx,
);
requests = 0;
faux.setResponses([counted(call("dispatch")), counted(call("dispatch"))]);
const item1 = await lane.submit({ type: "input", content: "item 1" }, ctx);
const item2 = await lane.submit({ type: "input", content: "item 2" }, ctx);
assert.equal((await item1.wait(ctx)).status, "done");
assert.equal((await item2.wait(ctx)).status, "done");
await lane.waitForIdle(ctx);
assert.equal(requests, 2);
console.log("E8 ok: two inputs to one lane were two runs of one model request each");

const report = {
	kind: "lane.report",
	data: { text: "REVIEW-FAILED" },
	model: [{ role: "user", content: "REVIEW-FAILED", timestamp: 1 }],
};
const notice = await lane.submit({ type: "write", requestId: "notice-1", entry: report }, ctx);
assert.equal((await notice.wait(ctx)).status, "done");
assert.equal(requests, 2);
assert.ok(JSON.stringify((await lane.context(ctx)).messages).includes("REVIEW-FAILED"));
console.log("E9 ok: a write with a model message was in the lane's next context and cost no model request");

await assert.rejects(
	h.commit(async (tx) => {
		const review = await tx.appendEntry(closed.id, { kind: "lane.review", data: { text: "failed" } });
		await lane.submit(tx, { type: "write", requestId: String(review.id), entry: report });
	}, ctx),
	(error) => error.name === "ReadAfterWrite",
);
console.log("E10 ok: a commit that appended an entry and then submitted threw ReadAfterWrite");
await h.close(ctx);

// E11 and E12
const kinds = [];
const respond = (context) => {
	const first = context.messages[0];
	const summary = first?.role === "system" && typeof first.content === "string" && first.content.includes("summar");
	kinds.push({ summary, seen: JSON.stringify(context.messages) });
	return fauxAssistantMessage(summary ? "SUMMARY: item 1 added --json." : `Done. ${"detail ".repeat(60)}`);
};
faux.setResponses(Array.from({ length: 20 }, () => respond));
const Notes = defineDoc({
	kind: "w1.notes",
	version: 1,
	scope: "session",
	initial: () => ({ text: "" }),
	checkpointWhen: () => false,
});
let fromNotes = false;
const Memory = defineExtension({
	name: "memory",
	hooks: [
		hook(CompactionTask, {
			beforeCompact: async (_compaction, api) =>
				fromNotes ? { summary: `NOTES: ${(await api.snapshot(Notes))?.text ?? ""}` } : undefined,
		}),
	],
});
const reg11 = createRegistry();
reg11.install(Memory);
h = await open("e.sqlite", reg11, { compaction: { enabled: false, keepRecentTokens: 0 } });
const long = await h.createConversation({ ownership: ownerless, agent: { model, extensions: [Memory] } }, ctx);
await ask(long, "Item 1: add a --json flag. FIRST-TURN-MARK");
await ask(long, "Item 1 passed review.");
const compact = async () => {
	const { outcome } = (await h.waitForTask(await long.compact(undefined, ctx), ctx)).state;
	assert.equal(outcome.status, "completed", JSON.stringify(outcome));
	if (outcome.result.submissionId !== undefined) await (await h.submission(outcome.result.submissionId, ctx)).wait(ctx);
};
const before = kinds.length;
await compact();
assert.equal(kinds.length, before + 1);
assert.equal(kinds.at(-1).summary, true);
await ask(long, "Item 3: add a --csv flag.");
assert.ok(kinds.at(-1).seen.includes("SUMMARY: item 1 added --json."));
assert.ok(!kinds.at(-1).seen.includes("FIRST-TURN-MARK"));
const entries = (await long.entries({}, 1000, undefined, ctx)).items;
assert.ok(JSON.stringify(entries).includes("FIRST-TURN-MARK"));
console.log(
	"E11 ok: a compaction was one extra model request; the next request held the summary and not the first turn; " +
		`all ${entries.length} entries were still stored`,
);

await h.commit(async (tx) => {
	(await tx.doc(Notes)).text = "The export command uses the new serializer.";
}, ctx);
fromNotes = true;
const summaries = kinds.filter((k) => k.summary).length;
await compact();
assert.equal(kinds.filter((k) => k.summary).length, summaries);
await ask(long, "Item 4.");
assert.ok(kinds.at(-1).seen.includes("NOTES: The export command uses the new serializer."));
console.log("E12 ok: a beforeCompact hook supplied the summary from a document, with no model request");

await h.close(ctx);
console.log("ok: checks E1-E12 passed");
