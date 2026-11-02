// Checksum-correct semantic damage to a real recovery package, using real durable and SQLite writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { runtimeOptions } from "../../src/engine/runtime.ts";
import { Device, Meta, Receipt, Workflow } from "../../src/ledger/records.ts";

export type PackageDamage =
	| "pointer"
	| "receipt"
	| "receipt-result"
	| "device"
	| "parent"
	| "schema"
	| "unknown-kind"
	| "role-provenance"
	| "future-fact"
	| "backup-schema"
	| "backup-cutoff"
	| "message-text"
	| "message-digest"
	| "message-length"
	| "message-partial";

/**
 * Copies a package from a store holding device:2, workflow:3 with a saved ground revision (command "first") and one
 * "hello" message at sequence 5, then applies one damage while keeping the manifest checksum correct.
 */
export async function damagedPackage(source: string, target: string, kind: PackageDamage): Promise<void> {
	await cp(source, target, { recursive: true });
	const dbPath = join(target, "render.db");
	const storage = await SqliteStorage.open(await openNodeSqliteDatabase(dbPath));
	const harness = await Harness.open(
		storage,
		runtimeOptions(() => undefined),
		BACKGROUND_CONTEXT,
	);
	await harness.commit(async (tx) => {
		if (kind.startsWith("backup-")) {
			const meta = await tx.doc(Meta);
			assert(meta.backup, "fixture must contain real retained backup status");
			if (kind === "backup-schema") Object.assign(meta.backup, { version: 99 });
			else
				meta.backup.verified = {
					id: "package-00000000-0000-0000-0000-000000000000",
					cutoff: 999,
					cutoffRecordedAt: 1,
					verifiedAt: 2,
					digest: "0".repeat(64),
				};
		}
		if (kind === "pointer") {
			const w = await tx.doc(Workflow, "workflow:3", null);
			assert(w.exists && w.documents.ground, "fixture must contain the saved ground pointer");
			w.documents.ground.revision = "revision:999";
		}
		if (kind === "receipt" || kind === "receipt-result") {
			const r = await tx.doc(Receipt, "human:owner first", null);
			assert(r.exists, "fixture must contain the save receipt");
			if (kind === "receipt") r.body.facts = ["fact:999"];
			else r.body.result.revision = "revision:999";
		}
		if (kind === "device") {
			const d = await tx.doc(Device, "device:2", null);
			assert(d.exists, "fixture must contain the enrolled device");
			d.scope.workflows = [""];
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
	if (kind === "parent" || kind === "schema" || kind === "unknown-kind" || kind === "role-provenance") {
		const row = sql.prepare("SELECT id, record FROM entries WHERE json_extract(record, '$.kind') = 'render.revision'").get() as {
			id: number;
			record: string;
		};
		const record = JSON.parse(row.record);
		if (kind === "parent") record.data.parent = "revision:999";
		if (kind === "schema") record.data.schema = 99;
		if (kind === "unknown-kind") record.kind = "render.future";
		if (kind === "role-provenance") record.data.roleBinding = { assignment: "assignment:999", generation: 1, attempt: "attempt:999" };
		sql.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
	}
	sql.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	sql.close();
	const manifest = JSON.parse(await readFile(join(target, "manifest.json"), "utf8"));
	manifest.files["render.db"] = createHash("sha256")
		.update(await readFile(dbPath))
		.digest("hex");
	await writeFile(join(target, "manifest.json"), JSON.stringify(manifest));
}
