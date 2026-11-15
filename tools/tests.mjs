import { spawnSync } from "node:child_process";
import { access, glob, readFile } from "node:fs/promises";
import path from "node:path";

import { selectPackages, workspaces } from "./workspaces.mjs";

const root = process.cwd();
const selected = process.argv.slice(2);
const tests = [];
for (const { directory, manifest: pkg } of selectPackages(
	await workspaces(),
	selected,
)) {
	const config = JSON.parse(
		await readFile(`${directory}/tsconfig.json`, "utf8"),
	);
	for await (const source of glob(`${directory}/test/**/*.test.ts`)) {
		const runnable = config.compilerOptions?.noEmit
			? source
			: source
					.replace(`${directory}/test/`, `${directory}/dist/test/`)
					.replace(/\.([cm]?)ts$/, ".$1js");
		tests.push({ source, runnable, packageName: pkg.name, directory });
	}
}
for await (const file of glob("tools/**/*.test.mjs")) {
	tests.push({
		source: file,
		runnable: file,
		packageName: "tools",
		directory: "tools",
	});
}
const files = new Set();
for (const selection of selected) {
	const candidates = [
		path.resolve(root, selection),
		path.resolve(process.env.TAU_INVOCATION_DIR ?? root, selection),
	];
	const matches = tests.filter(
		(test) =>
			selection === "workspace" ||
			selection === test.directory ||
			test.directory.startsWith(`${selection}/`) ||
			selection === test.packageName ||
			selection === path.basename(test.directory) ||
			candidates.includes(path.resolve(test.source)) ||
			candidates.includes(path.resolve(test.runnable)) ||
			candidates.some((candidate) =>
				path.resolve(test.source).startsWith(`${candidate}${path.sep}`),
			),
	);
	if (!matches.length) throw new Error(`no tests selected by ${selection}`);
	for (const test of matches) files.add(test.runnable);
}
if (!selected.length) for (const test of tests) files.add(test.runnable);
if (!files.size) throw new Error("no tests selected");
for (const file of files) {
	await access(file).catch((error) => {
		throw new Error(
			`missing emitted test ${file}; check the package tsconfig includes test/** and rebuild`,
			{ cause: error },
		);
	});
}
const result = spawnSync(process.execPath, ["--test", ...[...files].sort()], {
	stdio: "inherit",
});
process.exitCode = result.status ?? 1;
