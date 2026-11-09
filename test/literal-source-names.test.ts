// Refusals that happen at source resolution, before any sandbox preparation: real Git, no container runtime.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import * as Effect from "effect/Effect";
import { git, gitSourceFixture } from "./support/source.ts";

// Each case adds its own tree and commit to one real repository; resolution refuses before anything else is touched.
let f: Awaited<ReturnType<typeof gitSourceFixture>>;
before(async () => {
	f = await gitSourceFixture();
});
after(() => f.close());

for (const [label, names] of [
	["case collision", [Buffer.from("Readme"), Buffer.from("README")]],
	["compatibility collision", [Buffer.from("K"), Buffer.from("K")]],
	["decomposed name", [Buffer.from("e\u0301")]],
	["non-UTF8", [Buffer.from([0xff])]],
	["reserved name", [Buffer.from("AUX.txt")]],
	["backslash", [Buffer.from("a\\b")]],
] as const)
	test(`literal-source-roundtrip refuses ${label} before materialization`, async () => {
		const blob = git(f.repo, ["hash-object", "-w", "--stdin"], "literal").toString().trim();
		const tree = git(
			f.repo,
			["mktree", "-z"],
			Buffer.concat(names.map((name) => Buffer.concat([Buffer.from(`100644 blob ${blob}\t`), name, Buffer.from([0])]))),
		)
			.toString()
			.trim();
		const commit = git(f.repo, ["commit-tree", tree], "invalid names\n").toString().trim();
		await assert.rejects(
			Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit })),
			/name|collision|UTF8|representation/i,
		);
	});

test("literal-source-roundtrip: gitlinks refuse rather than fetch modules", async () => {
	const tree = git(f.repo, ["mktree"], `160000 commit ${f.commit}\tmodule\n`).toString().trim();
	const commit = git(f.repo, ["commit-tree", tree], "Gitlink fixture\n").toString().trim();
	await assert.rejects(Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit })), /gitlink|submodule/i);
});
