import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { createRegistry, type Harness } from "@earendil-works/pi-durable";
import { Engine } from "../src/engine/runtime.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

test("native-compaction-history: Engine exports scoped committed transcript and terminal receipt, not transient tokens", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses([
		fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "DECISIVE-RETAINED-EVIDENCE-6" }), { stopReason: "toolUse" }),
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

test("native-compaction-history: Engine native summary is admitted under executing authority and exact packet refreshes afterward", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", contextWindow: 4096 }] });
	let summary = 0;
	let refreshed = false;
	p.setResponses(
		Array.from({ length: 8 }, () => (transcript) => {
			if (JSON.stringify(transcript).includes("context summarization assistant")) {
				summary++;
				return fauxAssistantMessage("Lossy summary, no authority.");
			}
			if (summary) {
				refreshed = JSON.stringify(transcript).includes("Keep exact constraints.");
				return fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "Refreshed report." }), { stopReason: "toolUse" });
			}
			return fauxAssistantMessage(fauxToolCall("read_artifact", { ref: "revision:3" }), { stopReason: "toolUse" });
		}),
	);
	class SmallContext extends Engine {
		override options(report: Parameters<Engine["options"]>[0]) {
			const options = super.options(report);
			return { ...options, settings: { ...options.settings, compaction: { enabled: true, keepRecentTokens: 1, reserveTokens: 4090 } } };
		}
	}
	const f = await roleFixture(new SmallContext({ provider: p.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } }));
	try {
		await f.command({ type: "assignTask", slice: "engine-compact", delivery: true, packet: packet({ maxTurns: 8 }) });
		for (let n = 0; n < 300; n++) {
			const frame = f.ledger.snapshot(admin);
			if ("assignments" in frame && (frame.assignments as { runtimeTaskCaptured?: boolean }[])[0]?.runtimeTaskCaptured) break;
			await setTimeout(10);
		}
		assert.ok(summary > 0, "native Engine compaction must reach the configured provider");
		assert.equal(refreshed, true, "exact packet constraints must refresh after native compaction");
	} finally {
		await f.close();
	}
});

for (const damage of ["missing", "corrupt", "schema"] as const) {
	test(`native-compaction-history: ${damage} archived bytes never produce complete export`, async () => {
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		p.setResponses([fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "Retained report." }), { stopReason: "toolUse" })]);
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

async function fixture(responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0], auto = false) {
	const data = await mkdtemp(join(tmpdir(), "render-compaction-"));
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", contextWindow: 4096 }] });
	p.setResponses(responses);
	const models = createModels();
	models.setProvider(p.provider);
	let harness!: Harness;
	const opened = await openLedger({
		data,
		onFatal: () => {},
		runtime: () => ({
			models,
			registry: createRegistry(),
			settings: { retry: { maxRetries: 0 }, compaction: { enabled: auto, keepRecentTokens: 1, reserveTokens: 4090 } },
			bindLedger: (_ledger, h) => {
				harness = h;
			},
		}),
	});
	const c = await harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
	await c.configure({ model: { provider: "anthropic", modelId: "claude-sonnet-4-6" }, tools: [], modelTools: [] }, ctx);
	await c.commit(async (tx) => {
		await tx.appendEntry(c.id, { kind: "owned.input", data: {}, model: [{ role: "user", content: "Exact task.", timestamp: 1 }] });
		await tx.appendEntry(c.id, {
			kind: "owned.call",
			data: {},
			model: [fauxAssistantMessage(fauxToolCall("owned", {}, { id: "long" }), { stopReason: "toolUse" })],
		});
		await tx.appendEntry(c.id, {
			kind: "owned.result",
			data: {},
			model: [
				{
					role: "toolResult",
					toolCallId: "long",
					toolName: "owned",
					content: [{ type: "text", text: long }],
					isError: false,
					timestamp: 2,
				},
			],
		});
		await tx.appendEntry(c.id, {
			kind: "owned.tail",
			data: {},
			model: [{ role: "user", content: "Keep this recent tail.", timestamp: 3 }],
		});
	}, ctx);
	return {
		c,
		harness,
		async close() {
			await opened.close();
			await rm(data, { recursive: true, force: true });
		},
	};
}

test("native-compaction-history: compact twice/reset preserves literal committed tail; summary input alone is lossy", async () => {
	const sources: string[] = [];
	const f = await fixture(
		Array.from({ length: 2 }, () => (transcript) => {
			sources.push(JSON.stringify(transcript));
			return fauxAssistantMessage("Short historical summary.");
		}),
	);
	try {
		for (let n = 0; n < 2; n++) {
			if (n)
				await f.c.commit(
					(tx) =>
						tx.appendEntry(f.c.id, {
							kind: "owned.more",
							data: {},
							model: [{ role: "user", content: "More context. ".repeat(100), timestamp: 4 }],
						}),
					ctx,
				);
			const task = await f.c.compact(undefined, ctx);
			const done = await f.harness.waitForTask(task, ctx);
			assert.equal(done.state.outcome.status, "completed");
		}
		assert.equal(sources.length, 2);
		assert.equal(sources[0]!.includes(TAIL), false, "native summarizer truncates long tool text");
		await f.c.reset("Fresh context, not fresh authority.", ctx);
		assert.equal(JSON.stringify(await f.c.context(ctx)).includes(TAIL), false);
		const history = await f.c.entries({ order: "ascending" }, 100, undefined, ctx);
		const result = history.items.find((e) => e.kind === "owned.result");
		assert.ok(result);
		assert.ok(JSON.stringify(result.model).includes(TAIL));
		assert.equal(history.items.filter((e) => e.kind === "pi.compaction").length, 2);
	} finally {
		await f.close();
	}
});

test("native-compaction-history: stale cut refuses placement after reset", async () => {
	let release!: () => void;
	let started!: () => void;
	const gate = new Promise<void>((r) => {
		release = r;
	});
	const requested = new Promise<void>((r) => {
		started = r;
	});
	const f = await fixture([
		async () => {
			started();
			await gate;
			return fauxAssistantMessage("STALE-SUMMARY-CANARY");
		},
	]);
	try {
		const task = await f.c.compact(undefined, ctx);
		await requested;
		await f.c.reset("Reset supersedes selected range.", ctx);
		release();
		await f.harness.waitForTask(task, ctx);
		await f.c.waitForIdle(ctx);
		assert.equal(JSON.stringify((await f.c.context(ctx)).messages).includes("STALE-SUMMARY-CANARY"), false);
		assert.ok(JSON.stringify(await f.c.entries({}, 100, undefined, ctx)).includes(TAIL));
	} finally {
		release();
		await f.close();
	}
});

test("native-compaction-history: failed blocking compaction prevents generation", async () => {
	let requests = 0;
	const f = await fixture(
		[
			() => {
				requests++;
				return fauxAssistantMessage("", { stopReason: "error", errorMessage: "Owned compaction failure" });
			},
		],
		true,
	);
	try {
		const input = await f.c.submit({ type: "input", content: "Continue only after successful blocking compaction." }, ctx);
		await input.wait(ctx);
		assert.equal(requests, 1);
		const inspection = await f.harness.commit((tx) => tx.scanTasks({ conversationId: f.c.id }, 100), ctx);
		assert.ok(
			inspection.items.some((t) => t.kind === "pi.compaction" && t.state.status === "terminal" && t.state.outcome.status === "failed"),
		);
		assert.ok(
			inspection.items.some((t) => t.kind === "pi.generation" && t.state.status === "terminal" && t.state.outcome.status === "failed"),
		);
	} finally {
		await f.close();
	}
});
