// Effects owns trusted private Git. Worker Git/configuration is never opened here.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, open, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validatePath } from "../kernel/source-path.ts";
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
/** An already rooted host source (such as prepared X) read back exactly, with no fetch. */
export type Read = { type: "read"; repository: string; commit: string };
export type Retain = { type: "retain"; base: Source; capture: Capture };
export type Diff = { type: "diff"; repository: string; base: string; result: string };
/** Inputs are host-retained sources, never worker-selected Git metadata. */
export type Prepare = { type: "prepare"; base: Source; source: Source; target: Source };
/** The host-private canonical proposal ref; `initial` binds it only while absent. */
export type Observe = { type: "observe"; repository: string; proposal: string; initial: string };
export type TargetObservation = { proposal: string; ref: string; target: Source };
/** Squash R: exactly prepared X's tree on parent T with fixed metadata, rooted before any canonical-ref change. */
export type Squash = { type: "squash"; prepared: Source; target: Source; message: string };
/** One admitted attempt's expected-old CAS of the canonical proposal ref from `expected` (T) to `result` (R). */
export type Integrate = { type: "integrate"; repository: string; proposal: string; expected: string; result: Source; attempt: string };
/** Read-only reconciliation of the canonical proposal ref. */
export type ReconcileIntegration = { type: "integration"; repository: string; proposal: string };
export type CanonicalObservation = {
	ref: string;
	observed: { commit: string; tree: string; parents: string[] } | null;
	/** A held ref lock: a writer may still be finishing, so nothing about the outcome is known. */
	lock: boolean;
};
/** `refused`: the transaction never committed (prepare failed); `applied`: Git confirmed the commit. */
export type IntegrationDispatch = CanonicalObservation & { dispatch: "applied" | "refused" };
export type PreparationReceipt = {
	kind: "clean" | "conflict";
	base: Source;
	source: Source;
	target: Source;
	result: Source;
	algorithm: "git-merge-tree-write-tree-z/v1";
	profile: typeof PROFILE;
	git: string;
	identity: string;
	conflicts: string[];
	stdout: string;
	stderr: string;
	exitCode: 0 | 1;
};
type GitResult = { stdout: Buffer; stderr: Buffer; exitCode: number | null; signal: string | null };
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 10000;
/** Names the fixed trusted Git environment below; changing that environment changes preparation identity. */
const PROFILE =
	"render-trusted-git/v1: bare host-private store, empty host-owned HOME, no XDG, no system/global config or attributes, core.attributesFile=/dev/null, hooks disabled, LC_ALL=C";

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
	/** Integration permits this executor already dispatched: each admitted attempt is consumed at most once. */
	readonly #consumed = new Set<string>();
	constructor(options: { root: string; repositories: Readonly<Record<string, string>> }) {
		this.#root = options.root;
		this.#repositories = options.repositories;
	}
	perform(operation: Resolve | Read): Promise<Source>;
	perform(operation: Retain): Promise<SourceReceipt>;
	perform(operation: Diff): Promise<string>;
	perform(operation: Prepare): Promise<PreparationReceipt>;
	perform(operation: Observe): Promise<TargetObservation>;
	perform(operation: Squash): Promise<Source>;
	perform(operation: Integrate): Promise<IntegrationDispatch>;
	async perform(
		operation: Resolve | Read | Retain | Diff | Prepare | Observe | Squash | Integrate,
	): Promise<Source | SourceReceipt | string | PreparationReceipt | TargetObservation | IntegrationDispatch> {
		if (operation.type === "prepare") return this.#prepare(operation);
		if (operation.type === "squash") return this.#squash(operation);
		if (operation.type === "integrate") return this.#integrate(operation);
		if (operation.type === "read") {
			this.#checkOid(operation.commit, (await this.#store(operation.repository)).format);
			const source = await this.#read(operation.repository, operation.commit);
			await this.#verifySource(source);
			return source;
		}
		if (operation.type === "observe") return this.#observe(operation);
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
	reconcile(receipt: SourceReceipt): Promise<SourceReceipt>;
	reconcile(receipt: PreparationReceipt): Promise<PreparationReceipt>;
	reconcile(operation: ReconcileIntegration): Promise<CanonicalObservation>;
	async reconcile(
		receipt: SourceReceipt | PreparationReceipt | ReconcileIntegration,
	): Promise<SourceReceipt | PreparationReceipt | CanonicalObservation> {
		if ("type" in receipt) return this.#canonical(receipt.repository, receipt.proposal);
		await this.#verifySource(receipt.base);
		await this.#verifySource(receipt.source);
		if ("algorithm" in receipt) {
			await this.#verifySource(receipt.target);
			await this.#verifySource(receipt.result);
			const actual = await this.#prepare({ type: "prepare", base: receipt.base, source: receipt.source, target: receipt.target });
			if (JSON.stringify(actual) !== JSON.stringify(receipt)) throw new Error("Preparation receipt mismatch.");
		}
		return receipt;
	}
	async #squash({ prepared, target, message }: Squash): Promise<Source> {
		if (prepared.repository !== target.repository) throw new Error("Integration repository mismatch.");
		await this.#verifySource(prepared);
		await this.#verifySource(target);
		const store = await this.#store(target.repository);
		// The fixed Render identity and date in every trusted Git call make R a pure function of X's tree, T and message.
		const commit = (await this.#git(store.path, store.cwd, ["commit-tree", prepared.tree, "-p", target.commit], Buffer.from(message)))
			.toString()
			.trim();
		const result = await this.#read(target.repository, commit);
		await this.#rootSource(result);
		return result;
	}
	/**
	 * The expected-old canonical-ref CAS T→R under the host's exclusive store ownership, as one `update-ref --stdin`
	 * transaction. Commit is sent only after Git reports `prepare: ok` (ref locked, old value verified); if this process
	 * dies before that, Git aborts the transaction at end of input. A prepare failure is a definite refusal; any failure
	 * after commit is sent is uncertain and thrown, for the caller to reconcile.
	 */
	async #integrate({ repository, proposal, expected, result, attempt }: Integrate): Promise<IntegrationDispatch> {
		const store = await this.#store(repository);
		this.#checkOid(expected, store.format);
		await this.#verifySource(result);
		const parents = (await this.#git(store.path, store.cwd, ["rev-list", "--parents", "-n", "1", result.commit]))
			.toString()
			.trim()
			.split(" ");
		if (parents.length !== 2 || parents[1] !== expected)
			throw new Error("Integration result must be a single-parent commit on the expected target.");
		if (this.#consumed.has(attempt)) throw new Error(`Integration permit ${attempt} was already consumed.`);
		this.#consumed.add(attempt);
		const ref = canonicalRef(proposal);
		const dispatch = await this.#transaction(store.path, store.cwd, `start\nupdate ${ref} ${result.commit} ${expected}\nprepare\n`);
		if (dispatch === "applied") await syncTree(store.path);
		return { ...(await this.#canonical(repository, proposal)), dispatch };
	}
	async #canonical(repository: string, proposal: string): Promise<CanonicalObservation> {
		const store = await this.#store(repository);
		const ref = canonicalRef(proposal);
		const lock = await Promise.all(
			[join(store.path, `${ref}.lock`), join(store.path, "packed-refs.lock")].map((path) =>
				access(path).then(
					() => true,
					() => false,
				),
			),
		);
		const current = await this.#gitResult(store.path, store.cwd, ["rev-parse", "--verify", "--quiet", ref]);
		if (current.signal || (current.exitCode !== 0 && current.exitCode !== 1)) throw gitFailure("rev-parse", current);
		if (current.exitCode === 1) return { ref, observed: null, lock: lock.includes(true) };
		const commit = current.stdout.toString().trim();
		const [, ...parents] = (await this.#git(store.path, store.cwd, ["rev-list", "--parents", "-n", "1", commit]))
			.toString()
			.trim()
			.split(" ");
		const tree = (await this.#git(store.path, store.cwd, ["rev-parse", "--verify", `${commit}^{tree}`])).toString().trim();
		return { ref, observed: { commit, tree, parents }, lock: lock.includes(true) };
	}
	#transaction(path: string, cwd: string, prepare: string): Promise<"applied" | "refused"> {
		return new Promise((resolve, reject) => {
			const child = spawn("git", [...this.#gitArgs(path), "update-ref", "--stdin"], { cwd, env: GIT_ENV(cwd), stdio: "pipe" });
			let stdout = "";
			let stderr = "";
			let committed = false;
			child.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
				if (!committed && stdout.includes("prepare: ok\n")) {
					committed = true;
					child.stdin.end("commit\n");
				}
			});
			child.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});
			child.on("error", (error) => reject(new Error(`Trusted source Git update-ref failed to start: ${error.message}`)));
			// Resolve only after exit: the dispatching Git process is quiescent before anything is observed.
			child.on("close", (code, signal) => {
				if (!committed) resolve("refused");
				else if (code === 0 && !signal && stdout.includes("commit: ok\n")) resolve("applied");
				else reject(new Error(`Canonical CAS outcome unknown (exit ${code}, signal ${signal}): ${stderr}`));
			});
			child.stdin.on("error", () => {});
			child.stdin.write(prepare);
		});
	}
	async #observe({ repository, proposal, initial }: Observe): Promise<TargetObservation> {
		const store = await this.#store(repository);
		const ref = canonicalRef(proposal);
		const current = await this.#gitResult(store.path, store.cwd, ["rev-parse", "--verify", "--quiet", ref]);
		if (current.signal || (current.exitCode !== 0 && current.exitCode !== 1)) throw gitFailure("rev-parse", current);
		if (current.exitCode === 1) {
			// First use binds the proposal to the host-configured base, expected-absent. A failed create means another
			// binding won: the readback below decides, and nothing ever rebinds an existing ref.
			const base = await this.perform({ type: "resolve", repository, commit: initial });
			const created = await this.#gitResult(store.path, store.cwd, ["update-ref", ref, base.commit, "0".repeat(base.commit.length)]);
			if (created.signal) throw gitFailure("update-ref", created);
			await syncTree(store.path);
		}
		const commit = (await this.#git(store.path, store.cwd, ["rev-parse", "--verify", ref])).toString().trim();
		this.#checkOid(commit, store.format);
		if ((await this.#git(store.path, store.cwd, ["cat-file", "-t", commit])).toString().trim() !== "commit")
			throw new Error("Canonical proposal ref must name a commit.");
		const target = await this.#read(repository, commit);
		await this.#rootSource(target);
		return { proposal, ref, target };
	}
	async #prepare({ base, source, target }: Prepare): Promise<PreparationReceipt> {
		if (base.repository !== source.repository || base.repository !== target.repository) throw new Error("Preparation repository mismatch.");
		for (const input of [base, source, target]) await this.#verifySource(input);
		const store = await this.#store(source.repository);
		const ancestor = async (a: string, b: string): Promise<boolean> => {
			const result = await this.#gitResult(store.path, store.cwd, ["merge-base", "--is-ancestor", a, b]);
			if (result.signal || (result.exitCode !== 0 && result.exitCode !== 1)) throw gitFailure("merge-base", result);
			return result.exitCode === 0;
		};
		if (!(await ancestor(base.commit, source.commit)) || !(await ancestor(base.commit, target.commit)))
			throw new Error("Recorded base must be an ancestor of both B and target.");
		const algorithm = "git-merge-tree-write-tree-z/v1" as const;
		const git = (await this.#git(store.path, store.cwd, ["--version"])).toString().trim();
		const identity = createHash("sha256")
			.update(JSON.stringify([source.repository, base.commit, source.commit, target.commit, algorithm, PROFILE, git]))
			.digest("hex");
		if (await ancestor(target.commit, source.commit))
			return {
				kind: "clean",
				base,
				source,
				target,
				result: source,
				algorithm,
				profile: PROFILE,
				git,
				identity,
				conflicts: [],
				stdout: "",
				stderr: "",
				exitCode: 0,
			};
		const raw = await this.#gitResult(store.path, store.cwd, [
			"merge-tree",
			"--write-tree",
			"--messages",
			"-z",
			source.commit,
			target.commit,
		]);
		if (raw.signal || (raw.exitCode !== 0 && raw.exitCode !== 1)) throw gitFailure("merge-tree", raw);
		let parsed: { tree: string; conflicts: string[] };
		try {
			parsed = parseMergeResult(raw.stdout, raw.exitCode, store.format);
			if ((await this.#git(store.path, store.cwd, ["cat-file", "-t", parsed.tree])).toString().trim() !== "tree")
				throw new Error("Preparation result is not a tree.");
		} catch (error) {
			throw new Error(`Operational merge-tree result: ${error}; stderr: ${raw.stderr.toString("utf8")}`);
		}
		const commit = (
			await this.#git(
				store.path,
				store.cwd,
				["commit-tree", parsed.tree, "-p", source.commit, "-p", target.commit],
				Buffer.from(`Render preparation ${identity}\n`),
			)
		)
			.toString()
			.trim();
		const result = await this.#read(source.repository, commit);
		await this.#rootSource(result);
		return {
			kind: raw.exitCode === 0 ? "clean" : "conflict",
			base,
			source,
			target,
			result,
			algorithm,
			profile: PROFILE,
			git,
			identity,
			conflicts: parsed.conflicts,
			stdout: raw.stdout.toString("base64"),
			stderr: raw.stderr.toString("base64"),
			exitCode: raw.exitCode,
		};
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
		// Debt: per-blob Git processes make large manifests slow; batch object reads while preserving literal size checks.
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
		// Debt: immediate-child grouping duplicates treeOid; share grouping without coupling independent Git fixture oracles.
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
	async #git(path: string, cwd: string, args: string[], input?: Buffer): Promise<Buffer> {
		const result = await this.#gitResult(path, cwd, args, input);
		if (result.exitCode !== 0 || result.signal) throw gitFailure(args[0]!, result);
		return result.stdout;
	}
	#gitArgs(path: string): string[] {
		return [
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
		];
	}
	#gitResult(path: string, cwd: string, args: string[], input?: Buffer): Promise<GitResult> {
		return new Promise((resolve, reject) => {
			const child = execFile(
				"git",
				[...this.#gitArgs(path), ...args],
				{ cwd, maxBuffer: MAX_BYTES + 1024 * 1024, encoding: "buffer", timeout: 60000, env: GIT_ENV(cwd) },
				(error, stdout, stderr) => {
					if (error && typeof error.code !== "number" && !error.signal) {
						reject(new Error(`Trusted source Git ${args[0]} failed: ${error.message}; ${stderr.toString()}`));
						return;
					}
					resolve({
						stdout,
						stderr,
						exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
						signal: error?.signal ?? null,
					});
				},
			);
			child.stdin?.end(input);
		});
	}
}
/** The fixed trusted Git environment (PROFILE): no inherited configuration, fixed identity and dates. */
function GIT_ENV(cwd: string): NodeJS.ProcessEnv {
	return {
		PATH: process.env.PATH,
		HOME: cwd,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_ATTR_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_TERMINAL_PROMPT: "0",
		GIT_AUTHOR_NAME: "Render",
		GIT_AUTHOR_EMAIL: "render@invalid",
		GIT_COMMITTER_NAME: "Render",
		GIT_COMMITTER_EMAIL: "render@invalid",
		GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
		GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
		LC_ALL: "C",
	};
}
/** The host-private canonical proposal ref; upstream and forge branches never become it. */
export function canonicalRef(proposal: string): string {
	return `refs/render/proposals/${createHash("sha256").update(proposal).digest("hex")}`;
}
function gitFailure(command: string, result: GitResult): Error {
	return new Error(
		`Trusted source Git ${command} failed (exit ${result.exitCode}, signal ${result.signal}): ${result.stderr.toString("utf8")}`,
	);
}

// Git's -z protocol: tree, stage records, empty separator, then count/paths/type/message tuples.
// Validate the complete stream; an exit code or a first tree alone never authorizes conflict return.
function parseMergeResult(stdout: Buffer, exitCode: 0 | 1, format: Source["objectFormat"]): { tree: string; conflicts: string[] } {
	const text = stdout.toString("utf8");
	if (!Buffer.from(text).equals(stdout) || !text.endsWith("\0")) throw new Error("Invalid merge-tree framing.");
	const fields = text.slice(0, -1).split("\0");
	const tree = fields.shift()!;
	const hash = format === "sha1" ? "[0-9a-f]{40}" : "[0-9a-f]{64}";
	if (!new RegExp(`^${hash}$`).test(tree)) throw new Error("Invalid merge-tree tree framing.");
	const conflicts = new Set<string>();
	let stages = 0;
	while (fields.length && fields[0] !== "") {
		const stage = new RegExp(`^(100644|100755|120000) (${hash}) [123]\\t(.+)$`, "s").exec(fields.shift()!);
		if (!stage) throw new Error("Invalid merge-tree stage framing.");
		validatePath(stage[3]!);
		conflicts.add(stage[3]!);
		if (++stages > MAX_ENTRIES * 3) throw new Error("Merge-tree stage bound exceeded.");
	}
	if (fields.shift() !== "") throw new Error("Missing merge-tree section framing.");
	let conflictMessages = 0;
	while (fields.length) {
		const countText = fields.shift()!;
		if (!/^[1-9][0-9]*$/.test(countText)) throw new Error("Invalid merge-tree message framing.");
		const count = Number(countText);
		if (count > MAX_ENTRIES || fields.length < count + 2) throw new Error("Truncated merge-tree message framing.");
		const paths = fields.splice(0, count);
		for (const path of paths) validatePath(path);
		const type = fields.shift()!;
		const message = fields.shift()!;
		if (!type || !message) throw new Error("Empty merge-tree message framing.");
		if (type.startsWith("CONFLICT")) {
			conflictMessages++;
			for (const path of paths) conflicts.add(path);
		} else if (type !== "Auto-merging") throw new Error(`Unsupported merge-tree message classification: ${type}`);
	}
	if ((exitCode === 0 && (stages > 0 || conflictMessages > 0)) || (exitCode === 1 && conflictMessages === 0))
		throw new Error("Invalid merge-tree result classification.");
	return { tree, conflicts: [...conflicts].sort() };
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
