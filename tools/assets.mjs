import { copyFile, glob, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

// tsc does not copy prose. Preserve its module-relative path after emit.
for await (const file of glob("packages/*/tsconfig.json")) {
	const config = JSON.parse(await readFile(file, "utf8"));
	if (config.compilerOptions?.noEmit) continue;
	for await (const source of glob(`${dirname(file)}/{src,test}/**/*.md`)) {
		const target = source.replace(/^(packages\/[^/]+)\//, "$1/dist/");
		await mkdir(dirname(target), { recursive: true });
		await copyFile(source, target);
	}
}
