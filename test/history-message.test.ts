import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflow, enroll, envelope, http, startHost, tempDir } from "./support/host.ts";

test("history-cutoff-export: acknowledged messages are literal claims, not runner or classified outcomes", async () => {
	const dir = await tempDir("history-message");
	const host = await startHost(dir.path);
	try {
		const a = await enroll(host, "A");
		const w = await createWorkflow(host, a.bearer, "Messages");
		const posted = await http(host.url, "POST", "/v1/commands", {
			bearer: a.bearer,
			body: envelope(
				String(host.ready.authorityEpoch),
				{ type: "postCoordinatorMessage", text: "rejected abandoned unknown failed succeeded\r\n" },
				{ workflow: w, commandId: "claim" },
			),
		});
		assert.equal(posted.status, 200);
		const ref = String((posted.body.result as Record<string, unknown>).message);
		const exact = await http(host.url, "GET", `/v1/artifacts/${ref}`, { bearer: a.bearer });
		assert.equal(exact.status, 200, exact.text);
		assert.equal(Buffer.from(String(exact.body.content), "base64").toString("utf8"), "rejected abandoned unknown failed succeeded\r\n");
		assert.equal(exact.body.kind, "message");
		const snapshot = await http(host.url, "GET", "/v1/snapshot", { bearer: a.bearer });
		assert.equal((snapshot.body.history as Record<string, unknown>).status, "available");
		assert.equal(((snapshot.body.workflows as { unavailable: string[] }[])[0]?.unavailable ?? []).includes("historical-export"), false);
		const bundle = await http(host.url, "GET", `/v1/export?workflow=${encodeURIComponent(w)}`, { bearer: a.bearer });
		assert.equal(bundle.status, 200);
		const records = String(bundle.body.jsonl)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		const message = records.find((r) => r.ref === ref);
		assert.equal(message.outcome, null);
		assert.equal(message.claimType, "human_text");
		assert.deepEqual(message.parents, []);
		assert.deepEqual(message.outcomeRefs, []);
		assert.equal(
			records.some((r) => r.kind === "runner_receipt"),
			false,
		);
		const filtered = await http(host.url, "GET", `/v1/export?workflow=${encodeURIComponent(w)}&kind=message`, { bearer: a.bearer });
		const only = String(filtered.body.jsonl)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(
			only.map((r) => r.ref),
			[ref],
		);
	} finally {
		await host.stop();
		await dir.remove();
	}
});
