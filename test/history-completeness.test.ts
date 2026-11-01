import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createWorkflow, enroll, envelope, http, startHost, tempDir } from "./support/host.ts";

test("history-cutoff-export: default selection never widens and pages declare redactions/omissions", async () => {
	const dir = await tempDir("history-scope");
	const host = await startHost(dir.path);
	try {
		const dev = await enroll(host, "reader");
		const w = await createWorkflow(host, dev.bearer, "Original selection");
		const first = await http(host.url, "GET", "/v1/history?limit=1", { bearer: dev.bearer });
		assert.equal(first.status, 200);
		assert.deepEqual((first.body.scope as { workflows: string[] }).workflows, [w]);
		assert.ok(Array.isArray(first.body.redactions), "pages must declare redactions");
		assert.ok(
			(first.body.redactions as string[]).some((ref) => ref.startsWith("receipt:")),
			"pages must declare redacted administrative receipts",
		);
		assert.ok((first.body.omittedKinds as string[]).includes("attempt"));
		const late = await createWorkflow(host, dev.bearer, "New, not selected");
		let cursor: string | null = String(first.body.next);
		while (cursor !== null) {
			const next = await http(host.url, "GET", `/v1/history?limit=1&cursor=${encodeURIComponent(cursor)}`, { bearer: dev.bearer });
			assert.equal(next.status, 200);
			assert.deepEqual(next.body.scope, first.body.scope, "default traversal scope must stay fixed");
			assert.equal(next.body.cutoff, first.body.cutoff);
			assert.ok(!(next.body.records as { workflow: string }[]).some((r) => r.workflow === late));
			cursor = next.body.next as string | null;
		}
		const exported = await http(host.url, "GET", `/v1/export?cursor=${encodeURIComponent(String(first.body.next))}`, {
			bearer: dev.bearer,
		});
		assert.equal(exported.status, 200);
		const manifest = exported.body.manifest as Record<string, unknown>;
		assert.deepEqual(manifest.scope, first.body.scope);
		assert.equal(manifest.cutoff, first.body.cutoff);
		assert.ok(!String(exported.body.jsonl).includes("New, not selected"));
	} finally {
		await host.stop();
		await dir.remove();
	}
});

for (const failure of ["missing_content", "content_corrupt", "invalid_content_type"]) {
	test(`history-cutoff-export: acknowledged message ${failure} cannot become an external link or replacement text`, async () => {
		const dir = await tempDir("history-message-loss");
		let host = await startHost(dir.path);
		try {
			const dev = await enroll(host, "reader");
			const w = await createWorkflow(host, dev.bearer, "Messages");
			const posted = await http(host.url, "POST", "/v1/commands", {
				bearer: dev.bearer,
				body: envelope(
					String(host.ready.authorityEpoch),
					{ type: "postCoordinatorMessage", text: "acknowledged literal" },
					{ workflow: w },
				),
			});
			assert.equal(posted.status, 200);
			const ref = String((posted.body.result as Record<string, unknown>).message);
			await host.stop();
			const db = new DatabaseSync(join(dir.path, "render.db"));
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const record = JSON.parse(row.record);
					if (record.kind !== "render.message") continue;
					if (failure === "missing_content") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						record.data.text = failure === "invalid_content_type" ? null : "forged literal";
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
					}
				}
			} finally {
				db.close();
			}
			host = await startHost(dir.path);
			const exact = await http(host.url, "GET", `/v1/artifacts/${ref}`, { bearer: dev.bearer });
			assert.equal(exact.body.code, failure === "invalid_content_type" ? "content_corrupt" : failure);
			const exported = await http(host.url, "GET", `/v1/export?workflow=${encodeURIComponent(w)}`, { bearer: dev.bearer });
			assert.equal(exported.status, 200);
			const manifest = exported.body.manifest as { complete: boolean; missing: { ref: string; code: string }[] };
			assert.equal(manifest.complete, false, "missing/corrupt acknowledged messages must make export incomplete");
			assert.ok(
				manifest.missing.some((m) => m.ref === ref && m.code === (failure === "invalid_content_type" ? "content_corrupt" : failure)),
			);
			assert.equal(ref in (exported.body.content as object), false);
		} finally {
			await host.stop();
			await dir.remove();
		}
	});
}
