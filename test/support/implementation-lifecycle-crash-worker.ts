// Real SQLite/Durable handoff cuts. Source/check observations are Ledger fixtures, not container execution evidence.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImplementationPass, RoleAssignment } from "../../src/kernel/roles.ts";
import type { Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { accepted, capture, implementationLifecycle, implementationTasks, LedgerOnlyEngine } from "./implementation.ts";
import { admin, scheduler } from "./roles.ts";

const [mode, argument] = process.argv.slice(2) as [string, string];
const commandId = "handoff-cut";
type Saved = { owner: RoleAssignment; contract: string; handoff: Record<string, unknown>; tasks: number };
if (mode === "crash") {
	const t = await implementationLifecycle();
	process.stdout.write(`${JSON.stringify({ event: "data", data: t.f.data })}\n`);
	await t.audit();
	await t.reports();
	await t.retain("final");
	const saved: Saved = {
		owner: t.owner(),
		contract: t.contract,
		handoff: t.handoff,
		tasks: (await implementationTasks(t.f.harness)).length,
	};
	await writeFile(join(t.f.data, "handoff-cut.json"), JSON.stringify(saved));
	process.env.RENDER_FAULT_COMMAND = commandId;
	process.env.RENDER_FAULT_BARRIER = argument;
	const keepAlive = setInterval(() => {}, 1000);
	try {
		await t.f.command(t.handoff, t.actor, commandId);
	} finally {
		clearInterval(keepAlive);
	}
	throw new Error("handoff must stop at the configured barrier before replying");
} else {
	const saved = JSON.parse(await readFile(join(argument, "handoff-cut.json"), "utf8")) as Saved;
	const engine = new LedgerOnlyEngine();
	const opened = await openLedger({
		data: argument,
		runtime: (report) => engine.options(report),
		onFatal: (error) => {
			throw error;
		},
	});
	try {
		const actor = mintContext({
			kind: "assignment-agent",
			assignment: saved.owner.id,
			generation: saved.owner.generation,
			attempt: saved.owner.attempt,
			role: "implementer",
		});
		const command = (value: Record<string, unknown>, id: string, context = scheduler) =>
			opened.ledger.command(
				{
					version: 1,
					authorityEpoch: opened.authorityEpoch,
					workflow: saved.owner.workflow,
					commandId: id,
					command: value,
				},
				context,
			);
		const frame = () => opened.ledger.snapshot(admin) as Frame;
		const passes = () => frame().implementationPasses as ImplementationPass[];
		const owner = () => (frame().assignments as RoleAssignment[]).find((a) => a.id === saved.owner.id)!;
		const beforeHandoffs = passes().filter((p) => p.handoff).length;
		const beforeTasks = (await implementationTasks(engine.harness)).length - saved.tasks;
		const original = await opened.ledger.receipt(actor, commandId);
		const hadReceipt = !("code" in original);
		const stale = mintContext({
			kind: "assignment-agent",
			assignment: saved.owner.id,
			generation: 0,
			attempt: saved.owner.attempt,
			role: "implementer",
		});
		assert.notEqual(
			(await command(saved.handoff, commandId, stale)).status,
			"accepted",
			"stale principal cannot recover an accepted receipt",
		);
		if (!beforeHandoffs) {
			// Restart does not give the old executor permission to submit a new handoff.
			assert.equal((await command(saved.handoff, commandId, actor)).status, "refused");
			accepted(
				await command(
					{
						type: "rebindAttempt",
						assignment: saved.owner.id,
						generation: saved.owner.generation,
						attempt: saved.owner.attempt,
						providerIdle: true,
						environment: "stopped",
						effects: "reconciled",
						executorEpoch: opened.executorEpoch,
					},
					"recover-owner",
				),
			);
			accepted(
				await command(
					{
						type: "stageTask",
						assignment: saved.owner.id,
						generation: saved.owner.generation,
						attempt: saved.owner.attempt,
						executorEpoch: opened.executorEpoch,
					},
					"resume-owner",
				),
			);
			accepted(
				await command(
					{
						type: "recordImplementationSource",
						assignment: saved.owner.id,
						generation: saved.owner.generation,
						attempt: saved.owner.attempt,
						kind: "final",
						text: JSON.stringify(capture(owner(), opened.executorEpoch, saved.contract)),
					},
					"recapture-final",
					mintContext({ kind: "host", scope: "effects" }),
				),
			);
		}
		const retried = await command(saved.handoff, commandId, actor);
		const result = accepted(retried);
		const duplicate = await command(saved.handoff, commandId, actor);
		assert.deepEqual(accepted(duplicate), result);
		assert.equal(duplicate.status === "accepted" && duplicate.duplicate, true);
		if (hadReceipt) assert.deepEqual(original.result, result, "lost reply retains exact authorized result");
		assert.equal((await command(saved.handoff, "another-handoff", actor)).status, "refused");
		assert.equal(passes().length, 1);
		assert.equal(passes().filter((p) => p.handoff).length, 1);
		assert.equal((await implementationTasks(engine.harness)).length, saved.tasks + 1);
		assert.equal(passes()[0]!.handoff!.preparationTask, result.preparationTask);
		const exported = await opened.ledger.artifact(admin, { export: { workflow: saved.owner.workflow } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		const handoffs = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((record) => record.document?.startsWith("implementation-handoff/"));
		assert.equal(handoffs.length, 1);
		console.log(
			JSON.stringify({
				beforeHandoffs,
				beforeTasks,
				hadReceipt,
				duplicate: retried.status === "accepted" && retried.duplicate,
				finalHandoffs: handoffs.length,
				finalTasks: 1,
			}),
		);
	} finally {
		await opened.close();
	}
}
