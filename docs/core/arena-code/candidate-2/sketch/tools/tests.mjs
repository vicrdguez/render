import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const selected = new Set(process.argv.slice(2));
const files = [];
for (const entry of await readdir("packages", { withFileTypes: true })) {
	if (!entry.isDirectory() || (selected.size && !selected.has(entry.name)))
		continue;
	async function visit(dir) {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch (e) {
			if (e.code === "ENOENT") return;
			throw e;
		}
		for (const item of entries) {
			const file = path.join(dir, item.name);
			if (item.isDirectory()) await visit(file);
			else if (item.name.endsWith(".test.js")) files.push(file);
		}
	}
	await visit(path.join("packages", entry.name, "dist/test"));
}
if (!files.length) throw new Error("no emitted tests selected");
const result = spawnSync(process.execPath, ["--test", ...files], {
	stdio: "inherit",
});
process.exitCode = result.status ?? 1;
