import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
// tsc does not copy prose. Keep the same module-relative file location after emit.
export async function copyAssets(root) {
	for (const entry of await readdir(path.join(root, "packages"), {
		withFileTypes: true,
	})) {
		if (!entry.isDirectory()) continue;
		const base = path.join(root, "packages", entry.name);
		async function visit(relative) {
			for (const file of await readdir(path.join(base, "src", relative), {
				withFileTypes: true,
			})) {
				const next = path.join(relative, file.name);
				if (file.isDirectory()) await visit(next);
				else if (file.name.endsWith(".md")) {
					const target = path.join(base, "dist/src", next);
					await mkdir(path.dirname(target), { recursive: true });
					await copyFile(path.join(base, "src", next), target);
				}
			}
		}
		await visit("");
	}
}
await copyAssets(process.cwd());
