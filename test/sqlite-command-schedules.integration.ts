// V2: the seeded real-SQLite schedules and large-document boundaries; literal command cases stay in sqlite-command-atomicity.test.ts.
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
			for (const content of [
				"A",
				"AAA",
				"A===",
				"====",
				"AA=A",
				"AA==AAAA",
				"AA-_",
				"AA\n=",
				"AAA\n",
				"AAA\r",
				"AAA\u2028",
				"AAA\u2029",
				`${"QUFB".repeat(1_048_576)}!`,
			]) {
				const bad = await http(host.url, "POST", "/v1/commands", {
					bearer: dev.bearer,
					body: envelope(
						String(host.ready.authorityEpoch),
						{ type: "saveDocument", document: "ground", mediaType: "text/plain", content },
						{
							workflow: w,
							expected: { document: null },
						},
					),
				});
				assert.equal(bad.status, 400, `malformed base64 must deliberately refuse: ${bad.text}`);
				assert.equal(bad.body.code, "malformed_envelope");
			}
			assert.equal(Number((await snapshot(host, dev.bearer)).body.sequence), before);
			for (const [document, bytes] of [
				["empty", Buffer.alloc(0)],
				["pad2", Buffer.from("A")],
				["pad1", Buffer.from("AA")],
			] as const) {
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
