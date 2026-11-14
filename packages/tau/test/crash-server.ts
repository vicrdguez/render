import { createModels, fauxProvider } from "@earendil-works/pi-ai";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { startServer } from "tau-host";
import { modules } from "../src/modules.js";

const home = process.argv[2];
if (!home) throw new Error("A home is required.");
const faux = fauxProvider({ models: [{ id: "a" }, { id: "b" }] });
const models = createModels();
models.setProvider(faux.provider);
const server = await startServer({
	home,
	modules,
	models,
	port: 0,
	env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? home }),
});
process.send?.(server.address);
