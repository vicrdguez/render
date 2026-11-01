// Effects owns trusted private Git. Worker Git/configuration is never opened here.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { faultBarrier } from "../ledger/barrier.ts";
import type { Capture } from "../sandboxes/sandboxes.ts";

export type LiteralEntry = { path: string; mode: "100644" | "100755" | "120000"; oid: string; content: string };
export type Source = {
	repository: string;
	objectFormat: "sha1" | "sha256";
	commit: string;
	tree: string;
	root: string;
	entries: LiteralEntry[];
};
export type SourceReceipt = {
	base: Source;
	source: Source;
	freeze: Capture["freeze"];
	exclusions: string[];
	bytes: number;
	entries: number;
	deleted: string[];
	configurationChanges: string[];
	durability: { git: string; fsync: "all"; method: "fsync" };
};
export type Resolve = { type: "resolve"; repository: string; commit: string };
export type Retain = { type: "retain"; base: Source; capture: Capture };
export type Diff = { type: "diff"; repository: string; base: string; result: string };
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 10000;

function oid(format: Source["objectFormat"], type: string, content: Buffer): string {
	return createHash(format).update(`${type} ${content.length}\0`).update(content).digest("hex");
}
export function blobOid(format: Source["objectFormat"], content: Buffer): string {
	return oid(format, "blob", content);
}
export function treeOid(entries: LiteralEntry[], format: Source["objectFormat"], prefix = ""): string {
	const groups = new Map<string, LiteralEntry[]>();
	for (const entry of entries) {
		const name = entry.path.slice(prefix.length).split("/")[0]!;
		groups.set(name, [...(groups.get(name) ?? []), entry]);
	}
	const children = [...groups].map(([name, group]) => {
		const leaf = group.length === 1 && group[0]!.path === `${prefix}${name}` ? group[0]! : undefined;
		return { name, leaf, hash: leaf?.oid ?? treeOid(group, format, `${prefix}${name}/`) };
	});
	children.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.leaf ? "" : "/")), Buffer.from(b.name + (b.leaf ? "" : "/"))));
	return oid(
		format,
		"tree",
		Buffer.concat(
			children.map(({ name, leaf, hash }) => Buffer.concat([Buffer.from(`${leaf?.mode ?? "40000"} ${name}\0`), Buffer.from(hash, "hex")])),
		),
	);
}
export function validatePath(path: string): void {
	const parts = path.split("/");
	if (
		parts.length > 64 ||
		Buffer.byteLength(path) > 4096 ||
		path.normalize("NFC") !== path ||
		!Buffer.from(path).equals(Buffer.from(path, "utf8"))
	)
		throw new Error(`Unsupported source name representation: ${JSON.stringify(path)}`);
	for (const part of parts)
		if (
			!part ||
			part === "." ||
			part === ".." ||
			/[\0\\:]/.test(part) ||
			/[. ]$/.test(part) ||
			part.toLowerCase() === ".git" ||
			/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part) ||
			Buffer.byteLength(part) > 255
		)
			throw new Error(`Invalid/reserved source name: ${JSON.stringify(path)}`);
}
export function validateEntries(
	entries: LiteralEntry[],
	format: Source["objectFormat"],
	maxBytes = MAX_BYTES,
	maxEntries = MAX_ENTRIES,
): void {
	if (entries.length > maxEntries) throw new Error("Source entry bound exceeded.");
	const names = new Map<string, string>();
	const leaves = new Set<string>();
	let bytes = 0;
	for (const entry of entries) {
		validatePath(entry.path);
		if (!["100644", "100755", "120000"].includes(entry.mode))
			throw new Error("Unsupported source mode/gitlink; supply literal expanded source explicitly.");
		const parts = entry.path.split("/");
		for (let i = 1; i <= parts.length; i++) {
			const path = parts.slice(0, i).join("/");
			const key = path.normalize("NFKC").toLowerCase();
			const prior = names.get(key);
			if ((prior && prior !== path) || (i < parts.length && leaves.has(path))) throw new Error(`Source name collision: ${path}`);
			names.set(key, path);
		}
		if (leaves.has(entry.path) || [...leaves].some((p) => p.startsWith(`${entry.path}/`)))
			throw new Error(`Source name collision: ${entry.path}`);
		leaves.add(entry.path);
		const content = Buffer.from(entry.content, "base64");
		if (content.toString("base64") !== entry.content || blobOid(format, content) !== entry.oid)
			throw new Error(`Source blob integrity failed: ${entry.path}`);
		if (entry.mode === "120000" && (content.includes(0) || !Buffer.from(content.toString("utf8")).equals(content)))
			throw new Error("Unsupported symlink target representation.");
		bytes += content.length;
		if (bytes > maxBytes) throw new Error("Source bytes bound exceeded.");
	}
}

export class Effects {
	readonly #root: string;
	readonly #repositories: Readonly<Record<string, string>>;
	readonly #stores = new Map<string, Promise<{ path: string; cwd: string; format: Source["objectFormat"] }>>();
	constructor(options: { root: string; repositories: Readonly<Record<string, string>> }) {
		this.#root = options.root;
		this.#repositories = options.repositories;
	}
	perform(operation: Resolve): Promise<Source>;
	perform(operation: Retain): Promise<SourceReceipt>;
	perform(operation: Diff): Promise<string>;
	async perform(operation: Resolve | Retain | Diff): Promise<Source | SourceReceipt | string> {
		const repository = operation.type === "retain" ? operation.base.repository : operation.repository;
		const store = await this.#store(repository);
		if (operation.type === "diff") {
			this.#checkOid(operation.base, store.format);
			this.#checkOid(operation.result, store.format);
			return (
				await this.#git(store.path, store.cwd, ["diff", "--no-ext-diff", "--no-textconv", operation.base, operation.result, "--"])
			).toString("utf8");
		}
		if (operation.type === "resolve") {
			this.#checkOid(operation.commit, store.format);
			await this.#git(store.path, store.cwd, [
				"fetch",
				"--no-tags",
				"--no-write-fetch-head",
				"--no-recurse-submodules",
				"--",
				this.#repositories[repository]!,
				operation.commit,
			]);
			const source = await this.#read(repository, operation.commit);
			await this.#rootSource(source);
			return source;
		}
		const { base, capture } = operation;
		await this.#verifySource(base);
		if (capture.freeze.running !== false || capture.freeze.runtime.length < 1)
			throw new Error("Source capture has no confirmed whole-container freeze.");
		validateEntries(capture.entries, store.format);
		// No worker interpretation: literal blobs and NUL-delimited trees, in a private empty cwd.
		for (const entry of capture.entries) {
			const hash = (
				await this.#git(store.path, store.cwd, ["hash-object", "-w", "--no-filters", "--stdin"], Buffer.from(entry.content, "base64"))
			)
				.toString()
				.trim();
			if (hash !== entry.oid) throw new Error("Constructed source blob mismatch.");
		}
		const tree = await this.#writeTree(store, capture.entries);
		const commit = (
			await this.#git(
				store.path,
				store.cwd,
				["commit-tree", tree, "-p", base.commit],
				Buffer.from(`Render literal source\n${JSON.stringify(capture.freeze.scope)}\n`),
			)
		)
			.toString()
			.trim();
		const source = await this.#read(repository, commit);
		await faultBarrier("before-source-root", "owned-source");
		await this.#rootSource(source);
		await faultBarrier("after-source-root", "owned-source");
		return {
			base,
			source,
			freeze: capture.freeze,
			exclusions: capture.exclusions,
			bytes: capture.entries.reduce((n, e) => n + Buffer.from(e.content, "base64").length, 0),
			entries: capture.entries.length,
			deleted: base.entries
				.filter((e) => !source.entries.some((x) => x.path === e.path))
				.map((e) => e.path)
				.sort(),
			configurationChanges: [...new Set([...base.entries, ...source.entries].map((e) => e.path))]
				.filter(
					(path) =>
						/(^|\/)\.(gitattributes|gitmodules)$/.test(path) &&
						base.entries.find((e) => e.path === path)?.oid !== source.entries.find((e) => e.path === path)?.oid,
				)
				.sort(),
			durability: { git: (await this.#git(store.path, store.cwd, ["--version"])).toString().trim(), fsync: "all", method: "fsync" },
		};
	}
	async reconcile(receipt: SourceReceipt): Promise<SourceReceipt> {
		await this.#verifySource(receipt.base);
		await this.#verifySource(receipt.source);
		return receipt;
	}
	async #verifySource(source: Source): Promise<void> {
		const store = await this.#store(source.repository);
		this.#checkOid(source.commit, store.format);
		if (source.objectFormat !== store.format || source.root !== `refs/render/sources/${source.commit}`)
			throw new Error("Source root identity mismatch.");
		const root = (await this.#git(store.path, store.cwd, ["rev-parse", "--verify", source.root])).toString().trim();
		const actual = await this.#read(source.repository, source.commit);
		if (root !== source.commit || JSON.stringify(actual) !== JSON.stringify(source))
			throw new Error("Retained source/root mismatch; restore exact source objects.");
	}
	async #read(repository: string, commit: string): Promise<Source> {
		const store = await this.#store(repository);
		const exact = (await this.#git(store.path, store.cwd, ["rev-parse", "--verify", `${commit}^{commit}`])).toString().trim();
		if (exact !== commit) throw new Error("Exact source commit required.");
		const tree = (await this.#git(store.path, store.cwd, ["rev-parse", "--verify", `${commit}^{tree}`])).toString().trim();
		const listing = await this.#git(store.path, store.cwd, ["ls-tree", "-r", "-z", "--full-tree", commit]);
		const entries: LiteralEntry[] = [];
		let bytes = 0;
		for (const record of listing.toString("binary").split("\0").filter(Boolean)) {
			const tab = record.indexOf("\t");
			const [mode, type, hash] = record.slice(0, tab).split(" ") as [LiteralEntry["mode"], string, string];
			const name = Buffer.from(record.slice(tab + 1), "binary");
			const path = name.toString("utf8");
			if (!Buffer.from(path).equals(name)) throw new Error("Unsupported non-UTF8 source filename.");
			if (type !== "blob") throw new Error("Unsupported gitlink/submodule; provide explicit literal expanded input, no implicit fetch.");
			validatePath(path);
			const size = Number((await this.#git(store.path, store.cwd, ["cat-file", "-s", hash])).toString());
			bytes += size;
			if (bytes > MAX_BYTES || entries.length >= MAX_ENTRIES) throw new Error("Source bytes/entries bound exceeded.");
			const content = await this.#git(store.path, store.cwd, ["cat-file", "blob", hash]);
			entries.push({ path, mode, oid: hash, content: content.toString("base64") });
		}
		entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
		validateEntries(entries, store.format);
		return { repository, objectFormat: store.format, commit, tree, root: `refs/render/sources/${commit}`, entries };
	}
	async #writeTree(store: { path: string; cwd: string }, entries: LiteralEntry[], prefix = ""): Promise<string> {
		const children = new Map<string, LiteralEntry[]>();
		for (const entry of entries) {
			const name = entry.path.slice(prefix.length).split("/")[0]!;
			children.set(name, [...(children.get(name) ?? []), entry]);
		}
		const records: Buffer[] = [];
		for (const [name, group] of children) {
			const leaf = group.length === 1 && group[0]!.path === `${prefix}${name}` ? group[0]! : undefined;
			const hash = leaf ? leaf.oid : await this.#writeTree(store, group, `${prefix}${name}/`);
			records.push(Buffer.from(`${leaf?.mode ?? "040000"} ${leaf ? "blob" : "tree"} ${hash}\t${name}\0`));
		}
		return (await this.#git(store.path, store.cwd, ["mktree", "-z"], Buffer.concat(records))).toString().trim();
	}
	async #rootSource(source: Source): Promise<void> {
		const store = await this.#store(source.repository);
		await this.#git(store.path, store.cwd, ["fsck", "--strict", "--no-reflogs", source.commit]);
		await this.#git(store.path, store.cwd, ["update-ref", source.root, source.commit]);
		await syncTree(store.path);
	}
	#store(repository: string): Promise<{ path: string; cwd: string; format: Source["objectFormat"] }> {
		if (!Object.hasOwn(this.#repositories, repository)) throw new Error("Repository is not trusted/registered.");
		let pending = this.#stores.get(repository);
		if (!pending) {
			pending = (async () => {
				const dir = join(this.#root, createHash("sha256").update(repository).digest("hex"));
				const cwd = join(dir, "empty");
				const path = join(dir, "source.git");
				const created = await mkdir(cwd, { recursive: true, mode: 0o700 });
				const version = (await this.#git(path, cwd, ["--version"])).toString();
				const parsed = /git version (\d+)\.(\d+)/.exec(version);
				if (!parsed || Number(parsed[1]) < 2 || (Number(parsed[1]) === 2 && Number(parsed[2]) < 43))
					throw new Error("Source durability requires Git 2.43+ with fsync=all/fsyncMethod=fsync.");
				const upstream = this.#repositories[repository]!;
				if ((await this.#git(upstream, cwd, ["rev-parse", "--is-bare-repository"])).toString().trim() !== "true")
					throw new Error("Trusted source must be a private bare repository, not a linked worktree.");
				const format = (await this.#git(upstream, cwd, ["rev-parse", "--show-object-format"])).toString().trim();
				if (format !== "sha1" && format !== "sha256") throw new Error("Unsupported source object format.");
				await this.#git(path, cwd, ["init", "--bare", `--object-format=${format}`, path]);
				const until = dirname(created ?? dir);
				for (let current = dir; ; current = dirname(current)) {
					const directory = await open(current, "r");
					try {
						await directory.sync();
					} finally {
						await directory.close();
					}
					if (current === until || current === dirname(current)) break;
				}
				return { path, cwd, format };
			})();
			this.#stores.set(repository, pending);
		}
		return pending;
	}
	#checkOid(value: string, format: Source["objectFormat"]): void {
		if (!(format === "sha1" ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/).test(value)) throw new Error("Exact source commit/object ID required.");
	}
	#git(path: string, cwd: string, args: string[], input?: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const child = execFile(
				"git",
				[
					"--no-replace-objects",
					"--git-dir",
					path,
					"-c",
					"core.hooksPath=/dev/null",
					"-c",
					"core.attributesFile=/dev/null",
					"-c",
					"core.fsync=all",
					"-c",
					"core.fsyncMethod=fsync",
					"-c",
					"protocol.file.allow=always",
					...args,
				],
				{
					cwd,
					maxBuffer: MAX_BYTES + 1024 * 1024,
					encoding: "buffer",
					timeout: 60000,
					env: {
						PATH: process.env.PATH,
						HOME: cwd,
						GIT_CONFIG_NOSYSTEM: "1",
						GIT_CONFIG_GLOBAL: "/dev/null",
						GIT_TERMINAL_PROMPT: "0",
						GIT_AUTHOR_NAME: "Render",
						GIT_AUTHOR_EMAIL: "render@invalid",
						GIT_COMMITTER_NAME: "Render",
						GIT_COMMITTER_EMAIL: "render@invalid",
						GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
						GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
						LC_ALL: "C",
					},
				},
				(error, stdout, stderr) =>
					error ? reject(new Error(`Trusted source Git ${args[0]} failed: ${stderr.toString()}`)) : resolve(stdout),
			);
			child.stdin?.end(input);
		});
	}
}
async function syncTree(path: string): Promise<void> {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) await syncTree(child);
		else if (entry.isFile()) {
			const file = await open(child, "r");
			try {
				await file.sync();
			} finally {
				await file.close();
			}
		} else throw new Error("Unsupported private Git storage entry.");
	}
	const dir = await open(path, "r");
	try {
		await dir.sync();
	} finally {
		await dir.close();
	}
}
