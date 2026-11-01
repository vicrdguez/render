// V2: Ledger on real SQLite through the actual HTTP and admin-socket adapters.
import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
	adminRequest,
	assertNoDisclosure,
	createWorkflow,
	enroll,
	envelope,
	type HostProcess,
	http,
	save,
	sha256,
	startHost,
	tempDir,
} from "./support/host.ts";
import { A1, B1, B2, BAD, BOM, G1 } from "./support/literals.ts";
import { seeded } from "./support/random.ts";

const SCHEDULES = Number(process.env.RENDER_V2_SCHEDULES ?? 32);
const BATCH = 32;

async function artifact(host: HostProcess, bearer: string, ref: string) {
	return http(host.url, "GET", `/v1/artifacts/${encodeURIComponent(ref)}`, { bearer });
}

async function snapshot(host: HostProcess, bearer: string) {
	return http(host.url, "GET", "/v1/snapshot?version=1", { bearer });
}

function workflowView(snap: Record<string, unknown>, id: string): Record<string, unknown> | undefined {
	return (snap.workflows as Record<string, unknown>[]).find((w) => w.workflow === id);
}

function currentRevision(snap: Record<string, unknown>, workflow: string, document: string): string | null {
	const docs = (workflowView(snap, workflow)?.documents ?? []) as Record<string, unknown>[];
	const d = docs.find((x) => x.document === document);
	return d === undefined ? null : String(d.revision);
}

describe("B1 authority precedes disclosure (literal cases)", () => {
	let dir: Awaited<ReturnType<typeof tempDir>>;
	let host: HostProcess;
	let a: { device: string; bearer: string };
	let b: { device: string; bearer: string };
	let scoped: { device: string; bearer: string };
	let w1: string;
	let w2: string;
	let epoch: string;
	let acceptedId: string;
	let accepted: Record<string, unknown>;

	before(async () => {
		dir = await tempDir("v2-b1");
		host = await startHost(dir.path);
		epoch = String(host.ready.authorityEpoch);
		a = await enroll(host, "device A");
		b = await enroll(host, "device B");
		w1 = await createWorkflow(host, a.bearer, "Workflow one");
		w2 = await createWorkflow(host, a.bearer, "Workflow two");
		scoped = await enroll(host, "scoped", [w1]);
		acceptedId = "a-lost-reply-1";
		const r = await save(host, a.bearer, w2, "ground", G1.bytes, null, acceptedId);
		assert.equal(r.status, 200, r.text);
		accepted = r.body;
	});
	after(async () => {
		await host?.stop();
		await dir?.remove();
	});

	test("B1-01/B1-02 missing or invalid credentials disclose nothing", async () => {
		const paths: [string, string][] = [
			["POST", "/v1/commands"],
			["GET", `/v1/commands/${acceptedId}`],
			["GET", "/v1/snapshot?version=1"],
			["GET", `/v1/artifacts/${encodeURIComponent(String((accepted.result as Record<string, unknown>).revision))}`],
			["GET", "/v1/observe?version=1"],
		];
		for (const bearer of [undefined, "render_device:1_AAAA", `${a.bearer}x`, "garbage"]) {
			for (const [method, path] of paths) {
				const r = await http(host.url, method, path, {
					bearer,
					body: method === "POST" ? envelope(epoch, { type: "createWorkflow", title: "x" }) : undefined,
				});
				assert.equal(r.status, 401, `${method} ${path} with ${bearer}`);
				assert.equal(r.body.code, "unauthorized");
				assertNoDisclosure(r.body);
			}
		}
	});

	test("B1-03 forged principal fields in the envelope are malformed", async () => {
		const seqBefore = Number((await snapshot(host, a.bearer)).body.sequence);
		for (const field of ["principal", "by", "device", "capabilities"]) {
			const e = envelope(epoch, { type: "createWorkflow", title: "forged" });
			e[field] = field === "capabilities" ? ["host"] : "host";
			const r = await http(host.url, "POST", "/v1/commands", { bearer: a.bearer, body: e });
			assert.equal(r.status, 400, field);
			assert.equal(r.body.code, "malformed_envelope");
			const inner = envelope(epoch, { type: "createWorkflow", title: "forged", [field]: "human" });
			const r2 = await http(host.url, "POST", "/v1/commands", { bearer: a.bearer, body: inner });
			assert.equal(r2.status, 400, `command.${field}`);
			assert.equal(r2.body.code, "malformed_envelope");
		}
		assert.equal(Number((await snapshot(host, a.bearer)).body.sequence), seqBefore);
	});

	test("B1-04/B1-05/B1-06 headers cannot raise a device to local admin or host", async () => {
		for (const command of [
			{ type: "enrollDevice", label: "rogue", scope: { workflows: "all" } },
			{ type: "revokeDevice", device: b.device },
			{ type: "recordStartup", executorEpoch: "executor-forged", persistence: { journal_mode: "wal" } },
		]) {
			const r = await http(host.url, "POST", "/v1/commands", {
				bearer: a.bearer,
				body: envelope(epoch, command),
				headers: { "x-render-principal": "host", "x-forwarded-user": "admin", "x-render-route": "local-admin" },
			});
			assert.equal(r.status, 403, `${command.type}: ${r.text}`);
			assert.equal(r.body.code, "forbidden_principal");
		}
		const devices = await adminRequest(host.admin, "GET", "/v1/admin/devices");
		const list = devices.body.devices as Record<string, unknown>[];
		assert.ok(!list.some((d) => d.label === "rogue"));
		assert.equal(list.find((d) => d.device === b.device)?.revoked, false);
	});

	test("B1-07/B1-08 unknown and unavailable commands never succeed", async () => {
		const unknown = await http(host.url, "POST", "/v1/commands", { bearer: a.bearer, body: envelope(epoch, { type: "dropTables" }) });
		assert.equal(unknown.status, 400);
		assert.equal(unknown.body.code, "unknown_command");
		const future = await http(host.url, "POST", "/v1/commands", {
			bearer: a.bearer,
			body: envelope(epoch, { type: "approveCheckpoint" }, { workflow: w1 }),
		});
		assert.equal(future.status, 501);
		assert.equal(future.body.code, "capability_unavailable");
	});

	test("B1-09 a second device retrying the original ID and bytes receives the original receipt", async () => {
		const r = await save(host, b.bearer, w2, "ground", G1.bytes, null, acceptedId);
		assert.equal(r.status, 200, `a second device's retry must return the original receipt: ${r.text}`);
		assert.equal(r.body.duplicate, true);
		const { duplicate: _d1, ...original } = accepted;
		const { duplicate: _d2, ...again } = r.body;
		assert.deepEqual(again, original);
		assert.deepEqual(r.body.acceptedBy, { principal: "human", route: "device", device: a.device });
		const lookup = await http(host.url, "GET", `/v1/commands/${acceptedId}`, { bearer: b.bearer });
		assert.equal(lookup.status, 200);
		assert.equal(lookup.body.sequence, accepted.sequence);
		const snap = await snapshot(host, b.bearer);
		const docs = workflowView(snap.body, w2)?.documents as Record<string, unknown>[];
		assert.equal(docs.find((d) => d.document === "ground")?.revisionCount, 1);
	});

	test("B1-10 a changed payload under the same ID conflicts without disclosure", async () => {
		const r = await save(host, b.bearer, w2, "ground", A1.bytes, null, acceptedId);
		assert.equal(r.status, 409, `a changed payload under a used ID must conflict: ${r.text}`);
		assert.equal(r.body.code, "command_conflict");
		assertNoDisclosure(r.body);
	});

	test("B1-12/B1-13 a scoped device sees only its workflows", async () => {
		const lookup = await http(host.url, "GET", `/v1/commands/${acceptedId}`, { bearer: scoped.bearer });
		const absent = await http(host.url, "GET", "/v1/commands/never-used-id", { bearer: scoped.bearer });
		assert.equal(lookup.status, 404);
		assert.equal(lookup.text, absent.text);
		const ref = String((accepted.result as Record<string, unknown>).revision);
		const art = await artifact(host, scoped.bearer, ref);
		const missing = await artifact(host, scoped.bearer, "revision:999999");
		assert.equal(art.status, 404);
		assert.equal(art.text, missing.text);
		const snap = await snapshot(host, scoped.bearer);
		assert.deepEqual(
			(snap.body.workflows as Record<string, unknown>[]).map((w) => w.workflow),
			[w1],
		);
		const cmd = await save(host, scoped.bearer, w2, "notes", A1.bytes, null);
		assert.equal(cmd.status, 403);
		assert.equal(cmd.body.code, "forbidden_scope");
		const create = await http(host.url, "POST", "/v1/commands", {
			bearer: scoped.bearer,
			body: envelope(epoch, { type: "createWorkflow", title: "scoped create" }),
		});
		assert.equal(create.status, 403);
		assert.equal(create.body.code, "forbidden_scope");
	});

	test("B1-16 a different authority epoch is refused", async () => {
		const r = await http(host.url, "POST", "/v1/commands", {
			bearer: a.bearer,
			body: envelope("authority-other", { type: "createWorkflow", title: "x" }),
		});
		assert.equal(r.status, 409);
		assert.equal(r.body.code, "authority_epoch_mismatch");
	});

	test("B1-11 a revoked device cannot recover its receipt through deduplication", async () => {
		const c = await enroll(host, "device C");
		const id = "c-accepted-1";
		const first = await save(host, c.bearer, w1, "c-doc", A1.bytes, null, id);
		assert.equal(first.status, 200);
		const revoke = await adminRequest(
			host.admin,
			"POST",
			"/v1/admin/commands",
			envelope(epoch, { type: "revokeDevice", device: c.device }),
		);
		assert.equal(revoke.status, 200, revoke.text);
		const retry = await save(host, c.bearer, w1, "c-doc", A1.bytes, null, id);
		assert.equal(retry.status, 401, `a revoked device's retry must not disclose the receipt: ${retry.text}`);
		assertNoDisclosure(retry.body);
		const lookup = await http(host.url, "GET", `/v1/commands/${id}`, { bearer: c.bearer });
		assert.equal(lookup.status, 401);
		assertNoDisclosure(lookup.body);
	});

	test("B1-14 enrollment uses the restrictive owner route and the bearer is never retained", async () => {
		const dirMode = (await stat(host.data)).mode & 0o777;
		const sockMode = (await stat(host.admin)).mode & 0o777;
		assert.equal(dirMode, 0o700);
		assert.equal(sockMode, 0o600);
		const e = envelope(
			epoch,
			{ type: "enrollDevice", label: "secret-check", scope: { workflows: "all" } },
			{ commandId: "enroll-secret-1" },
		);
		const first = await adminRequest(host.admin, "POST", "/v1/admin/commands", e);
		assert.equal(first.status, 200, first.text);
		const bearer = String((first.body.credential as Record<string, unknown>).bearer);
		const match = /^render_(device:\d+)_([A-Za-z0-9_-]+)$/.exec(bearer);
		assert.ok(match, bearer);
		const secret = String(match?.[2]);
		assert.equal(Buffer.from(secret, "base64url").length, 32);
		const dup = await adminRequest(host.admin, "POST", "/v1/admin/commands", e);
		assert.equal(dup.body.duplicate, true);
		assert.ok(!dup.text.includes(secret));
		assert.ok(!("credential" in dup.body));
		const ok = await snapshot(host, bearer);
		assert.equal(ok.status, 200);
		for (const name of await readdir(host.data)) {
			if (name.endsWith(".sock")) continue;
			const bytes = await readFile(join(host.data, name));
			assert.ok(!bytes.includes(Buffer.from(secret)), `${name} contains the bearer secret`);
			assert.ok(!bytes.includes(Buffer.from(bearer)), `${name} contains the bearer`);
		}
		assert.ok(!host.stdout.join("\n").includes(secret));
		assert.ok(!host.stderr.join("\n").includes(secret));
	});
});

describe("B1-15 in-process contexts cannot be hand-built", () => {
	test("a context object not minted by a trusted adapter is refused", async () => {
		const dir = await tempDir("v2-inproc");
		const { openHost } = await import("../src/host/host.ts");
		const host = await openHost({ data: dir.path, port: 0 });
		try {
			const before = host.ledger.status().sequence;
			for (const forged of [
				{ kind: "host", scope: "recovery" },
				{ kind: "human", human: "human:owner", route: "local-admin" },
			]) {
				const r = await host.ledger.command(
					envelope(host.authorityEpoch, { type: "createWorkflow", title: "forged" }) as never,
					forged as never,
				);
				assert.equal(r.status, "refused");
				assert.equal(r.status === "refused" && r.code, "untrusted_context");
			}
			assert.equal(host.ledger.status().sequence, before);
		} finally {
			await host.close();
			await dir.remove();
		}
	});
});

describe("B2 acknowledgement is immutable and atomic (literal cases)", () => {
	let dir: Awaited<ReturnType<typeof tempDir>>;
	let host: HostProcess;
	let a: { device: string; bearer: string };
	let b: { device: string; bearer: string };
	let w: string;

	before(async () => {
		dir = await tempDir("v2-b2");
		host = await startHost(dir.path);
		a = await enroll(host, "A");
		b = await enroll(host, "B");
		w = await createWorkflow(host, a.bearer, "Save safely");
	});
	after(async () => {
		await host?.stop();
		await dir?.remove();
	});

	test("B2-01/B2-02/B2-03/B2-04/B2-05/B2-06/B2-11 exact bytes, stale basis and atomic visibility", async () => {
		const g = await save(host, a.bearer, w, "ground", G1.bytes, null);
		assert.equal(g.status, 200, g.text);
		const gr = g.body.result as Record<string, unknown>;
		assert.equal(gr.digest, G1.digest);
		assert.equal(gr.byteLength, G1.byteLength);
		const r0 = String(gr.revision);
		const bom = await save(host, a.bearer, w, "bom", BOM.bytes, null);
		assert.equal((bom.body.result as Record<string, unknown>).digest, BOM.digest);

		const seq0 = Number(g.body.sequence);
		assert.equal(Number(bom.body.sequence), seq0 + 1);

		const bad = await save(host, a.bearer, w, "bad", BAD.bytes, null);
		assert.equal(bad.status, 400);
		assert.equal(bad.body.code, "invalid_content");

		// Both clients hold basis r0. A saves first.
		const ra = await save(host, a.bearer, w, "ground", A1.bytes, r0);
		assert.equal(ra.status, 200, ra.text);
		assert.equal(Number(ra.body.sequence), seq0 + 2);
		const raRef = String((ra.body.result as Record<string, unknown>).revision);
		assert.equal((ra.body.result as Record<string, unknown>).parent, r0);
		// Visible together: receipt, pointer and bytes.
		assert.equal(currentRevision((await snapshot(host, b.bearer)).body, w, "ground"), raRef);
		assert.equal(Buffer.from(String((await artifact(host, b.bearer, raRef)).body.content), "base64").equals(A1.bytes), true);

		const staleId = "b-stale-1";
		const stale = await save(host, b.bearer, w, "ground", B1.bytes, r0, staleId);
		assert.equal(stale.status, 409, `a stale save must be refused: ${stale.text}`);
		assert.equal(stale.body.code, "stale_basis");
		assert.deepEqual(stale.body.refs, { current: raRef, expected: r0 });
		assert.equal(typeof stale.body.reason, "string");
		assert.ok((stale.body.repair as unknown[]).length > 0);
		const staleAgain = await save(host, b.bearer, w, "ground", B1.bytes, r0, staleId);
		assert.equal(staleAgain.body.code, "stale_basis");

		// Unrelated document saves do not stale the ground basis.
		const notes = await save(host, a.bearer, w, "notes", A1.bytes, null);
		assert.equal(notes.status, 200);
		const rb = await save(host, b.bearer, w, "ground", B2.bytes, raRef);
		assert.equal(rb.status, 200, rb.text);
		assert.equal((rb.body.result as Record<string, unknown>).parent, raRef);
		const rbRef = String((rb.body.result as Record<string, unknown>).revision);

		const nullExisting = await save(host, a.bearer, w, "ground", A1.bytes, null);
		assert.equal(nullExisting.body.code, "stale_basis");
		const refAbsent = await save(host, a.bearer, w, "absent-doc", A1.bytes, raRef);
		assert.equal(refAbsent.body.code, "stale_basis");

		await host.stop();
		host = await startHost(dir.path);
		for (const [ref, lit] of [
			[r0, G1],
			[raRef, A1],
			[rbRef, B2],
		] as const) {
			const art = await artifact(host, a.bearer, ref);
			assert.equal(art.status, 200, art.text);
			const bytes = Buffer.from(String(art.body.content), "base64");
			assert.ok(bytes.equals(lit.bytes), `exact bytes of ${ref} after restart`);
			assert.equal(art.body.digest, lit.digest);
			assert.equal(art.body.byteLength, lit.byteLength);
			assert.equal(art.body.mediaType, "text/markdown");
		}
		const bomArt = await artifact(host, a.bearer, String((bom.body.result as Record<string, unknown>).revision));
		assert.ok(Buffer.from(String(bomArt.body.content), "base64").equals(BOM.bytes));
		const snap = await snapshot(host, a.bearer);
		assert.equal(currentRevision(snap.body, w, "ground"), rbRef);
		assert.equal(workflowView(snap.body, w)?.ground !== null, true);
		// B1's stale bytes were never acknowledged anywhere.
		const allDigests = JSON.stringify(snap.body);
		assert.ok(!allDigests.includes(B1.digest));
	});
});

describe("B2 document names that collide with object prototype keys", () => {
	test("a document named constructor is created, read and updated like any other", async () => {
		const dir = await tempDir("v2-proto");
		const host = await startHost(dir.path);
		try {
			const dev = await enroll(host, "proto");
			const w = await createWorkflow(host, dev.bearer, "prototype keys");
			const first = await save(host, dev.bearer, w, "constructor", A1.bytes, null);
			assert.equal(first.status, 200, `new document named constructor must be accepted: ${first.text}`);
			const r1 = String((first.body.result as Record<string, unknown>).revision);
			assert.equal((first.body.result as Record<string, unknown>).parent, null);
			const second = await save(host, dev.bearer, w, "constructor", B2.bytes, r1);
			assert.equal(second.status, 200, second.text);
			assert.equal((second.body.result as Record<string, unknown>).parent, r1);
			const art = await artifact(host, dev.bearer, r1);
			assert.ok(Buffer.from(String(art.body.content), "base64").equals(A1.bytes));
			assert.equal(
				currentRevision((await snapshot(host, dev.bearer)).body, w, "constructor"),
				(second.body.result as Record<string, unknown>).revision,
			);
			assert.equal(host.proc.exitCode, null, "the host must keep serving");
		} finally {
			await host.stop();
			await dir.remove();
		}
	});
});

describe("B2-10 corrupt referenced bytes", () => {
	test("tampered stored bytes are refused with an exact restoration ref and never substituted", async () => {
		const dir = await tempDir("v2-corrupt");
		try {
			let host = await startHost(dir.path);
			const dev = await enroll(host, "corrupt");
			const w = await createWorkflow(host, dev.bearer, "corrupt");
			const g = await save(host, dev.bearer, w, "ground", G1.bytes, null);
			const r0 = String((g.body.result as Record<string, unknown>).revision);
			const a = await save(host, dev.bearer, w, "ground", A1.bytes, r0);
			const ra = String((a.body.result as Record<string, unknown>).revision);
			await host.stop();
			// Offline fault injection: alter the retained text of revision ra inside the stored record.
			const { DatabaseSync } = await import("node:sqlite");
			const db = new DatabaseSync(join(dir.path, "render.db"));
			const rows = db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[];
			const target = rows.filter((r) => r.record.includes("Saved by A: first exact revision"));
			assert.equal(target.length, 1);
			const tampered = (target[0] as { record: string }).record.replace("first exact", "forged exact");
			db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(tampered, (target[0] as { id: number }).id);
			db.close();

			host = await startHost(dir.path);
			try {
				const before = Number((await snapshot(host, dev.bearer)).body.sequence);
				const art = await artifact(host, dev.bearer, ra);
				assert.equal(art.status, 409, `a corrupt revision must be refused, not served: ${art.text}`);
				assert.equal(art.body.code, "content_corrupt");
				assert.deepEqual(art.body.refs, { restore: ra });
				assert.ok(!("content" in art.body));
				assert.ok(!art.text.includes("forged"));
				const blocked = await save(host, dev.bearer, w, "ground", B2.bytes, ra);
				assert.equal(blocked.status, 409, blocked.text);
				assert.equal(blocked.body.code, "content_corrupt");
				assert.deepEqual(blocked.body.refs, { restore: ra });
				assert.equal(Number((await snapshot(host, dev.bearer)).body.sequence), before);
				// The intact older revision is still served exactly; it is not offered in place of ra.
				const old = await artifact(host, dev.bearer, r0);
				assert.ok(Buffer.from(String(old.body.content), "base64").equals(G1.bytes));
			} finally {
				await host.stop();
			}
		} finally {
			await dir.remove();
		}
	});
});

describe("B2 supported document sizes and encoding boundaries", () => {
	for (const [size, digest] of [
		[4_194_304, "sha256:a58789e910e5f939afc433a00fef5930702927dc192cb237fd9e7449bd6ffe1d"],
		[16_777_216, "sha256:e6c907c2d418fa03118465063701b759c4f0f0a9d70ae90aa7cec552e2d33931"],
	] as const) {
		test(`${size} exact UTF-8 bytes save and survive restart`, async () => {
			const dir = await tempDir("v2-size");
			let host = await startHost(dir.path);
			try {
				const dev = await enroll(host, "sizes");
				const w = await createWorkflow(host, dev.bearer, "supported sizes");
				const bytes = Buffer.alloc(size, "A");
				const reply = await save(host, dev.bearer, w, "ground", bytes, null);
				assert.equal(reply.status, 200, `supported-size save must be accepted: ${reply.text}`);
				assert.equal((reply.body.result as Record<string, unknown>).digest, digest);
				assert.equal((reply.body.result as Record<string, unknown>).byteLength, size);
				const ref = String((reply.body.result as Record<string, unknown>).revision);
				await host.stop();
				host = await startHost(dir.path);
				const art = await artifact(host, dev.bearer, ref);
				assert.equal(art.status, 200);
				assert.equal(art.body.digest, digest);
				assert.equal(art.body.byteLength, size);
				assert.ok(Buffer.from(String(art.body.content), "base64").equals(bytes));
				assert.equal(currentRevision((await snapshot(host, dev.bearer)).body, w, "ground"), ref);
			} finally {
				await host.stop();
				await dir.remove();
			}
		});
	}

	test("oversized and malformed complete bytes refuse without advancing state", async () => {
		const dir = await tempDir("v2-encoding");
		const host = await startHost(dir.path);
		try {
			const dev = await enroll(host, "encoding");
			const w = await createWorkflow(host, dev.bearer, "encoding limits");
			const before = Number((await snapshot(host, dev.bearer)).body.sequence);
			const oversized = await save(host, dev.bearer, w, "ground", Buffer.alloc(16_777_217, "A"), null);
			assert.equal(oversized.status, 400, `oversized document must deliberately refuse: ${oversized.text}`);
			assert.equal(oversized.body.code, "malformed_envelope");
			assert.match(String(oversized.body.reason), /content exceeds 16777216 bytes/);
			for (const content of ["A", "AAA", "A===", "====", "AA=A", "AA==AAAA", "AA-_", "AA\n=", `${"QUFB".repeat(1_048_576)}!`]) {
				const bad = await http(host.url, "POST", "/v1/commands", {
					bearer: dev.bearer,
					body: envelope(String(host.ready.authorityEpoch), { type: "saveDocument", document: "ground", mediaType: "text/plain", content }, {
						workflow: w, expected: { document: null },
					}),
				});
				assert.equal(bad.status, 400, `malformed base64 must deliberately refuse: ${bad.text}`);
				assert.equal(bad.body.code, "malformed_envelope");
			}
			assert.equal(Number((await snapshot(host, dev.bearer)).body.sequence), before);
			for (const [document, bytes] of [["empty", Buffer.alloc(0)], ["pad2", Buffer.from("A")], ["pad1", Buffer.from("AA")]] as const) {
				const ok = await save(host, dev.bearer, w, document, bytes, null);
				assert.equal(ok.status, 200, ok.text);
				const art = await artifact(host, dev.bearer, String((ok.body.result as Record<string, unknown>).revision));
				assert.ok(Buffer.from(String(art.body.content), "base64").equals(bytes));
			}
		} finally {
			await host.stop();
			await dir.remove();
		}
	});
});

describe("B4 retained application schema compatibility", () => {
	test("unknown revision and message schemas block affected reads and saves without changing retained records", async () => {
		const dir = await tempDir("v2-record-schema");
		let host = await startHost(dir.path);
		try {
			const dev = await enroll(host, "schemas");
			const w = await createWorkflow(host, dev.bearer, "retained schemas");
			const g = await save(host, dev.bearer, w, "ground", G1.bytes, null);
			const ref = String((g.body.result as Record<string, unknown>).revision);
			const message = await http(host.url, "POST", "/v1/commands", {
				bearer: dev.bearer,
				body: envelope(String(host.ready.authorityEpoch), { type: "postCoordinatorMessage", text: "retained message literal" }, { workflow: w }),
			});
			assert.equal(message.status, 200);
			await host.stop();
			const { DatabaseSync } = await import("node:sqlite");
			// Controlled offline compatibility injection, not an outcome oracle. Change only application schema.
			const db = new DatabaseSync(join(dir.path, "render.db"));
			const injected: { id: number; record: string }[] = [];
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const record = JSON.parse(row.record);
					if (record.kind !== "render.revision" && record.kind !== "render.message") continue;
					record.data.schema = 99;
					const text = JSON.stringify(record);
					db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(text, row.id);
					injected.push({ id: row.id, record: text });
				}
			} finally {
				db.close();
			}
			assert.equal(injected.length, 2);
			host = await startHost(dir.path);
			const before = Number((await snapshot(host, dev.bearer)).body.sequence);
			const art = await artifact(host, dev.bearer, ref);
			assert.equal(art.status, 409, `unsupported artifact schema must refuse: ${art.text}`);
			assert.equal(art.body.code, "unsupported_schema");
			assert.deepEqual(art.body.refs, { record: ref });
			assert.deepEqual(art.body.supported, [1]);
			assert.match(String(art.body.reason), /99.*compatible Render version/);
			assert.ok(!("content" in art.body));
			const blocked = await save(host, dev.bearer, w, "ground", B2.bytes, ref);
			assert.equal(blocked.status, 409, `unsupported save basis must refuse: ${blocked.text}`);
			assert.equal(blocked.body.code, "unsupported_schema");
			assert.deepEqual(blocked.body.refs, { record: ref });
			const messages = await http(host.url, "GET", `/v1/workflows/${encodeURIComponent(w)}/messages`, { bearer: dev.bearer });
			assert.equal(messages.status, 409, `unsupported message schema must refuse: ${messages.text}`);
			assert.equal(messages.body.code, "unsupported_schema");
			assert.ok(!("messages" in messages.body));
			assert.equal(Number((await snapshot(host, dev.bearer)).body.sequence), before);
			assert.equal(currentRevision((await snapshot(host, dev.bearer)).body, w, "ground"), ref);
			const outside = await enroll(host, "outside", []);
			assert.equal((await artifact(host, outside.bearer, ref)).status, 404);
			const unaffected = await save(host, dev.bearer, w, "notes", A1.bytes, null);
			assert.equal(unaffected.status, 200, unaffected.text);
			await host.stop();
			const retained = new DatabaseSync(join(dir.path, "render.db"), { readOnly: true });
			try {
				for (const row of injected) assert.equal((retained.prepare("SELECT record FROM entries WHERE id = ?").get(row.id) as { record: string }).record, row.record);
			} finally {
				retained.close();
			}
		} finally {
			await host.stop();
			await dir.remove();
		}
	});
});

// Seeded schedules. The oracle is a test-owned model of devices, receipts and current revisions.
type Op =
	| { kind: "save"; device: number; document: string; basis: "current" | "stale" | "null"; reuse: "new" | "same" | "changed" }
	| { kind: "message"; device: number }
	| { kind: "lookup"; device: number }
	| { kind: "revoke"; device: number };

function schedule(seed: number): Op[] {
	const r = seeded(seed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
	const ops: Op[] = [];
	for (let i = 0; i < 14; i++) {
		const x = r();
		const device = Math.floor(r() * 3);
		if (x < 0.6)
			ops.push({
				kind: "save",
				device,
				document: pick(["ground", "notes"]),
				basis: pick(["current", "current", "stale", "null"]),
				reuse: pick(["new", "new", "same", "changed"]),
			});
		else if (x < 0.75) ops.push({ kind: "message", device });
		else if (x < 0.93) ops.push({ kind: "lookup", device });
		else ops.push({ kind: "revoke", device });
	}
	return ops;
}

describe(`V2 seeded schedules on real SQLite (${SCHEDULES})`, () => {
	test("every schedule matches the literal duplicate/conflict/stale/revocation/scope rules", async () => {
		for (let start = 0; start < SCHEDULES; start += BATCH) {
			const dir = await tempDir("v2-sched");
			let host = await startHost(dir.path);
			const epoch = String(host.ready.authorityEpoch);
			const verify: { ref: string; bytes: Buffer; bearer: string }[] = [];
			const receipts: { id: string; body: Record<string, unknown>; bearer: string }[] = [];
			let lastSequence = 0;
			try {
				for (let n = start; n < Math.min(SCHEDULES, start + BATCH); n++) {
					const seed = 0x2b00 + n;
					const ctx = `seed ${seed}`;
					const devices = [await enroll(host, `s${n}-0`), await enroll(host, `s${n}-1`), await enroll(host, `s${n}-2`)];
					const revoked = [false, false, false];
					const w = await createWorkflow(host, devices[0]?.bearer as string, `schedule ${n}`);
					const current = new Map<string, string | null>();
					const history = new Map<string, string[]>();
					const used: {
						id: string;
						payload: string;
						document: string;
						expected: string | null;
						bytes: Buffer;
						body: Record<string, unknown>;
					}[] = [];
					lastSequence = Number((await snapshot(host, devices[0]?.bearer as string)).body.sequence);
					let k = 0;
					for (const op of schedule(seed)) {
						k++;
						const dev = devices[op.device] as { device: string; bearer: string };
						if (op.kind === "revoke") {
							if (revoked[op.device]) continue;
							const r = await adminRequest(
								host.admin,
								"POST",
								"/v1/admin/commands",
								envelope(epoch, { type: "revokeDevice", device: dev.device }),
							);
							assert.equal(r.status, 200, `${ctx}: ${r.text}`);
							assert.equal(Number(r.body.sequence), lastSequence + 1, ctx);
							lastSequence++;
							revoked[op.device] = true;
							continue;
						}
						if (op.kind === "lookup") {
							const target = used.at(-1);
							if (target === undefined) continue;
							const r = await http(host.url, "GET", `/v1/commands/${target.id}`, { bearer: dev.bearer });
							if (revoked[op.device]) {
								assert.equal(r.status, 401, ctx);
								assertNoDisclosure(r.body);
							} else {
								assert.equal(r.status, 200, `${ctx}: ${r.text}`);
								assert.equal(r.body.sequence, target.body.sequence, ctx);
								assert.deepEqual(r.body.result, target.body.result, ctx);
							}
							continue;
						}
						if (op.kind === "message") {
							const r = await http(host.url, "POST", "/v1/commands", {
								bearer: dev.bearer,
								body: envelope(epoch, { type: "postCoordinatorMessage", text: `message ${k} from ${op.device}` }, { workflow: w }),
							});
							if (revoked[op.device]) {
								assert.equal(r.status, 401, ctx);
								assertNoDisclosure(r.body);
							} else {
								assert.equal(r.status, 200, `${ctx}: ${r.text}`);
								assert.equal(Number(r.body.sequence), lastSequence + 1, ctx);
								lastSequence++;
							}
							continue;
						}
						const doc = op.document;
						const cur = current.get(doc) ?? null;
						const prior = used.filter((u) => u.document === doc).at(-1);
						let id = `${seed}-${k}`;
						let bytes: Buffer = Buffer.from(`seed ${seed} op ${k}\r\nΩ ${doc} ✓\n`, "utf8");
						let expected: string | null =
							op.basis === "current" ? cur : op.basis === "null" ? null : (history.get(doc)?.at(-2) ?? "revision:0");
						if (op.reuse !== "new" && prior !== undefined) {
							id = prior.id;
							if (op.reuse === "same") {
								bytes = prior.bytes;
								expected = prior.expected;
							}
						}
						const r = await save(host, dev.bearer, w, doc, bytes, expected, id);
						const payload = `${doc}|${expected}|${bytes.toString("base64")}`;
						const previous = used.find((u) => u.id === id);
						if (revoked[op.device]) {
							assert.equal(r.status, 401, ctx);
							assertNoDisclosure(r.body);
							continue;
						}
						if (previous !== undefined) {
							if (previous.payload === payload) {
								assert.equal(r.status, 200, `${ctx}: ${r.text}`);
								assert.equal(r.body.duplicate, true, ctx);
								assert.equal(r.body.sequence, previous.body.sequence, ctx);
								assert.deepEqual(r.body.result, previous.body.result, ctx);
								assert.deepEqual(r.body.acceptedBy, previous.body.acceptedBy, ctx);
							} else {
								assert.equal(r.status, 409, ctx);
								assert.equal(r.body.code, "command_conflict", ctx);
								assertNoDisclosure(r.body);
							}
							continue;
						}
						if (expected !== cur) {
							assert.equal(r.status, 409, `${ctx}: ${r.text}`);
							assert.equal(r.body.code, "stale_basis", ctx);
							assert.deepEqual(r.body.refs, { current: cur, expected }, ctx);
							continue;
						}
						assert.equal(r.status, 200, `${ctx}: ${r.text}`);
						assert.equal(r.body.duplicate, false, ctx);
						assert.equal(Number(r.body.sequence), lastSequence + 1, ctx);
						lastSequence++;
						const result = r.body.result as Record<string, unknown>;
						assert.equal(result.parent, cur, ctx);
						assert.equal(result.digest, sha256(bytes), ctx);
						const ref = String(result.revision);
						// Atomic visibility: pointer, bytes and receipt agree immediately.
						const snap = await snapshot(host, dev.bearer);
						assert.equal(currentRevision(snap.body, w, doc), ref, ctx);
						assert.equal(Number(snap.body.sequence), lastSequence, ctx);
						current.set(doc, ref);
						history.set(doc, [...(history.get(doc) ?? []), ref]);
						used.push({ id, payload, document: doc, expected, bytes, body: r.body });
						verify.push({ ref, bytes, bearer: (devices.find((_, i) => !revoked[i]) ?? dev).bearer });
						receipts.push({ id, body: r.body, bearer: dev.bearer });
					}
				}
				// Every acknowledged revision and receipt survives an ordinary restart exactly.
				await host.stop();
				host = await startHost(dir.path);
				const reader = await enroll(host, "verifier");
				for (const v of verify) {
					const art = await artifact(host, reader.bearer, v.ref);
					assert.equal(art.status, 200, art.text);
					assert.ok(Buffer.from(String(art.body.content), "base64").equals(v.bytes), v.ref);
				}
				for (const rc of receipts) {
					const r = await http(host.url, "GET", `/v1/commands/${rc.id}`, { bearer: reader.bearer });
					assert.equal(r.status, 200);
					assert.equal(r.body.sequence, rc.body.sequence);
				}
			} finally {
				await host.stop();
				await dir.remove();
			}
		}
	});
});
