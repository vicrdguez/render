import { glob, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const manifest = await readJson("package.json");
const lock = await readJson("package-lock.json");
const manifests = new Map([["", manifest]]);
for await (const directory of glob(manifest.workspaces)) {
	manifests.set(directory, await readJson(`${directory}/package.json`));
}
const fields = [
	"name",
	"version",
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
	"peerDependenciesMeta",
	"engines",
	"workspaces",
];
const errors = [];
for (const [directory, pkg] of manifests) {
	const locked = lock.packages?.[directory];
	for (const field of fields) {
		// npm omits a workspace name when its directory already gives the name.
		if (directory && field === "name" && locked?.name === undefined) continue;
		if (!locked || !isDeepStrictEqual(pkg[field], locked[field])) {
			errors.push(
				`${directory ? `${directory}/` : ""}package.json: ${field} disagrees with package-lock.json`,
			);
		}
	}
}
for (const directory of Object.keys(lock.packages ?? {})) {
	if (
		directory &&
		!directory.includes("node_modules") &&
		!manifests.has(directory)
	) {
		errors.push(`package-lock.json: stale workspace ${directory}`);
	}
}
if (errors.length) {
	console.error(errors.join("\n"));
	process.exitCode = 1;
} else {
	console.log("workspace lock: pass");
}
