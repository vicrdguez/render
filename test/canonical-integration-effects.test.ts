// CI08–CI10 and the Effects half of CI13/CI14 on real private Git: squash construction, expected-old CAS, readback and
// read-only reconciliation. No Ledger here; the Kernel classification of these observations is canonical-integration.test.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { Effects } from "../src/effects/source.ts";
import { git, gitSourceFixture } from "./support/source.ts";

const PROPOSAL = "workflow:2";
const REF = `refs/render/proposals/${createHash("sha256").update(PROPOSAL).digest("hex")}`;
function commit(repo: string, files: Record<string, string>, parents: string[] = []): string {
	const records = Object.entries(files).map(([path, text]) => {
		const blob = git(repo, ["hash-object", "-w", "--stdin"], text).toString().trim();
		return `100644 blob ${blob}\t${path}\0`;
	});
	const tree = git(repo, ["mktree", "-z"], records.join("")).toString().trim();
	return git(repo, ["commit-tree", tree, ...parents.flatMap((p) => ["-p", p])], "Integration fixture\n")
		.toString()
		.trim();
}
/** Canonical T (the bound base), B on T0, and prepared X merging B with T, all rooted by Effects. */
async function fixture() {
	const f = await gitSourceFixture({ common: { text: "base\n" } });
	const resolve = (oid: string) => f.effects.perform({ type: "resolve", repository: "owned", commit: oid });
	const observed = await f.effects.perform({ type: "observe", repository: "owned", proposal: PROPOSAL, initial: f.commit });
	const T = observed.target;
	const B = await resolve(commit(f.repo, { common: "base\n", implementation: "B\n" }, [f.commit]));
	const prepared = await f.effects.perform({ type: "prepare", base: T, source: B, target: T });
	const store = join(f.root, "effects", createHash("sha256").update("owned").digest("hex"), "source.git");
	return { ...f, resolve, T, B, X: prepared.result, store };
}
const MESSAGE = "Render proposal integration\npass pass:workflow:2:value:1\n";

test("CI08 squash R is exactly X's tree on parent T with fixed metadata; CAS moves T→R with exact readback and rooting", async () => {
	const f = await fixture();
	try {
		const R = await f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE });
		assert.equal(R.tree, f.X.tree, "R's tree is exactly prepared X's tree");
		assert.equal(git(f.store, ["rev-list", "--parents", "-n", "1", R.commit]).toString().trim(), `${R.commit} ${f.T.commit}`);
		assert.equal(git(f.store, ["log", "-1", "--format=%B", R.commit]).toString(), `${MESSAGE}\n`);
		assert.equal(
			git(f.store, ["rev-parse", `refs/render/sources/${R.commit}`])
				.toString()
				.trim(),
			R.commit,
			"R is rooted",
		);
		const again = await f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE });
		assert.equal(again.commit, R.commit, "fixed metadata: the same inputs construct the same R");
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), f.T.commit, "constructing R changes no canonical ref");
		const result = await f.effects.perform({
			type: "integrate",
			repository: "owned",
			proposal: PROPOSAL,
			expected: f.T.commit,
			result: R,
			attempt: "integration-attempt:1",
		});
		assert.deepEqual(result, {
			ref: REF,
			dispatch: "applied",
			observed: { commit: R.commit, tree: f.X.tree, parents: [f.T.commit] },
			lock: false,
		});
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), R.commit);
		git(f.store, ["fsck", "--strict", "--no-reflogs", R.commit]);
		assert.deepEqual(await f.effects.reconcile({ type: "integration", repository: "owned", proposal: PROPOSAL }), {
			ref: REF,
			observed: { commit: R.commit, tree: f.X.tree, parents: [f.T.commit] },
			lock: false,
		});
	} finally {
		await f.close();
	}
});

test("CI09 a moved target refuses the stale CAS and keeps the moved ref", async () => {
	const f = await fixture();
	try {
		const R = await f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE });
		const moved = commit(f.store, { common: "moved\n" }, [f.T.commit]);
		git(f.store, ["update-ref", REF, moved, f.T.commit]);
		const result = await f.effects.perform({
			type: "integrate",
			repository: "owned",
			proposal: PROPOSAL,
			expected: f.T.commit,
			result: R,
			attempt: "integration-attempt:1",
		});
		assert.equal(result.dispatch, "refused");
		assert.equal(result.observed?.commit, moved);
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), moved, "the stale update never lands");
	} finally {
		await f.close();
	}
});

test("CI10 Effects refuses a result that is not exactly a single-parent commit on T, and a second dispatch of one attempt", async () => {
	const f = await fixture();
	try {
		const R = await f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE });
		const integrate = (over: Record<string, unknown>) =>
			f.effects.perform({
				type: "integrate",
				repository: "owned",
				proposal: PROPOSAL,
				expected: f.T.commit,
				result: R,
				attempt: "integration-attempt:1",
				...over,
			} as Parameters<Effects["perform"]>[0] & { type: "integrate" });
		// X itself has two parents (B and T): it is never what the canonical ref receives.
		await assert.rejects(integrate({ result: f.X }), /parent/i);
		await assert.rejects(integrate({ expected: f.B.commit }), /parent/i);
		await assert.rejects(integrate({ result: { ...R, tree: f.B.tree } }), /mismatch/i);
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), f.T.commit, "refusals change nothing");
		assert.equal((await integrate({ attempt: "integration-attempt:2" })).dispatch, "applied");
		await assert.rejects(integrate({ attempt: "integration-attempt:2" }), /consumed/i, "one permit, one dispatch");
		const reopened = new Effects({ root: join(f.root, "effects"), repositories: { owned: f.repo } });
		const replay = await reopened.perform({
			type: "integrate",
			repository: "owned",
			proposal: PROPOSAL,
			expected: f.T.commit,
			result: R,
			attempt: "integration-attempt:3",
		});
		assert.equal(replay.dispatch, "refused", "even a new process cannot apply T→R again once the ref moved");
	} finally {
		await f.close();
	}
});

test("CI13/CI14 reconciliation only reads: T, another commit and a held ref lock are reported exactly", async () => {
	const f = await fixture();
	try {
		const reconcile = () => f.effects.reconcile({ type: "integration", repository: "owned", proposal: PROPOSAL });
		const parents = (oid: string) => git(f.store, ["rev-list", "--parents", "-n", "1", oid]).toString().trim().split(" ").slice(1);
		assert.deepEqual(await reconcile(), {
			ref: REF,
			observed: { commit: f.T.commit, tree: f.T.tree, parents: parents(f.T.commit) },
			lock: false,
		});
		const other = commit(f.store, { common: "other\n" }, [f.T.commit]);
		git(f.store, ["update-ref", REF, other, f.T.commit]);
		assert.equal((await reconcile()).observed?.commit, other);
		await writeFile(join(f.store, `${REF}.lock`), `${f.T.commit}\n`);
		const locked = await reconcile();
		assert.equal(locked.lock, true, "a held ref lock means a writer may still be finishing");
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), other, "reconciliation never rolls back or rewrites");
	} finally {
		await f.close();
	}
});
