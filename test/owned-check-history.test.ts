import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { sourceFixture } from "./support/source.ts";

test("owned check exact command/source/platform receipt survives history, export and reopen", async () => {
	const source = await sourceFixture();
	const config = {
		root: join(source.root, "owned"),
		repositories: { owned: source.repo },
		checks: {
			"revision:3": {
				repository: "owned",
				commit: source.commit,
				profile: source.profile,
				argv: ["sh", "-c", "printf 'delivered\\r\\n' > deliverable; test -L link; test -x run"],
				timeoutMs: 10000,
				verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }));
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
		const read = await f.ledger.artifact(admin, { read: a.report! });
		assert.ok("content" in read);
		const receipt = JSON.parse(read.content.toString());
		assert.equal(receipt.execution.exitCode, 0);
		assert.equal(receipt.verification.status, "source_changed", "a changed result must not inherit the input-source check's pass");
		assert.equal(receipt.execution.platform.os, "linux");
		assert.equal(receipt.source.base.commit, source.commit);
		assert.equal(receipt.source.source.entries.find((e: { path: string }) => e.path === "deliverable").byteLength, 11);
		assert.ok(receipt.source.source.entries.find((e: { path: string }) => e.path === "deliverable").oid);
		assert.equal(receipt.verifierRevision, source.commit);
		assert.deepEqual(receipt.execution.argv, config.checks["revision:3"].argv);
		assert.equal(receipt.source.freeze.running, false);
		const exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported);
		assert.equal(exported.manifest.complete, true);
		assert.ok(
			exported.manifest.exclusions.includes("private_git_source_objects"),
			"history export is not a standalone recoverable source package",
		);
		assert.equal(Buffer.from(exported.content[a.report!]!, "base64").toString(), read.content.toString());
		const packaged = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "owned-package",
				command: { type: "createRecoveryPackage" },
			},
			admin,
		);
		assert.equal(packaged.status, "refused", "a history receipt must not masquerade as a recoverable source package");
		assert.ok(packaged.status === "refused");
		assert.match(packaged.reason, /role-work reconciliation unavailable/);
		await f.reopen(new Engine({ ownedChecks: config }));
		const after = await f.ledger.artifact(admin, { read: a.report! });
		assert.ok("content" in after);
		assert.equal(after.content.toString(), read.content.toString());
	} finally {
		await f.close();
		await source.close();
	}
});
