import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

// Converted from docs/core/spikes, once functions exist. Never run a stand-in as acceptance.
const dir = "packages/store/dist/test/spikes";
const files = (await readdir(dir)).filter((file) => file.endsWith(".spike.js"));
if (!files.length)
	throw new Error("real-function K1-K6 spikes have not been written");
for (const file of files) {
	const result = spawnSync(process.execPath, [path.join(dir, file)], {
		stdio: "inherit",
	});
	if (result.status !== 0) {
		process.exitCode = result.status ?? 1;
		break;
	}
}
