import {
	glob,
	lstat,
	mkdir,
	readdir,
	readFile,
	readlink,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import path from "node:path";

const external = path.resolve(process.argv[2]);
const modules = path.resolve("node_modules");
const marker = path.join(modules, ".tau-nix-links");
const stat = await lstat(modules).catch((error) => {
	if (error.code !== "ENOENT") throw error;
});
if (stat?.isSymbolicLink()) await unlink(modules);
else if (stat) {
	try {
		await readFile(marker);
	} catch {
		throw new Error(
			"node_modules is not managed by Tau. Move it aside before entering the Nix shell.",
		);
	}
}
await mkdir(modules, { recursive: true });
await writeFile(
	marker,
	"External dependencies link to Nix. Workspaces link to this checkout.\n",
);
const links = new Map();
for (const name of await readdir(external)) {
	if (name.startsWith("@")) {
		for (const child of await readdir(path.join(external, name))) {
			links.set(`${name}/${child}`, path.join(external, name, child));
		}
	} else if (name !== ".package-lock.json") {
		links.set(name, path.join(external, name));
	}
}
const manifest = JSON.parse(await readFile("package.json", "utf8"));
for await (const directory of glob(manifest.workspaces)) {
	const pkg = JSON.parse(
		await readFile(path.join(directory, "package.json"), "utf8"),
	);
	links.set(pkg.name, path.resolve(directory));
}
for await (const name of glob(["*", "@*/*"], { cwd: modules })) {
	if (links.has(name)) continue;
	const link = path.join(modules, name);
	if (!(await lstat(link)).isSymbolicLink()) continue;
	const target = await readlink(link);
	if (target.startsWith(path.resolve("packages") + path.sep))
		await unlink(link);
}
for (const [name, target] of links) {
	const link = path.join(modules, name);
	await mkdir(path.dirname(link), { recursive: true });
	const current = await readlink(link).catch((error) => {
		if (error.code !== "ENOENT") throw error;
	});
	if (current === target) continue;
	if (current) await unlink(link);
	await symlink(target, link);
}
