// Failure oracles authored before recovery/diagnostic implementation.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { Sandboxes } from "../src/sandboxes/sandboxes.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { sourceFixture } from "./support/source.ts";

test("quarantine reconciliation retries the original runtime without reopening execute or workspace reuse", async () => {
	const f = await sourceFixture();
	const path = process.env.PATH;
	try {
		const base = await f.effects.perform({ type: "resolve", repository: "owned", commit: f.commit });
		const handle = await f.sandboxes.prepare(f.scope, f.profile, base);
		await f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", "printf diagnostic; exit 7"], timeoutMs: 10000 });
		process.env.PATH = "/no-runtime-available";
		await assert.rejects(f.sandboxes.stop(handle), /quarant/i);
		process.env.PATH = path;
		const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => false });
		const stopped = await reopened.stop(handle);
		assert.equal(stopped.runtime, handle.runtime);
		assert.equal(stopped.running, false);
		await assert.rejects(reopened.execute(handle, { scope: f.scope, argv: ["true"], timeoutMs: 1000 }), /closed|seal|scope/i);
		await assert.rejects(f.sandboxes.prepare(f.scope, f.profile, base), /reuse|exist/i);
		const capture = await reopened.seal(handle);
		assert.equal(capture.freeze.runtime, handle.runtime);
		assert.equal(capture.entries.find((e) => e.path === "crlf")?.content, Buffer.from("literal\r\nbytes\r\n").toString("base64"));
	} finally {
		process.env.PATH = path;
		await f.close();
	}
});

test("failed collection retains actual command diagnostics in history without a source pass", async () => {
	const source = await sourceFixture();
	const config = {
		root: join(source.root, "owned"),
		repositories: { owned: source.repo },
		checks: {
			"revision:3": {
				repository: "owned",
				commit: source.commit,
				profile: source.profile,
				argv: ["sh", "-c", "printf 'actual diagnostic\\r\\n'; printf 'failure detail' >&2; mkfifo pipe; exit 7"],
				timeoutMs: 10000,
				verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }));
	try {
		assert.equal(
			(await f.command({ type: "assignTask", slice: "failed:check", delivery: true, packet: packet({ execution: "linux-writer" }) }))
				.status,
			"accepted",
		);
		const deadline = Date.now() + 20000;
		let assignment: RoleAssignment;
		for (;;) {
			const snapshot = f.ledger.snapshot(admin);
			assert.ok("assignments" in snapshot);
			assignment = (snapshot.assignments as RoleAssignment[])[0]!;
			if (assignment.status === "blocked" && !assignment.executing) break;
			assert.ok(Date.now() < deadline, JSON.stringify(assignment));
			await setTimeout(20);
		}
		assert.equal(assignment.report, null, "unsupported source never acquires a verification report");
		const exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported);
		const diagnostics = Object.entries(exported.content).flatMap(([ref, bytes]) => {
			try {
				const value = JSON.parse(Buffer.from(bytes, "base64").toString());
				return value.kind === "owned-check-diagnostic" ? [{ ref, value }] : [];
			} catch {
				return [];
			}
		});
		assert.ok(diagnostics.length > 0, "actual command diagnostics must survive failed source collection");
		const diagnostic = diagnostics.find(({ value }) => value.execution?.exitCode === 7)!;
		assert.ok(diagnostic, "actual exit result retained before rooting");
		assert.equal(diagnostic.value.execution.stdout, "actual diagnostic\r\n");
		assert.equal(diagnostic.value.execution.stderr, "failure detail");
		assert.equal(diagnostic.value.execution.platform.os, "linux");
		assert.equal(diagnostic.value.verifierRevision, source.commit);
		assert.equal(diagnostic.value.verification, "unaccepted");
		await f.reopen(new Engine({ ownedChecks: config }));
		const read = await f.ledger.artifact(admin, { read: diagnostic.ref });
		assert.ok("content" in read);
		assert.deepEqual(JSON.parse(read.content.toString()), diagnostic.value);
	} finally {
		await f.close();
		await source.close();
	}
});

test("failure before runtime creation releases capacity, survives reopen and cancellation releases writer ownership", async () => {
	const source = await sourceFixture();
	const config = {
		root: join(source.root, "owned"),
		repositories: { owned: source.repo },
		checks: {
			"revision:3": {
				repository: "owned", commit: source.commit,
				profile: { ...source.profile, image: `sha256:${"0".repeat(64)}` },
				argv: ["true"], timeoutMs: 10000, verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }));
	const snapshot = () => {
		const value = f.ledger.snapshot(admin);
		assert.ok("assignments" in value);
		return (value.assignments as RoleAssignment[])[0]!;
	};
	try {
		assert.equal((await f.command({
			type: "assignTask", slice: "prepare:failure", delivery: true, packet: packet({ execution: "linux-writer" }),
		})).status, "accepted");
		const deadline = Date.now() + 10000;
		while (snapshot().status !== "blocked" || snapshot().executing) {
			assert.ok(Date.now() < deadline, JSON.stringify(snapshot()));
			await setTimeout(20);
		}
		assert.match(snapshot().blocker!, /image.*failed/i);
		assert.equal(snapshot().report, null);
		await f.reopen(new Engine({ ownedChecks: config }));
		assert.equal(snapshot().executing, false);
		const a = snapshot();
		assert.equal((await f.command({
			type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt,
		}, admin)).status, "accepted");
		while (snapshot().status !== "canceled") {
			assert.ok(Date.now() < deadline, JSON.stringify(snapshot()));
			await setTimeout(20);
		}
		assert.equal(snapshot().executing, false);
		assert.equal((await f.command({
			type: "assignTask", slice: "prepare:failure", delivery: true, packet: packet({ execution: "linux-writer" }),
		})).status, "accepted", "a canceled writer must not keep Slice ownership");
	} finally {
		await f.close();
		await source.close();
	}
});
