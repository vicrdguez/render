// Independent Git-generated source and literal outcomes, before additional product changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { git, sourceFixture } from "./support/source.ts";

for (const [label, names] of [
	["case collision", [Buffer.from("Readme"), Buffer.from("README")]],
	["compatibility collision", [Buffer.from("K"), Buffer.from("K")]],
	["decomposed name", [Buffer.from("e\u0301")]],
	["non-UTF8", [Buffer.from([0xff])]],
	["reserved name", [Buffer.from("AUX.txt")]],
	["backslash", [Buffer.from("a\\b")]],
] as const)
	test(`literal-source-roundtrip refuses ${label} before materialization`, async () => {
		const f = await sourceFixture();
		try {
			const blob = git(f.repo, ["hash-object", "-w", "--stdin"], "literal").toString().trim();
			const tree = git(
				f.repo,
				["mktree", "-z"],
				Buffer.concat(names.map((name) => Buffer.concat([Buffer.from(`100644 blob ${blob}\t`), name, Buffer.from([0])]))),
			)
				.toString()
				.trim();
			const commit = git(f.repo, ["commit-tree", tree], "invalid names\n").toString().trim();
			await assert.rejects(f.effects.perform({ type: "resolve", repository: "owned", commit }), /name|collision|UTF8|representation/i);
		} finally {
			await f.close();
		}
	});

test("literal-source-roundtrip keeps newline, tab, leading dash and Unicode literal names", async () => {
	const names = ["line\nbreak", "tab\tname", "-option", "café"];
	const f = await sourceFixture(Object.fromEntries(names.map((name) => [name, { text: "exact\r\n" }])));
	try {
		const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		const handle = await f.sandboxes.prepare(f.scope, f.profile, base);
		const capture = await f.sandboxes.seal(handle);
		assert.deepEqual(capture.entries.map((e) => e.path).sort(), [...names].sort());
		for (const entry of capture.entries) assert.equal(entry.content, Buffer.from("exact\r\n").toString("base64"));
		const result = await f.effects.perform({ type: "retain", base, capture });
		assert.equal(result.source.tree, base.tree);
	} finally {
		await f.close();
	}
});

for (const [label, script, expected] of [
	["entry quota", "for n in 1 2 3 4 5 6 7; do mkdir dir$n; done", /entries.*bound/i],
	["partial execute mode", "chmod 700 crlf", /mode/i],
	["invalid symlink text", 'node -e \'require("fs").symlinkSync(Buffer.from([255]), "invalid-link")\'', /representation/i],
] as const)
	test(`literal-source-roundtrip egress refuses ${label}`, async () => {
		const f = await sourceFixture();
		try {
			const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
			const handle = await f.sandboxes.prepare(f.scope, { ...f.profile, maxEntries: label === "entry quota" ? 6 : 10000 }, base);
			const run = await f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", script], timeoutMs: 10000 });
			assert.equal(run.exitCode, 0, run.stderr);
			await assert.rejects(f.sandboxes.seal(handle), expected);
		} finally {
			await f.close();
		}
	});

test("literal-source-roundtrip ingress bounds reject instead of reducing source", async () => {
	const f = await sourceFixture();
	try {
		const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		await assert.rejects(f.sandboxes.prepare(f.scope, { ...f.profile, maxEntries: 5 }, base), /entry bound/i);
		await assert.rejects(f.sandboxes.prepare(f.scope, { ...f.profile, maxBytes: 1 }, base), /bytes bound/i);
	} finally {
		await f.close();
	}
});
