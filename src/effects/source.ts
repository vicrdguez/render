// Effects owns trusted private Git. Worker Git/configuration is never opened here.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { fromPromise, runPromise } from "../effect.ts";
import type { LiteralEntry, Source, SourceReceipt } from "../kernel/evidence-schema.ts";
import { validatePath } from "../kernel/source-path.ts";
import { faultBarrier } from "../ledger/barrier.ts";
import type { Capture } from "../sandboxes/sandboxes.ts";
import { type ForgeConfig, type ForgeDispatch, type ForgeSnapshot, GitHubForge } from "./forge.ts";

export type { LiteralEntry, Source, SourceReceipt } from "../kernel/evidence-schema.ts";
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
export type ReconcileIntegration = { type: "integration"; repository: string; proposal: string };
/** One admitted forge attempt: Effects consumes its permit once and sends the request through the internal Forge. */
export type Publish = { type: "publish"; repository: string; proposal: string; commit: string; expected: string | null; attempt: string };
export type CreateProposal = { type: "createProposal"; repository: string; proposal: string; title: string; body: string; attempt: string };
export type UpdateSummary = { type: "updateSummary"; repository: string; proposal: string; pr: string; summary: string; attempt: string };
export type MarkReady = { type: "markReady"; repository: string; proposal: string; pr: string; attempt: string };
export type ReconcilePublication = { type: "publication"; repository: string; proposal: string };
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
type SourceOperation =
	| Resolve
	| Read
	| Retain
	| Diff
	| Prepare
	| Observe
	| Squash
	| Integrate
	| Publish
	| CreateProposal
	| UpdateSummary
	| MarkReady;
type SourceResult = Source | SourceReceipt | string | PreparationReceipt | TargetObservation | IntegrationDispatch | ForgeDispatch;
type Reconciliation = SourceReceipt | PreparationReceipt | ReconcileIntegration | ReconcilePublication;
type Reconciled = SourceReceipt | PreparationReceipt | CanonicalObservation | ForgeSnapshot;
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
	readonly #started = Date.now();
	readonly #forge: ForgeConfig | undefined;
	constructor(options: { root: string; repositories: Readonly<Record<string, string>>; forge?: ForgeConfig }) {
		this.#root = options.root;
		this.#repositories = options.repositories;
		this.#forge = options.forge;
	}
	perform(operation: Resolve | Read): Promise<Source>;
	perform(operation: Retain): Promise<SourceReceipt>;
	perform(operation: Diff): Promise<string>;
	perform(operation: Prepare): Promise<PreparationReceipt>;
	perform(operation: Observe): Promise<TargetObservation>;
	perform(operation: Squash): Promise<Source>;
	perform(operation: Publish | CreateProposal | UpdateSummary | MarkReady): Promise<ForgeDispatch>;
	perform(operation: Integrate): Promise<IntegrationDispatch>;
	perform(operation: SourceOperation): Promise<SourceResult> {
		return runPromise(this.performEffect(operation));
	}
	performEffect(operation: Resolve | Read): Effect.Effect<Source, unknown>;
	performEffect(operation: Retain): Effect.Effect<SourceReceipt, unknown>;
	performEffect(operation: Diff): Effect.Effect<string, unknown>;
	performEffect(operation: Prepare): Effect.Effect<PreparationReceipt, unknown>;
	performEffect(operation: Observe): Effect.Effect<TargetObservation, unknown>;
	performEffect(operation: Squash): Effect.Effect<Source, unknown>;
	performEffect(operation: Publish | CreateProposal | UpdateSummary | MarkReady): Effect.Effect<ForgeDispatch, unknown>;
	performEffect(operation: Integrate): Effect.Effect<IntegrationDispatch, unknown>;
	performEffect(operation: SourceOperation): Effect.Effect<SourceResult, unknown>;
	performEffect(operation: SourceOperation): Effect.Effect<SourceResult, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (
				operation.type === "publish" ||
				operation.type === "createProposal" ||
				operation.type === "updateSummary" ||
				operation.type === "markReady"
			)
				return yield* this.#dispatchForge(operation);
			if (operation.type === "prepare") return yield* this.#prepare(operation);
			if (operation.type === "squash") return yield* this.#squash(operation);
			if (operation.type === "integrate") return yield* this.#integrate(operation);
			if (operation.type === "read") {
				this.#checkOid(operation.commit, (yield* fromPromise(() => this.#store(operation.repository))).format);
				const source = yield* this.#read(operation.repository, operation.commit);
				yield* this.#verifySource(source);
				return source;
			}
			if (operation.type === "observe") return yield* this.#observe(operation);
			const repository = operation.type === "retain" ? operation.base.repository : operation.repository;
			const store = yield* fromPromise(() => this.#store(repository));
			if (operation.type === "diff") {
				this.#checkOid(operation.base, store.format);
				this.#checkOid(operation.result, store.format);
				return (yield* this.#git(store.path, store.cwd, [
					"diff",
					"--no-ext-diff",
					"--no-textconv",
					operation.base,
					operation.result,
					"--",
				])).toString("utf8");
			}
			if (operation.type === "resolve") {
				this.#checkOid(operation.commit, store.format);
				yield* this.#git(store.path, store.cwd, [
					"fetch",
					"--no-tags",
					"--no-write-fetch-head",
					"--no-recurse-submodules",
					"--",
					this.#repositories[repository]!,
					operation.commit,
				]);
				const source = yield* this.#read(repository, operation.commit);
				yield* this.#rootSource(source);
				return source;
			}
			const { base, capture } = operation;
			yield* this.#verifySource(base);
			if (capture.freeze.running !== false || capture.freeze.runtime.length < 1)
				throw new Error("Source capture has no confirmed whole-container freeze.");
			validateEntries(capture.entries, store.format);
			// No worker interpretation: literal blobs and NUL-delimited trees, in a private empty cwd.
			for (const entry of capture.entries) {
				const hash = (yield* this.#git(
					store.path,
					store.cwd,
					["hash-object", "-w", "--no-filters", "--stdin"],
					Buffer.from(entry.content, "base64"),
				))
					.toString()
					.trim();
				if (hash !== entry.oid) throw new Error("Constructed source blob mismatch.");
			}
			const tree = yield* this.#writeTree(store, capture.entries);
			const commit = (yield* this.#git(
				store.path,
				store.cwd,
				["commit-tree", tree, "-p", base.commit],
				Buffer.from(`Render literal source\n${JSON.stringify(capture.freeze.scope)}\n`),
			))
				.toString()
				.trim();
			const source = yield* this.#read(repository, commit);
			yield* fromPromise(() => faultBarrier("before-source-root", "owned-source"));
			yield* this.#rootSource(source);
			yield* fromPromise(() => faultBarrier("after-source-root", "owned-source"));
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
				durability: { git: (yield* this.#git(store.path, store.cwd, ["--version"])).toString().trim(), fsync: "all", method: "fsync" },
			} satisfies SourceReceipt;
		}).pipe(Effect.uninterruptible);
	}
	reconcile(receipt: SourceReceipt): Promise<SourceReceipt>;
	reconcile(receipt: PreparationReceipt): Promise<PreparationReceipt>;
	reconcile(operation: ReconcileIntegration): Promise<CanonicalObservation>;
	reconcile(operation: ReconcilePublication): Promise<ForgeSnapshot>;
	reconcile(receipt: Reconciliation): Promise<Reconciled> {
		return runPromise(this.reconcileEffect(receipt));
	}
	reconcileEffect(receipt: SourceReceipt): Effect.Effect<SourceReceipt, unknown>;
	reconcileEffect(receipt: PreparationReceipt): Effect.Effect<PreparationReceipt, unknown>;
	reconcileEffect(operation: ReconcileIntegration): Effect.Effect<CanonicalObservation, unknown>;
	reconcileEffect(operation: ReconcilePublication): Effect.Effect<ForgeSnapshot, unknown>;
	reconcileEffect(receipt: Reconciliation): Effect.Effect<Reconciled, unknown>;
	reconcileEffect(
		receipt: SourceReceipt | PreparationReceipt | ReconcileIntegration | ReconcilePublication,
	): Effect.Effect<SourceReceipt | PreparationReceipt | CanonicalObservation | ForgeSnapshot, unknown> {
		return Effect.gen({ self: this }, function* () {
			if ("type" in receipt && receipt.type === "publication")
				return yield* (yield* this.#forgeFor(receipt.repository)).observeEffect(receipt.proposal);
			if ("type" in receipt) return yield* this.#canonical(receipt.repository, receipt.proposal);
			yield* this.#verifySource(receipt.base);
			yield* this.#verifySource(receipt.source);
			if ("algorithm" in receipt) {
				yield* this.#verifySource(receipt.target);
				yield* this.#verifySource(receipt.result);
				const actual = yield* this.#prepare({ type: "prepare", base: receipt.base, source: receipt.source, target: receipt.target });
				if (JSON.stringify(actual) !== JSON.stringify(receipt)) throw new Error("Preparation receipt mismatch.");
			}
			return receipt;
		}).pipe(Effect.uninterruptible);
	}
	#forgeFor(repository: string): Effect.Effect<GitHubForge, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (!this.#forge) throw new Error("forge_capability_unavailable: no trusted forge configuration");
			const store = yield* fromPromise(() => this.#store(repository));
			return new GitHubForge(this.#forge, repository, async (args, env) => {
				const result = await this.#gitResult(store.path, store.cwd, args, undefined, env);
				return { stdout: result.stdout.toString("utf8"), exitCode: result.signal ? null : result.exitCode };
			});
		});
	}
	#dispatchForge(operation: Publish | CreateProposal | UpdateSummary | MarkReady): Effect.Effect<ForgeDispatch, unknown> {
		return Effect.gen({ self: this }, function* () {
			const forge = yield* this.#forgeFor(operation.repository);
			if (operation.type === "publish") {
				const store = yield* fromPromise(() => this.#store(operation.repository));
				this.#checkOid(operation.commit, store.format);
				// Only host-sealed source is published: the commit must already be rooted in the private store.
				const root = yield* fromPromise(() =>
					this.#gitResult(store.path, store.cwd, ["rev-parse", "--verify", "--quiet", `refs/render/sources/${operation.commit}`]),
				);
				if (root.stdout.toString().trim() !== operation.commit) throw new Error("Publish only rooted host source.");
			}
			if (this.#consumed.has(operation.attempt)) throw new Error(`Forge permit ${operation.attempt} was already consumed.`);
			this.#consumed.add(operation.attempt);
			if (operation.type === "publish")
				return yield* forge.applyEffect({
					type: "publishSource",
					proposal: operation.proposal,
					commit: operation.commit,
					expected: operation.expected,
				});
			if (operation.type === "createProposal")
				return yield* forge.applyEffect({
					type: "createDraftProposal",
					proposal: operation.proposal,
					title: operation.title,
					body: operation.body,
				});
			if (operation.type === "markReady")
				return yield* forge.applyEffect({ type: "markProposalReady", proposal: operation.proposal, pr: operation.pr });
			return yield* forge.applyEffect({
				type: "updateProposalSummary",
				proposal: operation.proposal,
				pr: operation.pr,
				summary: operation.summary,
			});
		});
	}
	#squash({ prepared, target, message }: Squash): Effect.Effect<Source, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (prepared.repository !== target.repository) throw new Error("Integration repository mismatch.");
			yield* this.#verifySource(prepared);
			yield* this.#verifySource(target);
			const store = yield* fromPromise(() => this.#store(target.repository));
			// The fixed Render identity and date in every trusted Git call make R a pure function of X's tree, T and message.
			const commit = (yield* this.#git(store.path, store.cwd, ["commit-tree", prepared.tree, "-p", target.commit], Buffer.from(message)))
				.toString()
				.trim();
			const result = yield* this.#read(target.repository, commit);
			yield* this.#rootSource(result);
			return result;
		});
	}
	/**
	 * The expected-old canonical-ref CAS T→R under the host's exclusive store ownership, as one `update-ref --stdin`
	 * transaction. Commit is sent only after Git reports `prepare: ok` (ref locked, old value verified); if this process
	 * dies before that, Git aborts the transaction at end of input. A prepare failure is a definite refusal; any failure
	 * after commit is sent is uncertain and thrown, for the caller to reconcile.
	 */
	#integrate({ repository, proposal, expected, result, attempt }: Integrate): Effect.Effect<IntegrationDispatch, unknown> {
		return Effect.gen({ self: this }, function* () {
			const store = yield* fromPromise(() => this.#store(repository));
			this.#checkOid(expected, store.format);
			yield* this.#verifySource(result);
			const parents = (yield* this.#git(store.path, store.cwd, ["rev-list", "--parents", "-n", "1", result.commit]))
				.toString()
				.trim()
				.split(" ");
			if (parents.length !== 2 || parents[1] !== expected)
				throw new Error("Integration result must be a single-parent commit on the expected target.");
			if (this.#consumed.has(attempt)) throw new Error(`Integration permit ${attempt} was already consumed.`);
			this.#consumed.add(attempt);
			const ref = canonicalRef(proposal);
			const dispatch = yield* fromPromise(() =>
				this.#transaction(store.path, store.cwd, `start\nupdate ${ref} ${result.commit} ${expected}\nprepare\n`),
			);
			yield* fromPromise(() => faultBarrier("after-integration-cas", `integration:${proposal}`));
			const observed = yield* this.#canonical(repository, proposal);
			yield* fromPromise(() => faultBarrier("after-integration-readback", `integration:${proposal}`));
			return { ...observed, dispatch };
		});
	}
	/** Every observation, dispatch readback or reconciliation, follows a durability barrier: a failed fsync reports nothing. */
	#canonical(repository: string, proposal: string): Effect.Effect<CanonicalObservation, unknown> {
		return Effect.gen({ self: this }, function* () {
			const store = yield* fromPromise(() => this.#store(repository));
			const ref = canonicalRef(proposal);
			let lock = false;
			for (const path of [join(store.path, `${ref}.lock`), join(store.path, "packed-refs.lock")]) {
				const held = yield* fromPromise(() => stat(path).catch(() => undefined));
				// Only this host's Effects writes private Git: a lock untouched since before this executor began was left by a
				// dead one and is removed. A newer lock may belong to a live writer, so the outcome stays unknown.
				if (held && held.mtimeMs < this.#started) yield* fromPromise(() => rm(path));
				else if (held) lock = true;
			}
			yield* syncTree(store.path);
			const current = yield* fromPromise(() => this.#gitResult(store.path, store.cwd, ["rev-parse", "--verify", "--quiet", ref]));
			if (current.signal || (current.exitCode !== 0 && current.exitCode !== 1)) throw gitFailure("rev-parse", current);
			if (current.exitCode === 1) return { ref, observed: null, lock };
			const commit = current.stdout.toString().trim();
			const [, ...parents] = (yield* this.#git(store.path, store.cwd, ["rev-list", "--parents", "-n", "1", commit]))
				.toString()
				.trim()
				.split(" ");
			const tree = (yield* this.#git(store.path, store.cwd, ["rev-parse", "--verify", `${commit}^{tree}`])).toString().trim();
			return { ref, observed: { commit, tree, parents }, lock };
		});
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
	#observe({ repository, proposal, initial }: Observe): Effect.Effect<TargetObservation, unknown> {
		return Effect.gen({ self: this }, function* () {
			const store = yield* fromPromise(() => this.#store(repository));
			const ref = canonicalRef(proposal);
			const current = yield* fromPromise(() => this.#gitResult(store.path, store.cwd, ["rev-parse", "--verify", "--quiet", ref]));
			if (current.signal || (current.exitCode !== 0 && current.exitCode !== 1)) throw gitFailure("rev-parse", current);
			if (current.exitCode === 1) {
				// First use binds the proposal to the host-configured base, expected-absent. A failed create means another
				// binding won: the readback below decides, and nothing ever rebinds an existing ref.
				const base = yield* this.performEffect({ type: "resolve", repository, commit: initial });
				const created = yield* fromPromise(() =>
					this.#gitResult(store.path, store.cwd, ["update-ref", ref, base.commit, "0".repeat(base.commit.length)]),
				);
				if (created.signal) throw gitFailure("update-ref", created);
				yield* syncTree(store.path);
			}
			const commit = (yield* this.#git(store.path, store.cwd, ["rev-parse", "--verify", ref])).toString().trim();
			this.#checkOid(commit, store.format);
			if ((yield* this.#git(store.path, store.cwd, ["cat-file", "-t", commit])).toString().trim() !== "commit")
				throw new Error("Canonical proposal ref must name a commit.");
			const target = yield* this.#read(repository, commit);
			yield* this.#rootSource(target);
			return { proposal, ref, target };
		});
	}
	#prepare({ base, source, target }: Prepare): Effect.Effect<PreparationReceipt, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (base.repository !== source.repository || base.repository !== target.repository)
				throw new Error("Preparation repository mismatch.");
			for (const input of [base, source, target]) yield* this.#verifySource(input);
			const store = yield* fromPromise(() => this.#store(source.repository));
			const ancestor = (a: string, b: string): Effect.Effect<boolean, unknown> =>
				Effect.gen({ self: this }, function* () {
					const result = yield* fromPromise(() => this.#gitResult(store.path, store.cwd, ["merge-base", "--is-ancestor", a, b]));
					if (result.signal || (result.exitCode !== 0 && result.exitCode !== 1)) throw gitFailure("merge-base", result);
					return result.exitCode === 0;
				});
			if (!(yield* ancestor(base.commit, source.commit)) || !(yield* ancestor(base.commit, target.commit)))
				throw new Error("Recorded base must be an ancestor of both B and target.");
			const algorithm = "git-merge-tree-write-tree-z/v1" as const;
			const git = (yield* this.#git(store.path, store.cwd, ["--version"])).toString().trim();
			const identity = createHash("sha256")
				.update(JSON.stringify([source.repository, base.commit, source.commit, target.commit, algorithm, PROFILE, git]))
				.digest("hex");
			if (yield* ancestor(target.commit, source.commit))
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
			const raw = yield* fromPromise(() =>
				this.#gitResult(store.path, store.cwd, ["merge-tree", "--write-tree", "--messages", "-z", source.commit, target.commit]),
			);
			if (raw.signal || (raw.exitCode !== 0 && raw.exitCode !== 1)) throw gitFailure("merge-tree", raw);
			const exitCode = raw.exitCode;
			const parsed = yield* Effect.gen({ self: this }, function* () {
				const parsed = parseMergeResult(raw.stdout, exitCode, store.format);
				if ((yield* this.#git(store.path, store.cwd, ["cat-file", "-t", parsed.tree])).toString().trim() !== "tree")
					throw new Error("Preparation result is not a tree.");
				return parsed;
			}).pipe(
				Effect.catchCause((cause) =>
					Effect.fail(new Error(`Operational merge-tree result: ${Cause.squash(cause)}; stderr: ${raw.stderr.toString("utf8")}`)),
				),
			);
			const commit = (yield* this.#git(
				store.path,
				store.cwd,
				["commit-tree", parsed.tree, "-p", source.commit, "-p", target.commit],
				Buffer.from(`Render preparation ${identity}\n`),
			))
				.toString()
				.trim();
			const result = yield* this.#read(source.repository, commit);
			yield* this.#rootSource(result);
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
		});
	}
	#verifySource(source: Source): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			const store = yield* fromPromise(() => this.#store(source.repository));
			this.#checkOid(source.commit, store.format);
			if (source.objectFormat !== store.format || source.root !== `refs/render/sources/${source.commit}`)
				throw new Error("Source root identity mismatch.");
			const root = (yield* this.#git(store.path, store.cwd, ["rev-parse", "--verify", source.root])).toString().trim();
			const actual = yield* this.#read(source.repository, source.commit);
			if (root !== source.commit || JSON.stringify(actual) !== JSON.stringify(source))
				throw new Error("Retained source/root mismatch; restore exact source objects.");
		});
	}
	#read(repository: string, commit: string): Effect.Effect<Source, unknown> {
		return Effect.gen({ self: this }, function* () {
			const store = yield* fromPromise(() => this.#store(repository));
			const exact = (yield* this.#git(store.path, store.cwd, ["rev-parse", "--verify", `${commit}^{commit}`])).toString().trim();
			if (exact !== commit) throw new Error("Exact source commit required.");
			const tree = (yield* this.#git(store.path, store.cwd, ["rev-parse", "--verify", `${commit}^{tree}`])).toString().trim();
			const listing = yield* this.#git(store.path, store.cwd, ["ls-tree", "-r", "-z", "--full-tree", commit]);
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
				const size = Number((yield* this.#git(store.path, store.cwd, ["cat-file", "-s", hash])).toString());
				bytes += size;
				if (bytes > MAX_BYTES || entries.length >= MAX_ENTRIES) throw new Error("Source bytes/entries bound exceeded.");
				const content = yield* this.#git(store.path, store.cwd, ["cat-file", "blob", hash]);
				entries.push({ path, mode, oid: hash, content: content.toString("base64") });
			}
			entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
			validateEntries(entries, store.format);
			return { repository, objectFormat: store.format, commit, tree, root: `refs/render/sources/${commit}`, entries };
		});
	}
	#writeTree(store: { path: string; cwd: string }, entries: LiteralEntry[], prefix = ""): Effect.Effect<string, unknown> {
		return Effect.gen({ self: this }, function* () {
			// Debt: immediate-child grouping duplicates treeOid; share grouping without coupling independent Git fixture oracles.
			const children = new Map<string, LiteralEntry[]>();
			for (const entry of entries) {
				const name = entry.path.slice(prefix.length).split("/")[0]!;
				children.set(name, [...(children.get(name) ?? []), entry]);
			}
			const records: Buffer[] = [];
			for (const [name, group] of children) {
				const leaf = group.length === 1 && group[0]!.path === `${prefix}${name}` ? group[0]! : undefined;
				const hash = leaf ? leaf.oid : yield* this.#writeTree(store, group, `${prefix}${name}/`);
				records.push(Buffer.from(`${leaf?.mode ?? "040000"} ${leaf ? "blob" : "tree"} ${hash}\t${name}\0`));
			}
			return (yield* this.#git(store.path, store.cwd, ["mktree", "-z"], Buffer.concat(records))).toString().trim();
		});
	}
	#rootSource(source: Source): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			const store = yield* fromPromise(() => this.#store(source.repository));
			yield* this.#git(store.path, store.cwd, ["fsck", "--strict", "--no-reflogs", source.commit]);
			yield* this.#git(store.path, store.cwd, ["update-ref", source.root, source.commit]);
			yield* syncTree(store.path);
		});
	}
	#store(repository: string): Promise<{ path: string; cwd: string; format: Source["objectFormat"] }> {
		if (!Object.hasOwn(this.#repositories, repository)) throw new Error("Repository is not trusted/registered.");
		let pending = this.#stores.get(repository);
		if (!pending) {
			pending = runPromise(this.#initializeStore(repository));
			this.#stores.set(repository, pending);
		}
		return pending;
	}
	#initializeStore(repository: string): Effect.Effect<{ path: string; cwd: string; format: Source["objectFormat"] }, unknown> {
		return Effect.gen({ self: this }, function* () {
			const dir = join(this.#root, createHash("sha256").update(repository).digest("hex"));
			const cwd = join(dir, "empty");
			const path = join(dir, "source.git");
			const created = yield* fromPromise(() => mkdir(cwd, { recursive: true, mode: 0o700 }));
			const version = (yield* this.#git(path, cwd, ["--version"])).toString();
			const parsed = /git version (\d+)\.(\d+)/.exec(version);
			if (!parsed || Number(parsed[1]) < 2 || (Number(parsed[1]) === 2 && Number(parsed[2]) < 43))
				throw new Error("Source durability requires Git 2.43+ with fsync=all/fsyncMethod=fsync.");
			const upstream = this.#repositories[repository]!;
			if ((yield* this.#git(upstream, cwd, ["rev-parse", "--is-bare-repository"])).toString().trim() !== "true")
				throw new Error("Trusted source must be a private bare repository, not a linked worktree.");
			const format = (yield* this.#git(upstream, cwd, ["rev-parse", "--show-object-format"])).toString().trim();
			if (format !== "sha1" && format !== "sha256") throw new Error("Unsupported source object format.");
			yield* this.#git(path, cwd, ["init", "--bare", `--object-format=${format}`, path]);
			const until = dirname(created ?? dir);
			for (let current = dir; ; current = dirname(current)) {
				const directory = yield* fromPromise(() => open(current, "r"));
				const synced = yield* Effect.exit(fromPromise(() => directory.sync()));
				yield* fromPromise(() => directory.close());
				yield* synced;
				if (current === until || current === dirname(current)) break;
			}
			return { path, cwd, format };
		});
	}
	#checkOid(value: string, format: Source["objectFormat"]): void {
		if (!(format === "sha1" ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/).test(value)) throw new Error("Exact source commit/object ID required.");
	}
	#git(path: string, cwd: string, args: string[], input?: Buffer): Effect.Effect<Buffer, unknown> {
		return Effect.gen({ self: this }, function* () {
			const result = yield* fromPromise(() => this.#gitResult(path, cwd, args, input));
			if (result.exitCode !== 0 || result.signal) throw gitFailure(args[0]!, result);
			return result.stdout;
		});
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
	#gitResult(path: string, cwd: string, args: string[], input?: Buffer, env: Record<string, string> = {}): Promise<GitResult> {
		return new Promise((resolve, reject) => {
			const child = execFile(
				"git",
				[...this.#gitArgs(path), ...args],
				{ cwd, maxBuffer: MAX_BYTES + 1024 * 1024, encoding: "buffer", timeout: 60000, env: { ...GIT_ENV(cwd), ...env } },
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

function syncTree(path: string): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		for (const entry of yield* fromPromise(() => readdir(path, { withFileTypes: true }))) {
			const child = join(path, entry.name);
			if (entry.isDirectory()) yield* syncTree(child);
			else if (entry.isFile()) {
				const file = yield* fromPromise(() => open(child, "r"));
				const synced = yield* Effect.exit(fromPromise(() => file.sync()));
				yield* fromPromise(() => file.close());
				yield* synced;
			} else throw new Error("Unsupported private Git storage entry.");
		}
		const dir = yield* fromPromise(() => open(path, "r"));
		const synced = yield* Effect.exit(fromPromise(() => dir.sync()));
		yield* fromPromise(() => dir.close());
		yield* synced;
	});
}
