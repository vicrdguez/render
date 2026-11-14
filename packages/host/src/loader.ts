import { mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { ExtensionFailure, ExtensionSource } from "./extensions.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const JAVASCRIPT = new Set([".js", ".mjs", ".cjs", ".jsx"]);
const writable = (mode: number) => (mode & 0o022) !== 0;
const visible = (name: string) => !name.startsWith(".");

/**
 * Imports `<directory>/<name>/index.ts` for each extension folder, in name order, on every call.
 * Rejects only when the directory itself is unsafe or unreadable.
 */
export function fromDirectory(directory: string): ExtensionSource {
	return async () => {
		const names = await list(directory).catch((error: Error) => {
			throw new Error(
				`The extension directory ${directory} is unsafe or unreadable, so no extension loads: ${error.message}`,
				{ cause: error },
			);
		});
		const loaded: [string, unknown][] = [];
		const failures: ExtensionFailure[] = [];
		if (names.length === 0) return { modules: {}, failures };
		let alias: Record<string, string>;
		try {
			alias = await aliases();
		} catch (error) {
			for (const name of names)
				failures.push({
					name,
					path: path.join(directory, name),
					stage: "aliases",
					error,
				});
			return { modules: {}, failures };
		}
		// A file cache would write transformed code under the temporary directory and run it later.
		const jiti = createJiti(import.meta.url, {
			moduleCache: false,
			fsCache: false,
			alias,
		});
		for (const name of names) {
			const entry = path.join(directory, name);
			let stage = "find";
			try {
				const folder = await realpath(entry);
				if (!(await stat(folder)).isDirectory())
					throw new Error(
						`${name} is not a folder. An extension is a folder that holds index.ts.`,
					);
				const index = path.join(folder, "index.ts");
				if (!(await stat(index).catch(() => undefined))?.isFile())
					throw new Error(`${folder} holds no index.ts`);
				stage = "files";
				await check(folder, "");
				stage = "import";
				loaded.push([name, await jiti.import(index)]);
			} catch (error) {
				failures.push({ name, path: entry, stage, error });
			}
		}
		return { modules: Object.fromEntries(loaded), failures };
	};
}

async function list(directory: string): Promise<string[]> {
	const info = await stat(directory).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return undefined;
		throw error;
	});
	if (info === undefined) {
		await mkdir(directory, { recursive: true, mode: 0o700 });
		return [];
	}
	if (!info.isDirectory()) throw new Error("it is not a folder");
	if (info.uid !== process.getuid?.())
		throw new Error("it is not owned by the server's user");
	if (writable(info.mode)) throw new Error("it is writable by group or others");
	return (await readdir(directory))
		.filter((name) => visible(name) && name !== "node_modules")
		.sort();
}

/** Root may own files so that the Nix store is admitted. A node_modules is checked at its top only. */
async function check(folder: string, relative: string): Promise<void> {
	const shown = relative || folder;
	const info = await stat(path.join(folder, relative));
	if (info.uid !== process.getuid?.() && info.uid !== 0)
		throw new Error(`${shown} is owned by another user`);
	if (writable(info.mode))
		throw new Error(`${shown} is writable by group or others`);
	if (!info.isDirectory()) {
		if (JAVASCRIPT.has(path.extname(relative)))
			throw new Error(
				`${relative} is JavaScript. Only TypeScript is read again on reload and sees the aliases.`,
			);
		return;
	}
	if (path.basename(relative) === "node_modules") return;
	const names = await readdir(path.join(folder, relative));
	for (const name of names.filter(visible).sort())
		await check(folder, path.join(relative, name));
}

/** One alias per entry of tau-extension's exports map, found from the host's own location. */
async function aliases(): Promise<Record<string, string>> {
	for (let dir = here; ; dir = path.dirname(dir)) {
		const root = path.join(dir, "node_modules", "tau-extension");
		const text = await readFile(path.join(root, "package.json"), "utf8").catch(
			() => undefined,
		);
		if (text !== undefined) {
			const exports: Record<string, { import: string }> =
				JSON.parse(text).exports;
			const alias: Record<string, string> = {};
			for (const [key, target] of Object.entries(exports))
				alias[`tau-extension${key.slice(1)}`] = path.join(root, target.import);
			alias["tau-extension/testing"] = path.join(here, "refused-testing.js");
			return alias;
		}
		if (path.dirname(dir) === dir)
			throw new Error(
				`tau-extension is in no node_modules folder above ${here}. Install tau-extension beside the Tau server, then start it again.`,
			);
	}
}
