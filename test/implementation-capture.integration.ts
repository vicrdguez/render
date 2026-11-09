import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import type { Source } from "../src/effects/source.ts";
import { Sandboxes, type SandboxHandle } from "../src/sandboxes/sandboxes.ts";
import { sourceFixture } from "./support/source.ts";

function continueFrom(sandboxes: Sandboxes, f: Awaited<ReturnType<typeof sourceFixture>>, source: Source, after: SandboxHandle) {
	return Effect.runPromise(sandboxes.prepare(f.scope, f.profile, { source, after }));
}

test("implementation capture: sealed A reprovisions literal source under the same scope while old handle stays closed", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit }));
		const first = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const edited = await Effect.runPromise(
			f.sandboxes.execute(first, {
				scope: f.scope,
				argv: ["sh", "-c", "rm ignored; printf 'new\\r\\n' > added; mkdir .git; echo local-only > .git/config"],
				timeoutMs: 10000,
			}),
		);
		assert.equal(edited.exitCode, 0, edited.stderr);
		const A = await Effect.runPromise(
			f.effects.perform({ type: "retain", base, capture: await Effect.runPromise(f.sandboxes.seal(first)) }),
		);
		await Effect.runPromise(f.effects.reconcile(A));
		let next: SandboxHandle | undefined;
		let failure: unknown;
		try {
			next = await continueFrom(f.sandboxes, f, A.source, first);
		} catch (error) {
			failure = error;
		}
		assert.ok(next, `sealed A must provision a fresh writable handle: ${String(failure)}`);
		assert.deepEqual(next.scope, first.scope, "fresh handle is not new implementation authority");
		assert.notEqual(next.id, first.id);
		assert.notEqual(next.runtime, first.runtime);
		await assert.rejects(
			Effect.runPromise(f.sandboxes.execute(first, { scope: f.scope, argv: ["true"], timeoutMs: 1000 })),
			/closed|seal/i,
		);
		const literal = await Effect.runPromise(
			f.sandboxes.execute(next, {
				scope: f.scope,
				timeoutMs: 10000,
				argv: [
					"node",
					"-e",
					`const fs=require('fs');
if(fs.readFileSync('crlf','utf8')!=='literal\\r\\nbytes\\r\\n') throw Error('CRLF changed');
if(fs.readFileSync('added','utf8')!=='new\\r\\n') throw Error('new bytes lost');
if(fs.existsSync('ignored')) throw Error('deletion lost');
if(fs.readlinkSync('link')!=='/outside/never-follow') throw Error('symlink changed');
if(!(fs.statSync('run').mode&0o111)) throw Error('executable lost');
if(fs.existsSync('.git')) throw Error('local metadata survived');
fs.writeFileSync('added','fixed\\r\\n');`,
				],
			}),
		);
		assert.equal(literal.exitCode, 0, literal.stderr);
		const B = await Effect.runPromise(
			f.effects.perform({ type: "retain", base: A.source, capture: await Effect.runPromise(f.sandboxes.seal(next)) }),
		);
		assert.notEqual(B.source.tree, A.source.tree);
		assert.equal(
			Buffer.from(A.source.entries.find((e) => e.path === "added")!.content, "base64").toString(),
			"new\r\n",
			"Audit A must not be relabeled or mutated by fixes",
		);
		assert.equal(Buffer.from(B.source.entries.find((e) => e.path === "added")!.content, "base64").toString(), "fixed\r\n");
		await assert.rejects(continueFrom(f.sandboxes, f, A.source, first), /reuse|exist/i);
		const stopped = await Effect.runPromise(f.sandboxes.stop({ scope: f.scope }));
		assert.deepEqual(
			stopped.executions.map((d) => d.source?.tree),
			[base.tree, A.source.tree],
			"diagnostics from the original runtime must not be relabeled as executing on Audit A",
		);
	} finally {
		await f.close();
	}
});

test("implementation capture: only the exact sealed predecessor can authorize fresh preparation", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit }));
		const first = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		await assert.rejects(continueFrom(f.sandboxes, f, base, first), /sealed predecessor/i);
		await Effect.runPromise(f.sandboxes.execute(first, { scope: f.scope, argv: ["sh", "-c", "echo changed > added"], timeoutMs: 10000 }));
		const A = await Effect.runPromise(
			f.effects.perform({ type: "retain", base, capture: await Effect.runPromise(f.sandboxes.seal(first)) }),
		);
		await assert.rejects(continueFrom(f.sandboxes, f, base, first), /captured source/i);
		await assert.rejects(
			continueFrom(f.sandboxes, f, A.source, { ...first, scope: { ...first.scope, attempt: "another" } }),
			/scope|identity/i,
		);
		await assert.rejects(
			Effect.runPromise(f.sandboxes.prepare(f.scope, { ...f.profile, exclusions: [".git", "added"] }, { source: A.source, after: first })),
			/profile|exclusion/i,
		);
		f.fence();
		await assert.rejects(continueFrom(f.sandboxes, f, A.source, first), /fenced|unauthorized/i);
	} finally {
		await f.close();
	}
});

test("implementation capture: reopening and stopping a scope contains its fresh runtime, not only the original", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit }));
		const first = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const A = await Effect.runPromise(
			f.effects.perform({ type: "retain", base, capture: await Effect.runPromise(f.sandboxes.seal(first)) }),
		);
		const recovered = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		let next: SandboxHandle | undefined;
		try {
			next = await continueFrom(recovered, f, A.source, first);
		} catch {
			/* asserted below */
		}
		assert.ok(next, "ordinary restart must allow fresh preparation after a retained seal");
		await Effect.runPromise(recovered.execute(next, { scope: f.scope, argv: ["sh", "-c", "echo continued"], timeoutMs: 10000 }));
		const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		const stopped = await Effect.runPromise(reopened.stop({ scope: f.scope }));
		assert.equal(stopped.runtime, next.runtime, "scope stop must discover the latest runtime");
		assert.deepEqual(stopped.handle, next, "recovery must retain the exact latest stopped handle for capture");
		assert.equal(stopped.running, false);
		assert.ok(stopped.executions.some((e) => e.result?.stdout === "continued\n"));
		for (const diagnostic of stopped.executions) {
			assert.equal(diagnostic.source?.tree, A.source.tree, "recovered command diagnostics must identify their own workspace source");
		}
		assert.equal(execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", next.runtime], { encoding: "utf8" }).trim(), "false");
		const again = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		await assert.rejects(continueFrom(again, f, A.source, first), /stopped|fenced|reuse|exist/i);
	} finally {
		await f.close();
	}
});

test("implementation capture: scope stop contains successor despite missing predecessor runtime", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit }));
		const first = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const A = await Effect.runPromise(
			f.effects.perform({ type: "retain", base, capture: await Effect.runPromise(f.sandboxes.seal(first)) }),
		);
		const next = await continueFrom(f.sandboxes, f, A.source, first);
		execFileSync("docker", ["rm", first.runtime]);
		const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		await assert.rejects(Effect.runPromise(reopened.stop({ scope: f.scope })), /quarantine|inspect/i);
		assert.equal(
			execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", next.runtime], { encoding: "utf8" }).trim(),
			"false",
			"successor must be contained despite predecessor uncertainty",
		);
	} finally {
		await f.close();
	}
});

test("implementation capture: durable scope fence refuses execution after reopen", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit }));
		const first = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const A = await Effect.runPromise(
			f.effects.perform({ type: "retain", base, capture: await Effect.runPromise(f.sandboxes.seal(first)) }),
		);
		const next = await continueFrom(f.sandboxes, f, A.source, first);
		// Crash-state fixture: scope stop persisted its root fence, but had not yet stopped the successor.
		const journal = join(f.root, "sandboxes", first.id, "state.json");
		const state = JSON.parse(await readFile(journal, "utf8"));
		state.scopeStopped = true;
		await writeFile(journal, JSON.stringify(state));
		const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => true });
		await assert.rejects(
			Effect.runPromise(reopened.execute(next, { scope: f.scope, argv: ["sh", "-c", "echo started > fence-canary"], timeoutMs: 10000 })),
			/closed|fenced|stopped/i,
		);
		await assert.rejects(readFile(join(f.root, "sandboxes", next.id, "workspace", "fence-canary")), { code: "ENOENT" });
	} finally {
		await f.close();
	}
});

test("implementation capture: simultaneous fresh preparations cannot create two writers", async () => {
	const f = await sourceFixture();
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit }));
		const first = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		const A = await Effect.runPromise(
			f.effects.perform({ type: "retain", base, capture: await Effect.runPromise(f.sandboxes.seal(first)) }),
		);
		const attempts = await Promise.allSettled([
			continueFrom(f.sandboxes, f, A.source, first),
			continueFrom(f.sandboxes, f, A.source, first),
		]);
		assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1, "exactly one fresh workspace must be admitted");
		assert.equal(attempts.filter((r) => r.status === "rejected").length, 1);
	} finally {
		await f.close();
	}
});
