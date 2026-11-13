import { spawnSync } from "node:child_process";
import { glob, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const tests = [];
for await (const directory of glob(manifest.workspaces)) {
	const pkg = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
	for await (const source of glob(`${directory}/test/**/*.test.{ts,mts,cts}`)) {
		const emitted = source
			.replace(`${directory}/test/`, `${directory}/dist/test/`)
			.replace(/\.([cm]?)ts$/, ".$1js");
		tests.push({ source, emitted, packageName: pkg.name, directory });
	}
}
for await (const file of glob("tools/**/*.test.mjs")) {
	tests.push({
		source: file,
		emitted: file,
		packageName: "tools",
		directory: "tools",
	});
}
const selected = process.argv.slice(2);
const files = new Set();
for (const selection of selected) {
	const candidates = [
		path.resolve(root, selection),
		path.resolve(process.env.TAU_INVOCATION_DIR ?? root, selection),
	];
	const matches = tests.filter(
		(test) =>
			selection === test.packageName ||
			selection === path.basename(test.directory) ||
			candidates.includes(path.resolve(test.source)) ||
			candidates.includes(path.resolve(test.emitted)),
	);
	if (!matches.length) throw new Error(`no tests selected by ${selection}`);
	for (const test of matches) files.add(test.emitted);
}
if (!selected.length) for (const test of tests) files.add(test.emitted);
if (!files.size) throw new Error("no emitted tests selected");
const result = spawnSync(process.execPath, ["--test", ...[...files].sort()], {
	stdio: "inherit",
});
process.exitCode = result.status ?? 1;
