import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export function extensionSource(name: string) {
	return resolve(import.meta.dirname, "../../extensions", name, "src");
}

export async function linkExtensions(home: string, searchUrl?: string) {
	const directory = join(home, "extensions");
	await mkdir(directory, { recursive: true, mode: 0o700 });
	for (const name of ["w1", "w2", "websearch"]) {
		const folder = join(directory, name);
		if (name !== "websearch" || searchUrl === undefined) {
			await symlink(extensionSource(name), folder);
			continue;
		}
		await mkdir(folder);
		await writeFile(
			join(folder, "index.ts"),
			`import { createSearchExtension } from ${JSON.stringify(join(extensionSource(name), "web-search.ts"))};\nexport { options } from ${JSON.stringify(join(extensionSource(name), "options.ts"))};\nexport const extension = createSearchExtension({ exa: ${JSON.stringify(searchUrl)} });\n`,
		);
	}
}
