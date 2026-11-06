// Real SQLite/Durable successor transitions. Preparation and Watchdog production belong to later Slices: these observations
// exercise the authority boundary with literal lineage, they do not claim those capabilities executed.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import { parseEnvelope } from "../src/ledger/envelope.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import {
	accepted,
	capture,
	damageImplementation,
	implementationLifecycle,
	implementationTasks,
	LedgerOnlyEngine,
} from "./support/implementation.ts";
import { admin, packet, recovery, scheduler } from "./support/roles.ts";

const effects = mintContext({ kind: "host", scope: "effects" });
const S = "a".repeat(40);
const T1 = "c".repeat(40);
const TREE = "d".repeat(40);
const X = "e".repeat(40);
const WORKFLOW = "workflow:2";
const P1 = `pass:${WORKFLOW}:read-fix:1`;
const P2 = `pass:${WORKFLOW}:read-fix:2`;
const P3 = `pass:${WORKFLOW}:read-fix:3`;

type Lifecycle = Awaited<ReturnType<typeof implementationLifecycle>>;
const passes = (t: Lifecycle) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
const pass = (t: Lifecycle, ref: string) => {
	const found = passes(t).find((p) => p.ref === ref);
	assert.ok(found, `pass ${ref} exists`);
	return found;
};
const own = (t: Lifecycle, id: string) => t.assignments().find((a) => a.id === id)!;
const callerPacket = ({ policyBinding: _binding, ...packet }: RoleAssignment["packet"]) => packet;
const quiesce = async (t: Lifecycle, id: string) => {
	const a = own(t, id);
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
};
async function handedOff() {
	const t = await implementationLifecycle();
	await t.audit();
	await t.reports();
	const B = await t.retain("final");
	const handoff = accepted(await t.f.command(t.handoff, t.actor, "p1-handoff"));
	await quiesce(t, t.id);
	return { t, B, handoff: handoff.handoff as string };
}
const lineage = (B: string, cause: string) => ({
	schema: 1,
	cause,
	repository: "owned",
	source: B,
	sourceCommit: S,
	baseCommit: S,
	targetCommit: T1,
});
const conflict = (B: string, over: Record<string, unknown> = {}) =>
	JSON.stringify({
		...lineage(B, "preparation-conflict"),
		algorithm: "merge-tree-write-tree",
		resultTree: TREE,
		conflicts: ["value"],
		...over,
	});
const failedChecks = (B: string, over: Record<string, unknown> = {}) =>
	JSON.stringify({
		...lineage(B, "prepared-check-failure"),
		preparedCommit: X,
		verifierRevision: "b".repeat(64),
		failed: [{ name: "read", exitCode: 1 }],
		...over,
	});
const open = (a: RoleAssignment, text: string) => ({
	type: "openSuccessorPass",
	assignment: a.id,
	generation: a.generation,
	attempt: a.attempt,
	text,
});
const openFrom = (t: Lifecycle, id: string, text: string, commandId?: string) => t.f.command(open(own(t, id), text), effects, commandId);
function refusedWithoutWrites(t: Lifecycle, reply: CommandReply, code: string, before: unknown, label: string) {
	assert.equal(reply.status, "refused", `${label}: ${JSON.stringify(reply)}`);
	if (reply.status === "refused") assert.equal(reply.code, code, `${label}: ${reply.reason}`);
	assert.deepEqual(passes(t), before, `${label}: no pass changes`);
}
/** Runs a current pass to its one handoff with its own fresh Audit. */
async function completePass(t: Lifecycle, id: string, commit: string) {
	const actor = await t.start(id);
	const source = () => JSON.stringify(capture(own(t, id), t.f.ledger.status().executorEpoch, t.contract, commit));
	const retain = async (kind: "audit" | "final") =>
		accepted(
			await t.f.command(
				{ type: "recordImplementationSource", assignment: id, generation: 1, attempt: own(t, id).attempt, kind, text: source() },
				effects,
			),
		).source as string;
	const A = await retain("audit");
	const audit = accepted(await t.f.command({ type: "requestImplementationAudit" }, actor));
	for (const reviewer of t.assignments().filter((a) => a.parent === id)) {
		const principal = await t.start(reviewer.id);
		accepted(
			await t.f.command(
				{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...reviewer.auditReview, findings: [] }), supports: [] },
				principal,
			),
		);
		await quiesce(t, reviewer.id);
	}
	const B = await retain("final");
	const handoff = accepted(await t.f.command(t.handoff, actor));
	await quiesce(t, id);
	return { A, B, audit, handoff: handoff.handoff as string, actor };
}
/** A submitted scripted Watchdog Assignment bound to exact sealed lineage; its judgment is fixture data. */
async function review(t: Lifecycle, ref: string, verdict: string, over: Record<string, unknown> = {}) {
	const current = pass(t, ref);
	const id = accepted(
		await t.f.command({
			type: "assignTask",
			slice: "read-fix",
			delivery: false,
			packet: packet({ role: "watchdog", inputs: [t.contract, current.handoff!.record] }),
		}),
	).assignment as string;
	const actor = await t.start(id);
	const report = accepted(
		await t.f.command(
			{
				type: "submitRoleResult",
				text: JSON.stringify({
					schema: 1,
					verdict,
					passRef: current.ref,
					handoff: current.handoff!.record,
					source: current.handoff!.source,
					prepared: X,
					target: T1,
					...over,
				}),
				supports: [],
			},
			actor,
		),
	).report as string;
	await quiesce(t, id);
	return { id, report };
}
const rework = (B: string, r: { id: string; report: string }, over: Record<string, unknown> = {}) =>
	JSON.stringify({ ...lineage(B, "watchdog-rework"), preparedCommit: X, review: r.id, report: r.report, ...over });

test("validated preparation conflict opens the next pass from T1 with no Watchdog and preserves P1 exactly", async () => {
	const { t, B, handoff } = await handedOff();
	try {
		const before = structuredClone(pass(t, P1));
		const tasks = (await implementationTasks(t.f.harness)).length;
		const text = conflict(B);
		const opened = accepted(await openFrom(t, t.id, text));
		assert.equal(opened.passRef, P2);
		assert.equal(opened.passOrdinal, 2);
		assert.equal(opened.predecessorPass, P1);
		const successor = pass(t, P2);
		assert.equal(successor.ordinal, 2);
		assert.equal(successor.cause, "preparation-conflict");
		assert.equal(successor.predecessor, P1);
		assert.equal(successor.contract, t.contract);
		assert.deepEqual(successor.opening, { observation: opened.observation, source: B, target: T1, base: T1 });
		assert.equal(successor.audit, undefined);
		assert.equal(successor.captureA, undefined);
		assert.equal(successor.captureB, undefined);
		assert.equal(successor.handoff, undefined);
		assert.deepEqual(pass(t, P1), before, "predecessor stays immutable");
		const next = own(t, opened.assignment as string);
		assert.notEqual(next.id, t.id);
		assert.notEqual(next.attempt, t.owner().attempt);
		assert.notEqual(next.conversation, t.owner().conversation);
		assert.equal(next.status, "queued");
		assert.equal(next.delivery, true);
		assert.equal(next.predecessor, t.id);
		assert.equal(next.passRef, P2);
		assert.ok(next.packet.inputs.includes(opened.observation as string), "the conflict report is a scoped input");
		assert.equal(t.owner().status, "submitted");
		assert.equal((await implementationTasks(t.f.harness)).length, tasks + 1, "one implementation task and no preparation or Watchdog task");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0);
		assert.equal(t.assignments().filter((a) => a.parent === next.id).length, 0, "no reviewer starts before A2");
		const check = async () => {
			const exported = await t.f.ledger.artifact(admin, { export: { workflow: WORKFLOW } });
			assert.ok("manifest" in exported && exported.manifest.complete);
			const decoded = (ref: string) => Buffer.from(exported.content[ref]!, "base64").toString();
			assert.equal(decoded(opened.observation as string), text);
			assert.equal(JSON.parse(decoded(opened.passRecord as string)).predecessor, P1);
			assert.equal(JSON.parse(decoded(opened.passRecord as string)).cause, "preparation-conflict");
			assert.equal(JSON.parse(decoded(before.record)).ordinal, 1, "P1's record keeps its original opening");
			assert.equal(JSON.parse(decoded(handoff)).passRef, P1);
			assert.ok(exported.content[B]);
		};
		await check();
		await t.f.reopen(new LedgerOnlyEngine());
		await check();
		assert.deepEqual(pass(t, P1), before);
		assert.equal(pass(t, P2).opening?.base, T1);
	} finally {
		await t.close();
	}
});

test("prepared-check failure opens from X only for real check exits, never for operational retries", async () => {
	const { t, B } = await handedOff();
	try {
		const before = structuredClone(passes(t));
		for (const [label, over] of [
			["passing row", { failed: [{ name: "read", exitCode: 0 }] }],
			["launch failure 126", { failed: [{ name: "read", exitCode: 126 }] }],
			["missing command 127", { failed: [{ name: "read", exitCode: 127 }] }],
			["timeout has no exit", { failed: [{ name: "read", exitCode: null }] }],
			["no failed row", { failed: [] }],
			["row outside the catalog", { failed: [{ name: "not-in-catalog", exitCode: 1 }] }],
			["malformed X", { preparedCommit: "not-a-commit" }],
		] as const)
			refusedWithoutWrites(t, await openFrom(t, t.id, failedChecks(B, over)), "invalid_content", before, label);
		refusedWithoutWrites(
			t,
			await openFrom(t, t.id, JSON.stringify({ ...lineage(B, "operational-retry"), reason: "rerun checks" })),
			"invalid_content",
			before,
			"unchanged-source operational retry",
		);
		assert.equal(passes(t).length, 1);
		const opened = accepted(await openFrom(t, t.id, failedChecks(B)));
		assert.equal(opened.passOrdinal, 2);
		assert.equal(pass(t, P2).cause, "prepared-check-failure");
		assert.equal(pass(t, P2).opening?.base, X);
		assert.equal(pass(t, P2).opening?.target, T1);
	} finally {
		await t.close();
	}
});

const verifierDefect = (B: string, over: Record<string, unknown> = {}) =>
	JSON.stringify({
		...lineage(B, "prepared-verifier-defect"),
		preparedCommit: X,
		defect: "prepared_verifier_defect: Missing catalog row: read",
		...over,
	});
test("TP23 a prepared verifier defect opens a repair pass from X; it needs a closed result, never a fabricated exit", async () => {
	const { t, B } = await handedOff();
	try {
		const before = structuredClone(passes(t));
		for (const [label, over] of [
			["no defect", { defect: "" }],
			["oversized defect", { defect: "d".repeat(4097) }],
			["malformed X", { preparedCommit: "not-a-commit" }],
			["fabricated failed rows", { failed: [{ name: "read", exitCode: 1 }] }],
		] as const)
			refusedWithoutWrites(t, await openFrom(t, t.id, verifierDefect(B, over)), "invalid_content", before, label);
		refusedWithoutWrites(
			t,
			await openFrom(t, t.id, verifierDefect(B, { baseCommit: "f".repeat(40) })),
			"stale_basis",
			before,
			"other recorded base",
		);
		const opened = accepted(await openFrom(t, t.id, verifierDefect(B)));
		assert.equal(opened.passOrdinal, 2);
		assert.equal(pass(t, P2).cause, "prepared-verifier-defect");
		assert.equal(pass(t, P2).opening?.base, X);
		assert.equal(pass(t, P2).opening?.target, T1);
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0);
	} finally {
		await t.close();
	}
});

test("arbitrary reasons, wrong lineage and untrusted principals open nothing", async () => {
	const { t, B } = await handedOff();
	try {
		const before = structuredClone(passes(t));
		for (const [label, text, code] of [
			["free text", "Needs more work", "invalid_content"],
			["reason only", JSON.stringify({ schema: 1, cause: "preparation-conflict", reason: "trust me" }), "invalid_content"],
			["unknown cause", conflict(B, { cause: "human-said-so" }), "invalid_content"],
			["unknown schema", conflict(B, { schema: 2 }), "invalid_content"],
			["extra field", conflict(B, { reason: "extra" }), "invalid_content"],
			["empty conflict", conflict(B, { conflicts: [] }), "invalid_content"],
			["no algorithm", conflict(B, { algorithm: "" }), "invalid_content"],
			["malformed target", conflict(B, { targetCommit: "main" }), "invalid_content"],
			["sha256 target in sha1 source", conflict(B, { targetCommit: "c".repeat(64) }), "invalid_content"],
			["malformed result tree", conflict(B, { resultTree: "tree" }), "invalid_content"],
			["target equals base", conflict(B, { targetCommit: S }), "invalid_content"],
			["other B", conflict("revision:other"), "stale_basis"],
			["other B commit", conflict(B, { sourceCommit: "f".repeat(40) }), "stale_basis"],
			["other base", conflict(B, { baseCommit: "f".repeat(40) }), "stale_basis"],
			["other repository", conflict(B, { repository: "elsewhere" }), "stale_basis"],
		] as const)
			refusedWithoutWrites(t, await openFrom(t, t.id, text), code, before, label);
		const command = open(t.owner(), conflict(B));
		for (const principal of [t.actor, scheduler, recovery, admin])
			refusedWithoutWrites(t, await t.f.command(command, principal), "forbidden_principal", before, "untrusted principal");
		refusedWithoutWrites(t, await t.f.command({ ...command, generation: 2 }, effects), "stale_assignment", before, "stale generation");
		refusedWithoutWrites(t, await t.f.command({ ...command, attempt: "other" }, effects), "stale_assignment", before, "stale Attempt");
		const envelope = { version: 1, authorityEpoch: "authority", commandId: "successor", workflow: WORKFLOW };
		for (const invalid of [
			{ ...command, passOrdinal: 7 },
			{ ...command, cause: "caller-selected" },
			{ ...command, text: 7 },
		]) {
			const parsed = parseEnvelope({ ...envelope, command: invalid });
			assert.ok("status" in parsed && parsed.status === "refused");
		}
		assert.equal("status" in parseEnvelope({ ...envelope, command }), false);
	} finally {
		await t.close();
	}
});

test("a pass still open, a running writer or damaged predecessor evidence blocks the transition", async () => {
	const t = await implementationLifecycle();
	try {
		const before = structuredClone(passes(t));
		refusedWithoutWrites(t, await openFrom(t, t.id, conflict(t.A)), "missing_content", before, "open pass without handoff");
		await t.audit();
		await t.reports();
		const B = await t.retain("final");
		accepted(await t.f.command(t.handoff, t.actor));
		const handed = structuredClone(passes(t));
		refusedWithoutWrites(t, await openFrom(t, t.id, conflict(B)), "quiescence_unconfirmed", handed, "writer not yet quiescent");
		await quiesce(t, t.id);
	} finally {
		await t.close();
	}
	for (const failure of ["content_corrupt", "missing_content"] as const) {
		const { t: damaged, B } = await handedOff();
		try {
			const snapshot = structuredClone(passes(damaged));
			damageImplementation(damaged.f.data, B, failure);
			await damaged.f.reopen(new LedgerOnlyEngine());
			const reply = await openFrom(damaged, damaged.id, conflict(B));
			assert.equal(reply.status, "refused", `damaged B: ${failure}`);
			assert.deepEqual(passes(damaged), snapshot);
		} finally {
			await damaged.close();
		}
	}
});

test("one successor per pass: replay returns the original receipt and another command cannot open a second", async () => {
	const { t, B } = await handedOff();
	try {
		const tasks = (await implementationTasks(t.f.harness)).length;
		const first = await openFrom(t, t.id, conflict(B), "return-1");
		const result = accepted(first);
		const after = structuredClone(passes(t));
		const replay = await openFrom(t, t.id, conflict(B), "return-1");
		assert.deepEqual(accepted(replay), result);
		assert.equal(replay.status === "accepted" && replay.duplicate, true);
		refusedWithoutWrites(t, await openFrom(t, t.id, conflict(B), "return-2"), "assignment_closed", after, "second transition");
		refusedWithoutWrites(t, await openFrom(t, t.id, failedChecks(B), "return-3"), "assignment_closed", after, "other cause");
		assert.equal(passes(t).length, 2);
		assert.equal((await implementationTasks(t.f.harness)).length, tasks + 1);
		const replacing = await t.f.command({
			type: "replaceTask",
			assignment: t.id,
			generation: t.owner().generation,
			attempt: t.owner().attempt,
			packet: callerPacket(t.owner().packet),
		});
		refusedWithoutWrites(t, replacing, "assignment_closed", after, "replacement of handed-off owner");
		refusedWithoutWrites(
			t,
			await t.f.command({ type: "assignTask", slice: "read-fix", delivery: true, packet: callerPacket(t.owner().packet) }),
			"ownership_conflict",
			after,
			"new delivery assignment",
		);
	} finally {
		await t.close();
	}
});

test("P1 reports cannot satisfy P2 even for identical bytes; P2 needs its own one fresh Audit and handoff", async () => {
	const { t, B } = await handedOff();
	try {
		const p1 = structuredClone(pass(t, P1));
		const oldReviewers = t.assignments().filter((a) => a.parent === t.id);
		const opened = accepted(await openFrom(t, t.id, conflict(B)));
		const id = opened.assignment as string;
		const actor = await t.start(id);
		const before = structuredClone(passes(t));
		refusedWithoutWrites(t, await t.f.command(t.handoff, actor), "missing_content", before, "handoff with no P2 Audit");
		refusedWithoutWrites(t, await t.f.command({ type: "requestImplementationAudit" }, actor), "missing_content", before, "Audit before A2");
		const worker = capture(own(t, id), t.f.ledger.status().executorEpoch, t.contract);
		const raw = { type: "recordImplementationSource", assignment: id, generation: 1, attempt: own(t, id).attempt, kind: "audit" as const };
		refusedWithoutWrites(
			t,
			await t.f.command({ ...raw, text: JSON.stringify(worker) }, effects),
			"stale_basis",
			before,
			"worker-chosen parent",
		);
		const source = capture(own(t, id), t.f.ledger.status().executorEpoch, t.contract, T1);
		assert.equal(source.source.source.tree, capture(t.owner(), "any", t.contract).source.source.tree, "A2 has A1's exact tree");
		const A2 = accepted(await t.f.command({ ...raw, text: JSON.stringify(source) }, effects)).source as string;
		assert.notEqual(A2, p1.captureA);
		const staged = structuredClone(passes(t));
		for (const reviewer of oldReviewers) {
			const principal = t.agent(reviewer);
			const forged = { schema: 1, passRef: P2, audit: "audit:forged", source: A2, contract: t.contract, findings: [] };
			const reply = await t.f.command({ type: "submitRoleResult", text: JSON.stringify(forged), supports: [] }, principal);
			assert.equal(reply.status, "refused", "P1 reviewer cannot report into P2");
			assert.deepEqual(passes(t), staged);
		}
		assert.deepEqual(pass(t, P2).configuration, pass(t, P1).configuration, "a successor inherits its frozen configuration");
		const audit = accepted(await t.f.command({ type: "requestImplementationAudit" }, actor, "p2-audit"));
		assert.equal(audit.passRef, P2);
		assert.equal(audit.source, A2);
		assert.notEqual(audit.audit, p1.audit!.ref);
		const fresh = t.assignments().filter((a) => a.parent === id);
		assert.equal(fresh.length, 2);
		for (const reviewer of fresh) {
			assert.ok(!oldReviewers.some((old) => old.id === reviewer.id || old.conversation === reviewer.conversation));
			assert.deepEqual(reviewer.auditReview, { passRef: P2, audit: audit.audit, source: A2, contract: t.contract });
			assert.ok(!reviewer.packet.inputs.includes(p1.captureA!));
		}
		assert.equal(
			accepted(await t.f.command({ type: "requestImplementationAudit" }, actor, "p2-audit")).audit,
			audit.audit,
			"duplicate request replays the one invocation",
		);
		const audited = structuredClone(passes(t));
		const second = await t.f.command({ type: "requestImplementationAudit" }, actor, "p2-audit-again");
		refusedWithoutWrites(t, second, "role_already_requested", audited, "second P2 invocation");
		accepted(await t.f.command({ ...raw, kind: "final", text: JSON.stringify(source) }, effects));
		const reportless = await t.f.command(t.handoff, actor);
		assert.equal(reportless.status, "refused", "P1's retained reports do not satisfy P2");
		for (const reviewer of fresh) {
			const principal = await t.start(reviewer.id);
			accepted(
				await t.f.command(
					{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...reviewer.auditReview, findings: [] }), supports: [] },
					principal,
				),
			);
		}
		const handoff = accepted(await t.f.command(t.handoff, actor));
		assert.equal(handoff.passRef, P2);
		assert.equal(handoff.captureA, A2);
		assert.notEqual(handoff.handoff, p1.handoff!.record);
		assert.deepEqual(pass(t, P1), p1, "P1's Audit still names only what it examined");
		assert.equal(pass(t, P2).predecessor, P1);
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: WORKFLOW } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		const decoded = (ref: string) => JSON.parse(Buffer.from(exported.content[ref]!, "base64").toString());
		assert.equal(decoded(p1.handoff!.record).captureA, p1.captureA);
		assert.equal(decoded(handoff.handoff as string).captureA, A2);
		assert.equal(decoded(handoff.handoff as string).audit.ref, audit.audit);
	} finally {
		await t.close();
	}
});

test("P2 owner reads predecessor lineage; its fresh reviewers stay scoped to A2", async () => {
	const { t, B } = await handedOff();
	try {
		const p1 = structuredClone(pass(t, P1));
		const opened = accepted(await openFrom(t, t.id, conflict(B)));
		const id = opened.assignment as string;
		const actor = await t.start(id);
		const report = p1.audit!.results.standards!.report;
		for (const ref of [opened.observation as string, B, p1.captureA!, p1.handoff!.record, report]) {
			const read = await t.f.ledger.artifact(actor, { read: ref });
			assert.ok("content" in read, `P2 owner reads ${ref}`);
		}
		const source = JSON.stringify(capture(own(t, id), t.f.ledger.status().executorEpoch, t.contract, T1));
		const A2 = accepted(
			await t.f.command(
				{ type: "recordImplementationSource", assignment: id, generation: 1, attempt: own(t, id).attempt, kind: "audit", text: source },
				effects,
			),
		).source as string;
		accepted(await t.f.command({ type: "requestImplementationAudit" }, actor));
		const reviewer = t.assignments().find((a) => a.parent === id)!;
		const principal = await t.start(reviewer.id);
		assert.ok("content" in (await t.f.ledger.artifact(principal, { read: A2 })));
		for (const ref of [opened.observation as string, B, p1.captureA!, report]) {
			const read = await t.f.ledger.artifact(principal, { read: ref });
			assert.equal("content" in read, false, `P2 reviewer cannot read ${ref}`);
		}
	} finally {
		await t.close();
	}
});

test("replacement and restart keep P2's ordinal, and a late P1 preparation outcome stays on P1", async () => {
	const { t, B } = await handedOff();
	try {
		const opened = accepted(await openFrom(t, t.id, conflict(B)));
		const id = opened.assignment as string;
		const before = structuredClone(pass(t, P2));
		accepted(
			await t.f.command({
				type: "recordPreparationBlocker",
				assignment: t.id,
				generation: t.owner().generation,
				attempt: t.owner().attempt,
				reason: "preparation_capability_unavailable",
			}),
		);
		assert.equal(pass(t, P1).handoff?.blocker, "preparation_capability_unavailable");
		assert.deepEqual(pass(t, P2), before);
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(passes(t).length, 2);
		const current = own(t, id);
		accepted(await t.f.command({ type: "cancelWork", assignment: id, generation: current.generation, attempt: current.attempt }, admin));
		const fenced = own(t, id);
		await quiesce(t, id);
		const replaced = accepted(
			await t.f.command({
				type: "replaceTask",
				assignment: id,
				generation: fenced.generation,
				attempt: fenced.attempt,
				packet: callerPacket(fenced.packet),
			}),
		);
		assert.equal(replaced.passRef, P2);
		assert.equal(replaced.passOrdinal, 2);
		assert.equal(passes(t).length, 2);
		assert.equal(pass(t, P2).assignment, replaced.assignment);
		assert.deepEqual({ ...pass(t, P2), assignment: before.assignment, packet: before.packet }, before);
		const after = structuredClone(passes(t));
		refusedWithoutWrites(
			t,
			await openFrom(t, replaced.assignment as string, conflict(B)),
			"missing_content",
			after,
			"open P2 cannot succeed",
		);
	} finally {
		await t.close();
	}
});

test("Watchdog rework needs a bound retained verdict and obeys the completed-review cap without resetting it", async () => {
	const { t, B } = await handedOff();
	try {
		const before = structuredClone(passes(t));
		const bogus = { id: "assignment:missing", report: "revision:missing" };
		refusedWithoutWrites(t, await openFrom(t, t.id, rework(B, bogus)), "missing_content", before, "no such review");
		const passed = await review(t, P1, "pass");
		refusedWithoutWrites(t, await openFrom(t, t.id, rework(B, passed)), "forbidden_scope", before, "a passing verdict is not rework");
	} finally {
		await t.close();
	}
	for (const [label, over] of [
		["other pass", { passRef: "pass:other" }],
		["other handoff", { handoff: "implementation-handoff:other" }],
		["other B", { source: "revision:other" }],
		["other X", { prepared: "f".repeat(40) }],
		["other T", { target: "f".repeat(40) }],
	] as const) {
		const f = await handedOff();
		try {
			const before = structuredClone(passes(f.t));
			const unbound = await review(f.t, P1, "rework", over);
			refusedWithoutWrites(f.t, await openFrom(f.t, f.t.id, rework(f.B, unbound)), "stale_basis", before, label);
		} finally {
			await f.t.close();
		}
	}
	const j = await handedOff();
	try {
		// Limit 2: review 1 rework opens P2; P2's review 2 non-pass reaches the human.
		const first = await review(j.t, P1, "rework");
		const opened = accepted(await openFrom(j.t, j.t.id, rework(j.B, first)));
		assert.equal(opened.passOrdinal, 2);
		assert.equal(pass(j.t, P2).opening?.base, X);
		assert.equal(
			j.t.assignments().filter((a) => a.packet.role === "watchdog" && a.status === "submitted").length,
			1,
			"opening adds no review",
		);
		const id = opened.assignment as string;
		const second = await completePass(j.t, id, X);
		const again = await review(j.t, P2, "rework");
		const stopped = structuredClone(passes(j.t));
		// P2's recorded target-lineage base is the target its rework opened against, not its own capture.
		const atX = { sourceCommit: X, baseCommit: T1 };
		refusedWithoutWrites(j.t, await openFrom(j.t, id, rework(second.B, again, atX)), "human_direction_required", stopped, "cap reached");
		refusedWithoutWrites(
			j.t,
			await openFrom(j.t, id, conflict(second.B, { ...atX, targetCommit: "b".repeat(40) })),
			"human_direction_required",
			stopped,
			"cap applies to every cause",
		);
		assert.equal(j.t.assignments().filter((a) => a.packet.role === "watchdog" && a.status === "submitted").length, 2, "count is retained");
		const frame = j.t.f.ledger.snapshot(admin) as Frame;
		const policy = frame.policy as { defaultRevision: string; bindings: Record<string, { revision: string }> };
		const changed = accepted(
			await j.t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: j.t.f.ledger.status().authorityEpoch,
					commandId: "larger-cap",
					command: {
						type: "changePolicy",
						expectedRevision: policy.defaultRevision,
						policy: { completedReviewLimit: 3, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
					},
				},
				admin,
			),
		);
		accepted(
			await j.t.f.command({ type: "adoptPolicy", revision: changed.policy, expectedBinding: policy.bindings[WORKFLOW]!.revision }, admin),
		);
		const adopted = accepted(await openFrom(j.t, id, rework(second.B, again, atX)));
		assert.equal(adopted.passRef, P3);
		assert.equal(
			j.t.assignments().filter((a) => a.packet.role === "watchdog" && a.status === "submitted").length,
			2,
			"adoption keeps the count",
		);
		assert.notEqual(pass(j.t, P3).policyBinding, pass(j.t, P2).policyBinding, "successor binds current policy");
	} finally {
		await j.t.close();
	}
});

test("a needs-human verdict stops every return cause", async () => {
	const { t, B } = await handedOff();
	try {
		const stopped = await review(t, P1, "needs-human");
		const before = structuredClone(passes(t));
		refusedWithoutWrites(t, await openFrom(t, t.id, rework(B, stopped)), "human_direction_required", before, "rework");
		refusedWithoutWrites(t, await openFrom(t, t.id, conflict(B)), "human_direction_required", before, "conflict");
		refusedWithoutWrites(t, await openFrom(t, t.id, failedChecks(B)), "human_direction_required", before, "failed checks");
	} finally {
		await t.close();
	}
});

test("scripted two-pass flow stays complete through reopen and export", async () => {
	const { t, B } = await handedOff();
	try {
		const opened = accepted(await openFrom(t, t.id, conflict(B)));
		const done = await completePass(t, opened.assignment as string, T1);
		assert.equal(done.audit.passRef, P2);
		assert.equal(pass(t, P2).handoff?.source, done.B);
		assert.equal(pass(t, P1).handoff?.source, B);
		await t.f.reopen(new LedgerOnlyEngine());
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: WORKFLOW } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [B, done.A, done.B, done.handoff, opened.observation as string, opened.passRecord as string])
			assert.ok(exported.content[ref], `export retains ${ref}`);
		const facts = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.equal(facts.filter((record) => record.command === "openSuccessorPass").length, 1);
		assert.equal(facts.filter((record) => record.document?.startsWith("implementation-handoff/")).length, 2);
	} finally {
		await t.close();
	}
});
