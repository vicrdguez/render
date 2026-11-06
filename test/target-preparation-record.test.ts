// TP18–TP20 at the Ledger interface over real SQLite/Durable staging. Preparation records are literal host results here:
// these checks establish acceptance, ordering, retry and retention boundaries, not that Effects or Linux produced them.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { accepted, capture, implementationLifecycle, implementationTasks, LedgerOnlyEngine } from "./support/implementation.ts";
import { admin, recovery, scheduler } from "./support/roles.ts";

const effects = mintContext({ kind: "host", scope: "effects" });
const WORKFLOW = "workflow:2";
const P1 = `pass:${WORKFLOW}:read-fix:1`;
const S = "a".repeat(40);
const T1 = "c".repeat(40);
const TREE = "d".repeat(40);
const X = "e".repeat(40);
const REF = `refs/render/proposals/${"0".repeat(64)}`;

type Lifecycle = Awaited<ReturnType<typeof implementationLifecycle>>;
const passes = (t: Lifecycle) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
const pass = (t: Lifecycle, ref = P1) => passes(t).find((p) => p.ref === ref)!;

async function handedOff() {
	const t = await implementationLifecycle();
	await t.audit();
	await t.reports();
	await t.retain("final");
	accepted(await t.f.command(t.handoff, t.actor, "p1-handoff"));
	const a = t.owner();
	accepted(
		await t.f.command({
			type: "recordQuiescence",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		}),
	);
	return t;
}
const preparation = (p: ImplementationPass, kind: "clean" | "conflict") => ({
	kind,
	algorithm: "git-merge-tree-write-tree-z/v1",
	profile: "render-trusted-git/v1",
	git: "git version 2.50.0",
	identity: "f".repeat(64),
	base: p.configuration.verification.commit,
	source: S,
	target: T1,
	result: X,
	tree: TREE,
	conflicts: kind === "conflict" ? ["value"] : [],
	exitCode: kind === "conflict" ? 1 : 0,
	stdout: "",
	stderr: "",
});
const checks = (status: "passed" | "failed") => ({
	verifierRevision: "b".repeat(64),
	scope: { assignment: "assignment:owner", generation: 1, attempt: "attempt:owner:preparation:1", executorEpoch: "executor:1" },
	catalog: { selection: {}, rows: [] },
	results: [],
	cleanup: { status: "complete", results: [] },
	verification: { status, inputCommit: X, inputTree: TREE, resultTree: TREE },
	failed: status === "failed" ? [{ name: "read", exitCode: 1 }] : [],
});
type Outcome = "conflict" | "checked" | "check-failure" | "operational";
function record(p: ImplementationPass, outcome: Outcome, over: Record<string, unknown> = {}) {
	return JSON.stringify({
		schema: 1,
		passRef: p.ref,
		handoff: p.handoff!.record,
		source: p.handoff!.source,
		attempt: (p.handoff!.preparations?.length ?? 0) + 1,
		target: { proposal: WORKFLOW, ref: REF, commit: T1 },
		outcome,
		reason: outcome === "operational" ? "preparation_operational_error: merge-tree signal SIGABRT" : null,
		preparation: outcome === "operational" ? null : preparation(p, outcome === "conflict" ? "conflict" : "clean"),
		checks: outcome === "checked" ? checks("passed") : outcome === "check-failure" ? checks("failed") : null,
		...over,
	});
}
const recordCommand = (t: Lifecycle, text: string) => {
	const a = t.owner();
	return { type: "recordPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt, text };
};
const retry = (t: Lifecycle) => {
	const a = t.owner();
	return { type: "retryPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt };
};
function refused(t: Lifecycle, reply: CommandReply, code: string, before: unknown, label: string) {
	assert.equal(reply.status, "refused", `${label}: ${JSON.stringify(reply)}`);
	if (reply.status === "refused") assert.equal(reply.code, code, `${label}: ${reply.reason}`);
	assert.deepEqual(passes(t), before, `${label}: no pass changes`);
}

test("TP18 only trusted Effects retains one well-formed attempt per handed-off pass, in order", async () => {
	const t = await implementationLifecycle();
	try {
		await t.audit();
		await t.reports();
		await t.retain("final");
		const open = structuredClone(passes(t));
		const early = JSON.stringify({ schema: 1, passRef: P1, attempt: 1 });
		refused(t, await t.f.command(recordCommand(t, early), effects), "assignment_closed", open, "before handoff");
	} finally {
		await t.close();
	}
	const h = await handedOff();
	try {
		const p = pass(h);
		const before = structuredClone(passes(h));
		const valid = record(p, "conflict");
		for (const [label, context, code] of [
			["scheduler", scheduler, "forbidden_principal"],
			["recovery", recovery, "forbidden_principal"],
			["human", admin, "forbidden_principal"],
		] as const)
			refused(h, await h.f.command(recordCommand(h, valid), context), code, before, label);
		refused(h, await h.f.command(recordCommand(h, valid), h.actor), "forbidden_principal", before, "implementer agent");
		const malformed: [string, string][] = [
			["not JSON", "{"],
			["extra field", record(p, "conflict", { verdict: "pass" })],
			["conflict without conflicts", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), conflicts: [] } })],
			["conflict with checks", record(p, "conflict", { checks: checks("passed") })],
			["checked without passing checks", record(p, "checked", { checks: checks("failed") })],
			["check-failure without failed rows", record(p, "check-failure", { checks: { ...checks("failed"), failed: [] } })],
			[
				"launch failure as a check failure",
				record(p, "check-failure", { checks: { ...checks("failed"), failed: [{ name: "read", exitCode: 127 }] } }),
			],
			[
				"checks of other source",
				record(p, "checked", { checks: { ...checks("passed"), verification: { ...checks("passed").verification, inputCommit: S } } }),
			],
			["operational without reason", record(p, "operational", { reason: null })],
			["clean receipt as conflict", record(p, "conflict", { preparation: preparation(p, "clean") })],
		];
		for (const [label, text] of malformed) refused(h, await h.f.command(recordCommand(h, text), effects), "invalid_content", before, label);
		const lineage: [string, string][] = [
			["second attempt first", record(p, "conflict", { attempt: 2 })],
			["other pass", record(p, "conflict", { passRef: `pass:${WORKFLOW}:read-fix:9` })],
			["other handoff", record(p, "conflict", { handoff: "implementation-handoff:1" })],
			["other sealed B", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), source: "b".repeat(40) } })],
			["forged recorded base", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), base: "b".repeat(40) } })],
			["receipt for another target", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), target: "b".repeat(40) } })],
		];
		for (const [label, text] of lineage) refused(h, await h.f.command(recordCommand(h, text), effects), "stale_basis", before, label);
		const first = await h.f.command(recordCommand(h, valid), effects, "preparation:1");
		const ref = accepted(first).preparation as string;
		assert.deepEqual(pass(h).handoff!.preparations, [ref]);
		assert.equal(pass(h).handoff!.preparationResult, ref);
		assert.equal(pass(h).handoff!.blocker, undefined, "a classified conflict is not an operational blockage");
		assert.deepEqual(
			await h.f.command(recordCommand(h, valid), effects, "preparation:1"),
			{ ...first, duplicate: true },
			"replay returns the same receipt",
		);
		const after = structuredClone(passes(h));
		refused(h, await h.f.command(recordCommand(h, valid), effects), "stale_basis", after, "attempt 1 again");
		const read = await h.f.ledger.artifact(admin, { read: ref });
		assert.ok("content" in read && read.content.toString() === valid, "exact record bytes are retained");
	} finally {
		await h.close();
	}
});

test("TP19 explicit human retry after operational blockage keeps pass, B and Audit and stages one preparation", async () => {
	const t = await handedOff();
	try {
		const tasks = (await implementationTasks(t.f.harness)).length;
		const operational = accepted(await t.f.command(recordCommand(t, record(pass(t), "operational")), effects)).preparation as string;
		const blocked = structuredClone(pass(t));
		assert.match(blocked.handoff!.blocker ?? "", /SIGABRT/);
		assert.match(t.owner().blocker ?? "", /SIGABRT/);
		for (const [label, context] of [
			["scheduler", scheduler],
			["effects", effects],
			["agent", t.actor],
		] as const)
			refused(t, await t.f.command(retry(t), context), "forbidden_principal", [blocked], label);
		const retried = accepted(await t.f.command(retry(t), admin));
		assert.equal(retried.passRef, P1);
		const current = pass(t);
		assert.notEqual(current.handoff!.preparationTask, blocked.handoff!.preparationTask, "a new preparation task is staged");
		assert.equal(retried.preparationTask, current.handoff!.preparationTask);
		assert.equal(current.handoff!.blocker, undefined);
		assert.equal(t.owner().blocker, null);
		assert.equal(t.owner().status, "submitted");
		const { preparationTask: _a, blocker: _b, ...kept } = blocked.handoff!;
		const { preparationTask: _c, ...now } = current.handoff!;
		assert.deepEqual(now, kept, "B, handoff and the operational record stay");
		assert.deepEqual({ ...current, handoff: undefined }, { ...blocked, handoff: undefined }, "same pass and Audit");
		assert.equal(passes(t).length, 1, "no successor pass");
		assert.equal((await implementationTasks(t.f.harness)).length, tasks + 1, "exactly one preparation task");
		assert.deepEqual(current.handoff!.preparations, [operational]);
		refused(t, await t.f.command(retry(t), admin), "stale_basis", [structuredClone(current)], "retry while preparing");
		accepted(await t.f.command(recordCommand(t, record(pass(t), "checked")), effects));
		const owner = t.owner();
		accepted(
			await t.f.command({
				type: "recordPreparationBlocker",
				assignment: owner.id,
				generation: owner.generation,
				attempt: owner.attempt,
				reason: `awaiting_watchdog: prepared ${X} checked on current target ${T1}; Watchdog capability unavailable`,
			}),
		);
		// A settled ready preparation may be prepared again explicitly.
		accepted(await t.f.command(retry(t), admin));
		accepted(await t.f.command(recordCommand(t, record(pass(t), "conflict")), effects));
		const owner2 = t.owner();
		accepted(
			await t.f.command(
				{
					type: "openSuccessorPass",
					assignment: owner2.id,
					generation: owner2.generation,
					attempt: owner2.attempt,
					text: JSON.stringify({
						schema: 1,
						cause: "preparation-conflict",
						repository: "owned",
						source: pass(t).handoff!.source,
						sourceCommit: S,
						baseCommit: S,
						targetCommit: T1,
						algorithm: "git-merge-tree-write-tree-z/v1",
						resultTree: TREE,
						conflicts: ["value"],
					}),
				},
				effects,
			),
		);
		const returned = structuredClone(passes(t));
		refused(t, await t.f.command(retry(t), admin), "assignment_closed", returned, "retry after a successor");
		refused(
			t,
			await t.f.command(recordCommand(t, record(pass(t), "checked")), effects),
			"assignment_closed",
			returned,
			"late attempt after a successor",
		);
	} finally {
		await t.close();
	}
});

test("TP20 records survive reopen and export and stay readable by the successor owner only", async () => {
	const t = await handedOff();
	try {
		const ref = accepted(await t.f.command(recordCommand(t, record(pass(t), "conflict")), effects)).preparation as string;
		const owner = t.owner();
		const opened = accepted(
			await t.f.command(
				{
					type: "openSuccessorPass",
					assignment: owner.id,
					generation: owner.generation,
					attempt: owner.attempt,
					text: JSON.stringify({
						schema: 1,
						cause: "preparation-conflict",
						repository: "owned",
						source: pass(t).handoff!.source,
						sourceCommit: S,
						baseCommit: S,
						targetCommit: T1,
						algorithm: "git-merge-tree-write-tree-z/v1",
						resultTree: TREE,
						conflicts: ["value"],
					}),
				},
				effects,
			),
		);
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: WORKFLOW } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.ok(exported.content[ref], "export retains the preparation record");
		const before = structuredClone(passes(t));
		await t.f.reopen(new LedgerOnlyEngine());
		assert.deepEqual(passes(t), before);
		const successor = await t.start(opened.assignment as string);
		const read = await t.f.ledger.artifact(successor, { read: ref });
		assert.ok("content" in read, "successor owner reads predecessor preparation evidence");
		const auditRecord = accepted(
			await t.f.command(
				{
					type: "recordImplementationSource",
					assignment: opened.assignment,
					generation: 1,
					attempt: t.assignments().find((a) => a.id === opened.assignment)!.attempt,
					kind: "audit",
					text: JSON.stringify(
						capture(t.assignments().find((a) => a.id === opened.assignment)!, t.f.ledger.status().executorEpoch, t.contract, T1),
					),
				},
				effects,
			),
		);
		assert.ok(auditRecord.source);
		accepted(await t.f.command({ type: "requestImplementationAudit" }, successor));
		const reviewer = t.assignments().find((a) => a.parent === opened.assignment)!;
		const principal = await t.start(reviewer.id);
		assert.equal("content" in (await t.f.ledger.artifact(principal, { read: ref })), false, "fresh reviewers see only A2");
	} finally {
		await t.close();
	}
});
