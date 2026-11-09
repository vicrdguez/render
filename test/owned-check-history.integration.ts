import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { sourceFixture } from "./support/source.ts";

test("owned check exact command/source/platform receipt survives history, export and reopen", async () => {
	const source = await sourceFixture();
	const config = {
		root: join(source.root, "owned"),
		checks: {
			"revision:4": {
				commit: source.commit,
				profile: source.profile,
				argv: ["sh", "-c", "printf 'delivered\\r\\n' > deliverable; test -L link; test -x run"],
				timeoutMs: 10000,
				verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }), { remote: source.repo, defaultBranch: "fixture", checkImage: source.profile.image });
	try {
		const assigned = await f.command({
			type: "assignTask",
			slice: "owned:check",
			delivery: true,
			packet: packet({ execution: "linux-writer" }),
		});
		assert.equal(assigned.status, "accepted");
		let a: RoleAssignment;
		const deadline = Date.now() + 20000;
		for (;;) {
			const snapshot = f.ledger.snapshot(admin);
			assert.ok("assignments" in snapshot);
			a = (snapshot.assignments as RoleAssignment[])[0]!;
			if (a.report && !a.executing) break;
			assert.ok(Date.now() < deadline, JSON.stringify(a));
			await setTimeout(20);
		}
		assert.equal(a.status, "submitted");
		const read = await Effect.runPromise(f.ledger.artifact(admin, { read: a.report! }));
		assert.ok("content" in read);
		const receipt = JSON.parse(read.content.toString());
		assert.equal(receipt.execution.exitCode, 0);
		assert.equal(receipt.verification.status, "source_changed", "a changed result must not inherit the input-source check's pass");
		assert.equal(receipt.execution.platform.os, "linux");
		assert.equal(receipt.source.base.commit, source.commit);
		assert.equal(receipt.source.source.entries.find((e: { path: string }) => e.path === "deliverable").byteLength, 11);
		assert.ok(receipt.source.source.entries.find((e: { path: string }) => e.path === "deliverable").oid);
		assert.equal(receipt.verifierRevision, source.commit);
		assert.deepEqual(receipt.execution.argv, config.checks["revision:4"].argv);
		assert.equal(receipt.source.freeze.running, false);
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in exported);
		assert.equal(exported.manifest.complete, true);
		assert.ok(
			exported.manifest.exclusions.includes("private_git_source_objects"),
			"history export is not a standalone recoverable source package",
		);
		assert.equal(Buffer.from(exported.content[a.report!]!, "base64").toString(), read.content.toString());
		await f.reopen(new Engine({ ownedChecks: config }));
		const after = await Effect.runPromise(f.ledger.artifact(admin, { read: a.report! }));
		assert.ok("content" in after);
		assert.equal(after.content.toString(), read.content.toString());
	} finally {
		await f.close();
		await source.close();
	}
});

for (const [exitCode, status] of [
	[0, "passed"],
	[7, "failed"],
] as const)
	test(`owned check unchanged source with declared generated caches records ${status} for exit ${exitCode}`, async () => {
		const source = await sourceFixture();
		const config = {
			root: join(source.root, "owned"),
			checks: {
				"revision:4": {
					commit: source.commit,
					profile: { ...source.profile, exclusions: [".git", "node_modules", "cache", "absent"] },
					argv: [
						"sh",
						"-c",
						`mkdir node_modules cache; echo dependency > node_modules/package; echo generated > cache/data; exit ${exitCode}`,
					],
					timeoutMs: 10000,
					verifierRevision: source.commit,
				},
			},
		};
		const f = await roleFixture(new Engine({ ownedChecks: config }), { remote: source.repo, defaultBranch: "fixture", checkImage: source.profile.image });
		try {
			assert.equal(
				(
					await f.command({
						type: "assignTask",
						slice: "cache:check",
						delivery: true,
						packet: packet({ execution: "linux-writer" }),
					})
				).status,
				"accepted",
			);
			let a: RoleAssignment;
			const deadline = Date.now() + 20000;
			for (;;) {
				const snapshot = f.ledger.snapshot(admin);
				assert.ok("assignments" in snapshot);
				a = (snapshot.assignments as RoleAssignment[])[0]!;
				if (!a.executing && (a.report || a.status === "blocked")) break;
				assert.ok(Date.now() < deadline, JSON.stringify(a));
				await setTimeout(20);
			}
			assert.equal(a.status, "submitted", a.blocker ?? "expected retained receipt");
			const read = await Effect.runPromise(f.ledger.artifact(admin, { read: a.report! }));
			assert.ok("content" in read);
			const receipt = JSON.parse(read.content.toString());
			assert.equal(receipt.execution.exitCode, exitCode);
			assert.equal(receipt.verification.status, status);
			assert.equal(receipt.verification.inputTree, receipt.verification.resultTree);
			assert.deepEqual(receipt.source.exclusions.sort(), ["cache", "node_modules"]);
			assert.deepEqual(receipt.source.deleted, []);
			assert.deepEqual(
				receipt.source.source.entries.map((entry: { path: string }) => entry.path),
				[".gitattributes", "crlf", "ignored", "link", "run", "subst"],
			);
		} finally {
			await f.close();
			await source.close();
		}
	});
