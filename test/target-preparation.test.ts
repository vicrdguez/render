import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { Effects, type Source } from "../src/effects/source.ts";
import { selectCatalog } from "../src/engine/catalog.ts";
import { git, gitSourceFixture } from "./support/source.ts";

function commit(repo: string, files: Record<string, string>, parents: string[] = []): string {
	const records = Object.entries(files).map(([path, text]) => {
		const blob = git(repo, ["hash-object", "-w", "--stdin"], text).toString().trim();
		return `100644 blob ${blob}\t${path}\0`;
	});
	const tree = git(repo, ["mktree", "-z"], records.join("")).toString().trim();
	return git(repo, ["commit-tree", tree, ...parents.flatMap((p) => ["-p", p])], "Preparation fixture\n")
		.toString()
		.trim();
}
async function fixture() {
	const f = await gitSourceFixture({ common: { text: "base\n" } });
	const resolve = (oid: string) => f.effects.perform({ type: "resolve", repository: "owned", commit: oid });
	const base = await resolve(f.commit);
	const source = await resolve(commit(f.repo, { common: "base\n", implementation: "B\n" }, [f.commit]));
	const target = await resolve(commit(f.repo, { common: "base\n", target: "T1\n" }, [f.commit]));
	return { ...f, resolve, base, source, target };
}

test("preparation roots deterministic combined source and preserves exact B/T0/T1 provenance across reopening", async () => {
	const f = await fixture();
	try {
		const operation = { type: "prepare" as const, base: f.base, source: f.source, target: f.target };
		const result = await f.effects.perform(operation);
		assert.equal(result.kind, "clean");
		assert.deepEqual(result.base, f.base);
		assert.deepEqual(result.source, f.source);
		assert.deepEqual(result.target, f.target);
		assert.deepEqual(
			result.result.entries.map((e) => [e.path, Buffer.from(e.content, "base64").toString()]),
			[
				["common", "base\n"],
				["implementation", "B\n"],
				["target", "T1\n"],
			],
		);
		assert.equal(result.algorithm, "git-merge-tree-write-tree-z/v1");
		assert.match(result.git, /^git version /);
		assert.equal(result.exitCode, 0);
		const reopened = new Effects({ root: join(f.root, "effects"), repositories: { owned: f.repo } });
		assert.deepEqual(await reopened.perform(operation), result);
		assert.deepEqual(await reopened.reconcile(result), result, "reconcile verifies rooted output, not only input refs");
	} finally {
		await f.close();
	}
});

test("ancestry fast path still rejects forged base, rewritten target and changed retained bytes", async () => {
	const f = await fixture();
	try {
		const source = await f.resolve(commit(f.repo, { common: "base\n", target: "T1\n", implementation: "B\n" }, [f.target.commit]));
		const operation = { type: "prepare" as const, base: f.base, source, target: f.target };
		assert.equal((await f.effects.perform(operation)).result.commit, source.commit);
		const unrelated = await f.resolve(commit(f.repo, { other: "unrelated\n" }));
		await assert.rejects(f.effects.perform({ ...operation, base: unrelated }), /base.*ancestor/i);
		await assert.rejects(f.effects.perform({ ...operation, target: unrelated }), /base.*ancestor/i);
		await assert.rejects(f.effects.perform({ ...operation, source: { ...source, entries: [] } }), /mismatch/i);
		await assert.rejects(f.effects.perform({ ...operation, target: { ...f.target, objectFormat: "sha256" } }), /mismatch/i);
	} finally {
		await f.close();
	}
});

test("validated real conflicts retain originals and a rooted conflict tree, never a clean classification", async () => {
	const f = await fixture();
	try {
		const source = await f.resolve(commit(f.repo, { common: "implementation\n" }, [f.commit]));
		const target = await f.resolve(commit(f.repo, { common: "target\n" }, [f.commit]));
		const before = JSON.stringify({ source, target });
		const result = await f.effects.perform({ type: "prepare", base: f.base, source, target });
		assert.equal(result.kind, "conflict");
		assert.equal(result.exitCode, 1);
		assert.deepEqual(result.conflicts, ["common"]);
		assert.equal(JSON.stringify({ source, target }), before);
		assert.ok(Buffer.from(result.stdout, "base64").includes(Buffer.from("CONFLICT")));
		assert.deepEqual(await f.effects.reconcile(result), result);
	} finally {
		await f.close();
	}
});

test("blob or missing inputs are operational errors, not conflict returns", async () => {
	const f = await fixture();
	try {
		const operation = { type: "prepare" as const, base: f.base, source: f.source, target: f.target };
		const blob = git(f.repo, ["hash-object", "-w", "--stdin"], "not a commit").toString().trim();
		for (const hash of [blob, "f".repeat(40)]) {
			await assert.rejects(f.effects.perform({ ...operation, source: { ...f.source, commit: hash, root: `refs/render/sources/${hash}` } }));
		}
	} finally {
		await f.close();
	}
});

// Vary the actual executable process result, not an internal parser or Effects collaborator.
// All other Git commands continue through the real binary and retained fixture repository.
test("empty exit 1, truncated output, false-clean output and SIGABRT remain diagnostic operational failures", async () => {
	const f = await fixture();
	const path = process.env.PATH;
	const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
	try {
		const bin = join(f.root, "bin");
		await mkdir(bin);
		for (const [label, script, diagnostic] of [
			["empty conflict", "printf 'empty-result diagnostic' >&2; exit 1", /empty-result diagnostic/],
			["truncated", `printf '${f.source.tree}'; exit 0`, /framing/i],
			[
				"false clean",
				`printf '${f.source.tree}\\000\\0001\\000common\\000CONFLICT (contents)\\000conflict\\000'; exit 0`,
				/classification/i,
			],
			["abort", "printf 'abort diagnostic' >&2; kill -ABRT $$", /SIGABRT.*abort diagnostic/s],
		] as const) {
			await writeFile(
				join(bin, "git"),
				`#!/bin/sh\nfor arg do\n if [ "$arg" = merge-tree ]; then\n ${script}\n fi\ndone\nexec '${realGit}' "$@"\n`,
				{ mode: 0o700 },
			);
			process.env.PATH = `${bin}:${path}`;
			await assert.rejects(f.effects.perform({ type: "prepare", base: f.base, source: f.source, target: f.target }), diagnostic, label);
		}
	} finally {
		process.env.PATH = path;
		await f.close();
	}
});

const storeOf = (root: string) => join(root, "effects", createHash("sha256").update("owned").digest("hex"), "source.git");
const proposalRef = (proposal: string) => `refs/render/proposals/${createHash("sha256").update(proposal).digest("hex")}`;

test("canonical observation binds the host-private proposal ref once and follows only host ref updates", async () => {
	const f = await fixture();
	try {
		const observe = { type: "observe" as const, repository: "owned", proposal: "workflow:2", initial: f.commit };
		const first = await f.effects.perform(observe);
		assert.equal(first.proposal, "workflow:2");
		assert.equal(first.ref, proposalRef("workflow:2"));
		assert.deepEqual(first.target, f.base, "initial binding is the exact rooted host-configured base");
		const store = storeOf(f.root);
		assert.equal(git(store, ["rev-parse", first.ref]).toString().trim(), f.commit);
		assert.deepEqual((await f.effects.perform({ ...observe, initial: f.target.commit })).target, f.base, "no rebinding");
		git(f.repo, ["update-ref", "refs/heads/proposal/render", f.source.commit]);
		assert.deepEqual((await f.effects.perform(observe)).target, f.base, "an upstream/forge branch never becomes T");
		git(store, ["update-ref", first.ref, f.target.commit, f.commit]);
		assert.deepEqual((await f.effects.perform(observe)).target, f.target, "a host canonical update is observed");
		const other = await f.effects.perform({ ...observe, proposal: "workflow:3", initial: f.source.commit });
		assert.deepEqual(other.target, f.source, "each proposal has its own binding");
		const blob = git(store, ["hash-object", "-w", "--stdin"], "not a commit").toString().trim();
		git(store, ["update-ref", first.ref, blob]);
		await assert.rejects(f.effects.perform(observe), /commit/i);
		await assert.rejects(f.effects.perform({ ...observe, proposal: "workflow:4", initial: "f".repeat(40) }));
		assert.equal(git(store, ["for-each-ref", proposalRef("workflow:4")]).toString(), "", "unresolvable initial binds nothing");
	} finally {
		await f.close();
	}
});

test("a host-rooted prepared commit resolves without upstream fetch; unknown commits still refuse", async () => {
	const f = await fixture();
	try {
		const prepared = await f.effects.perform({ type: "prepare", base: f.base, source: f.source, target: f.target });
		assert.throws(() => git(f.repo, ["cat-file", "-e", prepared.result.commit]), "X exists only in host-private Git");
		assert.deepEqual(await f.resolve(prepared.result.commit), prepared.result);
		await assert.rejects(f.resolve("e".repeat(40)));
	} finally {
		await f.close();
	}
});

test("receipt identity binds the trusted Git profile and algorithm", async () => {
	const f = await fixture();
	try {
		const result = await f.effects.perform({ type: "prepare", base: f.base, source: f.source, target: f.target });
		assert.match(result.profile, /^render-trusted-git\/v1/);
		assert.equal(
			result.identity,
			createHash("sha256")
				.update(JSON.stringify(["owned", f.base.commit, f.source.commit, f.target.commit, result.algorithm, result.profile, result.git]))
				.digest("hex"),
		);
	} finally {
		await f.close();
	}
});

// TP09: each hostile default-attribute source alone must not turn a real conflict clean. The direct Git run proves the
// fixture really is hostile; the unsafe controls inherit exactly one variable and must be caught by these assertions.
async function hostileAttributes(variable: "HOME" | "XDG_CONFIG_HOME") {
	const f = await fixture();
	const saved = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME };
	try {
		const source = await f.resolve(commit(f.repo, { common: "implementation\n" }, [f.commit]));
		const target = await f.resolve(commit(f.repo, { common: "target\n" }, [f.commit]));
		const hostile = join(f.root, `hostile-${variable}`);
		const empty = join(f.root, "empty-home");
		const file = join(hostile, variable === "HOME" ? ".config/git/attributes" : "git/attributes");
		await mkdir(dirname(file), { recursive: true });
		await mkdir(empty, { recursive: true });
		await writeFile(file, "* merge=union\n");
		const env = variable === "HOME" ? { HOME: hostile } : { HOME: empty, XDG_CONFIG_HOME: hostile };
		const direct = spawnSync("git", ["--git-dir", f.repo, "merge-tree", "--write-tree", source.commit, target.commit], {
			env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", ...env },
		});
		assert.equal(direct.status, 0, "fixture sanity: the hostile default attributes union-merge this conflict in ordinary Git");
		process.env.HOME = env.HOME;
		if (env.XDG_CONFIG_HOME) process.env.XDG_CONFIG_HOME = env.XDG_CONFIG_HOME;
		else delete process.env.XDG_CONFIG_HOME;
		const result = await f.effects.perform({ type: "prepare", base: f.base, source, target });
		assert.equal(result.kind, "conflict", `${variable}-only hostile default attributes changed a real conflict`);
		assert.deepEqual(result.conflicts, ["common"]);
	} finally {
		for (const [key, value] of Object.entries(saved))
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		await f.close();
	}
}
test("HOME-only hostile default attributes cannot turn a real conflict clean", () => hostileAttributes("HOME"));
test("XDG-only hostile default attributes cannot turn a real conflict clean", () => hostileAttributes("XDG_CONFIG_HOME"));

test("TP26: the repository's target-preparation catalog row is selectable and executable through the product verifier", async () => {
	const path = ".render/verify.md";
	const bytes = await readFile(join(import.meta.dirname, "..", path));
	const commit = "a".repeat(40);
	const source = {
		repository: "render",
		objectFormat: "sha1",
		commit,
		tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
		root: "refs/render/source/literal",
		entries: [{ path, mode: "100644", content: bytes.toString("base64") }],
	} as unknown as Source;
	const rows = ["target-preparation", "full-suite", "typecheck", "lint"];
	const catalog = selectCatalog(source, {
		repository: "render",
		commit,
		path,
		digest: createHash("sha256").update(bytes).digest("hex"),
		contract: "contract:render",
		rows,
		behavioralRows: ["target-preparation"],
		receipts: [],
	});
	assert.deepEqual(
		catalog.rows.map((r) => r.name),
		rows,
	);
	const row = catalog.rows[0]!;
	assert.deepEqual([row.kind, row.run, row.rank], ["executed", "npm run verify:target-preparation", "tests"]);
	for (const required of catalog.rows)
		assert.ok(
			["executed", "journey"].includes(required.kind) && catalog.ranks.includes(required.rank ?? ""),
			`${required.name} can prove behavior by definition`,
		);
});
