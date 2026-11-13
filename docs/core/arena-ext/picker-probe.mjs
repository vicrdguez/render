// Picker's checks for the extension and Lane pass, on pi-durable 1.5.2 with SQLite. Each is a fact the designs lean on.
// X1. Selection. With a default selection in the settings, a conversation with no selection follows it, one with
//     { add } gets the default plus its own, and one with an exact list gets exactly that list.
// X2. A default that changes reaches the first two at once and never the third.
// X3. An extension that is named but not installed is left out without an error. It comes back when installed.
// X4. With no default in the settings, a conversation with no selection gets every installed extension.
// X5. Compaction. A manual compaction is one extra model request. Afterwards the model's context starts with the
//     summary and no longer holds the early turns. Every entry is still in storage.
// X6. A beforeCompact hook can supply the summary itself, from a document, with no model request.
//   PI_MODULES=/path/to/node_modules/@earendil-works node probe.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { obj } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { CompactionTask, createRegistry, defineDoc, defineExtension, defineTool, Harness, hook } = d;

const dir = mkdtempSync(join(tmpdir(), "tau-ext-"));
const tool = (name) =>
	defineTool({ name, description: name, parameters: obj({}), execute: async () => ({ output: [] }) });
const Coding = defineExtension({ name: "coding-tools", tools: [tool("read")] });
const Search = defineExtension({ name: "websearch", tools: [tool("search")] });
const Code = defineExtension({ name: "codemode", tools: [tool("run")] });
const W1 = defineExtension({ name: "w1", tools: [tool("publish_design")] });

const faux = fauxProvider({ models: [{ id: "m", contextWindow: 200000, maxTokens: 4000 }] });
const models = createModels();
models.setProvider(faux.provider);
const model = { provider: "faux", modelId: "m" };
const open = async (file, registry, settings) =>
	Harness.open(await openNodeSqliteStorage(join(dir, file)), { models, registry, settings }, ctx);
const names = async (conversation) => (await conversation.agent(ctx)).extensions.map((e) => e.name);
const ownerless = { kind: "ownerless" };

// X1 to X3
const registry = createRegistry();
for (const extension of [Coding, Search, W1]) registry.install(extension);
let defaults = [Coding, Search];
let h = await open("a.sqlite", registry, () => ({ extensions: defaults }));
const follows = await h.createConversation({ ownership: ownerless, agent: { model } }, ctx);
const adds = await h.createConversation({ ownership: ownerless, agent: { model, extensions: { add: [W1] } } }, ctx);
const exact = await h.createConversation({ ownership: ownerless, agent: { model, extensions: [W1] } }, ctx);
assert.deepEqual(await names(follows), ["coding-tools", "websearch"]);
assert.deepEqual(await names(adds), ["coding-tools", "websearch", "w1"]);
assert.deepEqual(await names(exact), ["w1"]);
console.log("X1 ok: no selection follows the default; { add } gets the default plus its own; a list gets exactly the list");

registry.install(Code);
defaults = [Coding, Search, Code];
assert.deepEqual(await names(follows), ["coding-tools", "websearch", "codemode"]);
assert.deepEqual(await names(adds), ["coding-tools", "websearch", "codemode", "w1"]);
assert.deepEqual(await names(exact), ["w1"]);
console.log("X2 ok: a changed default reached the first two at once and not the exact list");

registry.uninstall(Search);
assert.deepEqual(await names(follows), ["coding-tools", "codemode"]);
assert.deepEqual(await names(adds), ["coding-tools", "codemode", "w1"]);
registry.install(Search);
assert.deepEqual(await names(follows), ["coding-tools", "websearch", "codemode"]);
console.log("X3 ok: a named extension that is not installed was left out with no error, and came back when installed");
await h.close(ctx);

// X4
h = await open("b.sqlite", registry, undefined);
const open4 = await h.createConversation({ ownership: ownerless, agent: { model } }, ctx);
assert.deepEqual((await names(open4)).sort(), ["codemode", "coding-tools", "w1", "websearch"]);
console.log("X4 ok: with no default in the settings, no selection means every installed extension");
await h.close(ctx);

// X5
const requests = [];
const isSummary = (transcript) => {
	const first = transcript.messages[0];
	return first?.role === "system" && typeof first.content === "string" && first.content.includes("summar");
};
const respond = (transcript) => {
	const kind = isSummary(transcript) ? "summary" : "chat";
	requests.push({ kind, seen: JSON.stringify(transcript.messages) });
	return fauxAssistantMessage(kind === "summary" ? "SUMMARY: item 1 added --json." : `Done. ${"detail ".repeat(60)}`);
};
faux.setResponses(Array.from({ length: 20 }, () => respond));
const Notes = defineDoc({
	kind: "lane.notes",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ text: "" }),
	checkpointWhen: () => false,
});
let useNotes = false;
const Lane = defineExtension({
	name: "lane",
	hooks: [
		hook(CompactionTask, {
			beforeCompact: async (_compaction, api) => {
				if (!useNotes) return undefined;
				const notes = await api.snapshot(Notes, api.conversationId);
				return { summary: `NOTES: ${notes?.text ?? ""}` };
			},
		}),
	],
});
const reg5 = createRegistry();
reg5.install(Lane);
h = await open("c.sqlite", reg5, { compaction: { enabled: false, keepRecentTokens: 0 } });
const lane = await h.createConversation({ ownership: ownerless, agent: { model, extensions: [Lane] } }, ctx);
const ask = async (content) => (await (await lane.submit({ type: "input", content }, ctx)).wait(ctx)).status;
await ask("Item 1: add a --json flag. FIRST-TURN-MARK");
await ask("Item 1 passed review.");
const before = (await lane.entries({}, 1000, undefined, ctx)).items.length;
const compact = async () => {
	const { outcome } = (await h.waitForTask(await lane.compact(undefined, ctx), ctx)).state;
	assert.equal(outcome.status, "completed", JSON.stringify(outcome));
	if (outcome.result.submissionId !== undefined) {
		await (await h.submission(outcome.result.submissionId, ctx)).wait(ctx);
	}
};
const chatBefore = requests.length;
await compact();
assert.equal(requests.length, chatBefore + 1);
assert.equal(requests.at(-1).kind, "summary");
await ask("Item 3: add a --csv flag.");
const afterCompaction = requests.at(-1);
assert.equal(afterCompaction.kind, "chat");
assert.ok(afterCompaction.seen.includes("SUMMARY: item 1 added --json."));
assert.ok(!afterCompaction.seen.includes("FIRST-TURN-MARK"));
const stored = (await lane.entries({}, 1000, undefined, ctx)).items;
assert.ok(stored.length > before);
assert.ok(JSON.stringify(stored).includes("FIRST-TURN-MARK"));
console.log(
	"X5 ok: a compaction was one extra model request; the next request held the summary and not the first turn; " +
		`all ${stored.length} entries were still stored`,
);

// X6
await h.commit(async (tx) => {
	(await tx.doc(Notes, lane.id)).text = "The export command uses the new serializer.";
}, ctx);
useNotes = true;
const summariesBefore = requests.filter((r) => r.kind === "summary").length;
await compact();
assert.equal(requests.filter((r) => r.kind === "summary").length, summariesBefore);
await ask("Item 4.");
assert.ok(requests.at(-1).seen.includes("NOTES: The export command uses the new serializer."));
console.log("X6 ok: a beforeCompact hook supplied the summary from a document, with no model request");

await h.close(ctx);
console.log("ok: checks X1-X6 passed");
