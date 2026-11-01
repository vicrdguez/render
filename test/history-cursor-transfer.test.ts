import assert from "node:assert/strict";
import { test } from "node:test";
import { adminRequest, createWorkflow, enroll, http, save, startHost, tempDir } from "./support/host.ts";

test("history-cutoff-export: different receipt views refuse cursor transfers in both directions", async () => {
	const dir = await tempDir("history-transfer");
	const host = await startHost(dir.path);
	try {
		const device = await enroll(host, "Reader");
		const workflow = await createWorkflow(host, device.bearer, "Transfer");
		assert.equal((await save(host, device.bearer, workflow, "ground", Buffer.from("original"), null)).status, 200);
		const readers = [
			(path: string) => adminRequest(host.admin, "GET", path),
			(path: string) => http(host.url, "GET", path, { bearer: device.bearer }),
		];
		for (const [index, origin] of readers.entries()) {
			const first = await origin("/v1/history?limit=3");
			assert.equal(first.status, 200, first.text);
			assert.equal(typeof first.body.next, "string");
			const cursor = encodeURIComponent(String(first.body.next));
			for (const route of ["history", "export"]) {
				const transferred = await readers[1 - index]?.(`/v1/${route}?limit=3&cursor=${cursor}`);
				assert.equal(transferred?.body.code, "invalid_cursor", "different receipt view must not silently omit or repeat stable refs");
				assert.equal("records" in (transferred?.body ?? {}), false);
			}
			// A refusal must not invalidate the original traversal or change its redactions.
			const refs = (first.body.records as { ref: string }[]).map((r) => r.ref);
			let next = first.body.next as string | null;
			while (next !== null) {
				const page = await origin(`/v1/history?limit=3&cursor=${encodeURIComponent(next)}`);
				assert.equal(page.status, 200, page.text);
				refs.push(...(page.body.records as { ref: string }[]).map((r) => r.ref));
				next = page.body.next as string | null;
				assert.equal(page.body.complete, next === null);
			}
			const whole = await origin(`/v1/export?cursor=${cursor}`);
			assert.equal(whole.status, 200, whole.text);
			assert.deepEqual(
				refs,
				String(whole.body.jsonl)
					.trim()
					.split("\n")
					.map((l) => JSON.parse(l).ref),
			);
			assert.equal(new Set(refs).size, refs.length);
		}
	} finally {
		await host.stop();
		await dir.remove();
	}
});
