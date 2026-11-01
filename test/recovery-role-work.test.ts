import assert from "node:assert/strict";
import { cp, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { Meta } from "../src/ledger/records.ts";
import { Recovery } from "../src/ledger/recovery.ts";
import { managedRestore, openLedger } from "../src/ledger/startup.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

test("package-validation / restore-newer-world: role work explicitly refuses recovery without unchecked resume", async () => {
	const f = await roleFixture();
	const command = (type: string, id = type) =>
		f.ledger.command({ version: 1, authorityEpoch: f.ledger.status().authorityEpoch, commandId: id, command: { type } }, admin);
	try {
		const good = await command("createRecoveryPackage");
		assert.equal(good.status, "packaged", "empty role index must remain packageable");
		assert(good.status === "packaged");
		const original = await readFile(join(good.path, "render.db"));
		assert.equal((await f.command({ type: "assignTask", slice: "recover:role", delivery: true, packet: packet() })).status, "accepted");
		const snapshot = f.ledger.snapshot(admin);
		assert("assignments" in snapshot);
		const a = (snapshot.assignments as RoleAssignment[])[0]!;
		const own = mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
		const refused = await command("createRecoveryPackage", "with-role");
		assert.equal(refused.status, "refused");
		assert(refused.status === "refused");
		assert.match(refused.reason, /role-work reconciliation unavailable/, "refusal must explain the retained role-work limit");
		assert.deepEqual(await readFile(join(good.path, "render.db")), original, "refused generation must not replace prior good package");

		// A supported older package repairs, but never revives authority for its newer-world assignment.
		const clean = join(f.data, "clean");
		await managedRestore(clean, good.path);
		const repaired = await openLedger({ data: clean, runtime: (report) => new Engine().options(report), onFatal: () => {} });
		try {
			const result = await repaired.ledger.command(
				{ version: 1, authorityEpoch: repaired.authorityEpoch, commandId: "repair", command: { type: "repairRecovery" } }, admin,
			);
			assert.equal(result.status, "accepted");
			assert.equal((repaired.ledger.snapshot(own) as { code: string }).code, "unauthorized");
			assert.equal((await repaired.ledger.command(
				{ version: 1, authorityEpoch: repaired.ledger.status().authorityEpoch, commandId: "late", workflow: "workflow:2",
					command: { type: "submitRoleResult", assignment: a.id, generation: a.generation, attempt: a.attempt, text: "late" } }, own,
			) as { code: string }).code, "unauthorized");
		} finally {
			await repaired.close();
		}

		// An unsupported marked direct copy remains diagnostic-only, not an implicit task migration.
		await f.harness.close(ctx);
		const direct = join(f.data, "direct");
		await mkdir(direct);
		await cp(join(f.data, "render.db"), join(direct, "render.db"));
		const storage = await SqliteStorage.open(await openNodeSqliteDatabase(join(direct, "render.db")));
		const offline = await Harness.open(storage, new Engine().options(() => {}), ctx);
		await offline.commit(async (tx) => {
			const meta = await tx.doc(Meta);
			delete meta.historyCursorKey;
			Object.assign(await tx.doc(Recovery), {
				restoreRequired: true, mode: "admission-disabled",
				origin: { id: "package-00000000-0000-0000-0000-000000000000", cutoff: meta.sequence, priorAuthorityEpoch: meta.authorityEpoch },
			});
		}, ctx);
		await offline.close(ctx);
		let resumeHooks = 0;
		const runtime = (report: Parameters<Engine["options"]>[0]) => ({
			...new Engine().options(report),
			beforeResume: async () => { resumeHooks++; },
			afterResume: () => { resumeHooks++; },
		});
		let restored = await openLedger({ data: direct, runtime, onFatal: () => {} });
		try {
			const oldExecutor = restored.executorEpoch;
			assert.equal(restored.ledger.status().hostMode, "admission-disabled");
			assert.equal((restored.ledger.snapshot(own) as { code: string }).code, "unauthorized", "backed-up assignment must not read restored state");
			for (const route of ["history", "export"] as const) {
				const response = route === "history"
					? await restored.ledger.observe(admin, { history: { workflow: "workflow:2" } })
					: await restored.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
				assert("recovery" in response);
				assert.equal(response.recovery?.mode, "admission-disabled");
				if ("content" in response) {
					assert.equal(Buffer.from(response.content[a.packetRef]!, "base64").toString(), JSON.stringify(packet()));
				} else {
					assert("records" in response);
					assert(response.records.some((r) => r.ref === a.packetRef && r.assignment === a.id && r.generation === 1));
				}
			}
			const repair = await restored.ledger.command(
				{ version: 1, authorityEpoch: restored.authorityEpoch, commandId: "unsupported-repair", command: { type: "repairRecovery" } }, admin,
			);
			assert.equal(repair.status, "refused");
			assert(repair.status === "refused");
			assert.match(repair.reason, /role-work reconciliation unavailable/);
			assert.equal(restored.ledger.status().hostMode, "admission-disabled");
			const before = restored.ledger.snapshot(admin);
			await restored.close();
			restored = await openLedger({ data: direct, runtime, onFatal: () => {} });
			assert.notEqual(restored.executorEpoch, oldExecutor, "every restricted start fences old executor permits");
			const after = restored.ledger.snapshot(admin);
			assert("assignments" in before && "assignments" in after);
			assert.deepEqual(after.assignments, before.assignments, "restricted restart must neither rebind nor dispatch assignments");
			assert.equal(resumeHooks, 0, "restricted recovery must skip both Engine resume hooks");
		} finally {
			await restored.close();
		}
	} finally {
		await f.close();
	}
});
