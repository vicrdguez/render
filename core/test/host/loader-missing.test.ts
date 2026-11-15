import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const scratch = () => mkdtemp(path.join(tmpdir(), "tau-loader-missing-"));
const plain = (name: string) => `export const extension = { name: "${name}" };`;
async function directory(entries: Record<string, Record<string, string>>) {
	const root = await scratch();
	for (const [name, files] of Object.entries(entries)) {
		await mkdir(path.join(root, name));
		for (const [file, content] of Object.entries(files))
			await writeFile(path.join(root, name, file), content);
	}
	return root;
}

test("without tau-extension beside the host every extension fails with a repair message", async () => {
	const host = await scratch();
	const src = path.join(host, "dist", "src");
	await mkdir(src, { recursive: true });
	for (const file of await readdir(
		fileURLToPath(new URL("../../src/host/", import.meta.url)),
	))
		if (file.endsWith(".js"))
			await copyFile(
				fileURLToPath(new URL(`../../src/host/${file}`, import.meta.url)),
				path.join(src, file),
			);
	await mkdir(path.join(host, "node_modules"));
	await symlink(
		path.join(root, "node_modules", "jiti"),
		path.join(host, "node_modules", "jiti"),
	);
	const scan = (dir: string) => {
		const script = `const { fromDirectory } = await import(${JSON.stringify(pathToFileURL(path.join(src, "loader.js")).href)});
const scan = await fromDirectory(${JSON.stringify(dir)})();
console.log(JSON.stringify({ modules: Object.keys(scan.modules), failures: scan.failures.map((f) => ({ name: f.name, stage: f.stage, message: f.error.message })) }));`;
		const child = spawnSync(
			process.execPath,
			["--input-type=module", "--eval", script],
			{ encoding: "utf8" },
		);
		assert.equal(child.status, 0, child.stderr);
		return JSON.parse(child.stdout);
	};
	assert.deepEqual(scan(await scratch()), { modules: [], failures: [] });
	const dir = await directory({
		alpha: { "index.ts": plain("alpha") },
		beta: { "index.ts": plain("beta") },
	});
	const result = scan(dir);
	assert.deepEqual(result.modules, []);
	assert.deepEqual(
		result.failures.map((f: { name: string }) => f.name),
		["alpha", "beta"],
	);
	for (const f of result.failures) {
		assert.match(f.message, /tau-extension/);
		assert.match(f.message, /node_modules/);
		assert.match(
			f.message,
			/Install tau-extension beside the Tau server, then start it again\./,
		);
	}
});
