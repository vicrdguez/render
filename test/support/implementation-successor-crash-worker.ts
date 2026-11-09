// Real SQLite/Durable successor transition cuts. Source/check observations are Ledger fixtures, not container execution evidence.

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import type { ImplementationPass, RoleAssignment } from "../../src/kernel/roles.ts";
import type { Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { accepted, implementationLifecycle, implementationTasks, LedgerOnlyEngine } from "./implementation.ts";
import { admin } from "./roles.ts";

const [mode, argument] = process.argv.slice(2) as [string, string];
const commandId = "successor-cut";
const effects = mintContext({ kind: "host", scope: "effects" });
type Saved = { owner: RoleAssignment; open: Record<string, unknown>; tasks: number };
if (mode === "crash") {
	const t = await implementationLifecycle();
	process.stdout.write(`${JSON.stringify({ event: "data", data: t.f.data })}\n`);
	await t.audit();
	await t.reports();
	const B = await t.retain("final");
	accepted(await t.f.command(t.handoff, t.actor));
	const owner = t.owner();
	accepted(
		await t.f.command({
			type: "recordQuiescence",
			assignment: owner.id,
			generation: owner.generation,
			attempt: owner.attempt,
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		}),
	);
	const open = {
		type: "openSuccessorPass",
		assignment: owner.id,
		generation: owner.generation,
		attempt: owner.attempt,
		text: JSON.stringify({
			schema: 1,
			cause: "preparation-conflict",
			repository: "owned",
			source: B,
			sourceCommit: "a".repeat(40),
			baseCommit: "a".repeat(40),
			targetCommit: "c".repeat(40),
			algorithm: "merge-tree-write-tree",
			resultTree: "d".repeat(40),
			conflicts: ["value"],
		}),
	};
	const saved: Saved = { owner: t.owner(), open, tasks: (await implementationTasks(t.f.harness)).length };
	await writeFile(join(t.f.data, "successor-cut.json"), JSON.stringify(saved));
	process.env.RENDER_FAULT_COMMAND = commandId;
	process.env.RENDER_FAULT_BARRIER = argument;
	const keepAlive = setInterval(() => {}, 1000);
	try {
		await t.f.command(open, effects, commandId);
	} finally {
		clearInterval(keepAlive);
	}
	throw new Error("successor must stop at the configured barrier before replying");
} else {
	const saved = JSON.parse(await readFile(join(argument, "successor-cut.json"), "utf8")) as Saved;
	const engine = new LedgerOnlyEngine();
	const opened = await Effect.runPromise(
		openLedger({
			data: argument,
			runtime: (report) => engine.options(report),
			onFatal: (error) => {
				throw error;
			},
		}),
	);
	try {
		const command = (id: string) =>
			Effect.runPromise(
				opened.ledger.command(
					{ version: 1, authorityEpoch: opened.authorityEpoch, workflow: saved.owner.workflow, commandId: id, command: saved.open },
					effects,
				),
			);
		const passes = () => (opened.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const beforePasses = passes().length;
		const beforeTasks = (await implementationTasks(engine.harness)).length - saved.tasks;
		const original = await Effect.runPromise(opened.ledger.receipt(effects, commandId));
		const hadReceipt = !("code" in original);
		const retried = await command(commandId);
		const result = accepted(retried);
		assert.equal(result.passOrdinal, 2);
		const duplicate = await command(commandId);
		assert.deepEqual(accepted(duplicate), result);
		assert.equal(duplicate.status === "accepted" && duplicate.duplicate, true);
		if (hadReceipt) assert.deepEqual(original.result, result, "lost reply retains the exact authorized result");
		assert.equal((await command("another-successor")).status, "refused");
		assert.equal(passes().length, 2);
		assert.equal((await implementationTasks(engine.harness)).length, saved.tasks + 1);
		const exported = await Effect.runPromise(opened.ledger.artifact(admin, { export: { workflow: saved.owner.workflow } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		const records = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		console.log(
			JSON.stringify({
				beforePasses,
				beforeTasks,
				hadReceipt,
				duplicate: retried.status === "accepted" && retried.duplicate,
				finalPasses: passes().length,
				finalTasks: 1,
				finalObservations: records.filter((record) => record.document?.startsWith("implementation-return/")).length,
			}),
		);
	} finally {
		await Effect.runPromise(opened.close());
	}
}
