import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { options } from "../src/index.js";
import { createSearchExtension } from "../src/web-search.js";

const [file, url] = process.argv.slice(2);
if (!file || !url) throw new Error("file and URL required");
const registry = createRegistry();
const extension = createSearchExtension({ exa: url });
registry.install(extension);
const models = createModels();
const faux = fauxProvider({
	models: [{ id: "search-test", contextWindow: 200000, maxTokens: 4000 }],
});
models.setProvider(faux.provider);
faux.setResponses([
	fauxAssistantMessage(
		[fauxToolCall("web_search", { query: "Tau durability" })],
		{ stopReason: "toolUse" },
	),
]);
const h = await Harness.open(
	await openNodeSqliteStorage(file),
	{
		models,
		registry,
		settings: { extensions: [extension], retry: { enabled: false } },
	},
	context,
);
await h.commit(
	(tx) =>
		options.set(tx, { provider: "exa", apiKey: "sk-unit3-not-a-real-key" }),
	context,
);
const c = await h.createConversation(
	{
		ownership: { kind: "ownerless" },
		agent: { model: { provider: "faux", modelId: "search-test" } },
	},
	context,
);
process.send?.(c.id);
await (await c.submit({ type: "input", content: "Search." }, context)).wait(
	context,
);
throw new Error("Expected parent to kill the process during HTTP request");
