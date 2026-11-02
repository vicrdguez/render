// Repeated real process death at the Ledger/Engine seam; providers alone are scripted.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { Harness } from "@earendil-works/pi-durable";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import type { Ledger } from "../../src/ledger/ledger.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { admin, allowSameFamily, packet, scheduler } from "./roles.ts";

const [data, mode, action] = process.argv.slice(2);
assert.ok(data && mode && action);
const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
p.setResponses(
	Array.from({ length: 20 }, () => (transcript) => {
		const parent = JSON.stringify(transcript).includes("Required output: Parent report");
		return parent
			? fauxAssistantMessage(fauxToolCall("request_role", { key: "child" }), { stopReason: "toolUse" })
			: fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Queued work complete.\n" }), {
					stopReason: "toolUse",
				});
	}),
);
const engine = new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } });
let harness!: Harness;
let boundLedger!: Ledger;
const opened = await openLedger({
	data,
	onFatal: (e) => {
		throw e;
	},
	runtime: (report) => {
		const options = engine.options(report);
		return {
			...options,
			bindLedger: (ledger, h) => {
				boundLedger = ledger;
				harness = h;
				options.bindLedger?.(ledger, h);
			},
			beforeResume: async () => {
				await options.beforeResume?.();
				if (action !== "seed" || mode !== "capacity") return;
				// Real accepted scheduling intents, with demonstrably absent providers/environments.
				// Blocked execution retains capacity until explicit quiescence, even across host death.
				await command({ type: "createWorkflow", title: "Restart waits" }, admin);
				await saveInput();
				for (let i = 0; i < 5; i++) {
					const accepted = await command({ type: "assignTask", slice: `holder:${i}`, delivery: true, packet: packet() });
					if (i === 4) continue;
					assert.equal(accepted.status, "accepted");
					const a = assignments().find((a) => a.id === accepted.result!.assignment)!;
					await command({ type: "stageTask", ...identity(a), executorEpoch: boundLedger.status().executorEpoch });
					await command({ type: "recordBlocker", ...identity(a), reason: "human decision" });
				}
			},
		};
	},
});
function assignments(): RoleAssignment[] {
	const frame = boundLedger.snapshot(admin);
	assert.ok("assignments" in frame);
	return frame.assignments as RoleAssignment[];
}
function identity(a: RoleAssignment) {
	return { assignment: a.id, generation: a.generation, attempt: a.attempt };
}
async function until(check: () => boolean | Promise<boolean>) {
	const end = Date.now() + 10000;
	while (!(await check())) {
		assert.ok(Date.now() < end, "restart wait did not settle");
		await setTimeout(10);
	}
}
async function command(c: Record<string, unknown>, principal = scheduler) {
	const ledger = boundLedger;
	const reply = await ledger.command(
		{
			version: 1,
			authorityEpoch: ledger.status().authorityEpoch,
			commandId: `restart:${action}:${createHash("sha256").update(JSON.stringify(c)).digest("hex")}`,
			workflow: c.type === "createWorkflow" ? undefined : "workflow:2",
			expected: c.type === "saveDocument" ? { document: null } : undefined,
			command: c,
		},
		principal,
	);
	assert.ok(reply.status === "accepted", JSON.stringify(reply));
	return reply;
}
async function saveInput() {
	await command(
		{
			type: "saveDocument",
			document: "principles",
			mediaType: "text/plain",
			content: Buffer.from("Keep exact constraints.\n").toString("base64"),
		},
		admin,
	);
}
if (action === "seed" && mode === "parent") {
	await command({ type: "createWorkflow", title: "Restart waits" }, admin);
	await saveInput();
	await allowSameFamily(opened.ledger);
	await command({
		type: "assignTask",
		slice: "parent",
		delivery: true,
		packet: packet({
			expectedOutput: "Parent report",
			requests: [{ key: "child", packet: packet({ role: "challenger", execution: "linux-writer" }) }],
		}),
	});
}
if (mode === "parent") {
	await until(() => assignments()[0]?.blocker === "awaiting_role_results" && !assignments()[0]?.executing);
	assert.equal(assignments()[1]?.blocker, "sandbox_capability_unavailable");
} else {
	await until(() => assignments().length === 5 && assignments().filter((a) => a.executing).length === 4);
	assert.equal(assignments()[4]?.status, "queued");
	assert.equal(p.state.callCount, 0, "blocked ownership must not admit a fifth execution after reopen");
}
await setTimeout(100); // let the durable reattachment settle, not a graceful close
const tasks = await harness.inspect(ctx);
assert.equal(tasks.tasks.filter((t) => t.state.kind === "blocked").length, 0, "ordinary waits must never be runtime-parked");
console.log(
	JSON.stringify({
		event: "waiting",
		mode,
		action,
		executorEpoch: opened.executorEpoch,
		assignments: assignments().map((a) => ({ id: a.id, status: a.status, executing: a.executing })),
	}),
);
if (action === "resolve") {
	if (mode === "capacity") {
		for (const a of assignments().slice(0, 4)) {
			await command({ type: "cancelWork", ...identity(a) }, admin);
			const current = assignments().find((v) => v.id === a.id)!;
			await command({ type: "recordQuiescence", ...identity(current), providerIdle: true, environment: "absent", effects: "reconciled" });
		}
		await until(() => assignments()[4]?.status === "submitted" && assignments().every((a) => !a.executing));
		const result = await opened.ledger.artifact(admin, { read: assignments()[4]!.report! });
		assert.ok("content" in result);
		assert.equal(result.content.toString(), "Queued work complete.\n");
	} else {
		// Sandbox execution is absent: cancellation, not a fabricated child report, resolves this wait.
		await command({ type: "cancelWork", ...identity(assignments()[0]!) }, admin);
		await until(() => assignments()[0]?.status === "canceled");
		await until(async () => (await harness.getTask(assignments()[0]!.task as never, ctx))?.state.status === "terminal");
		assert.equal(p.state.callCount, 0, "recovery must not replay the parent or unavailable child");
	}
	console.log(JSON.stringify({ event: "resolved", mode }));
	await opened.close();
} else {
	setInterval(() => {}, 1000);
	await new Promise(() => {});
}
