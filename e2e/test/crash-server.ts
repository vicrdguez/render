import { join } from "node:path";
import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { fromDirectory, startServer } from "tau/server";

const home = process.argv[2];
if (!home) throw new Error("A home is required.");
const faux = fauxProvider({ models: [{ id: "a" }, { id: "b" }] });
const models = createModels();
models.setProvider(faux.provider);
const server = await startServer({
	home,
	source: fromDirectory(join(home, "extensions")),
	models,
	port: 0,
	env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? home }),
});
process.send?.(server.address);
