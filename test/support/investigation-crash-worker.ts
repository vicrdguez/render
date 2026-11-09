import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { type ConversationId, type Harness, hook, type Registry, ToolTask } from "@earendil-works/pi-durable";
import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import { RoleBinding } from "../../src/ledger/records.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { assignments, finding, investigationPacket, saveGround, until } from "./investigation.ts";
import { addProject, admin, claudeFixture, PROJECT, scheduler } from "./roles.ts";

const [data, mode, repo, commit] = process.argv.slice(2) as [string, string, string, string];
const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
provider.setResponses(
	Array.from({ length: 4 }, () => (transcript) => {
		const user = transcript.messages.filter((m) => m.role === "user").at(-1)!;
		const prompt = JSON.parse(user.content as string);
		const source = prompt.inputs.find((i: { text: string }) => i.text.includes('"kind":"investigation-source"'));
		return fauxAssistantMessage(
			fauxToolCall(
				"submit_role_result",
				{ supports: [], text: JSON.stringify(finding(source.ref, prompt.packet.investigation.ground)) },
				{ id: "stable-result" },
			),
			{ stopReason: "toolUse" },
		);
	}),
);
const engine = new Engine({
	provider: provider.provider,
	...claudeFixture,
	investigations: { root: join(data, "source") },
});
let harness!: Harness;
const opened = await Effect.runPromise(
	openLedger({
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
								if (call.name !== "submit_role_result") return;
								const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
								assert.ok(binding);
								process.env.RENDER_FAULT_COMMAND = `role:${createHash("sha256")
									.update(
										JSON.stringify([
											"workflow:3",
											api.conversationId,
											binding.assignment,
											binding.generation,
											binding.attempt,
											api.taskId,
											call.id,
										]),
									)
									.digest("hex")}`;
								process.env.RENDER_FAULT_BARRIER = process.env.RENDER_INVESTIGATION_BARRIER;
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
	}),
);
try {
	if (mode === "crash") {
		assert.equal(
			(
				await Effect.runPromise(
					opened.ledger.command(
						{
							version: 1,
							authorityEpoch: opened.authorityEpoch,
							commandId: "project",
							command: addProject({ remote: repo, defaultBranch: "fixture" }),
						},
						admin,
					),
				)
			).status,
			"accepted",
		);
		assert.equal(
			(
				await Effect.runPromise(
					opened.ledger.command(
						{
							version: 1,
							authorityEpoch: opened.authorityEpoch,
							commandId: "create",
							command: { type: "createWorkflow", title: "Investigate", project: PROJECT },
						},
						admin,
					),
				)
			).status,
			"accepted",
		);
		assert.equal(
			(
				await Effect.runPromise(
					opened.ledger.command(
						{
							version: 1,
							authorityEpoch: opened.authorityEpoch,
							commandId: "principles",
							workflow: "workflow:3",
							expected: { document: null },
							command: {
								type: "saveDocument",
								document: "principles",
								mediaType: "text/plain",
								content: Buffer.from("Read only; retain exact facts.").toString("base64"),
							},
						},
						admin,
					),
				)
			).status,
			"accepted",
		);
		const ground = await saveGround(opened.ledger);
		assert.equal(
			(
				await Effect.runPromise(
					opened.ledger.command(
						{
							version: 1,
							authorityEpoch: opened.authorityEpoch,
							commandId: "start",
							workflow: "workflow:3",
							command: { type: "assignTask", slice: "workflow:3", delivery: false, packet: investigationPacket(ground, commit) },
						},
						scheduler,
					),
				)
			).status,
			"accepted",
		);
	}
	await until(() => assignments(opened.ledger)[0]?.status === "submitted" && !assignments(opened.ledger)[0]?.executing);
	assert.notEqual(mode, "crash", "fault barrier must interrupt submission");
	const a = assignments(opened.ledger)[0]!;
	assert.equal(assignments(opened.ledger).length, 1);
	const report = await Effect.runPromise(opened.ledger.artifact(admin, { read: a.report! }));
	assert.ok("content" in report);
	assert.equal(JSON.parse(report.content.toString()).summary, "The strict positive predicate excludes zero.");
	const conversation = await harness.conversation(a.conversation as ConversationId, ctx);
	const entries = await conversation!.entries({ order: "ascending" }, 200, undefined, ctx);
	const results = entries.items.flatMap((e) => e.model ?? []).filter((m) => m.role === "toolResult" && m.toolName === "submit_role_result");
	assert.equal(results.length, 1);
	const result = results[0]!;
	assert.equal(result.role, "toolResult");
	const receipt = JSON.parse(
		result.content
			.filter((c) => c.type === "text")
			.map((c) => c.text)
			.join(""),
	);
	assert.equal(receipt.status, "accepted");
	const bundle = await Effect.runPromise(opened.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
	assert.ok("manifest" in bundle && bundle.manifest.complete);
	const reports = bundle.jsonl
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line))
		.filter((r) => r.document === `role-report/${a.id}`);
	assert.equal(reports.length, 1, "one retained report across crash/replay");
	console.log(JSON.stringify({ report: a.report, duplicate: receipt.duplicate ?? false, assignments: 1, exact: true }));
} finally {
	await Effect.runPromise(opened.close());
}
