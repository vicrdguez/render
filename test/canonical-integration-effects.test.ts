// CI08–CI10, CI23, CI25 and the Effects half of CI13/CI14 on real private Git: squash construction, expected-old CAS,
// durable readback and reconciliation that never rewrites the ref. No Ledger here; the Kernel classification of these observations is canonical-integration.test.ts.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { access, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import * as Effect from "effect/Effect";
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
/** Canonical T (another Slice's integration on the bound base T0), B on T0, and prepared X merging B with T. */
async function fixture() {
	const f = await gitSourceFixture({ common: { text: "base\n" } });
	const resolve = (oid: string) => Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: oid }));
	const T0 = (await Effect.runPromise(f.effects.perform({ type: "observe", repository: "owned", proposal: PROPOSAL, initial: f.commit })))
		.target;
	const store = join(f.root, "effects", createHash("sha256").update("owned").digest("hex"), "source.git");
	const T1 = await resolve(commit(f.repo, { common: "base\n", target: "T1\n" }, [f.commit]));
	git(store, ["update-ref", REF, T1.commit, T0.commit]);
	const T = (await Effect.runPromise(f.effects.perform({ type: "observe", repository: "owned", proposal: PROPOSAL, initial: f.commit })))
		.target;
	assert.equal(T.commit, T1.commit);
	const B = await resolve(commit(f.repo, { common: "base\n", implementation: "B\n" }, [f.commit]));
	const prepared = await Effect.runPromise(f.effects.perform({ type: "prepare", base: T0, source: B, target: T }));
	assert.equal(prepared.kind, "clean");
	return { ...f, resolve, T, B, X: prepared.result, store };
}
const MESSAGE = "Render proposal integration\npass pass:workflow:2:value:1\n";

test("CI08 squash R is exactly X's tree on parent T with fixed metadata; CAS moves T→R with exact readback and rooting", async () => {
	const f = await fixture();
	try {
		const R = await Effect.runPromise(f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE }));
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
		const again = await Effect.runPromise(f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE }));
		assert.equal(again.commit, R.commit, "fixed metadata: the same inputs construct the same R");
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), f.T.commit, "constructing R changes no canonical ref");
		const result = await Effect.runPromise(
			f.effects.perform({
				type: "integrate",
				repository: "owned",
				proposal: PROPOSAL,
				expected: f.T.commit,
				result: R,
				attempt: "integration-attempt:1",
			}),
		);
		assert.deepEqual(result, {
			ref: REF,
			dispatch: "applied",
			observed: { commit: R.commit, tree: f.X.tree, parents: [f.T.commit] },
			lock: false,
		});
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), R.commit);
		git(f.store, ["fsck", "--strict", "--no-reflogs", R.commit]);
		assert.deepEqual(await Effect.runPromise(f.effects.reconcile({ type: "integration", repository: "owned", proposal: PROPOSAL })), {
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
		const R = await Effect.runPromise(f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE }));
		const moved = commit(f.store, { common: "moved\n" }, [f.T.commit]);
		git(f.store, ["update-ref", REF, moved, f.T.commit]);
		const result = await Effect.runPromise(
			f.effects.perform({
				type: "integrate",
				repository: "owned",
				proposal: PROPOSAL,
				expected: f.T.commit,
				result: R,
				attempt: "integration-attempt:1",
			}),
		);
		assert.equal(result.dispatch, "refused", "a moved target refuses the stale CAS");
		assert.equal(result.observed?.commit, moved);
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), moved, "the stale update never lands");
	} finally {
		await f.close();
	}
});

test("CI10 Effects refuses a result that is not exactly a single-parent commit on T, and a second dispatch of one attempt", async () => {
	const f = await fixture();
	try {
		const R = await Effect.runPromise(f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE }));
		const integrate = (over: Record<string, unknown>) =>
			Effect.runPromise(
				f.effects.perform({
					type: "integrate",
					repository: "owned",
					proposal: PROPOSAL,
					expected: f.T.commit,
					result: R,
					attempt: "integration-attempt:1",
					...over,
				} as Parameters<Effects["perform"]>[0] & { type: "integrate" }),
			);
		// X itself has two parents (B and T): it is never what the canonical ref receives.
		await assert.rejects(integrate({ result: f.X }), /parent/i);
		await assert.rejects(integrate({ expected: f.B.commit }), /parent/i);
		await assert.rejects(integrate({ result: { ...R, tree: f.B.tree } }), /mismatch/i);
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), f.T.commit, "refusals change nothing");
		assert.equal((await integrate({ attempt: "integration-attempt:2" })).dispatch, "applied");
		await assert.rejects(integrate({ attempt: "integration-attempt:2" }), /consumed/i, "one permit, one dispatch");
		const reopened = new Effects({ root: join(f.root, "effects"), repositories: { owned: f.repo } });
		const replay = await Effect.runPromise(
			reopened.perform({
				type: "integrate",
				repository: "owned",
				proposal: PROPOSAL,
				expected: f.T.commit,
				result: R,
				attempt: "integration-attempt:3",
			}),
		);
		assert.equal(replay.dispatch, "refused", "even a new process cannot apply T→R again once the ref moved");
	} finally {
		await f.close();
	}
});

test("CI23 no canonical observation without a durability barrier: while fsync fails, neither the CAS readback nor reconciliation reports R", async () => {
	const f = await fixture();
	const open = fs.open;
	const restore = () => {
		fs.open = open;
		syncBuiltinESMExports();
	};
	try {
		const R = await Effect.runPromise(f.effects.perform({ type: "squash", prepared: f.X, target: f.T, message: MESSAGE }));
		const refs = join(f.store, "refs/render/proposals");
		fs.open = (async (...args: Parameters<typeof open>) => {
			const handle = await open(...args);
			if (String(args[0]).startsWith(refs))
				handle.sync = () => Promise.reject(Object.assign(new Error("Injected canonical-ref fsync EIO"), { code: "EIO" }));
			return handle;
		}) as typeof open;
		syncBuiltinESMExports();
		const reconcile = () => Effect.runPromise(f.effects.reconcile({ type: "integration", repository: "owned", proposal: PROPOSAL }));
		await assert.rejects(
			Effect.runPromise(
				f.effects.perform({
					type: "integrate",
					repository: "owned",
					proposal: PROPOSAL,
					expected: f.T.commit,
					result: R,
					attempt: "integration-attempt:1",
				}),
			),
			/EIO/,
			"the dispatch reports no applied R it could not make durable",
		);
		assert.equal(git(f.store, ["rev-parse", REF]).toString().trim(), R.commit, "the ref moved; only its durability is unknown");
		await assert.rejects(reconcile(), /EIO/, "reconciliation reports no R it could not make durable");
		restore();
		assert.deepEqual(
			await reconcile(),
			{ ref: REF, observed: { commit: R.commit, tree: f.X.tree, parents: [f.T.commit] }, lock: false },
			"once the durability barrier succeeds, reconciliation reads R back",
		);
	} finally {
		restore();
		await f.close();
	}
});

test("CI25 after a restart, the previous executor's stale ref lock is removed and the ref classified; a lock written since stays held", async () => {
	const f = await fixture();
	try {
		const lock = join(f.store, `${REF}.lock`);
		await writeFile(lock, `${f.T.commit}\n`);
		await delay(5);
		const restarted = new Effects({ root: join(f.root, "effects"), repositories: { owned: f.repo } });
		const reconcile = () => Effect.runPromise(restarted.reconcile({ type: "integration", repository: "owned", proposal: PROPOSAL }));
		const T = { commit: f.T.commit, tree: f.T.tree, parents: [f.commit] };
		assert.deepEqual(await reconcile(), { ref: REF, observed: T, lock: false }, "no writer of this executor can hold an older lock");
		await assert.rejects(access(lock), "the stale lock is removed");
		await writeFile(lock, `${f.T.commit}\n`);
		assert.deepEqual(await reconcile(), { ref: REF, observed: T, lock: true }, "a lock written since this executor began may be live");
		await access(lock);
	} finally {
		await f.close();
	}
});

test("CI13/CI14 reconciliation only reads: T, another commit and a held ref lock are reported exactly", async () => {
	const f = await fixture();
	try {
		const reconcile = () => Effect.runPromise(f.effects.reconcile({ type: "integration", repository: "owned", proposal: PROPOSAL }));
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
