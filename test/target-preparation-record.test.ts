// TP18–TP20 at the Ledger interface over real SQLite/Durable staging. Preparation records are literal host results here:
// these checks establish acceptance, ordering, retry and retention boundaries, not that Effects or Linux produced them.

import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { type ConversationId, createRegistry, defineExtension, defineTask, type Harness } from "@earendil-works/pi-durable";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { ImplementationPass, RoleAssignment, RoleIntent } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { Workflow } from "../src/ledger/records.ts";
import { accepted, capture, implementationLifecycle, implementationTasks, LedgerOnlyEngine } from "./support/implementation.ts";
import { admin, recovery, scheduler } from "./support/roles.ts";

const effects = mintContext({ kind: "host", scope: "effects" });
const WORKFLOW = "workflow:3";
const P1 = `pass:${WORKFLOW}:read-fix:1`;
const S = "a".repeat(40);
const T1 = "c".repeat(40);
const TREE = "d".repeat(40);
const X = "e".repeat(40);
const REF = `refs/render/proposals/${"0".repeat(64)}`;
/** The fixture workflow's current policy binding, the basis a current preparation record must name. */
const BASIS = { binding: "policy-binding:6", revision: "policy:5", minimumEvidenceRank: "tests" };

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
		policy: BASIS,
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
			["without policy basis", record(p, "checked", { policy: undefined })],
			["policy basis without minimum", record(p, "checked", { policy: { binding: BASIS.binding, revision: BASIS.revision } })],
		];
		for (const [label, text] of malformed) refused(h, await h.f.command(recordCommand(h, text), effects), "invalid_content", before, label);
		const lineage: [string, string][] = [
			["second attempt first", record(p, "conflict", { attempt: 2 })],
			["other pass", record(p, "conflict", { passRef: `pass:${WORKFLOW}:read-fix:9` })],
			["other handoff", record(p, "conflict", { handoff: "implementation-handoff:1" })],
			["other sealed B", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), source: "b".repeat(40) } })],
			["forged recorded base", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), base: "b".repeat(40) } })],
			["receipt for another target", record(p, "conflict", { preparation: { ...preparation(p, "conflict"), target: "b".repeat(40) } })],
			["superseded policy binding", record(p, "checked", { policy: { ...BASIS, binding: "policy-binding:1" } })],
			["other policy revision", record(p, "checked", { policy: { ...BASIS, revision: "policy:initial" } })],
			["other minimum than the bound policy", record(p, "checked", { policy: { ...BASIS, minimumEvidenceRank: "static" } })],
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
		const read = await Effect.runPromise(h.f.ledger.artifact(admin, { read: ref }));
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
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: WORKFLOW } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.ok(exported.content[ref], "export retains the preparation record");
		const before = structuredClone(passes(t));
		await t.f.reopen(new LedgerOnlyEngine());
		assert.deepEqual(passes(t), before);
		const successor = await t.start(opened.assignment as string);
		const read = await Effect.runPromise(t.f.ledger.artifact(successor, { read: ref }));
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
		assert.equal(
			"content" in (await Effect.runPromise(t.f.ledger.artifact(principal, { read: ref }))),
			false,
			"fresh reviewers see only A2",
		);
	} finally {
		await t.close();
	}
});

/** The preparation task exactly as the prior release admitted it: same name, version, input and checkpoint. */
const priorPreparation = defineTask<{ assignment: string }, { phase: "blocked" }, null>({
	name: "render.implementation-preparation",
	version: 1,
	initial: () => ({ phase: "blocked" }),
	// Held live until the store closes, as after a crash or pause; this definition never records anything itself.
	phases: { blocked: (task, runtime, context) => runtime.sleepUntil(Date.now() + 1000, task.state.checkpoint, context) },
	abort: (_task, runtime, context) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
});
/** The Ledger-seam role task these fixtures already retained; reinstalled so their terminal records stay supported. */
const roleTask = defineTask<{ assignment: string }, { phase: "done" }, null>({
	name: "test.implementation-task",
	version: 1,
	initial: () => ({ phase: "done" }),
	phases: {
		done: (_task, runtime, context) =>
			runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
	},
	abort: (_task, runtime, context) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
});
class PriorReleaseEngine extends LedgerOnlyEngine {
	override options(onReport: Parameters<LedgerOnlyEngine["options"]>[0]) {
		const options = super.options(onReport);
		const registry = createRegistry();
		registry.install(defineExtension({ name: "test.prior-release", tasks: [roleTask, priorPreparation] }));
		return {
			...options,
			registry,
			roleTasks: {
				...options.roleTasks!,
				stage: async (tx: Parameters<NonNullable<typeof options.roleTasks>["stage"]>[0], intent: RoleIntent, a: RoleAssignment) => {
					if (intent.kind !== "prepare-pass") return options.roleTasks!.stage(tx, intent, a);
					const workflow = await tx.doc(Workflow, a.workflow, null);
					if (!workflow.exists) throw new Error("fixture workflow missing");
					return tx.createTask(
						priorPreparation,
						{ assignment: a.id },
						{ conversationId: workflow.conversation as ConversationId, ownership: { kind: "conversation" } },
					);
				},
			},
		};
	}
}
/** This release's Engine, unchanged, exposing only the reopened Durable harness for task inspection. */
class CurrentEngine extends Engine {
	harness!: Harness;
	override options(onReport: Parameters<Engine["options"]>[0]) {
		const options = super.options(onReport);
		return {
			...options,
			bindLedger: (ledger: Parameters<NonNullable<typeof options.bindLedger>>[0], harness: Harness) => {
				this.harness = harness;
				options.bindLedger?.(ledger, harness);
			},
		};
	}
}
async function tasksOf(harness: Harness, kind: string) {
	return harness.commit(async (tx) => {
		const found: { id: number; input: unknown; state: { status: string; checkpoint?: unknown } }[] = [];
		let cursor: Parameters<typeof tx.scanTasks>[2];
		for (;;) {
			const page = await tx.scanTasks({}, 200, cursor);
			for (const task of page.items) if (task.kind === kind) found.push(task as never);
			if (!page.next) return found;
			cursor = page.next;
		}
	}, ctx);
}

test("TP25 a preparation task admitted by the prior release reopens and drains with its retained meaning; retry uses the new task", async () => {
	const prior = new PriorReleaseEngine();
	const t = await implementationLifecycle(prior);
	try {
		await t.audit();
		await t.reports();
		await t.retain("final");
		accepted(await t.f.command(t.handoff, t.actor, "p1-handoff"));
		const [staged] = await tasksOf(prior.harness, "render.implementation-preparation");
		assert.ok(staged, "the prior release staged its preparation task atomically with the handoff");
		assert.deepEqual(staged.input, { assignment: t.owner().id });
		assert.equal(staged.state.status, "running");
		// Restart onto this release while that task is live: startup must not refuse the retained store.
		const current = new CurrentEngine();
		await t.f.reopen(current);
		const drained = async () => (await tasksOf(current.harness, "render.implementation-preparation"))[0]!;
		const deadline = Date.now() + 15000;
		while ((await drained()).state.status !== "terminal") {
			assert.ok(Date.now() < deadline, `prior task drains: ${JSON.stringify(await drained())}`);
			await setTimeout(50);
		}
		assert.equal((await drained()).id, staged.id, "the same admitted task, not a replacement");
		assert.equal(pass(t).handoff!.blocker, "preparation_capability_unavailable; Watchdog has not run", "its exact original meaning");
		assert.equal(pass(t).handoff!.preparations, undefined, "no preparation attempt is invented for old work");
		assert.equal((await tasksOf(current.harness, "render.target-preparation")).length, 0);
		accepted(await t.f.command(retry(t), admin));
		const retried = Date.now() + 15000;
		while (!/^preparation_capability_unavailable: owned/.test(pass(t).handoff!.blocker ?? "")) {
			assert.ok(Date.now() < retried, `retry settles: ${pass(t).handoff!.blocker}`);
			await setTimeout(50);
		}
		assert.equal((await tasksOf(current.harness, "render.target-preparation")).length, 1, "explicit retry stages the current task");
		assert.equal((await tasksOf(current.harness, "render.implementation-preparation")).length, 1);
		assert.equal(passes(t).length, 1, "same pass, B and Audit");
	} finally {
		await t.close();
	}
});
