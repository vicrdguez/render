// Can one Node process drive two pi-durable harnesses at once, each with its own store and registry?
// The repo has no dependencies yet, so PI_MODULES points at an installed `node_modules/@earendil-works`.
//   PI_MODULES=/path/to/node_modules/@earendil-works node docs/core/spikes/two-harnesses.mjs
import assert from "node:assert/strict";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES to a node_modules/@earendil-works directory");
const { BACKGROUND_CONTEXT: context } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider } = await import(`${base}/pi-ai/dist/providers/faux.js`);
const { createRegistry, defineExtension, Harness, MemoryStorage, section } = await import(
	`${base}/pi-durable/dist/index.js`
);

async function project(name, responses) {
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	faux.setResponses(responses);
	const registry = createRegistry();
	registry.install(defineExtension({ name: `workflow-${name}`, sections: [section("workflow", () => name)] }));
	const harness = await Harness.open(new MemoryStorage(), { models, registry }, context);
	const root = await harness.root(context, { agent: { model: { provider: "faux", modelId: "faux-1" } } });
	return { harness, root };
}

let releaseA;
const gate = new Promise((resolve) => {
	releaseA = resolve;
});
const order = [];
const a = await project("design", [
	async () => {
		order.push("a:generating");
		await gate;
		return fauxAssistantMessage("answer from A");
	},
]);
const b = await project("thesis", [fauxAssistantMessage("answer from B")]);

const runA = await a.root.submit({ type: "input", content: "question for A" }, context);
const runB = await b.root.submit({ type: "input", content: "question for B" }, context);
await runB.wait(context);
order.push("b:done");
releaseA();
await runA.wait(context);
order.push("a:done");

const text = async (p) => {
	const page = await p.root.entries({ order: "ascending" }, 100, undefined, context);
	return JSON.stringify(page.items.map((entry) => entry.model ?? entry.kind));
};
const [ta, tb] = [await text(a), await text(b)];
assert.deepEqual(order, ["a:generating", "b:done", "a:done"], "B finished while A was mid-generation");
assert.ok(ta.includes("answer from A") && !ta.includes("from B"), "store A holds only A");
assert.ok(tb.includes("answer from B") && !tb.includes("from A"), "store B holds only B");
const agentA = await a.root.agent(context);
const agentB = await b.root.agent(context);
assert.deepEqual(agentA.extensions.map((e) => e.name).filter((n) => n.startsWith("workflow-")), ["workflow-design"]);
assert.deepEqual(agentB.extensions.map((e) => e.name).filter((n) => n.startsWith("workflow-")), ["workflow-thesis"]);
assert.ok(ta.includes("design") && !ta.includes("thesis"), "A's prompt carries only its own workflow section");
await a.harness.close(context);
await b.harness.close(context);
console.log("ok", order.join(" > "));
