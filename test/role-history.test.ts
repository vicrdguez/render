// Integration contract: new retained role documents use the delivered fixed-cutoff history surface.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, packet, recovery, roleFixture } from "./support/roles.ts";

async function until(check: () => boolean) {
	const end = Date.now() + 5000;
	while (!check()) {
		assert.ok(Date.now() < end, "role history fixture did not settle");
		await setTimeout(10);
	}
}
function roleAssignments(f: Awaited<ReturnType<typeof roleFixture>>): RoleAssignment[] {
	const frame = f.ledger.snapshot(admin);
	assert.ok("assignments" in frame);
	return frame.assignments as RoleAssignment[];
}
function own(a: RoleAssignment) {
	return mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
}
test("R12 retained role packets, reports, task receipts and uncertainty export at the original cutoff", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses(
		Array.from({ length: 12 }, () => (transcript) => {
			if (JSON.stringify(transcript).includes("Required output: Parent report"))
				return fauxAssistantMessage(fauxToolCall("request_role", { key: "challenge" }), { stopReason: "toolUse" });
			return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Exact independent report.\r\n" }), {
				stopReason: "toolUse",
			});
		}),
	);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } }));
	const assignments = () => roleAssignments(f);
	try {
		await f.command({
			type: "assignTask",
			slice: "history:role",
			delivery: true,
			packet: packet({ expectedOutput: "Parent report", requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }),
		});
		await until(() => assignments().length === 2 && assignments().every((a) => !a.executing) && assignments()[1]?.status === "submitted");
		const [parent, child] = assignments() as [RoleAssignment, RoleAssignment];
		const page = await f.ledger.observe(admin, { history: { workflow: "workflow:2", limit: "1" } });
		assert.ok("next" in page && page.next);
		const before = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in before);
		assert.equal(before.manifest.complete, true, "role receipts must be found in their actual scheduling/agent namespaces");
		assert.deepEqual(before.manifest.missing, []);
		const records = before.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		for (const a of [parent, child]) {
			assert.equal(Buffer.from(before.content[a.packetRef]!, "base64").toString(), JSON.stringify(a.packet));
			const retained = records.find((r) => r.ref === a.packetRef);
			assert.equal(retained.assignment, a.id);
			assert.equal(retained.attempt, a.attempt);
			assert.equal(retained.generation, 1, "export must preserve the original generation, not discard retained role provenance");
			assert.ok(
				records.some((r) => r.kind === "receipt" && r.result.task === a.task),
				"accepted task binding must be exported",
			);
		}
		assert.equal(Buffer.from(before.content[child.report!]!, "base64").toString(), "Exact independent report.\r\n");
		assert.equal(((await f.ledger.artifact(own(child), { export: {} })) as { code: string }).code, "forbidden_principal");
		await f.command({ type: "cancelWork", assignment: parent.id, generation: parent.generation, attempt: parent.attempt }, admin);
		const quarantine = await f.command(
			{
				type: "recordRecoveryState",
				assignment: parent.id,
				generation: parent.generation,
				attempt: parent.attempt,
				text: "Late uncertain evidence.\n",
			},
			recovery,
		);
		assert.ok(quarantine.status === "accepted");
		await f.reopen();
		const continued = await f.ledger.artifact(admin, { export: { cursor: page.next } });
		assert.ok("manifest" in continued);
		assert.equal(continued.manifest.cutoff, page.cutoff);
		assert.equal(continued.jsonl, before.jsonl, "later uncertainty and restart cannot change the original history cutoff");
		const current = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in current);
		assert.equal(current.manifest.complete, true);
		const ref = String(quarantine.result.quarantined);
		assert.equal(JSON.parse(Buffer.from(current.content[ref]!, "base64").toString()).text, "Late uncertain evidence.\n");
		const path = join(f.data, "role-export.json");
		await writeFile(path, JSON.stringify(current));
		const reader = spawnSync(process.execPath, ["src/client/read-export.ts", path], {
			cwd: new URL("../", import.meta.url),
			encoding: "utf8",
		});
		assert.equal(reader.status, 0, reader.stdout + reader.stderr);
		assert.ok(
			JSON.parse(reader.stdout).documents.some(
				(d: { ref: string; text: string }) => d.ref === child.report && d.text === "Exact independent report.\r\n",
			),
		);
	} finally {
		await f.close();
	}
});

for (const failure of ["missing_content", "content_corrupt", "unsupported_schema"]) {
	test(`R12 role packet ${failure} is declared after reopen, never omitted or substituted`, async () => {
		const f = await roleFixture();
		try {
			await f.command({ type: "assignTask", slice: "damaged:packet", delivery: true, packet: packet() });
			await until(() => roleAssignments(f)[0]?.status === "blocked");
			const a = roleAssignments(f)[0]!;
			await f.harness.close(ctx);
			const db = new DatabaseSync(join(f.data, "render.db"));
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const record = JSON.parse(row.record);
					if (record.kind !== "render.revision" || record.data.revision !== a.packetRef) continue;
					if (failure === "missing_content") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						if (failure === "content_corrupt") record.data.text = "Substituted packet";
						else record.data.schema = 99;
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
					}
				}
			} finally {
				db.close();
			}
			await f.reopen();
			const bundle = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			assert.ok("manifest" in bundle);
			assert.equal(bundle.manifest.complete, false);
			assert.ok(
				bundle.manifest.missing.some((m) => m.ref === a.packetRef && m.code === failure),
				"original packet failure must be declared",
			);
			assert.equal(a.packetRef in bundle.content, false);
		} finally {
			await f.close();
		}
	});
}
