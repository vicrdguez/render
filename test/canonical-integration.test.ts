// CI01–CI07, CI09, CI11–CI15 and CI17 at the Ledger/Kernel interface over real SQLite/Durable staging. Intents and
// canonical-ref observations are literal host results here: they establish authority, ordering, qualification and
// retention, not that Effects or Git produced them (see canonical-integration-effects.test.ts and the Engine journeys).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Frame } from "../src/ledger/ledger.ts";
import { accepted, LedgerOnlyEngine, selection } from "./support/implementation.ts";
import {
	admit,
	admitted,
	effects,
	handedOff,
	handOffNext,
	intent,
	type Lifecycle,
	lineage,
	observation,
	own,
	passedRound,
	passes,
	passOf,
	R1,
	record,
	refused,
	S,
	stage,
	T0,
	T1,
	W,
} from "./support/integration.ts";
import { admin, recovery, scheduler } from "./support/roles.ts";
import { EMPTY, watchdogRound } from "./support/watchdog.ts";

type Integration = {
	operation: string;
	status: string;
	preparation: string;
	review: string;
	target: string;
	result: string;
	attempts: { id: string; executorEpoch: string; outcome?: string; observations: string[] }[];
	qualification?: string;
};
const integrations = (t: Lifecycle, slice = "read-fix") =>
	((passOf(t, slice).handoff as { integrations?: Integration[] }).integrations ?? []) as Integration[];
const canceled = (t: Lifecycle) => (passOf(t).handoff as { canceled?: { inFlight: string[] } }).canceled;
async function read(t: Lifecycle, ref: string) {
	const value = await t.f.ledger.artifact(admin, { read: ref });
	assert.ok("content" in value, `read ${ref}`);
	return value.content.toString();
}
function cancel(t: Lifecycle, owner = t.id) {
	const a = own(t, owner);
	return t.f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin);
}
const nextPacket = (t: Lifecycle) => t.writer({ inputs: [t.nextContract!], verification: selection(t.nextContract!) });
const assignNext = (t: Lifecycle) => t.f.command({ type: "assignTask", slice: "read-next", delivery: true, packet: nextPacket(t) });
const viewBlocker = (t: Lifecycle) =>
	((t.f.ledger.snapshot(admin) as Frame).workflows as { blocker: { code: string; reason: string } | null }[])[0]!.blocker;

test("CI01/CI02 only host Effects stages and admits the exact pinned intent; no grant, approval or setting exists", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const text = intent(t, t.id, r);
		for (const [label, context] of [
			["scheduling", scheduler],
			["recovery", recovery],
			["local admin", admin],
			["implementer agent", t.actor],
		] as const)
			refused(await stage(t, t.id, text, context), "forbidden_principal", `${label} stage`);
		for (const type of ["approveIntegration", "grantIntegration"])
			refused(await t.f.command({ type, assignment: t.id }, admin), "unknown_command", type);
		assert.deepEqual(integrations(t), [], "refused stages retain nothing");
		const staged = accepted(await stage(t, t.id, text));
		const operation = staged.operation as string;
		assert.equal(await read(t, operation), text, "the retained intent is the exact staged bytes");
		assert.deepEqual(
			integrations(t).map((i) => [i.operation, i.status, i.preparation, i.review, i.target, i.result, i.attempts.length]),
			[[operation, "planned", r.preparation, r.id, T0, R1, 0]],
			"intent is planned: it permits nothing",
		);
		for (const [label, context] of [
			["scheduling", scheduler],
			["local admin", admin],
			["implementer agent", t.actor],
		] as const)
			refused(await admit(t, t.id, operation, context), "forbidden_principal", `${label} admission`);
		const admission = accepted(await admit(t, t.id, operation));
		assert.match(String(admission.integrationAttempt), /^integration-attempt:\d+$/);
		assert.equal(admission.executorEpoch, t.f.ledger.status().executorEpoch, "bound to the current executor epoch");
		const [op] = integrations(t);
		assert.equal(op!.status, "admitted");
		assert.deepEqual(
			op!.attempts.map((a) => [a.id, a.executorEpoch, a.outcome]),
			[[admission.integrationAttempt, t.f.ledger.status().executorEpoch, undefined]],
		);
		const human = await record(t, t.id, operation, observation(operation, admission.integrationAttempt as string), admin);
		refused(human, "forbidden_principal", "human observation");
	} finally {
		await t.close();
	}
});

test("CI03 ineligible intents refuse with exact codes and retain nothing", async () => {
	const t = await handedOff();
	try {
		const rework = await watchdogRound(t, t.id, passOf(t).ref, lineage(), "rework");
		refused(await stage(t, t.id, intent(t, t.id, rework)), "forbidden_scope", "rework verdict");
		const r = await passedRound(t, t.id, "read-fix", lineage(T1, X1));
		const l = lineage(T1, X1);
		const cases: [string, Record<string, unknown>, string][] = [
			["other preparation", { preparation: rework.preparation }, "stale_basis"],
			["other target", { target: T0, result: { commit: R1, tree: EMPTY, parent: T0, message: "m\n" } }, "stale_basis"],
			["other handoff", { handoff: "revision:1" }, "stale_basis"],
			["other B", { source: "revision:1" }, "stale_basis"],
			["other A", { captureA: "revision:1" }, "stale_basis"],
			["other report", { report: rework.report }, "stale_basis"],
			["other generation", { generation: 2 }, "stale_basis"],
			["R tree is not X's tree", { result: { commit: R1, tree: "1".repeat(40), parent: T1, message: "m\n" } }, "invalid_content"],
			["R parent is not T", { result: { commit: R1, tree: EMPTY, parent: T0, message: "m\n" } }, "invalid_content"],
			["unresolved basis nonempty", { unresolved: ["integration:other"] }, "invalid_content"],
			["unknown field", { extra: true }, "invalid_content"],
		];
		for (const [label, over, code] of cases) refused(await stage(t, t.id, intent(t, t.id, r, over, l)), code, label);
		refused(await stage(t, t.id, "{not json"), "invalid_content", "malformed");
		assert.deepEqual(integrations(t), [], "no operation retained");
	} finally {
		await t.close();
	}
});

test("CI03 a policy adopted after the passing review stales its intent", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const before = intent(t, t.id, r);
		const frame = t.f.ledger.snapshot(admin) as Frame;
		const policy = frame.policy as { defaultRevision: string; bindings: Record<string, { revision: string }> };
		const changed = accepted(
			await t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: "ci03-policy",
					command: {
						type: "changePolicy",
						expectedRevision: policy.defaultRevision,
						policy: { completedReviewLimit: 3, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
					},
				},
				admin,
			),
		);
		accepted(await t.f.command({ type: "adoptPolicy", revision: changed.policy, expectedBinding: policy.bindings[W]!.revision }, admin));
		refused(await stage(t, t.id, before), "stale_basis", "intent naming the superseded policy");
		refused(await stage(t, t.id, intent(t, t.id, r)), "stale_basis", "X was qualified under the superseded policy");
		assert.deepEqual(integrations(t), []);
	} finally {
		await t.close();
	}
});

test("CI04 cancellation first fences admission and further staging", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const operation = accepted(await stage(t, t.id, intent(t, t.id, r))).operation as string;
		const result = accepted(await cancel(t));
		assert.equal(result.generation, 2);
		assert.deepEqual(canceled(t)?.inFlight, []);
		refused(await admit(t, t.id, operation), "assignment_closed", "admission after cancellation");
		refused(await stage(t, t.id, intent(t, t.id, r)), "assignment_closed", "stage after cancellation");
		assert.deepEqual(integrations(t)[0]!.attempts, [], "no attempt");
		refused(await cancel(t), "assignment_closed", "second cancellation");
	} finally {
		await t.close();
	}
});

test("CI05 admission first: cancellation lists the attempt in flight and its observation still qualifies", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, r);
		accepted(await cancel(t));
		assert.deepEqual(canceled(t)?.inFlight, [attempt], "the cancellation view lists the admitted attempt");
		const recorded = accepted(await record(t, t.id, operation, observation(operation, attempt)));
		assert.equal(recorded.outcome, "applied");
		assert.equal(integrations(t)[0]!.status, "qualified");
	} finally {
		await t.close();
	}
});

test("CI06 a duplicate admission returns the same receipt and never a second attempt", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const operation = accepted(await stage(t, t.id, intent(t, t.id, r))).operation as string;
		const first = await admit(t, t.id, operation, effects, "admission-1");
		const again = await admit(t, t.id, operation, effects, "admission-1");
		assert.equal(first.status, "accepted");
		assert.equal(again.status, "accepted");
		if (first.status !== "accepted" || again.status !== "accepted") return;
		assert.equal(again.duplicate, true);
		assert.equal(again.receipt, first.receipt);
		assert.equal(again.result.integrationAttempt, first.result.integrationAttempt);
		refused(await admit(t, t.id, operation, effects, "admission-2"), "stale_basis", "another admission while admitted");
		assert.equal(integrations(t)[0]!.attempts.length, 1);
	} finally {
		await t.close();
	}
});

test("CI07/CI13 a fresh executor epoch cannot report a prior epoch's dispatch; observed T is unapplied and needs fresh admission", async () => {
	const t = await handedOff("integration");
	try {
		const r = await passedRound(t);
		const { operation, attempt, executorEpoch } = await admitted(t, t.id, r);
		await t.f.reopen(new LedgerOnlyEngine());
		assert.notEqual(t.f.ledger.status().executorEpoch, executorEpoch, "restart minted a fresh epoch");
		refused(
			await record(t, t.id, operation, observation(operation, attempt, { dispatch: "applied" })),
			"stale_executor",
			"another epoch reporting a dispatch",
		);
		const unapplied = accepted(
			await record(
				t,
				t.id,
				operation,
				observation(operation, attempt, { mode: "reconcile", observed: { commit: T0, tree: EMPTY, parents: [S] } }),
			),
		);
		assert.equal(unapplied.outcome, "unapplied");
		const op = integrations(t)[0]!;
		assert.equal(op.status, "unapplied");
		assert.equal(op.attempts[0]!.outcome, "unapplied");
		assert.equal(op.qualification, undefined, "no success inferred from intent or admission");
		refused(await assignNext(t), "dependency_blocked", "dependent stays blocked");
		const fresh = accepted(await admit(t, t.id, operation));
		assert.notEqual(fresh.integrationAttempt, attempt);
		assert.equal(fresh.executorEpoch, t.f.ledger.status().executorEpoch);
		assert.deepEqual(
			integrations(t)[0]!.attempts.map((a) => [a.id, a.executorEpoch]),
			[
				[attempt, executorEpoch],
				[fresh.integrationAttempt, t.f.ledger.status().executorEpoch],
			],
		);
	} finally {
		await t.close();
	}
});

test("CI09 the dispatching executor's refused CAS is stale: the review stays counted and its preparation cannot stage again", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, r);
		const stale = accepted(
			await record(
				t,
				t.id,
				operation,
				observation(operation, attempt, { dispatch: "refused", observed: { commit: T1, tree: EMPTY, parents: [T0] } }),
			),
		);
		assert.equal(stale.outcome, "stale");
		assert.equal(integrations(t)[0]!.status, "stale");
		assert.equal(own(t, r.id).status, "submitted", "the completed review stays visible");
		refused(await stage(t, t.id, intent(t, t.id, r)), "stale_basis", "same preparation after a stale CAS");
		refused(await record(t, t.id, operation, observation(operation, attempt)), "assignment_closed", "resolved attempt");
	} finally {
		await t.close();
	}
});

test("CI11 one unresolved or divergent operation serializes the proposal's integration", async () => {
	const t = await handedOff("independent");
	try {
		const a = await passedRound(t);
		const next = await handOffNext(t);
		const b = await passedRound(t, next, "read-next");
		const { operation, attempt } = await admitted(t, t.id, a);
		refused(await stage(t, next, intent(t, next, b)), "ownership_conflict", "admitted unresolved operation");
		accepted(
			await record(
				t,
				t.id,
				operation,
				observation(operation, attempt, { mode: "reconcile", observed: { commit: T1, tree: EMPTY, parents: [T0] } }),
			),
		);
		assert.equal(integrations(t)[0]!.status, "divergent");
		refused(await stage(t, next, intent(t, next, b)), "ownership_conflict", "divergent operation");
		accepted(await record(t, t.id, operation, observation(operation, attempt, { mode: "reconcile" }), effects, "reconciled-applied"));
		assert.equal(integrations(t)[0]!.status, "qualified");
		const staged = accepted(await stage(t, next, intent(t, next, b)));
		assert.equal(integrations(t, "read-next")[0]!.operation, staged.operation, "the resolved proposal admits the next intent");
	} finally {
		await t.close();
	}
});

test("CI12 a reconciled R qualifies exactly once; replay keeps the receipt and later observations refuse", async () => {
	const t = await handedOff("integration");
	try {
		const r = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, r);
		await t.f.reopen(new LedgerOnlyEngine());
		const text = observation(operation, attempt, { mode: "reconcile" });
		const first = await record(t, t.id, operation, text, effects, "reconcile-1");
		const again = await record(t, t.id, operation, text, effects, "reconcile-1");
		assert.ok(first.status === "accepted" && again.status === "accepted");
		assert.equal(first.result.outcome, "applied");
		assert.equal(again.duplicate, true);
		assert.equal(again.receipt, first.receipt);
		refused(await record(t, t.id, operation, text, effects, "reconcile-2"), "assignment_closed", "second qualification");
		const op = integrations(t)[0]!;
		assert.equal(op.status, "qualified");
		assert.equal(op.qualification, first.result.observation);
		assert.equal(op.attempts[0]!.outcome, "applied");
		refused(await stage(t, t.id, intent(t, t.id, r)), "assignment_closed", "an integrated handoff stages nothing more");
		accepted(await assignNext(t));
	} finally {
		await t.close();
	}
});

test("CI14 another ref or a lock is divergent: blocked, never rolled back, and a human retry reconciles again", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, r);
		await t.f.reopen(new LedgerOnlyEngine());
		const locked = accepted(
			await record(t, t.id, operation, observation(operation, attempt, { mode: "reconcile", lock: true }), effects, "locked"),
		);
		assert.equal(locked.outcome, "divergent", "a held ref lock is never success");
		assert.equal(integrations(t)[0]!.status, "divergent");
		assert.match(own(t, t.id).blocker ?? "", /^integration_divergent: /);
		assert.match(passOf(t).handoff!.blocker ?? "", /^integration_divergent: /);
		const a = own(t, t.id);
		accepted(await t.f.command({ type: "retryPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin));
		const restored = accepted(
			await record(
				t,
				t.id,
				operation,
				observation(operation, attempt, { mode: "reconcile", observed: { commit: T0, tree: EMPTY, parents: [S] } }),
				effects,
				"restored",
			),
		);
		assert.equal(restored.outcome, "unapplied");
		assert.equal(integrations(t)[0]!.attempts[0]!.observations.length, 2, "both observations retained");
	} finally {
		await t.close();
	}
});

for (const kind of ["integration", "record"] as const)
	test(`CI15 ${kind} edge: a passing review alone never clears the dependent; recorded qualification does`, async () => {
		const t = await handedOff(kind);
		try {
			refused(await assignNext(t), "dependency_blocked", "before any review");
			const r = await passedRound(t);
			refused(await assignNext(t), "dependency_blocked", "Watchdog passed, no qualification");
			assert.equal(viewBlocker(t)?.code, "dependency_blocked");
			const { operation, attempt } = await admitted(t, t.id, r);
			refused(await assignNext(t), "dependency_blocked", "admitted, not qualified");
			accepted(await record(t, t.id, operation, observation(operation, attempt)));
			assert.notEqual(viewBlocker(t)?.code, "dependency_blocked", "the view no longer names the dependency");
			accepted(await assignNext(t));
		} finally {
			await t.close();
		}
	});

test("CI17 intents, attempts, observations and qualification survive reopen and export, and the owner reads them", async () => {
	const t = await handedOff();
	try {
		const r = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, r);
		const applied = accepted(await record(t, t.id, operation, observation(operation, attempt))).observation as string;
		const before = JSON.stringify(integrations(t));
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(JSON.stringify(integrations(t)), before, "state survives reopen");
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: W } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [operation, applied]) assert.ok(exported.content[ref], `export contains ${ref}`);
		const o = own(t, t.id);
		const owner = t.agent(o);
		for (const ref of [operation, applied]) assert.ok("content" in (await t.f.ledger.artifact(owner, { read: ref })), `owner reads ${ref}`);
		assert.equal(JSON.parse(await read(t, applied)).observed.commit, R1);
		assert.equal(passes(t).length, 1, "qualification opens no pass");
	} finally {
		await t.close();
	}
});
