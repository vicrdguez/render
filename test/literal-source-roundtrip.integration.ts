import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { gitSourceFixture, sourceFixture } from "./support/source.ts";

test("literal-source-roundtrip: literal bytes, symlinks and actual deletions ignore worker Git", async () => {
	const f = await sourceFixture();
	let handle: Awaited<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		assert.equal(base.commit, f.commit);
		assert.equal(base.entries.find((e) => e.path === "subst")?.content, Buffer.from("$Format:%H$\n").toString("base64"));
		handle = await f.sandboxes.prepare(f.scope, f.profile, base);
		const execution = await f.sandboxes.execute(handle, {
			scope: f.scope,
			argv: [
				"/bin/sh",
				"-c",
				"printf 'ignored\\n' > .gitignore; rm ignored; printf 'new\\r\\n' > new.txt; printf '*.txt filter=hostile\\n' > .gitattributes; printf '[submodule x]\\n' > .gitmodules; ln new.txt hard.txt",
			],
			timeoutMs: 10000,
		});
		assert.equal(execution.exitCode, 0);
		assert.equal(execution.platform.os, "linux");
		const capture = await f.sandboxes.seal(handle);
		assert.deepEqual(capture.exclusions, [], "record actual exclusions, not paths absent from the frozen workspace");
		const retained = await f.effects.perform({ type: "retain", base, capture });
		assert.equal(retained.source.entries.find((e) => e.path === "crlf")?.content, Buffer.from("literal\r\nbytes\r\n").toString("base64"));
		assert.equal(retained.source.entries.find((e) => e.path === "link")?.content, Buffer.from("/outside/never-follow").toString("base64"));
		assert.equal(retained.source.entries.find((e) => e.path === "run")?.mode, "100755");
		assert.deepEqual(retained.deleted, ["ignored"]);
		assert.deepEqual(retained.configurationChanges, [".gitattributes", ".gitmodules"]);
		assert.equal(retained.source.entries.find((e) => e.path === "new.txt")?.content, Buffer.from("new\r\n").toString("base64"));
		assert.equal(retained.source.entries.find((e) => e.path === "hard.txt")?.content, Buffer.from("new\r\n").toString("base64"));
		assert.deepEqual(await f.effects.reconcile(retained), retained);
		const diff = await f.effects.perform({ type: "diff", base: base.commit, result: retained.source.commit, repository: "owned" });
		assert.match(diff, /new.txt/);
		assert.match(diff, /ignored/);
		assert.equal(await readFile(join(f.root, "sandboxes", handle.id, "workspace", "crlf"), "utf8"), "literal\r\nbytes\r\n");
	} finally {
		if (handle) await f.sandboxes.stop(handle).catch(() => {});
		await f.close();
	}
});

for (const [name, command, expected] of [
	["FIFO", "mkfifo pipe", /special|regular/i],
	["sparse bound", "truncate -s 67108865 huge", /bound|bytes/i],
	["reserved name", "touch 'bad.'", /name/i],
] as const)
	test(`literal-source-roundtrip: ${name} refuses, never truncates`, async () => {
		const f = await sourceFixture();
		let handle: Awaited<ReturnType<typeof f.sandboxes.prepare>> | undefined;
		try {
			const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
			handle = await f.sandboxes.prepare(f.scope, f.profile, base);
			assert.equal((await f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", command], timeoutMs: 10000 })).exitCode, 0);
			await assert.rejects(f.sandboxes.seal(handle), expected);
		} finally {
			if (handle) await f.sandboxes.stop(handle).catch(() => {});
			await f.close();
		}
	});

test("literal-source-roundtrip: declared caches are excluded, base conflicts refuse and undeclared deliverables survive", async () => {
	const f = await sourceFixture();
	let handle: Awaited<ReturnType<typeof f.sandboxes.prepare>> | undefined;
	try {
		const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		await assert.rejects(f.sandboxes.prepare(f.scope, { ...f.profile, exclusions: [".git", "ignored"] }, base), /exclu|profile/i);
		handle = await f.sandboxes.prepare(f.scope, { ...f.profile, exclusions: [".git", "cache"] }, base);
		await f.sandboxes.execute(handle, {
			scope: f.scope,
			argv: ["sh", "-c", "mkdir cache; echo generated > cache/new.txt; echo deliverable > new.txt"],
			timeoutMs: 10000,
		});
		const capture = await f.sandboxes.seal(handle);
		assert.deepEqual(capture.exclusions, ["cache"]);
		assert.equal(
			capture.entries.some((entry) => entry.path.startsWith("cache/")),
			false,
		);
		assert.equal(capture.entries.find((entry) => entry.path === "new.txt")?.content, Buffer.from("deliverable\n").toString("base64"));
		assert.equal(
			capture.entries.find((entry) => entry.path === "ignored")?.content,
			Buffer.from("must not disappear\n").toString("base64"),
		);
	} finally {
		if (handle) await f.sandboxes.stop(handle).catch(() => {});
		await f.close();
	}
});

test("literal-source-roundtrip unsafe archive control loses an accepted literal file", async () => {
	const f = await gitSourceFixture();
	try {
		const listing = execFileSync("git", ["--git-dir", f.repo, "archive", f.commit]);
		// This is the unsafe operation itself, not a product mock or a setup error.
		assert.equal(listing.includes(Buffer.from("must not disappear\n")), false);
		const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		assert.equal(base.entries.find((e) => e.path === "ignored")?.content, Buffer.from("must not disappear\n").toString("base64"));
	} finally {
		await f.close();
	}
});
