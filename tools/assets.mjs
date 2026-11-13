import { copyFile, glob, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// tsc does not copy prose. Preserve its module-relative path after emit.
for await (const source of glob("packages/*/{src,test}/**/*.md")) {
	const target = source.replace(/^(packages\/[^/]+)\//, "$1/dist/");
	await mkdir(dirname(target), { recursive: true });
	await copyFile(source, target);
}
