import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { adminRequest, createWorkflow, enroll, envelope, http, ROOT, save, startHost, tempDir } from "./support/host.ts";

const ORIGINAL = Buffer.from("original\r\n☃\n", "utf8");
type Row = { ref: string; kind: string; sequence: number; parents: string[]; supersedes: string[]; outcome: unknown; commandId: string };
type Bundle = {
	version: number;
	manifest: { cutoff: number; complete: boolean; exclusions: string[]; missing: unknown[] };
	jsonl: string;
	text: string;
	content: Record<string, string>;
};

function rows(b: Bundle): Row[] {
	return b.jsonl
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l) as Row);
}

test("history-cutoff-export: exact separate identities, fixed pages/export after restart and concurrent writes", async () => {
	const dir = await tempDir("history");
	let host = await startHost(dir.path);
	try {
		const a = await enroll(host, "A");
		const b = await enroll(host, "B");
		const workflow = await createWorkflow(host, a.bearer, "History");
		const first = await save(host, a.bearer, workflow, "ground", ORIGINAL, null, "original-one");
		assert.equal(first.status, 200);
		const r1 = String((first.body.result as Record<string, unknown>).revision);
		const second = await save(host, b.bearer, workflow, "ground", ORIGINAL, r1, "original-two");
		assert.equal(second.status, 200);
		const r2 = String((second.body.result as Record<string, unknown>).revision);
		assert.notEqual(r1, r2);
		const q = `workflow=${encodeURIComponent(workflow)}`;
		const start = await http(host.url, "GET", `/v1/history?${q}&limit=1`, { bearer: a.bearer });
		assert.equal(start.status, 200, start.text);
		assert.equal(start.body.complete, false);
		const cursor = String(start.body.next);
		const cutoff = Number(start.body.cutoff);
		assert.equal(cutoff, Number(second.body.sequence));
		const late = await save(host, b.bearer, workflow, "ground", Buffer.from("later\n"), r2, "late");
		assert.equal(late.status, 200);
		await createWorkflow(host, b.bearer, "Later workflow");
		await host.stop();
		host = await startHost(dir.path);
		const seen = [...(start.body.records as Row[])];
		let next: string | null = cursor;
		while (next !== null) {
			const page = await http(host.url, "GET", `/v1/history?${q}&limit=2&cursor=${encodeURIComponent(next)}`, { bearer: b.bearer });
			assert.equal(page.status, 200, page.text);
			assert.equal(page.body.cutoff, cutoff, "history cutoff must not drift");
			seen.push(...(page.body.records as Row[]));
			next = page.body.next as string | null;
			assert.equal(page.body.complete, next === null);
		}
		assert.deepEqual(
			seen.filter((r) => r.kind === "ground").map((r) => r.ref),
			[r1, r2],
			"pages retain both original identities only",
		);
		assert.equal(new Set(seen.map((r) => r.ref)).size, seen.length);
		assert.ok(seen.every((r) => r.sequence <= cutoff));
		const exported = await http(host.url, "GET", `/v1/export?${q}&cursor=${encodeURIComponent(cursor)}`, { bearer: b.bearer });
		assert.equal(exported.status, 200, exported.text);
		const bundle = exported.body as unknown as Bundle;
		assert.equal(bundle.version, 1);
		assert.equal(bundle.manifest.cutoff, cutoff, "export cutoff must not drift");
		assert.equal(bundle.manifest.complete, true);
		assert.deepEqual(bundle.manifest.missing, []);
		assert.deepEqual(bundle.manifest.exclusions, [
			"unsaved_client_buffers",
			"uncommitted_provider_streams",
			"unsnapshotted_worker_files",
			"latest_only_live_partials",
			"unpromoted_nested_results",
			"active_task_memos",
		]);
		const revisions = rows(bundle).filter((r) => r.kind === "ground");
		assert.deepEqual(
			revisions.map((r) => r.ref),
			[r1, r2],
			"export must retain superseded identities, not latest only",
		);
		assert.deepEqual(revisions[0]?.parents, []);
		assert.deepEqual(revisions[1]?.parents, [r1]);
		assert.deepEqual(revisions[1]?.supersedes, [r1]);
		assert.deepEqual(
			revisions.map((r) => r.commandId),
			["original-one", "original-two"],
		);
		assert.ok(revisions.every((r) => r.outcome === null));
		for (const ref of [r1, r2]) {
			assert.deepEqual(Buffer.from(bundle.content[ref] as string, "base64"), ORIGINAL, `export exact bytes of ${ref}`);
			const read = await http(host.url, "GET", `/v1/artifacts/${ref}`, { bearer: a.bearer });
			assert.equal(read.status, 200);
			assert.deepEqual(Buffer.from(String(read.body.content), "base64"), ORIGINAL);
			assert.deepEqual(read.body.supersedes, ref === r1 ? [] : [r1]);
		}
		assert.ok(!bundle.text.includes("later\n"));
		const path = join(dir.path, "export.json");
		await writeFile(path, JSON.stringify(bundle));
		const decoded = JSON.parse(execFileSync(process.execPath, [join(ROOT, "src/client/read-export.ts"), path], { encoding: "utf8" }));
		assert.equal(decoded.complete, true);
		assert.deepEqual(
			decoded.documents.filter((d: { kind: string }) => d.kind === "ground").map((d: { text: string }) => d.text),
			["original\r\n☃\n", "original\r\n☃\n"],
		);
		const fresh = await http(host.url, "GET", `/v1/history?${q}`, { bearer: a.bearer });
		assert.ok((fresh.body.records as Row[]).some((r) => r.commandId === "late"));
	} finally {
		await host.stop();
		await dir.remove();
	}
});

test("history-cutoff-export: scope, malformed filters/cursors, absent capabilities, and revocation", async () => {
	const dir = await tempDir("history-auth");
	const host = await startHost(dir.path);
	try {
		const a = await enroll(host, "A");
		const w = await createWorkflow(host, a.bearer, "Private");
		await save(host, a.bearer, w, "ground", ORIGINAL, null);
		const scoped = await enroll(host, "other", []);
		const q = `workflow=${encodeURIComponent(w)}`;
		const first = await http(host.url, "GET", `/v1/history?${q}&limit=1`, { bearer: a.bearer });
		assert.equal(first.status, 200);
		const cursor = encodeURIComponent(String(first.body.next));
		for (const route of ["history", "export"]) {
			assert.equal((await http(host.url, "GET", `/v1/${route}?${q}`, { bearer: scoped.bearer })).body.code, "unauthorized");
			assert.equal((await http(host.url, "GET", `/v1/${route}?cursor=${cursor}`, { bearer: scoped.bearer })).body.code, "invalid_cursor");
			assert.equal((await http(host.url, "GET", `/v1/${route}?cursor=bogus`, { bearer: a.bearer })).body.code, "invalid_cursor");
			assert.equal(
				(await http(host.url, "GET", `/v1/${route}?cursor=${cursor}&workflow=other`, { bearer: a.bearer })).body.code,
				"invalid_cursor",
			);
			assert.equal((await http(host.url, "GET", `/v1/${route}?proposal=x`, { bearer: a.bearer })).body.code, "capability_unavailable");
			assert.equal((await http(host.url, "GET", `/v1/${route}?assignment=x`, { bearer: a.bearer })).body.code, "capability_unavailable");
			assert.equal((await http(host.url, "GET", `/v1/${route}?outcome=unknown`, { bearer: a.bearer })).body.code, "capability_unavailable");
			assert.equal((await http(host.url, "GET", `/v1/${route}?version=99`, { bearer: a.bearer })).body.code, "unsupported_version");
			assert.equal((await http(host.url, "GET", `/v1/${route}?limit=-1`, { bearer: a.bearer })).body.code, "invalid_query");
		}
		await adminRequest(
			host.admin,
			"POST",
			"/v1/admin/commands",
			envelope(String(host.ready.authorityEpoch), { type: "revokeDevice", device: a.device }),
		);
		for (const route of ["history", "export"]) {
			const denied = await http(host.url, "GET", `/v1/${route}?${q}&cursor=${cursor}`, { bearer: a.bearer });
			assert.equal(denied.body.code, "unauthorized");
			assert.equal("records" in denied.body, false);
		}
	} finally {
		await host.stop();
		await dir.remove();
	}
});
