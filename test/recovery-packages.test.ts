import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { runtimeOptions } from "../src/engine/runtime.ts";
import { Device, Meta, Receipt, Workflow } from "../src/ledger/records.ts";
import {
	adminRequest,
	assertNoDisclosure,
	createWorkflow,
	enroll,
	envelope,
	HOST_MAIN,
	http,
	save,
	startHost,
	tempDir,
} from "./support/host.ts";

async function adminCommand(host: Awaited<ReturnType<typeof startHost>>, type: string, commandId = type) {
	const status = await adminRequest(host.admin, "GET", "/v1/admin/status");
	return adminRequest(host.admin, "POST", "/v1/admin/commands", envelope(String(status.body.authorityEpoch), { type }, { commandId }));
}

function restore(data: string, source: string) {
	return spawnSync(process.execPath, [HOST_MAIN, "restore", "--data", data, "--package", source], { encoding: "utf8" });
}

async function fixture() {
	const dir = await tempDir("recovery");
	const data = join(dir.path, "original");
	const h = await startHost(data);
	const device = await enroll(h, "before revocation");
	const workflow = await createWorkflow(h, device.bearer, "retained");
	assert.equal(workflow, "workflow:3");
	const first = await save(h, device.bearer, workflow, "ground", Buffer.from("first\r\n"), null, "first");
	assert.equal(first.body.sequence, 4);
	await http(h.url, "POST", "/v1/commands", {
		bearer: device.bearer,
		body: envelope(String(h.ready.authorityEpoch), { type: "postCoordinatorMessage", text: "hello" }, { workflow, commandId: "hello" }),
	});
	return { dir, data, h, device, workflow };
}

test("package-clean-restore: snapshot cutoff, exact retained bytes, live DB unmarked, package only", async () => {
	const f = await fixture();
	try {
		const packaged = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(packaged.body.status, "packaged", "package creation must publish a complete package");
		assert.equal(packaged.body.cutoff, 5);
		const path = String(packaged.body.path);
		const retained = join(f.dir.path, "only-package");
		await cp(path, retained, { recursive: true });
		await f.h.stop();
		await rm(f.data, { recursive: true });
		const destination = join(f.dir.path, "restored");
		const imported = restore(destination, retained);
		assert.equal(imported.status, 0, imported.stderr);
		const h = await startHost(destination);
		try {
			const refused = await http(h.url, "GET", "/v1/commands/first", { bearer: f.device.bearer });
			assert.equal(refused.body.code, "recovery_required", "package-origin fence must reject backed-up credentials");
			assertNoDisclosure(refused.body);
			const repair = await adminCommand(h, "repairRecovery");
			assert.equal(repair.body.status, "accepted", repair.text);
			const status = await adminRequest(h.admin, "GET", "/v1/admin/status");
			assert.equal(status.body.hostMode, "recovery-reconciling");
			assert.notEqual(status.body.authorityEpoch, f.h.ready.authorityEpoch);
			const fresh = await enroll({ admin: h.admin, ready: { event: "ready", authorityEpoch: status.body.authorityEpoch } }, "repaired");
			const read = await http(h.url, "GET", "/v1/artifacts/revision%3A4", { bearer: fresh.bearer });
			assert.equal(read.body.content, "Zmlyc3QNCg==");
			assert.deepEqual(read.body.parents, []);
			assert.equal(read.body.workflow, "workflow:3");
			const messages = await http(h.url, "GET", "/v1/workflows/workflow%3A3/messages", { bearer: fresh.bearer });
			assert.equal((messages.body.messages as { text: string }[])[0]?.text, "hello");
			const receipt = await http(h.url, "GET", "/v1/commands/first", { bearer: fresh.bearer });
			assert.equal(receipt.body.sequence, 4);
		} finally {
			await h.stop();
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("package-origin-auth-fence / restore-newer-world: direct DB copy predates revocation and lost admissions", async () => {
	const f = await fixture();
	try {
		const p = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(p.body.status, "packaged", p.text);
		const later = await save(f.h, f.device.bearer, f.workflow, "ground", Buffer.from("newer world"), "revision:4", "lost-effect");
		assert.equal(later.body.status, "accepted");
		await adminRequest(
			f.h.admin,
			"POST",
			"/v1/admin/commands",
			envelope(String(f.h.ready.authorityEpoch), { type: "revokeDevice", device: f.device.device }),
		);
		assert.equal(
			(await adminRequest(f.h.admin, "GET", "/v1/admin/status")).body.hostMode,
			"active",
			"packaging must never mark the live DB",
		);
		const data = join(f.dir.path, "direct");
		await mkdir(data);
		await cp(join(String(p.body.path), "render.db"), join(data, "render.db"));
		let h = await startHost(data);
		try {
			for (const path of ["/v1/snapshot", "/v1/commands/first"]) {
				const r = await http(h.url, "GET", path, { bearer: f.device.bearer });
				assert.equal(r.body.code, "recovery_required", "package-origin fence must reject backed-up credentials");
				assertNoDisclosure(r.body);
			}
			assert.equal((await adminCommand(h, "repairRecovery")).body.status, "accepted");
			const s = await adminRequest(h.admin, "GET", "/v1/admin/status");
			const epoch = String(s.body.authorityEpoch);
			const fresh = await enroll({ admin: h.admin, ready: { event: "ready", authorityEpoch: epoch } }, "repaired");
			assert.equal((await http(h.url, "GET", "/v1/commands/first", { bearer: f.device.bearer })).body.code, "unauthorized");
			const missing = await http(h.url, "GET", "/v1/commands/lost-effect", { bearer: fresh.bearer });
			assert.equal(missing.body.code, "outcome_unknown_after_restore", "missing restored receipt must retain uncertainty");
			const old = await http(h.url, "POST", "/v1/commands", {
				bearer: fresh.bearer,
				body: envelope(String(f.h.ready.authorityEpoch), { type: "createWorkflow", title: "old outbox" }, { commandId: "lost-effect" }),
			});
			assert.equal(old.body.code, "authority_epoch_mismatch");
			const replay = await http(h.url, "POST", "/v1/commands", {
				bearer: fresh.bearer,
				body: envelope(epoch, { type: "createWorkflow", title: "do not reissue" }, { commandId: "lost-effect" }),
			});
			assert.equal(replay.body.code, "recovery_required");
			await h.stop();
			h = await startHost(data);
			assert.equal(h.ready.authorityEpoch, epoch, "restricted restart must not re-rotate authority");
			assert.notEqual(h.ready.executorEpoch, s.body.executorEpoch);
			assert.equal((await http(h.url, "GET", "/v1/commands/first", { bearer: fresh.bearer })).body.sequence, 4);
			const scoped = await enroll(h, "no workflows", []);
			for (const [bearer, commandIds] of [
				[scoped.bearer, ["first", "repairRecovery"]],
				[fresh.bearer, ["repairRecovery"]],
			] as const) {
				const absent = await http(h.url, "GET", "/v1/commands/never-used", { bearer });
				assert.equal(absent.body.code, "outcome_unknown_after_restore");
				for (const commandId of commandIds) {
					const hidden = await http(h.url, "GET", `/v1/commands/${commandId}`, { bearer });
					assert.equal(hidden.status, absent.status, "restricted receipt status must not disclose out-of-scope existence");
					assert.equal(hidden.text, absent.text, "restricted receipt body must not disclose out-of-scope existence");
					assertNoDisclosure(hidden.body);
				}
			}
		} finally {
			await h.stop();
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("package-validation / managed-restore: nonclean refusal leaves the existing store usable", async () => {
	const f = await fixture();
	try {
		const p = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(p.body.status, "packaged", p.text);
		await f.h.stop();
		const before = await readFile(join(f.data, "render.db"));
		const refused = restore(f.data, String(p.body.path));
		assert.equal(refused.status, 2, refused.stderr);
		assert.match(refused.stderr, /restore needs a clean destination; existing data preserved/);
		assert.equal(
			JSON.parse(refused.stderr).action,
			"Preserve existing data and the package; retry in a clean directory. Failed imports remain admission-disabled.",
			"restore refusal guidance must not claim an untouched store was disabled",
		);
		assert.deepEqual(await readFile(join(f.data, "render.db")), before, "refused restore must not overwrite existing bytes");
		const h = await startHost(f.data);
		try {
			const status = await adminRequest(h.admin, "GET", "/v1/admin/status");
			assert.equal(status.body.hostMode, "active", "nonclean refusal must not disable an untouched store");
			assert.equal(status.body.authorityEpoch, f.h.ready.authorityEpoch);
			assert.equal((await http(h.url, "GET", "/v1/commands/first", { bearer: f.device.bearer })).body.sequence, 4);
			assert.equal((await http(h.url, "GET", "/v1/artifacts/revision%3A4", { bearer: f.device.bearer })).body.content, "Zmlyc3QNCg==");
			const saved = await save(h, f.device.bearer, f.workflow, "ground", Buffer.from("still usable"), "revision:4");
			assert.equal(saved.body.status, "accepted", saved.text);
			assert.equal((await adminCommand(h, "createRecoveryPackage")).body.status, "packaged");
		} finally {
			await h.stop();
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("package-validation / managed-restore: malformed inputs durably disable admission before import", async () => {
	const f = await fixture();
	try {
		const p = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(p.body.status, "packaged", p.text);
		for (const kind of ["missing", "corrupt", "traversal", "symlink", "malformed"] as const) {
			const bad = join(f.dir.path, `bad-${kind}`);
			await cp(String(p.body.path), bad, { recursive: true });
			if (kind === "missing") await rm(join(bad, "render.db"));
			if (kind === "corrupt") await writeFile(join(bad, "render.db"), "not sqlite");
			if (kind === "traversal") {
				const manifest = JSON.parse(await readFile(join(bad, "manifest.json"), "utf8"));
				manifest.files = { "../render.db": "unsafe" };
				await writeFile(join(bad, "manifest.json"), JSON.stringify(manifest));
			}
			if (kind === "symlink") {
				await rm(join(bad, "render.db"));
				await symlink(join(String(p.body.path), "render.db"), join(bad, "render.db"));
			}
			if (kind === "malformed") await writeFile(join(bad, "manifest.json"), "{");
			const data = join(f.dir.path, `destination-${kind}`);
			assert.notEqual(restore(data, bad).status, 0, `${kind} package must refuse`);
			const h = await startHost(data);
			try {
				assert.equal(
					(await http(h.url, "GET", "/v1/snapshot")).body.code,
					"recovery_required",
					"failed managed restore must remain durably admission-disabled",
				);
				assert.notEqual((await adminCommand(h, "repairRecovery")).body.status, "accepted");
			} finally {
				await h.stop();
			}
		}
		assert.equal(JSON.parse(await readFile(join(String(p.body.path), "manifest.json"), "utf8")).cutoff, 5);
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("package-clean-restore: concurrent later writes and interrupted generation cannot change snapshot or prior package", async () => {
	const f = await fixture();
	try {
		const good = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(good.body.status, "packaged", good.text);
		await f.h.stop();
		const h = await startHost(f.data, { RENDER_FAULT_BARRIER: "package-snapshot", RENDER_FAULT_COMMAND: "interrupted" });
		try {
			const pending = adminCommand(h, "createRecoveryPackage", "interrupted");
			await h.waitForEvent("barrier");
			const later = await save(h, f.device.bearer, f.workflow, "ground", Buffer.from("later"), "revision:4");
			assert.equal(later.body.status, "accepted");
			h.proc.kill("SIGUSR2");
			const completed = await pending;
			assert.equal(completed.body.status, "packaged", completed.text);
			assert.equal(completed.body.cutoff, 6, "package cutoff must come from snapshot before later save");
			h.events.length = 0;
			const incomplete = adminCommand(h, "createRecoveryPackage", "interrupted").catch(() => undefined);
			await h.waitForEvent("barrier");
			await h.kill();
			await incomplete;
			assert.equal(JSON.parse(await readFile(join(String(good.body.path), "manifest.json"), "utf8")).cutoff, 5);
			assert.equal(restore(join(f.dir.path, "good-again"), String(good.body.path)).status, 0);
		} finally {
			await h.stop();
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("package-validation: checksummed but semantically invalid retained relationships cannot be repaired", async () => {
	const f = await fixture();
	try {
		const p = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(p.body.status, "packaged", p.text);
		for (const kind of [
			"pointer",
			"receipt",
			"receipt-result",
			"device",
			"parent",
			"schema",
			"unknown-kind",
			"future-fact",
			"message-text",
			"message-digest",
			"message-length",
			"message-partial",
		]) {
			const bad = join(f.dir.path, `semantic-${kind}`);
			await cp(String(p.body.path), bad, { recursive: true });
			const dbPath = join(bad, "render.db");
			const adapter = await openNodeSqliteDatabase(dbPath);
			const storage = await SqliteStorage.open(adapter);
			const harness = await Harness.open(
				storage,
				runtimeOptions(() => undefined),
				BACKGROUND_CONTEXT,
			);
			await harness.commit(async (tx) => {
				if (kind === "pointer") {
					const w = await tx.doc(Workflow, "workflow:3", null);
					assert(w.exists && w.documents.ground);
					w.documents.ground.revision = "revision:999";
				}
				if (kind === "receipt") {
					const r = await tx.doc(Receipt, "human:owner first", null);
					if (r.exists) r.body.facts = ["fact:999"];
				}
				if (kind === "receipt-result") {
					const r = await tx.doc(Receipt, "human:owner first", null);
					if (r.exists) r.body.result.revision = "revision:999";
				}
				if (kind === "device") {
					const d = await tx.doc(Device, "device:2", null);
					if (d.exists) d.scope.workflows = [""];
				}
			}, BACKGROUND_CONTEXT);
			await harness.close(BACKGROUND_CONTEXT);
			const sql = new DatabaseSync(dbPath);
			if (kind.startsWith("message-")) {
				const row = sql.prepare("SELECT id, record FROM entries WHERE json_extract(record, '$.kind') = 'render.message'").get() as {
					id: number;
					record: string;
				};
				const record = JSON.parse(row.record);
				// Independent literal SHA-256/UTF-8 length for "hello"; also exercises pre-slice2 fixtures.
				record.data.digest = "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
				record.data.byteLength = 5;
				if (kind === "message-text") record.data.text = "wrong";
				if (kind === "message-digest") record.data.digest = "sha256:bad";
				if (kind === "message-length") record.data.byteLength = 6;
				if (kind === "message-partial") delete record.data.digest;
				sql.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
			}
			if (kind === "future-fact") {
				sql.exec(
					"UPDATE entries SET record = json_set(record, '$.data.command', 'admitEffect') WHERE json_extract(record, '$.kind') = 'render.fact' AND json_extract(record, '$.data.sequence') = 4",
				);
			}
			if (kind === "parent" || kind === "schema" || kind === "unknown-kind") {
				const row = sql.prepare("SELECT id, record FROM entries WHERE json_extract(record, '$.kind') = 'render.revision'").get() as {
					id: number;
					record: string;
				};
				const record = JSON.parse(row.record);
				if (kind === "parent") record.data.parent = "revision:999";
				if (kind === "schema") record.data.schema = 99;
				if (kind === "unknown-kind") record.kind = "render.future";
				sql.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
			}
			sql.exec("PRAGMA wal_checkpoint(TRUNCATE)");
			sql.close();
			const manifest = JSON.parse(await readFile(join(bad, "manifest.json"), "utf8"));
			manifest.files["render.db"] = createHash("sha256")
				.update(await readFile(dbPath))
				.digest("hex");
			await writeFile(join(bad, "manifest.json"), JSON.stringify(manifest));
			assert.notEqual(restore(join(f.dir.path, `reject-${kind}`), bad).status, 0, `${kind} semantics must be validated beyond checksums`);
			const direct = join(f.dir.path, `d${kind.indexOf("message-") === 0 ? kind.slice(8) : kind}`);
			await mkdir(direct);
			await cp(dbPath, join(direct, "render.db"));
			const h = await startHost(direct);
			try {
				assert.notEqual(
					(await adminCommand(h, "repairRecovery")).body.status,
					"accepted",
					`${kind} direct-copy repair must validate semantics`,
				);
			} finally {
				await h.stop();
			}
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("package-clean-restore / restore-newer-world: history scope, secret exclusion and restricted uncertainty", async () => {
	const f = await fixture();
	const key = "private-history-key-must-not-travel-in-package";
	try {
		await f.h.stop();
		const adapter = await openNodeSqliteDatabase(join(f.data, "render.db"));
		const storage = await SqliteStorage.open(adapter);
		const harness = await Harness.open(
			storage,
			runtimeOptions(() => undefined),
			BACKGROUND_CONTEXT,
		);
		await harness.commit(async (tx) => {
			(await tx.doc(Meta)).historyCursorKey = key;
		}, BACKGROUND_CONTEXT);
		await harness.close(BACKGROUND_CONTEXT);
		f.h = await startHost(f.data);
		const original = await http(f.h.url, "GET", "/v1/history?limit=1", { bearer: f.device.bearer });
		assert.equal(original.status, 200, original.text);
		const oldCursor = String(original.body.next);
		assert.notEqual(oldCursor, "null");
		const p = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(p.body.status, "packaged", p.text);
		assert.equal(
			(await readFile(join(String(p.body.path), "render.db"))).includes(Buffer.from(key)),
			false,
			"package bytes must exclude the raw history cursor key, including old bases and deltas",
		);
		const livePage = await http(f.h.url, "GET", `/v1/history?cursor=${encodeURIComponent(oldCursor)}`, { bearer: f.device.bearer });
		assert.equal(livePage.status, 200, "packaging must preserve live cursor authority");
		const retained = join(f.dir.path, "pkg");
		await cp(String(p.body.path), retained, { recursive: true });
		await f.h.stop();
		await rm(f.data, { recursive: true });
		const data = join(f.dir.path, "hr");
		const imported = restore(data, retained);
		assert.equal(imported.status, 0, imported.stderr);
		let h = await startHost(data);
		try {
			for (const route of ["history", "export"]) {
				const blocked = await http(h.url, "GET", `/v1/${route}`, { bearer: f.device.bearer });
				assert.equal(blocked.body.code, "recovery_required");
				assertNoDisclosure(blocked.body);
				const diagnostic = await adminRequest(h.admin, "GET", `/v1/${route}?workflow=workflow%3A3`);
				assert.deepEqual(
					diagnostic.body.recovery,
					{ mode: "admission-disabled", restoredCutoff: 6, newerWorld: "unreconciled" },
					"admin diagnostics must also declare restored uncertainty before repair",
				);
			}
			assert.equal((await adminCommand(h, "repairRecovery")).body.status, "accepted");
			const status = await adminRequest(h.admin, "GET", "/v1/admin/status");
			const fresh = await enroll(
				{ admin: h.admin, ready: { event: "ready", authorityEpoch: status.body.authorityEpoch } },
				"history reader",
				[f.workflow],
			);
			const empty = await enroll(
				{ admin: h.admin, ready: { event: "ready", authorityEpoch: status.body.authorityEpoch } },
				"no history",
				[],
			);
			for (const route of ["history", "export"]) {
				assert.equal((await http(h.url, "GET", `/v1/${route}`, { bearer: f.device.bearer })).body.code, "unauthorized");
				assert.equal(
					(await http(h.url, "GET", `/v1/${route}?cursor=${encodeURIComponent(oldCursor)}`, { bearer: fresh.bearer })).body.code,
					"invalid_cursor",
				);
				const hidden = await http(h.url, "GET", `/v1/${route}?workflow=workflow%3A3`, { bearer: empty.bearer });
				const absent = await http(h.url, "GET", `/v1/${route}?workflow=workflow%3A999`, { bearer: empty.bearer });
				assert.equal(hidden.status, absent.status);
				assert.equal(hidden.text, absent.text, "history selectors must not disclose hidden workflow existence");
				const allowed = await http(h.url, "GET", `/v1/${route}?workflow=workflow%3A3`, { bearer: fresh.bearer });
				assert.equal(allowed.status, 200, allowed.text);
				assert.deepEqual(
					allowed.body.recovery,
					{ mode: "recovery-reconciling", restoredCutoff: 6, newerWorld: "unreconciled" },
					"history must declare lost-newer-world uncertainty",
				);
				const records =
					route === "history"
						? (allowed.body.records as { workflow: string }[])
						: String(allowed.body.jsonl)
								.trim()
								.split("\n")
								.map((line) => JSON.parse(line));
				assert(records.every((r) => r.workflow === "workflow:3"));
				if (route === "export") {
					assert.equal((allowed.body.content as Record<string, string>)["revision:4"], "Zmlyc3QNCg==");
					assert.equal((allowed.body.content as Record<string, string>)["message:5"], "aGVsbG8=");
				}
			}
			const page = await http(h.url, "GET", "/v1/history?limit=1", { bearer: fresh.bearer });
			const cursor = String(page.body.next);
			assert.notEqual(cursor, "null");
			await h.stop();
			h = await startHost(data);
			assert.equal(
				(await http(h.url, "GET", `/v1/history?cursor=${encodeURIComponent(cursor)}`, { bearer: fresh.bearer })).status,
				200,
				"repaired cursors survive ordinary restricted restart",
			);
		} finally {
			await h.stop();
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});

test("repair-crash: transaction barriers retain either marker or rotated restricted recovery", async () => {
	const repetitions = Number(process.env.RENDER_V3_REPETITIONS ?? 1);
	const f = await fixture();
	try {
		const p = await adminCommand(f.h, "createRecoveryPackage");
		assert.equal(p.body.status, "packaged", p.text);
		for (const barrier of ["repair-before-commit", "repair-after-commit"]) {
			for (let i = 0; i < repetitions; i++) {
				const data = join(f.dir.path, `${barrier === "repair-before-commit" ? "b" : "a"}${i}`);
				assert.equal(restore(data, String(p.body.path)).status, 0);
				const h = await startHost(data, { RENDER_FAULT_BARRIER: barrier, RENDER_FAULT_COMMAND: "repair" });
				const pending = adminCommand(h, "repairRecovery", "repair").catch(() => undefined);
				await h.waitForEvent("barrier");
				await h.kill();
				await pending;
				const restarted = await startHost(data);
				try {
					const status = await adminRequest(restarted.admin, "GET", "/v1/admin/status");
					assert.equal(status.body.hostMode, barrier === "repair-before-commit" ? "admission-disabled" : "recovery-reconciling");
					assert.equal(status.body.authorityEpoch === f.h.ready.authorityEpoch, barrier === "repair-before-commit");
					assert.notEqual(restarted.ready.executorEpoch, h.ready.executorEpoch);
					assert.equal(
						(await http(restarted.url, "GET", "/v1/commands/first", { bearer: f.device.bearer })).body.code,
						barrier === "repair-before-commit" ? "recovery_required" : "unauthorized",
					);
				} finally {
					await restarted.stop();
				}
			}
		}
	} finally {
		await f.h.stop();
		await f.dir.remove();
	}
});
