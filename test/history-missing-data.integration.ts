import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { createWorkflow, enroll, http, save, startHost, tempDir } from "./support/host.ts";

for (const failure of ["missing_content", "content_corrupt", "unsupported_schema"]) {
	test(`history-cutoff-export: ${failure} is declared, never substituted`, async () => {
		const dir = await tempDir("history-missing");
		let host = await startHost(dir.path);
		try {
			const dev = await enroll(host, "reader");
			const w = await createWorkflow(host, dev.bearer, "Damaged");
			const saved = await save(host, dev.bearer, w, "ground", Buffer.from("original bytes"), null);
			const ref = String((saved.body.result as Record<string, unknown>).revision);
			await host.stop();
			// Fault injection only; all observations below use the public protocol.
			const db = new DatabaseSync(join(dir.path, "render.db"));
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const record = JSON.parse(row.record);
					if (record.kind !== "render.revision") continue;
					if (failure === "missing_content") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						if (failure === "content_corrupt") record.data.text = "forged bytes";
						else record.data.schema = 99;
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
					}
				}
			} finally {
				db.close();
			}
			host = await startHost(dir.path);
			const read = await http(host.url, "GET", `/v1/artifacts/${ref}`, { bearer: dev.bearer });
			assert.equal(read.body.code, failure);
			const exported = await http(host.url, "GET", `/v1/export?workflow=${encodeURIComponent(w)}`, { bearer: dev.bearer });
			assert.equal(exported.status, 200, exported.text);
			const manifest = exported.body.manifest as { complete: boolean; missing: { ref: string; code: string }[] };
			assert.equal(manifest.complete, false);
			assert.ok(manifest.missing.some((m) => m.ref === ref && m.code === failure));
			assert.equal(ref in (exported.body.content as object), false);
			assert.ok(!String(exported.body.text).includes("forged bytes"));
		} finally {
			await host.stop();
			await dir.remove();
		}
	});
}
