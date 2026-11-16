import { BACKGROUND_CONTEXT as context } from "tau/chord";
import { createRegistry, Harness, openNodeSqliteStorage } from "tau/durable";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "tau/testing";
import { options } from "../src/index.ts";
import { createWebkitExtension } from "../src/tools.ts";

const [file, key] = process.argv.slice(2);
if (!file || !key) throw new Error("store file and key required");
const extension = createWebkitExtension({
	http: () => ({
		request() {
			process.send?.("requested");
			return new Promise(() => {});
		},
	}),
	endpoints: {
		exaMcp: "https://mcp.exa.test/mcp",
		exa: "https://api.exa.test",
		tavily: "https://api.tavily.test",
		github: "https://api.github.test",
	},
});
const registry = createRegistry();
registry.install(extension);
const models = createModels();
const faux = fauxProvider({
	models: [{ id: "webkit-test", contextWindow: 200000, maxTokens: 4000 }],
});
models.setProvider(faux.provider);
faux.setResponses([
	fauxAssistantMessage(
		[fauxToolCall("web_search", { query: "Tau durability" })],
		{ stopReason: "toolUse" },
	),
]);
const harness = await Harness.open(
	await openNodeSqliteStorage(file),
	{
		models,
		registry,
		settings: { extensions: [extension], retry: { enabled: false } },
	},
	context,
);
await harness.commit((tx) => options.set(tx, { exaApiKey: key }), context);
const conversation = await harness.createConversation(
	{
		ownership: { kind: "ownerless" },
		agent: { model: { provider: "faux", modelId: "webkit-test" } },
	},
	context,
);
process.send?.(conversation.id);
await (
	await conversation.submit({ type: "input", content: "Search." }, context)
).wait(context);
throw new Error(
	"Expected the parent to kill the process during the HTTP request",
);
