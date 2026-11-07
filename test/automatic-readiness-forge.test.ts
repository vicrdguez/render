// AF01–AF03: the GitHub Forge's ready promotion inside Effects against the owned fake GitHub and real private Git. No
// Ledger here; automatic-readiness.test.ts classifies these results.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { Effects } from "../src/effects/source.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { git, gitSourceFixture } from "./support/source.ts";

const PROPOSAL = "workflow:2";

async function fixture() {
	const source = await gitSourceFixture({ value: { text: "A\n" } });
	const gh = await fakeGitHub();
	const forge = { ...gh.config, repositories: { owned: { owner: gh.owner, name: gh.name, base: "main" } } };
	const effects = new Effects({ root: join(source.root, "effects"), repositories: { owned: source.repo }, forge });
	const blob = git(source.repo, ["hash-object", "-w", "--stdin"], "R1\n").toString().trim();
	const tree = git(source.repo, ["mktree"], `100644 blob ${blob}\tvalue\n`).toString().trim();
	const R1 = git(source.repo, ["commit-tree", tree, "-p", source.commit], "Fixture R\n").toString().trim();
	await effects.perform({ type: "resolve", repository: "owned", commit: R1 });
	await effects.perform({
		type: "publish",
		repository: "owned",
		proposal: PROPOSAL,
		commit: R1,
		expected: null,
		attempt: "forge-attempt:1",
	});
	const created = await effects.perform({
		type: "createProposal",
		repository: "owned",
		proposal: PROPOSAL,
		title: "Render: fixture",
		body: "<!-- render:proposal-pr render-proposal:workflow:2:revision:9 -->",
		attempt: "forge-attempt:2",
	});
	const pr = String(created.created);
	return {
		gh,
		pr,
		effects,
		markReady: (attempt: string) => effects.perform({ type: "markReady", repository: "owned", proposal: PROPOSAL, pr, attempt }),
		listed: async () => (await effects.reconcile({ type: "publication", repository: "owned", proposal: PROPOSAL })).proposals.items,
		async close() {
			await gh.close();
			await source.close();
		},
	};
}

test("AF01 ready promotion is GitHub's markPullRequestReadyForReview for the PR's node, sent once per permit", async () => {
	const f = await fixture();
	try {
		const caps = (await f.effects.reconcile({ type: "publication", repository: "owned", proposal: PROPOSAL })).capabilities;
		assert.equal(caps.markProposalReady, true);
		const result = await f.markReady("forge-attempt:3");
		assert.deepEqual(result, { outcome: "applied", reason: null, created: null, head: null });
		const sent = f.gh.readyRequests();
		assert.equal(sent.length, 1);
		const body = JSON.parse(sent[0]!.body) as { query: string; variables: Record<string, string> };
		assert.match(body.query, /markPullRequestReadyForReview/);
		assert.deepEqual(body.variables, { id: "PR_node1" });
		assert.equal(sent[0]!.authorization, `Bearer ${TOKEN}`);
		assert.equal(f.gh.pulls[0]!.draft, false);
		assert.equal((await f.listed())[0]!.draft, false);
		await assert.rejects(f.markReady("forge-attempt:3"), /already consumed/, "one dispatch per admitted attempt");
		assert.equal(f.gh.readyRequests().length, 1);
		assert.ok(!JSON.stringify(result).includes(TOKEN), "the result never carries the token");
	} finally {
		await f.close();
	}
});

test("AF02 an applied ready request whose reply is lost is unknown; the PR is observed ready", async () => {
	const f = await fixture();
	try {
		f.gh.faults.dropReadyReply = true;
		const result = await f.markReady("forge-attempt:3");
		assert.equal(result.outcome, "unknown");
		assert.equal((await f.listed())[0]!.draft, false);
		assert.equal(f.gh.readyRequests().length, 1);
	} finally {
		await f.close();
	}
});

test("AF03 a ready request GitHub refuses is rejected with its error type", async () => {
	const f = await fixture();
	try {
		f.gh.pulls[0]!.state = "closed";
		assert.deepEqual(await f.markReady("forge-attempt:3"), {
			outcome: "rejected",
			reason: "graphql: UNPROCESSABLE",
			created: null,
			head: null,
		});
		assert.deepEqual([f.gh.pulls[0]!.state, f.gh.pulls[0]!.draft], ["closed", true]);
	} finally {
		await f.close();
	}
});
