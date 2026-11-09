// HF01: the GitHub Forge adapter reads the actual merge mapping from an owned fake GitHub with real Git. No Ledger here;
// human-merge-observation.test.ts classifies these observations.

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Effects } from "../src/effects/source.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { git, gitSourceFixture } from "./support/source.ts";

test("HF01 a human merge into main reports the merged head and the main commit; other closures and prose do not", async () => {
	const source = await gitSourceFixture({ value: { text: "A\n" } });
	const gh = await fakeGitHub();
	const project = { id: "owned", remote: `${gh.config.git}/${gh.owner}/${gh.name}.git`, defaultBranch: "main" };
	const effects = new Effects({ root: join(source.root, "effects"), forge: gh.config });
	const reconcile = (proposal: string) => Effect.runPromise(effects.reconcile({ type: "publication", project, proposal }));
	const commit = (text: string) => {
		const blob = git(source.repo, ["hash-object", "-w", "--stdin"], text).toString().trim();
		const tree = git(source.repo, ["mktree"], `100644 blob ${blob}\tvalue\n`).toString().trim();
		const R = git(source.repo, ["commit-tree", tree, "-p", source.commit], "Fixture R\n").toString().trim();
		git(gh.repo, ["fetch", "-q", source.repo, R]);
		return R;
	};
	const open = async (proposal: string, text: string, n: number, body = "Render proposal") => {
		const R = (await Effect.runPromise(effects.perform({ type: "resolve", project, commit: commit(text) }))).commit;
		await Effect.runPromise(
			effects.perform({ type: "publish", project, proposal, commit: R, expected: null, attempt: `forge-attempt:p${n}` }),
		);
		await Effect.runPromise(
			effects.perform({ type: "createProposal", project, proposal, title: "Render", body, attempt: `forge-attempt:c${n}` }),
		);
		return R;
	};
	try {
		const R1 = await open("workflow:2", "R1\n", 1);
		const main = gh.merge(1);
		assert.equal(gh.branch("main"), main, "the fake's main moved by a real Git commit");
		const merged = await reconcile("workflow:2");
		assert.equal(merged.proposals.complete, true);
		assert.deepEqual(
			{ ...merged.proposals.items[0], id: undefined },
			{ id: undefined, state: "merged", draft: true, head: R1, marker: null, actor: true, merge: { main: true, commit: main } },
		);
		assert.ok(!JSON.stringify(merged).includes(TOKEN), "observation never carries the token");

		await open("workflow:3", "R3\n", 3);
		gh.pulls[1]!.base.ref = "release";
		const release = gh.merge(2);
		assert.deepEqual((await reconcile("workflow:3")).proposals.items[0]!.merge, { main: false, commit: release });

		await open("workflow:4", "R4\n", 4);
		gh.pulls[2]!.state = "closed";
		const closed = (await reconcile("workflow:4")).proposals.items[0]!;
		assert.deepEqual([closed.state, closed.merge], ["closed", null], "a closed unmerged PR is not merged");

		await open("workflow:5", "R5\n", 5, "Merged into main by the human.");
		gh.pulls[3]!.draft = false;
		const prose = (await reconcile("workflow:5")).proposals.items[0]!;
		assert.deepEqual([prose.state, prose.draft, prose.merge], ["open", false, null], "prose and a ready flag are not a merge");
	} finally {
		await gh.close();
		await source.close();
	}
});
