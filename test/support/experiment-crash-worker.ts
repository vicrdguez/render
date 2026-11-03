import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { hook, type Registry, ToolTask } from "@earendil-works/pi-durable";
import { Engine } from "../../src/engine/runtime.ts";
import { RoleBinding } from "../../src/ledger/records.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { assignments, saveGround, until } from "./investigation.ts";
import { admin, packet, scheduler } from "./roles.ts";

const [data, mode, repo, commit, image] = process.argv.slice(2) as [string, string, string, string, string];
const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
provider.setResponses([
	() =>
		fauxAssistantMessage(
			fauxToolCall("experiment_run", { argv: ["node", "-e", "require('fs').writeFileSync('measurement.txt','12'); console.log(12)"] }),
			{ stopReason: "toolUse" },
		),
	(transcript) => {
		const prompt = JSON.parse(transcript.messages.filter((m) => m.role === "user").at(-1)!.content as string);
		return fauxAssistantMessage(
			fauxToolCall(
				"submit_role_result",
				{
					supports: [],
					text: JSON.stringify({
						schema: 1,
						protocol: prompt.packet.experiment.protocol,
						outcome: "negative",
						summary: "12 exceeds 10",
						measurements: [{ name: "favorite", value: 12, unit: "units" }],
						failures: [],
						limits: ["Scripted judgment"],
					}),
				},
				{ id: "stable-result" },
			),
			{ stopReason: "toolUse" },
		);
	},
]);
const engine = new Engine({
	provider: provider.provider,
	apiKey: "fixture",
	families: { "claude-sonnet-4-6": "claude" },
	experiments: { root: join(data, "experiments"), repositories: { owned: repo } },
});
const opened = await openLedger({
	data,
	onFatal: console.error,
	runtime: (report) => {
		const options = engine.options(report);
		if (mode !== "recover") {
			const registry = options.registry as Registry;
			const roles = registry.snapshot().extension("render.roles")!;
			registry.install({
				...roles,
				hooks: [
					...(roles.hooks ?? []),
					hook(ToolTask, {
						beforeTool: async (call, api) => {
							if (call.name !== "submit_role_result") return;
							if (mode === "cancel") {
								process.env.RENDER_FAULT_COMMAND = "owned-source";
								process.env.RENDER_FAULT_BARRIER = "before-source-root";
								return;
							}
							const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
							assert.ok(binding);
							process.env.RENDER_FAULT_COMMAND = `role:${createHash("sha256")
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
							process.env.RENDER_FAULT_BARRIER = process.env.RENDER_EXPERIMENT_BARRIER;
						},
					}),
				],
			});
		}
		return options;
	},
});
if (mode === "cancel")
	process.once("SIGUSR1", () => {
		void (async () => {
			const a = assignments(opened.ledger)[0]!;
			assert.equal(
				(
					await opened.ledger.command(
						{
							version: 1,
							authorityEpoch: opened.authorityEpoch,
							commandId: "cancel",
							workflow: "workflow:2",
							command: { type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt },
						},
						admin,
					)
				).status,
				"accepted",
			);
			// Keep the real source-root effect held while cancellation has time to reconcile.
			await setTimeout(100);
			console.log(JSON.stringify({ event: "cancel-observed", executing: assignments(opened.ledger)[0]!.executing }));
		})().catch((error) => {
			console.error(error);
			process.exit(1);
		});
	});
try {
	if (mode !== "recover") {
		const command = (id: string, command: Record<string, unknown>, human = false, save = false) =>
			opened.ledger.command(
				{
					version: 1,
					authorityEpoch: opened.authorityEpoch,
					commandId: id,
					...(id === "create" ? {} : { workflow: "workflow:2" }),
					...(save ? { expected: { document: null } } : {}),
					command,
				},
				human ? admin : scheduler,
			);
		assert.equal((await command("create", { type: "createWorkflow", title: "Experiment" }, true)).status, "accepted");
		assert.equal(
			(
				await command(
					"principles",
					{
						type: "saveDocument",
						document: "principles",
						mediaType: "text/plain",
						content: Buffer.from("Preserve exact negative evidence").toString("base64"),
					},
					true,
					true,
				)
			).status,
			"accepted",
		);
		const ground = await saveGround(opened.ledger);
		const protocol = {
			schema: 1,
			ground,
			question: "Is favorite <= 10?",
			hypothesis: "yes",
			falsifier: ">10",
			decisionRule: "negative when >10",
			controls: ["fixed input"],
			fixtures: ["fixture.txt"],
			failureCases: ["missing is inconclusive"],
			retainedOutputs: ["measurement.txt", "raw result"],
			budget: { maxCommands: 1, timeoutMs: 1000 },
			profile: { image, exclusions: [".git"], maxBytes: 1048576, maxEntries: 1000 },
			source: { repository: "owned", commit },
			candidates: ["favorite"],
		};
		const retained = await command(
			"protocol",
			{
				type: "saveDocument",
				document: "protocol",
				mediaType: "text/plain",
				content: Buffer.from(JSON.stringify(protocol)).toString("base64"),
			},
			true,
			true,
		);
		assert.ok(retained.status === "accepted");
		assert.equal(
			(
				await command("assign", {
					type: "assignTask",
					slice: "workflow:2",
					delivery: false,
					packet: {
						...packet({ role: "experiment-candidate", execution: "linux-writer", maxInputBytes: 1048576 }),
						experiment: { protocol: retained.result.revision, candidate: "favorite" },
					},
				})
			).status,
			"accepted",
		);
	}
	if (mode === "cancel") {
		await until(() => assignments(opened.ledger)[0]?.status === "canceled" && !assignments(opened.ledger)[0]?.executing);
		const exported = await opened.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.ok(
			Object.values(exported.content).some((bytes) => {
				try {
					const value = JSON.parse(Buffer.from(bytes, "base64").toString());
					return (
						value.kind === "experiment-source" &&
						value.verification === "unaccepted" &&
						value.source.source.entries.some((entry: { path: string }) => entry.path === "measurement.txt")
					);
				} catch {
					return false;
				}
			}),
			"fenced sealing must retain exact unaccepted candidate source",
		);
		console.log(JSON.stringify({ canceled: true, retained: true }));
	} else {
		await until(() => assignments(opened.ledger)[0]?.status === "submitted" && !assignments(opened.ledger)[0]?.executing);
		assert.notEqual(mode, "crash", "barrier must interrupt experiment result retention");
		const a = assignments(opened.ledger)[0]!;
		assert.equal(assignments(opened.ledger).length, 1);
		const result = await opened.ledger.artifact(admin, { read: a.report! });
		assert.ok("content" in result);
		assert.equal(
			JSON.parse(result.content.toString()).outcome,
			"negative",
			"sealed negative result must continue without rerunning candidate",
		);
		const snapshot = await opened.ledger.artifact(admin, { read: a.experimentSource! });
		assert.ok("content" in snapshot);
		assert.equal(JSON.parse(snapshot.content.toString()).executions.length, 1, "interruption must not replay candidate execution");
		const exported = await opened.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		const reports = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((r) => r.document === `role-report/${a.id}`);
		assert.equal(reports.length, 1, "one report across experiment result crash");
		console.log(JSON.stringify({ exact: true, executions: 1, reports: 1 }));
	}
} catch (error) {
	console.error(JSON.stringify(assignments(opened.ledger)));
	throw error;
} finally {
	await opened.close();
}
