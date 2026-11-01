// V7: startup ownership, persistence readback and incompatible-store refusal on real processes and files.
import assert from "node:assert/strict";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineExtension, defineTask, Harness } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { adminRequest, createWorkflow, enroll, http, save, sha256, spawnHost, startHost, tempDir } from "./support/host.ts";
import { G1 } from "./support/literals.ts";

const EXPECTED_PERSISTENCE = { journal_mode: "wal", synchronous: 2, fullfsync: 1, checkpoint_fullfsync: 1 };

async function fileDigest(path: string): Promise<string> {
	return sha256(await readFile(path));
}

async function expectBlocked(data: string, code: string): Promise<Record<string, unknown>> {
	const s = spawnHost(data);
	const exit = await s.exited;
	const blocked = s.events.find((e) => e.event === "startup_blocked");
	assert.equal(exit, 2, `stderr: ${s.stderr.join("\n")}`);
	assert.equal(blocked?.code, code, JSON.stringify(blocked));
	assert.equal(typeof blocked?.action, "string");
	assert.ok(!s.events.some((e) => e.event === "ready"));
	return blocked as Record<string, unknown>;
}

describe("B4 startup", () => {
	test("B4-01/B4-02 the owner lock refuses a second process before it opens the store, and dies with its owner", async () => {
		const dir = await tempDir("v7-lock");
		try {
			const owner = await startHost(dir.path);
			const dev = await enroll(owner, "lock");
			await chmod(join(dir.path, "render.db"), 0o000);
			try {
				const second = spawnHost(dir.path);
				assert.equal(await second.exited, 3, `the second process must be refused by the owner lock: ${second.stderr.join("\n")}`);
				const refused = second.events.find((e) => e.event === "startup_refused");
				assert.equal(refused?.code, "store_owned");
			} finally {
				await chmod(join(dir.path, "render.db"), 0o600);
			}
			const still = await http(owner.url, "GET", "/v1/snapshot?version=1", { bearer: dev.bearer });
			assert.equal(still.status, 200);
			await owner.kill();
			const next = await startHost(dir.path);
			try {
				const snap = await http(next.url, "GET", "/v1/snapshot?version=1", { bearer: dev.bearer });
				assert.equal(snap.status, 200);
			} finally {
				await next.stop();
			}
		} finally {
			await dir.remove();
		}
	});

	test("B4-03/B4-09/B4-10 readback, fresh executor epochs, preserved authority epoch and enrollment", async () => {
		const dir = await tempDir("v7-epochs");
		try {
			const first = await startHost(dir.path);
			assert.deepEqual(first.ready.persistence, EXPECTED_PERSISTENCE, "ready must report the required persistence readback");
			const dev = await enroll(first, "epoch");
			const w = await createWorkflow(first, dev.bearer, "epochs");
			const saved = await save(first, dev.bearer, w, "ground", G1.bytes, null);
			const snap1 = await http(first.url, "GET", "/v1/snapshot?version=1", { bearer: dev.bearer });
			assert.deepEqual(snap1.body.persistence, EXPECTED_PERSISTENCE);
			assert.equal(snap1.body.hostMode, "active");
			assert.equal(snap1.body.executorEpoch, first.ready.executorEpoch);
			await first.stop();
			const second = await startHost(dir.path);
			try {
				assert.notEqual(second.ready.executorEpoch, first.ready.executorEpoch);
				assert.equal(second.ready.authorityEpoch, first.ready.authorityEpoch);
				const snap2 = await http(second.url, "GET", "/v1/snapshot?version=1", { bearer: dev.bearer });
				assert.equal(snap2.status, 200, "ordinary restart must preserve enrollment");
				assert.equal(snap2.body.authorityEpoch, first.ready.authorityEpoch);
				const status = await adminRequest(second.admin, "GET", "/v1/admin/status");
				const startups = status.body.startups as { executorEpoch: string; sequence: number }[];
				assert.deepEqual(
					startups.map((s) => s.executorEpoch),
					[first.ready.executorEpoch, second.ready.executorEpoch],
				);
				// The first start's fence commit precedes every accepted command.
				assert.ok((startups[0]?.sequence ?? Number.POSITIVE_INFINITY) < Number(saved.body.sequence));
				assert.ok((startups[1]?.sequence ?? 0) > Number(saved.body.sequence));
			} finally {
				await second.stop();
			}
		} finally {
			await dir.remove();
		}
	});

	test("B4-04 a foreign SQLite file is refused with its bytes retained", async () => {
		const dir = await tempDir("v7-foreign");
		try {
			await mkdir(dir.path, { recursive: true, mode: 0o700 });
			const db = new DatabaseSync(join(dir.path, "render.db"));
			db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('someone else''s data');");
			db.close();
			const before = await fileDigest(join(dir.path, "render.db"));
			await expectBlocked(dir.path, "unsupported_store");
			assert.equal(await fileDigest(join(dir.path, "render.db")), before);
			const check = new DatabaseSync(join(dir.path, "render.db"), { readOnly: true });
			const tables = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
			check.close();
			assert.deepEqual(
				tables.map((t) => t.name),
				["notes"],
			);
		} finally {
			await dir.remove();
		}
	});

	test("B4-05/B4-06/B4-07 newer schema, non-SQLite and read-only stores are refused with bytes retained", async () => {
		const dir = await tempDir("v7-incompatible");
		try {
			const host = await startHost(dir.path);
			await host.stop();
			const db = join(dir.path, "render.db");

			const raw = new DatabaseSync(db);
			raw.exec("PRAGMA user_version = 99");
			raw.close();
			const newer = await fileDigest(db);
			const blocked = await expectBlocked(dir.path, "unsupported_schema");
			assert.match(String(blocked.detail), /99/);
			assert.equal(await fileDigest(db), newer);
			const fix = new DatabaseSync(db);
			fix.exec("PRAGMA user_version = 1");
			fix.close();

			await chmod(db, 0o400);
			const readonly = await fileDigest(db);
			await expectBlocked(dir.path, "persistence_unavailable");
			assert.equal(await fileDigest(db), readonly);
			await chmod(db, 0o600);

			const garbage = join(dir.path, "garbage");
			await mkdir(garbage, { mode: 0o700 });
			await writeFile(join(garbage, "render.db"), Buffer.from("this is not a database, keep me\n"));
			const g = await fileDigest(join(garbage, "render.db"));
			await expectBlocked(garbage, "store_unreadable");
			assert.equal(await fileDigest(join(garbage, "render.db")), g);
		} finally {
			await dir.remove();
		}
	});

	test("B4-08 a pending task of an unknown definition blocks startup and is never dispatched", async () => {
		const dir = await tempDir("v7-definitions");
		try {
			const host = await startHost(dir.path);
			await host.stop();
			let ran = false;
			const Fixture = defineTask({
				name: "fixture.unknown-to-render",
				version: 1,
				initial: () => ({ phase: "start" as const }),
				phases: {
					start: async () => {
						ran = true;
					},
				},
				abort: async () => undefined,
			});
			const ctx = BACKGROUND_CONTEXT;
			const registry = createRegistry();
			registry.install(defineExtension({ name: "fixture", tasks: [Fixture] }));
			const adapter = await openNodeSqliteDatabase(join(dir.path, "render.db"));
			const harness = await Harness.open(await SqliteStorage.open(adapter), { models: createModels(), registry }, ctx);
			const conversation = await harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
			const taskId = await conversation.commit((tx) => tx.createTask(Fixture, {}, { ownership: { kind: "conversation" } }), ctx);
			await harness.close(ctx);
			assert.equal(ran, false);

			const blocked = await expectBlocked(dir.path, "unsupported_definitions");
			assert.match(String(blocked.detail), /fixture\.unknown-to-render/);

			// Reopen through the runtime interface, without resuming: the task must still be pending, not run or aborted.
			const reopened = await Harness.open(
				await SqliteStorage.open(await openNodeSqliteDatabase(join(dir.path, "render.db"))),
				{ models: createModels(), registry },
				ctx,
			);
			const record = await reopened.getTask(taskId, ctx);
			await reopened.close(ctx);
			assert.equal(record?.state.status, "pending");
			assert.equal(record?.abortRequested, false);
			assert.equal(ran, false);
		} finally {
			await dir.remove();
		}
	});
});
