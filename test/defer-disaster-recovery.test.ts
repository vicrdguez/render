import assert from "node:assert/strict";
import { test } from "node:test";
import { admin, roleFixture } from "./support/roles.ts";

test("ordinary Ledger state has no disaster bookkeeping and removed management commands are unknown", async () => {
	const f = await roleFixture();
	try {
		for (const type of ["createRecoveryPackage", "repairRecovery", "rotateEpoch"]) {
			const reply = await f.ledger.command(
				{ version: 1, authorityEpoch: f.ledger.status().authorityEpoch, commandId: type, command: { type } },
				admin,
			);
			assert.ok(reply.status === "refused", "removed management command must refuse");
			assert.equal(reply.code, "unknown_command");
		}
		for (const state of [
			f.ledger.status(),
			f.ledger.snapshot(admin),
			await f.ledger.observe(admin, { history: { workflow: "workflow:2" } }),
			await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }),
		]) {
			assert.equal("backup" in state, false, "ordinary state must not expose protection bookkeeping");
			assert.equal("recovery" in state, false, "ordinary state must not expose disaster mode");
		}
		const authority = f.ledger.status().authorityEpoch;
		const executor = f.ledger.status().executorEpoch;
		await f.reopen();
		assert.equal(f.ledger.status().authorityEpoch, authority);
		assert.notEqual(f.ledger.status().executorEpoch, executor);
		const read = await f.ledger.artifact(admin, { read: "revision:3" });
		assert.ok("content" in read);
		assert.equal(read.content.toString(), "Keep exact constraints.\n");
	} finally {
		await f.close();
	}
});
