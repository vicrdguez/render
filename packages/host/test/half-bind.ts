import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { openStore } from "tau-store/host";
import { faux } from "./helpers.js";

const [home = "", project = ""] = process.argv.slice(2);
const directory = path.join(home, "projects", project);
await mkdir(directory, { recursive: true });
const storage = await openNodeSqliteStorage(
	path.join(directory, "store.sqlite"),
);
await openStore(
	storage,
	{ models: faux().models, registry: createRegistry() },
	BACKGROUND_CONTEXT,
);
process.send?.("open");
