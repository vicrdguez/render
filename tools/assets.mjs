import { copyFile, glob, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { selectPackages, workspaces } from "./workspaces.mjs";

// tsc does not copy prose. Preserve its module-relative path after emit.
for (const { directory } of selectPackages(
	await workspaces(),
	process.argv.slice(2),
)) {
	const config = JSON.parse(
		await readFile(`${directory}/tsconfig.json`, "utf8"),
	);
	if (config.compilerOptions?.noEmit) continue;
	for await (const source of glob(`${directory}/{src,test}/**/*.md`)) {
		const target = `${directory}/dist/${source.slice(directory.length + 1)}`;
		await mkdir(dirname(target), { recursive: true });
		await copyFile(source, target);
	}
}
