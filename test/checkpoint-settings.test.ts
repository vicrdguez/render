import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import { deviceServer } from "../src/ledger/http.ts";
import type { Frame, Ledger } from "../src/ledger/ledger.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { admin, roleFixture, scheduler } from "./support/roles.ts";

const human = { seams: "human", modules: "human", proposal: "human" };
const delegated = { seams: "delegated", modules: "delegated", proposal: "human" };
const settings = (ledger: Ledger) =>
	(ledger.snapshot(admin) as Frame).checkpointSettings as { currentRevision: string; modes: typeof human };
let n = 0;
const change = (
	ledger: Ledger,
	modes: unknown,
	expectedRevision = settings(ledger).currentRevision,
	type = "changeCheckpointSettings",
	actor = admin,
) =>
	Effect.runPromise(
		ledger.command(
			{
				version: 1,
				authorityEpoch: ledger.status().authorityEpoch,
				commandId: `settings:${++n}`,
				command: { type, modes, expectedRevision },
			},
			actor,
		),
	);

test("S01 initial file seeds only empty settings; restart cannot overwrite accepted settings", async () => {
	const data = await mkdtemp(join(tmpdir(), "render-settings-"));
	const file = join(data, "checkpoint-settings.json");
	const open = () => Effect.runPromise(openLedger({ data, runtime: (report) => new Engine().options(report), onFatal: () => {} }));
	await writeFile(file, JSON.stringify(delegated));
	let f = await open();
	try {
		assert.deepEqual(settings(f.ledger).modes, delegated, "empty state must use explicit file seed");
		const seeded = settings(f.ledger).currentRevision;
		const edited = await change(f.ledger, human);
		assert.equal(edited.status, "accepted");
		const latest = settings(f.ledger).currentRevision;
		await Effect.runPromise(f.close());
		f = await open();
		assert.equal(settings(f.ledger).currentRevision, latest, "restart must not overwrite accepted settings");
		assert.deepEqual(settings(f.ledger).modes, human);
		assert.equal((await change(f.ledger, delegated, seeded, "importCheckpointSettings")).status, "refused");
		assert.equal((await change(f.ledger, delegated, latest, "importCheckpointSettings")).status, "accepted");
		const imported = settings(f.ledger).currentRevision;
		await Effect.runPromise(f.close());
		await writeFile(file, "malformed old file is not authority");
		f = await open();
		assert.equal(settings(f.ledger).currentRevision, imported);
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: {} }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		const records = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		const revisions = records.filter((r) => r.kind === "checkpoint_settings");
		assert.equal(revisions.length, 3);
		assert.deepEqual(
			revisions.map((r) => r.createdBy),
			Array(3).fill({ principal: "human", route: "local-admin" }),
		);
		for (const r of revisions) assert.ok(exported.content[r.ref], "exact settings bytes retained");
	} finally {
		await Effect.runPromise(f.close());
		await rm(data, { recursive: true, force: true });
	}
});

for (const damage of ["missing", "corrupt"] as const)
	test(`S10 ${damage} settings source refuses replacement and reports exact history gap`, async () => {
		const f = await roleFixture();
		try {
			assert.equal((await change(f.ledger, delegated)).status, "accepted");
			const revision = settings(f.ledger).currentRevision;
			await f.harness.close(BACKGROUND_CONTEXT);
			const db = new DatabaseSync(join(f.data, "render.db"));
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const entry = JSON.parse(row.record);
					if (entry.kind !== "render.checkpoint-settings") continue;
					if (damage === "missing") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						entry.data.text = "substituted";
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(entry), row.id);
					}
				}
			} finally {
				db.close();
			}
			await f.reopen();
			const reply = await change(f.ledger, human);
			assert.equal(reply.status, "refused");
			if (reply.status === "refused") {
				assert.equal(reply.code, damage === "missing" ? "missing_content" : "content_corrupt");
				assert.ok(reply.reason.includes(revision));
			}
			const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: {} }));
			assert.ok("manifest" in exported && !exported.manifest.complete);
			assert.ok(exported.manifest.missing.some((m) => m.ref === revision));
		} finally {
			await f.close();
		}
	});

test("S02/S03 two project clients race settings; import is local-admin only; closed modes", async () => {
	const f = await roleFixture();
	const server = deviceServer(f.ledger);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		assert.deepEqual(settings(f.ledger), { currentRevision: "settings:initial", modes: human });
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const clients = await Promise.all(
			["all", "all", []].map(async (workflows, i) => {
				const r = await Effect.runPromise(
					f.ledger.command(
						{
							version: 1,
							authorityEpoch: f.ledger.status().authorityEpoch,
							commandId: `enroll:${i}`,
							command: { type: "enrollDevice", label: `client ${i}`, scope: { workflows } },
						},
						admin,
					),
				);
				assert.ok(r.status === "accepted" && r.credential);
				const bearer = r.credential.bearer;
				return async (command: Record<string, unknown>) => {
					const response = await fetch(`http://127.0.0.1:${address.port}/v1/commands`, {
						method: "POST",
						headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
						body: JSON.stringify({ version: 1, authorityEpoch: f.ledger.status().authorityEpoch, commandId: `http:${++n}`, command }),
					});
					return response.json() as Promise<{ status: string; code?: string }>;
				};
			}),
		);
		const command = { type: "changeCheckpointSettings", expectedRevision: "settings:initial", modes: delegated };
		const replies = await Promise.all([clients[0]!(command), clients[1]!({ ...command, modes: human })]);
		assert.deepEqual(replies.map((r) => r.code ?? r.status).sort(), ["accepted", "stale_basis"]);
		assert.equal((await clients[0]!({ ...command, type: "importCheckpointSettings" })).code, "forbidden_principal");
		assert.equal((await clients[2]!(command)).code, "forbidden_scope");
		assert.equal(
			(await change(f.ledger, human, settings(f.ledger).currentRevision, "changeCheckpointSettings", scheduler)).status,
			"refused",
		);
		for (const invalid of [
			{ ...human, proposal: "delegated" },
			{ ...human, seams: "automatic" },
			{ ...human, seams: ["human"] },
			{ ...human, modules: ["delegated"] },
			{ ...human, extra: "human" },
		]) {
			const r = await change(f.ledger, invalid);
			assert.equal(r.status, "refused");
		}
		const current = settings(f.ledger);
		await f.reopen();
		assert.deepEqual(settings(f.ledger), current);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await f.close();
	}
});
