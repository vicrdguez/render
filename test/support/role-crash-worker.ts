// Owned-process driver for the prewritten R01/R02 crash oracle. Uses real Durable tools, Ledger and SQLite.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { type ConversationId, type Harness, hook, type Registry, ToolTask } from "@earendil-works/pi-durable";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import type { Frame } from "../../src/ledger/ledger.ts";
import { RoleBinding } from "../../src/ledger/records.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { admin, packet, scheduler } from "./roles.ts";

const data = process.argv[2]!;
const mode = process.argv[3]!;
const ctx = BACKGROUND_CONTEXT;
const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
// Choose by the assignment's own packet, not global request timing.
const scripted: import("@earendil-works/pi-ai/providers/faux").FauxResponseFactory = (transcript) => {
	const user = transcript.messages.filter((m) => m.role === "user").at(-1);
	const text = typeof user?.content === "string" ? user.content : "";
	const a = JSON.parse(text);
	if (a.packet.role === "challenger")
		return fauxAssistantMessage(
			fauxToolCall("submit_role_result", { text: "Independent durable result.\n" }, { id: "reused-provider-id" }),
			{ stopReason: "toolUse" },
		);
	if (a.results.length)
		return fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "Parent handover.\n" }, { id: "reused-provider-id" }), {
			stopReason: "toolUse",
		});
	return fauxAssistantMessage(fauxToolCall("request_role", { key: "challenge" }, { id: "reused-provider-id" }), { stopReason: "toolUse" });
};
p.setResponses(Array.from({ length: 12 }, () => scripted));
const engine = new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } });
let harness!: Harness;
const opened = await openLedger({
	data,
	onFatal: (error) => {
		console.error(error);
	},
	runtime: (report) => {
		const options = engine.options(report);
		if (mode === "crash") {
			const registry = options.registry as Registry;
			const roles = registry.snapshot().extension("render.roles")!;
			registry.install({
				...roles,
				hooks: [
					...(roles.hooks ?? []),
					hook(ToolTask, {
						beforeTool: async (call, api) => {
							if (call.name !== "request_role") return;
							const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
							assert.ok(binding);
							const commandId = `role:${createHash("sha256")
								.update(
									JSON.stringify([
										"workflow:2",
										api.conversationId,
										binding.assignment,
										binding.generation,
										binding.attempt,
										api.taskId,
										call.id,
									]),
								)
								.digest("hex")}`;
							process.env.RENDER_FAULT_BARRIER = process.env.RENDER_ROLE_BARRIER;
							process.env.RENDER_FAULT_COMMAND = commandId;
						},
					}),
				],
			});
		}
		return {
			...options,
			bindLedger: (ledger, h) => {
				harness = h;
				options.bindLedger?.(ledger, h);
			},
		};
	},
});
try {
	if (mode === "crash") {
		await opened.ledger.command(
			{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: "create", command: { type: "createWorkflow", title: "crash" } },
			admin,
		);
		await opened.ledger.command(
			{
				version: 1,
				authorityEpoch: opened.authorityEpoch,
				commandId: "input",
				workflow: "workflow:2",
				expected: { document: null },
				command: {
					type: "saveDocument",
					document: "principles",
					mediaType: "text/plain",
					content: Buffer.from("Keep constraints.\n").toString("base64"),
				},
			},
			admin,
		);
		const accepted = await opened.ledger.command(
			{
				version: 1,
				authorityEpoch: opened.authorityEpoch,
				commandId: "root",
				workflow: "workflow:2",
				command: {
					type: "assignTask",
					slice: "slice:1",
					delivery: true,
					packet: packet({ requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }),
				},
			},
			scheduler,
		);
		assert.equal(accepted.status, "accepted");
		await setTimeout(15000);
		throw new Error("barrier did not stop worker");
	}
	let assignments: RoleAssignment[] = [];
	for (let n = 0; n < 1000; n++) {
		assignments = (opened.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
		if (assignments.length === 2 && assignments.every((a) => a.status === "submitted" && !a.executing)) break;
		await setTimeout(10);
	}
	assert.equal(assignments.length, 2);
	assert.deepEqual(
		assignments.map((a) => a.status),
		["submitted", "submitted"],
		JSON.stringify({ assignments, tasks: (await harness.inspect(ctx)).tasks }),
	);
	// Read the actual durable tool result, not a regenerated envelope or a database side channel.
	const root = await harness.conversation(assignments[0]!.conversation as ConversationId, ctx);
	const entries = await root!.entries({ order: "ascending" }, 200, undefined, ctx);
	const results = entries.items.flatMap((e) => e.model ?? []).filter((m) => m.role === "toolResult" && m.toolName === "request_role");
	assert.equal(results.length, 1);
	const request = results[0]!;
	assert.equal(request.role, "toolResult");
	const body = JSON.parse(
		request.content
			.filter((c) => c.type === "text")
			.map((c) => c.text)
			.join(""),
	);
	assert.equal(body.status, "accepted");
	const child = assignments[1]!;
	const artifact = await opened.ledger.artifact(admin, { read: child.report! });
	assert.ok("content" in artifact);
	assert.equal(artifact.content.toString(), "Independent durable result.\n");
	console.log(
		JSON.stringify({
			children: assignments.filter((a) => a.parent).length,
			requests: new Set(assignments.filter((a) => a.parent).map((a) => a.requestKey)).size,
			duplicate: body.duplicate,
		}),
	);
} finally {
	await opened.close();
}
