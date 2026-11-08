import assert from "node:assert/strict";
import { test } from "node:test";
import { admin, roleFixture } from "./support/roles.ts";

test("ordinary Ledger restart preserves authority, rotates executor and retains exact bytes", async () => {
	const f = await roleFixture();
	try {
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
