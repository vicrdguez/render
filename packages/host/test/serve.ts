import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { startServer } from "../src/index.js";
import { modules } from "./extensions.js";
import { faux } from "./helpers.js";

const [home = "", mode] = process.argv.slice(2);
const models = faux();
if (mode === "mid-run")
	models.faux.setResponses([
		fauxAssistantMessage([fauxToolCall("ask", { key: "k" })], {
			stopReason: "toolUse",
		}),
		() => new Promise<never>(() => {}),
	]);
try {
	const server = await startServer({
		home,
		modules,
		models: models.models,
		port: 0,
	});
	process.send?.({ port: server.address.port });
} catch (error) {
	process.send?.({ error: String(error) });
	process.disconnect?.();
}
