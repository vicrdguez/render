// GF01–GF07: the actual GitHub Forge adapter inside Effects against an owned fake GitHub (REST plus smart-HTTP Git) and
// real private Git. No Ledger here; github-publication.test.ts classifies these observations.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Effects } from "../src/effects/source.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { git, gitSourceFixture } from "./support/source.ts";

const PROPOSAL = "workflow:2";
const BRANCH = "render/workflow-2";
const SECTION = (text: string) => `<!-- render:summary:start -->\n${text}\n<!-- render:summary:end -->`;

async function fixture() {
	const source = await gitSourceFixture({ value: { text: "A\n" } });
	const gh = await fakeGitHub();
	const forge = { ...gh.config, repositories: { owned: { owner: gh.owner, name: gh.name, base: "main" } } };
	const effects = new Effects({ root: join(source.root, "effects"), repositories: { owned: source.repo }, forge });
	const commit = (text: string, parent: string) => {
		const blob = git(source.repo, ["hash-object", "-w", "--stdin"], text).toString().trim();
		const tree = git(source.repo, ["mktree"], `100644 blob ${blob}\tvalue\n`).toString().trim();
		return git(source.repo, ["commit-tree", tree, "-p", parent], "Fixture R\n").toString().trim();
	};
	const resolve = async (oid: string) => (await effects.perform({ type: "resolve", repository: "owned", commit: oid })).commit;
	return {
		source,
		gh,
		effects,
		commit,
		resolve,
		reconcile: () => effects.reconcile({ type: "publication", repository: "owned", proposal: PROPOSAL }),
		publish: (commit: string, expected: string | null, attempt: string) =>
			effects.perform({ type: "publish", repository: "owned", proposal: PROPOSAL, commit, expected, attempt }),
		create: (attempt: string, body = `<!-- render:proposal-pr render-proposal:${PROPOSAL}:revision:9 -->\n${SECTION("first")}`) =>
			effects.perform({ type: "createProposal", repository: "owned", proposal: PROPOSAL, title: "Render: fixture", body, attempt }),
		async close() {
			await gh.close();
			await source.close();
		},
	};
}
const noToken = (value: unknown, label: string) => assert.ok(!JSON.stringify(value).includes(TOKEN), `${label} never carries the token`);

test("GF01 a fresh repository observes no head and a complete empty listing", async () => {
	const f = await fixture();
	try {
		const seen = await f.reconcile();
		assert.deepEqual(seen.head, { commit: null });
		assert.deepEqual(seen.proposals, { complete: true, items: [] });
		assert.ok(!Number.isNaN(Date.parse(seen.observedAt)), "observation carries its time");
		noToken(seen, "observation");
	} finally {
		await f.close();
	}
});

test("GF02/GF07 publication is an expected-old guarded push of exact host source; a moved remote refuses and is observed", async () => {
	const f = await fixture();
	try {
		const R1 = await f.resolve(f.commit("R1\n", f.source.commit));
		const first = await f.publish(R1, null, "forge-attempt:1");
		assert.deepEqual(first, { outcome: "applied", reason: null, created: null, head: { commit: R1 } });
		assert.equal(f.gh.branch(BRANCH), R1, "the remote branch is exactly R1");
		const R2 = await f.resolve(f.commit("R2\n", R1));
		assert.equal((await f.publish(R2, R1, "forge-attempt:2")).outcome, "applied");
		assert.equal(f.gh.branch(BRANCH), R2);
		const foreign = git(
			f.gh.repo,
			[
				"commit-tree",
				git(f.gh.repo, ["rev-parse", `${R2}^{tree}`])
					.toString()
					.trim(),
				"-p",
				R2,
			],
			"Human push\n",
		)
			.toString()
			.trim();
		git(f.gh.repo, ["update-ref", `refs/heads/${BRANCH}`, foreign]);
		const R3 = await f.resolve(f.commit("R3\n", R2));
		const refused = await f.publish(R3, R2, "forge-attempt:3");
		assert.deepEqual(
			refused,
			{ outcome: "rejected", reason: "stale-expected", created: null, head: { commit: foreign } },
			"a moved remote refuses the guarded push",
		);
		assert.equal(f.gh.branch(BRANCH), foreign, "the moved remote is never overwritten");
		const gitRequests = f.gh.requests.filter((r) => r.path.startsWith("/git/"));
		assert.ok(gitRequests.length > 0 && gitRequests.every((r) => r.authorization?.startsWith("Basic ")), "Git transport carries the token");
		noToken([first, refused], "dispatch results");
		await assert.rejects(f.publish(R3, R2, "forge-attempt:3"), /already consumed/, "one dispatch per admitted attempt");
	} finally {
		await f.close();
	}
});

test("GF03 the create is a draft with the marker and host section; draft unsupported is a capability rejection, never a non-draft", async () => {
	const f = await fixture();
	try {
		const R1 = await f.resolve(f.commit("R1\n", f.source.commit));
		await f.publish(R1, null, "forge-attempt:1");
		const created = await f.create("forge-attempt:2");
		assert.equal(created.outcome, "applied");
		assert.match(String(created.created), /^github:pr:1:/);
		const post = JSON.parse(f.gh.requests.find((r) => r.method === "POST" && r.path.endsWith("/pulls"))!.body);
		assert.equal(post.draft, true);
		assert.equal(post.head, BRANCH);
		assert.equal(post.base, "main");
		assert.match(post.body, /render:proposal-pr render-proposal:workflow:2:revision:9/);
		assert.match(post.body, /render:summary:start/);
		const g = await fixture();
		try {
			await g.publish(await g.resolve(g.commit("R1\n", g.source.commit)), null, "forge-attempt:1");
			g.gh.faults.draftUnsupported = true;
			const refused = await g.create("forge-attempt:2");
			assert.deepEqual(
				refused,
				{ outcome: "rejected", reason: "draft-unsupported", created: null, head: null },
				"draft unsupported is a capability rejection",
			);
			const posts = g.gh.requests.filter((r) => r.method === "POST" && r.path.endsWith("/pulls")).map((r) => JSON.parse(r.body).draft);
			assert.deepEqual(posts, [true], "no non-draft substitute was sent");
			assert.equal(g.gh.pulls.length, 0);
		} finally {
			await g.close();
		}
	} finally {
		await f.close();
	}
});

test("GF04 an applied create whose reply is lost is unknown; lagging listing is empty but complete; the permit is never reused", async () => {
	const f = await fixture();
	try {
		await f.publish(await f.resolve(f.commit("R1\n", f.source.commit)), null, "forge-attempt:1");
		f.gh.faults.dropCreateReply = true;
		f.gh.faults.lagListing = true;
		const lost = await f.create("forge-attempt:2");
		assert.deepEqual(lost, { outcome: "unknown", reason: lost.reason, created: null, head: null });
		assert.equal(f.gh.pulls.length, 1, "GitHub did create it");
		assert.deepEqual((await f.reconcile()).proposals, { complete: true, items: [] }, "a lagging listing shows nothing");
		await assert.rejects(f.create("forge-attempt:2"), /already consumed/);
		assert.equal(f.gh.posts(), 1, "no second POST");
		f.gh.reveal();
		const items = (await f.reconcile()).proposals!.items;
		assert.equal(items.length, 1);
		assert.deepEqual(
			{ ...items[0], id: undefined },
			{
				id: undefined,
				state: "open",
				draft: true,
				head: f.gh.branch(BRANCH),
				marker: "render-proposal:workflow:2:revision:9",
				actor: true,
				merge: null,
			},
		);
		assert.match(items[0]!.id, /^github:pr:1:/);
	} finally {
		await f.close();
	}
});

test("GF05 a listing whose next page fails is incomplete, never absence", async () => {
	const f = await fixture();
	try {
		const R1 = await f.resolve(f.commit("R1\n", f.source.commit));
		await f.publish(R1, null, "forge-attempt:1");
		for (let n = 0; n < 101; n++) await f.create(`forge-attempt:c${n}`, `other ${n}`);
		f.gh.faults.failPage = 2;
		const seen = await f.reconcile();
		assert.equal(seen.proposals!.complete, false);
		f.gh.faults.failPage = undefined;
		const all = await f.reconcile();
		assert.deepEqual([all.proposals!.complete, all.proposals!.items.length], [true, 101]);
	} finally {
		await f.close();
	}
});

test("GF06 the summary update replaces only the host-owned section; a lost reply is unknown", async () => {
	const f = await fixture();
	try {
		await f.publish(await f.resolve(f.commit("R1\n", f.source.commit)), null, "forge-attempt:1");
		const pr = String((await f.create("forge-attempt:2")).created);
		f.gh.pulls[0]!.body = `Human preface\n\n${f.gh.pulls[0]!.body}\n\nHuman notes`;
		const update = (summary: string, attempt: string) =>
			f.effects.perform({ type: "updateSummary", repository: "owned", proposal: PROPOSAL, pr, summary, attempt });
		assert.deepEqual(await update(SECTION("second"), "forge-attempt:3"), { outcome: "applied", reason: null, created: null, head: null });
		assert.equal(
			f.gh.pulls[0]!.body,
			`Human preface\n\n<!-- render:proposal-pr render-proposal:${PROPOSAL}:revision:9 -->\n${SECTION("second")}\n\nHuman notes`,
		);
		f.gh.faults.dropPatchReply = true;
		assert.equal((await update(SECTION("third"), "forge-attempt:4")).outcome, "unknown");
	} finally {
		await f.close();
	}
});

test("GF07 a forge outage throws on observation and leaves dispatch unknown; nothing exposes the token", async () => {
	const f = await fixture();
	try {
		const R1 = await f.resolve(f.commit("R1\n", f.source.commit));
		await f.gh.down();
		const observed = await Effect.runPromise(
			Effect.result(f.effects.reconcileEffect({ type: "publication", repository: "owned", proposal: PROPOSAL })),
		);
		assert.equal(observed._tag, "Failure", "an unreachable forge is a recoverable observation failure");
		if (observed._tag === "Failure") {
			assert.ok(observed.failure instanceof Error);
			assert.ok(!observed.failure.message.includes(TOKEN));
		}
		const sent = await f.publish(R1, null, "forge-attempt:1");
		assert.equal(sent.outcome, "unknown");
		noToken(sent, "outage result");
		await f.gh.up();
		assert.deepEqual((await f.reconcile()).head, { commit: null }, "nothing reached the remote");
	} finally {
		await f.close();
	}
});
