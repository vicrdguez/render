import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Effects } from "../src/effects/source.ts";
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
