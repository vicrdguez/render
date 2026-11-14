import { join } from "node:path";
import {
	type AssistantMessage,
	createModels,
	fauxProvider,
} from "@earendil-works/pi-ai";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { fromDirectory, startServer } from "tau-host";

const home = process.argv[2];
if (!home) throw new Error("A home is required.");
const config = JSON.parse(process.argv[3] ?? "{}") as {
	now?: number;
};
const pending = new Map<number, (response: AssistantMessage) => void>();
process.on("message", (message: { id: number; response: AssistantMessage }) => {
	pending.get(message.id)?.(message.response);
	pending.delete(message.id);
});
let id = 0;
const faux = fauxProvider({ models: [{ id: "a" }, { id: "b" }] });
faux.setResponses(
	Array.from(
		{ length: 1000 },
		() => (request) =>
			new Promise<AssistantMessage>((resolve) => {
				const next = ++id;
				pending.set(next, resolve);
				process.send?.({ id: next, request });
			}),
	),
);
const now = config.now;
const models = createModels();
models.setProvider(faux.provider);
const server = await startServer({
	home,
	source: fromDirectory(join(home, "extensions")),
	models,
	port: 0,
	...(now === undefined ? {} : { now: () => now }),
	env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? home }),
});
process.stdout.write(`journey server listening on ${server.address.port}\n`);
process.send?.(server.address);
