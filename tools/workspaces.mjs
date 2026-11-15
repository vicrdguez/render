import { glob, readFile } from "node:fs/promises";
import path from "node:path";

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
	if (!selections.length || selections.includes("workspace")) return packages;
	const selected = new Set();
	for (const selection of selections) {
		if (selection === "tools" || selection.startsWith("tools/")) continue;
		const candidates = [root, process.env.TAU_INVOCATION_DIR ?? root].map(
			(base) => path.resolve(base, selection),
		);
		const matches = packages.filter(
			({ directory, manifest }) =>
				selection === manifest.name ||
				selection === path.basename(directory) ||
				selection === directory ||
				directory.startsWith(`${selection}/`) ||
				candidates.some((candidate) =>
					candidate.startsWith(`${path.resolve(root, directory)}${path.sep}`),
				),
		);
		if (!matches.length) throw new Error(`no package selected by ${selection}`);
		for (const pkg of matches) selected.add(pkg);
	}
	return [...selected];
}
