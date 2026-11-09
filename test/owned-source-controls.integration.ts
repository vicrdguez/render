import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { sourceFixture } from "./support/source.ts";

test("owned source unsafe control: worker ignore cannot hide an accepted base file", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		const handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		assert.equal(
			(
				await Effect.runPromise(
					f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", "printf 'ignored\\n' > .gitignore"], timeoutMs: 10000 }),
				)
			).exitCode,
			0,
		);
		const capture = await Effect.runPromise(f.sandboxes.seal(handle));
		assert.equal(
			capture.entries.find((e) => e.path === "ignored")?.content,
			Buffer.from("must not disappear\n").toString("base64"),
			"worker ignores must not hide accepted literal source",
		);
	} finally {
		await f.close();
	}
});

test("owned source unsafe control: symlink stays literal rather than reading a host target", async () => {
	const f = await sourceFixture();
	try {
		const canary = join(f.root, "host-only");
		await writeFile(canary, "OWNED HOST CANARY, not source");
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		const handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		assert.equal(
			(await Effect.runPromise(f.sandboxes.execute(handle, { scope: f.scope, argv: ["ln", "-s", canary, "host-link"], timeoutMs: 10000 })))
				.exitCode,
			0,
		);
		const capture = await Effect.runPromise(f.sandboxes.seal(handle));
		assert.equal(
			capture.entries.find((e) => e.path === "host-link")?.content,
			Buffer.from(canary).toString("base64"),
			"collector must retain symlink text, never host target bytes",
		);
	} finally {
		await f.close();
	}
});

test("owned source unsafe control: commands never fall back to the host", async () => {
	const f = await sourceFixture();
	try {
		const canary = join(f.root, "host-only");
		await writeFile(canary, "owned canary");
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		const handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const result = await Effect.runPromise(
			f.sandboxes.execute(handle, {
				scope: f.scope,
				argv: ["node", "-e", `console.log(require('fs').existsSync(${JSON.stringify(canary)}))`],
				timeoutMs: 10000,
			}),
		);
		assert.equal(result.exitCode, 0, result.stderr);
		assert.equal(result.stdout.trim(), "false", "host-shell fallback exposes an owned host-only canary");
	} finally {
		await f.close();
	}
});

test("owned source unsafe control: live or quarantined workspace never reused", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		await assert.rejects(
			Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base)),
			/reuse|exist/i,
			"live workspace must not be reused before confirmed quiescence",
		);
	} finally {
		await f.close();
	}
});
