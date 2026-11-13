import { startServer } from "../src/index.js";
import { modules } from "./extensions.js";
import { faux } from "./helpers.js";

const home = process.argv[2] ?? "";
try {
	const server = await startServer({
		home,
		modules,
		models: faux().models,
		port: 0,
	});
	process.send?.({ port: server.address.port });
} catch (error) {
	process.send?.({ error: String(error) });
	process.disconnect?.();
}
