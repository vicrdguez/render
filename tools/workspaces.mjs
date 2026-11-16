import { existsSync } from "node:fs";
import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function workspaces(root = process.cwd()) {
	const manifest = JSON.parse(
		await readFile(path.join(root, "package.json"), "utf8"),
	);
	const packages = [];
	for await (const directory of glob(manifest.workspaces, { cwd: root })) {
		const manifest = JSON.parse(
			await readFile(path.join(root, directory, "package.json"), "utf8"),
		);
		packages.push({ directory, manifest });
	}
	return packages;
}

export function selectPackages(packages, selections, root = process.cwd()) {
	if (!selections.length) return packages;
	const selected = new Set();
	for (const selection of selections) {
		if (selection === "workspace") {
			for (const pkg of packages) selected.add(pkg);
			continue;
		}
		if (selection === "tools" || selection.startsWith("tools/")) continue;
		const candidates = [root, process.env.TAU_INVOCATION_DIR ?? root]
			.map((base) => path.resolve(base, selection))
			.filter((candidate) => existsSync(candidate));
		const matches = packages.filter(
			({ directory, manifest }) =>
				selection === manifest.name ||
				selection === path.basename(directory) ||
				selection === directory ||
				directory.startsWith(`${selection}/`) ||
				candidates.some(
					(candidate) =>
						candidate === path.resolve(root, directory) ||
						candidate.startsWith(
							`${path.resolve(root, directory)}${path.sep}`,
						) ||
						path.resolve(root, directory).startsWith(`${candidate}${path.sep}`),
				),
		);
		if (!matches.length) throw new Error(`no package selected by ${selection}`);
		for (const pkg of matches) selected.add(pkg);
	}
	return [...selected];
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const args = process.argv.slice(2);
	const usage =
		"Usage: test [selection ...]\n       typecheck [selection ...]\n       test --list";
	if (args.length !== 1 || !["--help", "--list"].includes(args[0])) {
		console.error(usage);
		process.exitCode = 2;
	} else {
		const selections = (await workspaces())
			.map(({ directory, manifest }) => `${directory}\t${manifest.name}`)
			.sort();
		selections.push("tools\ttools");
		if (args[0] === "--help") {
			console.log(`${usage}\n
Selections accept a directory, package name, test file, or test directory.
Use core or tau for the core, extensions for all extensions, and e2e for server tests.
Use tools for development-tool tests. No selection, or workspace, selects everything.
Paths are relative to the invocation directory or repository root.
Named Nix apps such as test-core and test-w2 run a fixed package.
Use the generic test command to select individual files.

Available packages:`);
		}
		console.log(selections.join("\n"));
	}
}
