import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, test } from "node:test";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { Engine } from "../src/engine/runtime.ts";
import { Policy } from "../src/ledger/records.ts";
import { managedRestore, openLedger } from "../src/ledger/startup.ts";
import { admin, roleFixture } from "./support/roles.ts";

const selected = { completedReviewLimit: 4, reviewerDiversity: "different-family", minimumEvidenceRank: "tests" };
async function policyFixture() {
	const f = await roleFixture();
	const global = (command: Record<string, unknown>, commandId: string) =>
		f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId,
				command,
			},
			admin,
		);
	try {
		assert.equal(
			(await global({ type: "changePolicy", expectedRevision: "policy:initial", policy: selected }, "publish")).status,
			"accepted",
		);
		assert.equal(
			(await f.command({ type: "adoptPolicy", revision: "policy:4", expectedBinding: "policy-binding:2" }, admin)).status,
			"accepted",
		);
		assert.equal(
			(await f.command({ type: "adoptPolicy", revision: "policy:initial", expectedBinding: "policy-binding:5" }, admin)).status,
			"accepted",
		);
		assert.equal((await global({ type: "createWorkflow", title: "Future policy" }, "future")).status, "accepted");
		return { ...f, global };
	} catch (error) {
		await f.close();
		throw error;
	}
}

test("package-clean-restore: policy defaults, adopt-away/back provenance and exact payload survive package-only recovery", async () => {
	const f = await policyFixture();
	try {
		const packaged = await f.global({ type: "createRecoveryPackage" }, "policy-package");
		assert.equal(packaged.status, "packaged", JSON.stringify(packaged));
		assert.ok(packaged.status === "packaged");
		await f.harness.close(ctx);
		await rm(join(f.data, "render.db"));
		const restoredData = join(f.data, "restored-policy");
		await managedRestore(restoredData, packaged.path);
		const restored = await openLedger({ data: restoredData, runtime: (report) => new Engine().options(report), onFatal: () => {} });
		try {
			assert.equal(
				(
					await restored.ledger.command(
						{ version: 1, authorityEpoch: restored.authorityEpoch, commandId: "repair", command: { type: "repairRecovery" } },
						admin,
					)
				).status,
				"accepted",
			);
			const frame = restored.ledger.snapshot(admin);
			assert.ok("policy" in frame);
			assert.deepEqual(frame.policy, {
				defaultRevision: "policy:4",
				revisions: {
					"policy:initial": { completedReviewLimit: 2, reviewerDiversity: "different-family", minimumEvidenceRank: null },
					"policy:4": selected,
				},
				bindings: {
					"workflow:2": { revision: "policy-binding:6", policy: "policy:initial" },
					"workflow:7": { revision: "policy-binding:7", policy: "policy:4" },
				},
			});
			const exported = await restored.ledger.artifact(admin, { export: {} });
			assert.ok("manifest" in exported && exported.manifest.complete);
			assert.equal(
				Buffer.from(exported.content["policy-binding:5"]!, "base64").toString(),
				'{"binding":{"revision":"policy-binding:5","policy":"policy:4"},"revision":"policy:4","policy":{"completedReviewLimit":4,"reviewerDiversity":"different-family","minimumEvidenceRank":"tests"}}',
			);
			assert.equal(restored.ledger.status().hostMode, "recovery-reconciling");
		} finally {
			await restored.close();
		}
	} finally {
		await f.close();
	}
});

describe("policy package damage", () => {
	let f: Awaited<ReturnType<typeof policyFixture>>;
	let packagePath: string;
	before(async () => {
		f = await policyFixture();
		const packaged = await f.global({ type: "createRecoveryPackage" }, "policy-package");
		assert.ok(packaged.status === "packaged", JSON.stringify(packaged));
		packagePath = packaged.path;
	});
	after(() => f.close());

	for (const damage of ["missing", "schema", "digest", "meaning", "binding", "placement", "cache"] as const) {
		test(`package-validation: checksum-correct ${damage} policy damage refuses import`, async () => {
			const damaged = join(f.data, `damaged-${damage}`);
			await cp(packagePath, damaged, { recursive: true });
			const path = join(damaged, "render.db");
			if (damage === "cache") {
				const adapter = await openNodeSqliteDatabase(path);
				const h = await Harness.open(
					await SqliteStorage.open(adapter),
					new Engine().options(() => {}),
					ctx,
				);
				try {
					await h.commit(async (tx) => {
						(await tx.doc(Policy)).defaultRevision = "policy:initial";
					}, ctx);
				} finally {
					await h.close(ctx);
				}
			} else {
				const db = new DatabaseSync(path);
				try {
					const row = (db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]).find((r) => {
						const e = JSON.parse(r.record);
						return e.kind === "render.policy" && e.data.ref === "policy-binding:5";
					});
					assert.ok(row);
					const e = JSON.parse(row.record);
					if (damage === "missing") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						if (damage === "schema") e.data.schema = 999;
						if (damage === "digest") e.data.text += " ";
						if (damage === "placement") e.data.workflow = "workflow:7";
						if (damage === "meaning" || damage === "binding") {
							const payload = JSON.parse(e.data.text);
							if (damage === "meaning") payload.policy.completedReviewLimit = 99;
							else payload.binding.revision = "policy-binding:2";
							e.data.text = JSON.stringify(payload);
							e.data.digest = `sha256:${createHash("sha256").update(e.data.text).digest("hex")}`;
							e.data.byteLength = Buffer.byteLength(e.data.text);
						}
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(e), row.id);
					}
				} finally {
					db.close();
				}
			}
			const manifest = JSON.parse(await readFile(join(damaged, "manifest.json"), "utf8"));
			manifest.files["render.db"] = createHash("sha256")
				.update(await readFile(path))
				.digest("hex");
			await writeFile(join(damaged, "manifest.json"), JSON.stringify(manifest));
			await assert.rejects(
				managedRestore(join(f.data, `rejected-${damage}`), damaged),
				/invalid_recovery_package:.*policy/,
				"policy semantics must be validated beyond the package checksum",
			);
		});
	}
});
