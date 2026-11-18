import assert from "node:assert/strict";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import { startServer } from "tau/server";

const home = process.argv[2];
assert.ok(home);
const faux = fauxProvider({ models: [{ id: "smoke" }] });
faux.setResponses([
	fauxAssistantMessage(
		[fauxToolCall("codemode", { code: 'text("codemode-smoke=" + 6 * 7)' })],
		{ stopReason: "toolUse" },
	),
	fauxAssistantMessage("Done"),
]);
const models = createModels();
models.setProvider(faux.provider);
const server = await startServer({
	home,
	port: 0,
	models,
	source: () => ({ modules: {}, failures: [] }),
});
process.once("SIGTERM", () => void server.close());
process.stdout.write(`listening on http://127.0.0.1:${server.address.port}\n`);
