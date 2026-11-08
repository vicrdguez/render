import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

test("native-compaction-history: Engine exports scoped committed transcript and terminal receipt, not transient tokens", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses([
		fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "DECISIVE-RETAINED-EVIDENCE-6" }), {
			stopReason: "toolUse",
		}),
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } }));
	try {
		await f.command({ type: "assignTask", slice: "runtime-history", delivery: true, packet: packet() });
		let bundle = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		for (let n = 0; n < 300; n++) {
			bundle = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			if ("jsonl" in bundle && bundle.jsonl.includes("runtime_task")) break;
			await setTimeout(10);
		}
		assert.ok("manifest" in bundle && bundle.manifest.complete);
		assert.ok(bundle.jsonl.includes("runtime_transcript"), "committed transcript must be exported");
		assert.ok(bundle.jsonl.includes("runtime_task"), "terminal task receipt must be exported");
		assert.ok(bundle.jsonl.includes("DECISIVE-RETAINED-EVIDENCE-6"));
		assert.ok(bundle.manifest.exclusions.includes("latest_only_live_partials"));
		const before = bundle.jsonl;
		await f.reopen();
		const after = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("jsonl" in after);
		assert.equal(after.jsonl, before, "reopen must not reinterpret retained runtime history");
	} finally {
		await f.close();
	}
});

test("native-compaction-history: Engine compacts twice, refreshes exact constraints, resets/replaces without losing scoped literal tail", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", contextWindow: 4096 }] });
	let summary = 0;
	let refreshed = false;
	let replacementClean = false;
	let active = 0;
	let maxActive = 0;
	p.setResponses(
		Array.from({ length: 20 }, () => async (transcript) => {
			active++;
			maxActive = Math.max(maxActive, active);
			await setTimeout(10);
			try {
				const text = JSON.stringify(transcript);
				if (text.includes("context summarization assistant")) {
					summary++;
					return fauxAssistantMessage("Lossy summary, no authority.");
				}
				if (text.includes("Replacement report")) {
					replacementClean = !text.includes(TAIL);
					return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Fresh replacement report." }), {
						stopReason: "toolUse",
					});
				}
				if (summary >= 2) {
					refreshed = text.includes("Keep exact constraints.");
					return fauxAssistantMessage(fauxToolCall("request_own_stop", {}), { stopReason: "toolUse" });
				}
				return fauxAssistantMessage(fauxToolCall("read_artifact", { ref: "revision:4" }), { stopReason: "toolUse" });
			} finally {
				active--;
			}
		}),
	);
	class SmallContext extends Engine {
		override options(report: Parameters<Engine["options"]>[0]) {
			const options = super.options(report);
			const settings = typeof options.settings === "function" ? options.settings() : options.settings;
			return {
				...options,
				settings: { ...settings, compaction: { ...settings?.compaction, keepRecentTokens: 1, reserveTokens: 4090 } },
			};
		}
	}
	const f = await roleFixture(new SmallContext({ provider: p.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } }));
	const roles = () =>
		(f.ledger.snapshot(admin) as import("../src/ledger/ledger.ts").Frame).assignments as import("../src/kernel/roles.ts").RoleAssignment[];
	try {
		const saved = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "long-evidence",
				workflow: "workflow:2",
				expected: { document: null },
				command: {
					type: "saveDocument",
					document: "long-evidence",
					mediaType: "text/plain",
					content: Buffer.from(long).toString("base64"),
				},
			},
			admin,
		);
		assert.ok(saved.status === "accepted" && saved.result.revision === "revision:4");
		await f.command({
			type: "assignTask",
			slice: "engine-compact",
			delivery: true,
			packet: packet({ maxTurns: 12, inputs: ["revision:4"] }),
		});
		for (let n = 0; n < 500 && !roles()[0]?.runtimeTaskCaptured; n++) await setTimeout(10);
		assert.ok(summary >= 2, "two native Engine compactions must reach the configured provider");
		assert.equal(refreshed, true, "exact packet constraints must refresh after native compaction");
		const predecessor = roles()[0]!;
		assert.equal(predecessor.status, "canceled");
		const c = await f.harness.conversation(predecessor.conversation as import("@earendil-works/pi-durable").ConversationId, ctx);
		assert.ok(c);
		await c.reset("Reset context, not historical obligations.", ctx);
		await f.command({
			type: "recordRuntimeHistory",
			assignment: predecessor.id,
			generation: predecessor.generation,
			attempt: predecessor.attempt,
			key: "after-reset",
		});
		assert.equal(
			(
				await f.command({
					type: "replaceTask",
					assignment: predecessor.id,
					generation: predecessor.generation,
					attempt: predecessor.attempt,
					packet: packet({ role: "implementer", expectedOutput: "Replacement report", maxTurns: 12 }),
				})
			).status,
			"accepted",
		);
		for (let n = 0; n < 500 && !roles()[1]?.runtimeTaskCaptured; n++) await setTimeout(10);
		assert.equal(replacementClean, true, "replacement provider must never inherit private predecessor context");
		assert.equal(maxActive, 1, "compaction must share the assignment execution slot without parallel provider work");
		const bundle = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in bundle && bundle.manifest.complete);
		const records = bundle.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		const archives = records.filter((r) => r.kind === "runtime_transcript" && r.assignment === predecessor.id);
		assert.ok(
			archives.some((r) =>
				r.entries.some((entry: { model: { role: string; content: unknown }[] }) =>
					entry.model.some((message) => message.role === "toolResult" && JSON.stringify(message.content).includes(long)),
				),
			),
			"scoped Ledger archive must retain the literal committed tool tail beyond 2,000 characters",
		);
		assert.ok(
			archives.some((r) => bundle.content[r.ref] && Buffer.from(bundle.content[r.ref]!, "base64").toString().includes(TAIL)),
			"portable runtime payload must retain exact tail bytes",
		);
	} finally {
		await f.close();
	}
});

for (const damage of ["missing", "corrupt", "schema"] as const) {
	test(`native-compaction-history: ${damage} archived bytes never produce complete export`, async () => {
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		p.setResponses([
			fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Retained report." }), { stopReason: "toolUse" }),
		]);
		const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } }));
		try {
			await f.command({ type: "assignTask", slice: "damaged-history", delivery: true, packet: packet() });
			for (let n = 0; n < 300; n++) {
				const frame = f.ledger.snapshot(admin);
				if ("assignments" in frame && (frame.assignments as { runtimeTaskCaptured?: boolean }[])[0]?.runtimeTaskCaptured) break;
				await setTimeout(10);
			}
			await f.harness.close(ctx);
			const db = new DatabaseSync(join(f.data, "render.db"));
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const entry = JSON.parse(row.record);
					if (entry.kind !== "render.runtime-history") continue;
					if (damage === "missing") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						if (damage === "corrupt") entry.data.text = "Substituted transcript";
						else entry.data.schema = 999;
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(entry), row.id);
					}
				}
			} finally {
				db.close();
			}
			await f.reopen();
			const exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			assert.ok("manifest" in exported);
			assert.equal(exported.manifest.complete, false, "missing/corrupt archived bytes must be declared");
			assert.ok(
				exported.manifest.missing.some(
					(m) => m.code === (damage === "missing" ? "missing_content" : damage === "corrupt" ? "content_corrupt" : "unsupported_schema"),
				),
			);
		} finally {
			await f.close();
		}
	});
}

const TAIL = "LITERAL-COMMITTED-TAIL-PAST-2000-6";
const long = "x".repeat(2500) + TAIL;
