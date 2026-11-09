// WR01–WR18, WR21–WR22 at the Ledger/Kernel interface over real SQLite/Durable staging. Preparation records, check
// receipts and verdicts are literal host/scripted results here: they establish authority, binding, counting and
// retention, not that Effects, Linux or a model produced them. The Engine journeys are in watchdog-rework.integration.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { reviewQualification, watchdogVerdict } from "../src/kernel/implementation.ts";
import type { PolicyState } from "../src/kernel/policy.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { accepted, damageImplementation, implementationLifecycle, LedgerOnlyEngine, selection } from "./support/implementation.ts";
import { admin, recovery, scheduler } from "./support/roles.ts";
import {
	basis,
	EMPTY,
	nonPass,
	passing,
	type Receipt,
	receipt,
	checkedRecord as record,
	V,
	type Verdict,
	verdictText,
	watchdogRequest,
	watchdogRound,
	watched,
} from "./support/watchdog.ts";

const effects = mintContext({ kind: "host", scope: "effects" });
const W = "workflow:3";
const P1 = `pass:${W}:read-fix:1`;
const P2 = `pass:${W}:read-fix:2`;
const S = "a".repeat(40);
const [T0, T1, T2] = ["c", "2", "3"].map((c) => c.repeat(40)) as [string, string, string];
const [X1, X2, X3] = ["e", "f", "1"].map((c) => c.repeat(40)) as [string, string, string];

type Lifecycle = Awaited<ReturnType<typeof implementationLifecycle>>;
const frame = (t: Lifecycle) => t.f.ledger.snapshot(admin) as Frame;
const passes = (t: Lifecycle) => frame(t).implementationPasses as ImplementationPass[];
const pass = (t: Lifecycle, ref = P1) => passes(t).find((p) => p.ref === ref)!;
const own = (t: Lifecycle, id: string) => t.assignments().find((a) => a.id === id)!;
const watchdogs = (t: Lifecycle) => t.assignments().filter((a) => a.packet.role === "watchdog");
const completed = (t: Lifecycle) => watchdogs(t).filter((a) => a.status === "submitted").length;
const policy = (t: Lifecycle) => frame(t).policy as PolicyState;
function refused(reply: CommandReply, code: string, label: string) {
	assert.equal(reply.status, "refused", `${label}: ${JSON.stringify(reply)}`);
	if (reply.status === "refused") assert.equal(reply.code, code, `${label}: ${reply.reason}`);
}
const quiesce = async (t: Lifecycle, id: string) => {
	const a = own(t, id);
	accepted(
		await t.f.command({
			type: "recordQuiescence",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			providerIdle: true,
			environment: a.packet.execution === "linux-writer" ? "stopped" : "absent",
			effects: "reconciled",
		}),
	);
};
let policies = 0;
/** Explicit human D004 publication and adoption with the expected binding; not a fixture shortcut. */
async function adoptLimit(t: Lifecycle, completedReviewLimit: number) {
	const p = policy(t);
	const changed = accepted(
		await Effect.runPromise(
			t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: `watchdog-limit:${++policies}`,
					command: {
						type: "changePolicy",
						expectedRevision: p.defaultRevision,
						policy: { completedReviewLimit, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
					},
				},
				admin,
			),
		),
	);
	accepted(await t.f.command({ type: "adoptPolicy", revision: changed.policy, expectedBinding: p.bindings[W]!.revision }, admin));
}
/** P1 handed off with its own fresh Audit; `watchdog:false` omits the frozen Watchdog configuration. */
async function handedOff({ watchdog = true, limit }: { watchdog?: boolean; limit?: number } = {}) {
	const t = await implementationLifecycle(undefined, (contract) => (watchdog ? watched(contract) : {}));
	await t.audit();
	await t.reports();
	await t.retain("final");
	accepted(await t.f.command(t.handoff, t.actor, "p1-handoff"));
	await quiesce(t, t.id);
	if (limit !== undefined) await adoptLimit(t, limit);
	return t;
}
const checkedRecord = (t: Lifecycle, target: string, X: string, over: Record<string, unknown> = {}) =>
	record(t, pass(t), { target, X, base: S, source: S }, over);
async function prepare(t: Lifecycle, target: string, X: string, over: Record<string, unknown> = {}) {
	const a = own(t, t.id);
	return accepted(
		await t.f.command(
			{
				type: "recordPreparation",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				text: checkedRecord(t, target, X, over),
			},
			effects,
		),
	).preparation as string;
}
function launch(t: Lifecycle, preparation: string, target: string, context = effects, commandId?: string) {
	const a = own(t, t.id);
	return t.f.command(
		{ type: "requestWatchdogReview", assignment: a.id, generation: a.generation, attempt: a.attempt, preparation, target },
		context,
		commandId,
	);
}
const recordChecks = (t: Lifecycle, w: RoleAssignment, text: string, context = effects) =>
	t.f.command({ type: "recordReviewChecks", assignment: w.id, generation: w.generation, attempt: w.attempt, text }, context);
function submit(
	t: Lifecycle,
	actor: ReturnType<typeof mintContext>,
	text: string,
	verification: Record<string, unknown> | undefined,
	commandId?: string,
) {
	return t.f.command({ type: "submitRoleResult", text, supports: [], ...(verification ? { verification } : {}) }, actor, commandId);
}
const round = (t: Lifecycle, target: string, X: string, verdict: Verdict) =>
	watchdogRound(t, t.id, P1, { target, X, base: S, source: S }, verdict);
const reworkObservation = (t: Lifecycle, r: { id: string; report: string }, X: string, target: string) =>
	JSON.stringify({
		schema: 1,
		cause: "watchdog-rework",
		repository: "owned",
		source: pass(t).handoff!.source,
		sourceCommit: S,
		baseCommit: S,
		targetCommit: target,
		preparedCommit: X,
		review: r.id,
		report: r.report,
	});
function openRework(t: Lifecycle, r: { id: string; report: string }, X: string, target: string) {
	const a = own(t, t.id);
	return t.f.command(
		{ type: "openSuccessorPass", assignment: a.id, generation: a.generation, attempt: a.attempt, text: reworkObservation(t, r, X, target) },
		effects,
	);
}
async function qualification(t: Lifecycle, r: { id: string; preparation: string; report: string }, target: string) {
	const read = async (ref: string) => {
		const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
		assert.ok("content" in value, `read ${ref}`);
		return value.content.toString();
	};
	return reviewQualification({
		pass: pass(t),
		preparation: r.preparation,
		record: JSON.parse(await read(r.preparation)),
		review: own(t, r.id),
		verdict: watchdogVerdict(await read(r.report)),
		target,
		basis: basis(t),
	});
}

test("WR01/WR02 launch: only host Effects starts one fresh read-only Watchdog bound to exact checked X/T and the pass's evidence", async () => {
	const t = await handedOff();
	try {
		const preparation = await prepare(t, T0, X1);
		for (const [label, context] of [
			["scheduling", scheduler],
			["recovery", recovery],
			["human", admin],
			["implementer agent", t.actor],
		] as const)
			refused(await launch(t, preparation, T0, context), "forbidden_principal", label);
		assert.equal(watchdogs(t).length, 0, "refused launches create nothing");
		const launched = accepted(await launch(t, preparation, T0));
		const w = own(t, launched.assignment as string);
		const p = pass(t);
		assert.equal(w.packet.role, "watchdog");
		assert.equal(w.packet.execution, "read-only");
		assert.deepEqual(w.packet.requests, []);
		assert.equal(w.packet.model, watchdogRequest.packet.model);
		assert.equal(w.packet.family, watchdogRequest.packet.family);
		assert.equal(w.parent, null, "not a child of the handed-off implementer");
		assert.equal(w.delivery, false);
		assert.equal(w.status, "queued");
		assert.equal(w.passRef, undefined, "no implementation authority");
		const used = new Set(
			t
				.assignments()
				.filter((a) => a.id !== w.id)
				.map((a) => a.conversation),
		);
		assert.ok(!used.has(w.conversation), "fresh non-fork conversation");
		assert.deepEqual(w.watchdogReview, {
			passRef: P1,
			handoff: p.handoff!.record,
			source: p.handoff!.source,
			preparation,
			prepared: X1,
			tree: EMPTY,
			target: T0,
			verifier: V,
			prior: [],
		});
		for (const ref of [
			t.contract,
			p.record,
			p.handoff!.record,
			p.handoff!.source,
			p.captureA!,
			p.audit!.record,
			p.audit!.results.standards!.report,
			p.audit!.results.contracts!.report,
			preparation,
		])
			assert.ok(w.packet.inputs.includes(ref), `Watchdog input includes ${ref}`);
		assert.equal(completed(t), 0, "a launch is not a completed review");
	} finally {
		await t.close();
	}
});

test("WR03/WR04/WR05/WR21 launch refuses stale, unchecked, duplicate or unconfigured review without state", async () => {
	const t = await handedOff();
	try {
		const first = await prepare(t, T0, X1);
		const second = await prepare(t, T1, X2);
		refused(await launch(t, first, T0), "stale_basis", "non-latest preparation");
		refused(await launch(t, second, T0), "stale_basis", "re-observed target differs from the record");
		await adoptLimit(t, 2);
		refused(await launch(t, second, T1), "stale_basis", "record under a superseded policy binding");
		const current = await prepare(t, T1, X2);
		const launched = accepted(await launch(t, current, T1));
		refused(await launch(t, current, T1), "role_already_requested", "open review of the same X");
		const a = own(t, t.id);
		refused(
			await t.f.command({ type: "retryPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin),
			"stale_basis",
			"WR21 retry while a review is open",
		);
		refused(
			await t.f.command(
				{ type: "recordPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt, text: checkedRecord(t, T2, X3) },
				effects,
			),
			"stale_basis",
			"one preparation or review in flight",
		);
		const w = own(t, launched.assignment as string);
		const actor = await t.start(w.id);
		accepted(await recordChecks(t, own(t, w.id), receipt(t, own(t, w.id))));
		accepted(await submit(t, actor, verdictText(own(t, w.id), "pass"), passing));
		await quiesce(t, w.id);
		refused(await launch(t, current, T1), "role_already_requested", "completed review of the same X");
		assert.equal(watchdogs(t).length, 1);
	} finally {
		await t.close();
	}
	const c = await handedOff();
	try {
		const a = own(c, c.id);
		const conflict = accepted(
			await c.f.command(
				{
					type: "recordPreparation",
					assignment: a.id,
					generation: a.generation,
					attempt: a.attempt,
					text: checkedRecord(c, T0, X1, {
						outcome: "conflict",
						checks: null,
						preparation: { ...JSON.parse(checkedRecord(c, T0, X1)).preparation, kind: "conflict", exitCode: 1, conflicts: ["value"] },
					}),
				},
				effects,
			),
		).preparation as string;
		refused(await launch(c, conflict, T0), "forbidden_scope", "conflict is not checked X");
	} finally {
		await c.close();
	}
	const u = await handedOff({ watchdog: false });
	try {
		const preparation = await prepare(u, T0, X1);
		refused(await launch(u, preparation, T0), "capability_unavailable", "WR05 no configured Watchdog");
		assert.equal(watchdogs(u).length, 0);
	} finally {
		await u.close();
	}
});

test("WR06/WR07/WR08/WR09 a review counts only with its own exact X checks and a bound verdict; Watchdog cannot write source", async () => {
	const t = await handedOff();
	try {
		const preparation = await prepare(t, T0, X1);
		const id = accepted(await launch(t, preparation, T0)).assignment as string;
		const actor = await t.start(id);
		const w = () => own(t, id);
		refused(await submit(t, actor, verdictText(w(), "rework"), nonPass), "missing_content", "WR06 verdict before own checks");
		for (const [label, over] of [
			["another role", { role: "implementer" }],
			["another prepared commit", { prepared: X2 }],
			["another verifier", { digest: "8".repeat(64) }],
		] as const)
			refused(await recordChecks(t, w(), receipt(t, w(), over)), "stale_basis", `WR07 ${label}`);
		refused(await recordChecks(t, w(), "{"), "invalid_content", "WR07 malformed receipt");
		refused(
			await recordChecks(t, w(), receipt(t, w(), { tree: "9".repeat(40) })),
			"invalid_content",
			"WR07 literal X entries that do not form its claimed tree",
		);
		refused(await recordChecks(t, w(), receipt(t, w()), scheduler), "forbidden_principal", "WR07 scheduler receipt");
		refused(await recordChecks(t, w(), receipt(t, w()), actor), "forbidden_principal", "WR07 Watchdog cannot attest its own checks");
		// The Engine's scratch copy changed: retained as the actual result, never passing evidence.
		accepted(await recordChecks(t, w(), receipt(t, w(), { resultTree: "7".repeat(40), status: "source_changed" })));
		refused(await recordChecks(t, w(), receipt(t, w())), "assignment_closed", "checks are retained once");
		refused(await submit(t, actor, verdictText(w(), "pass"), passing), "missing_content", "WR07 pass over source_changed checks");
		for (const [label, over] of [
			["another pass", { passRef: P2 }],
			["another handoff", { handoff: "implementation-handoff:10" }],
			["another B", { source: "revision:10" }],
			["another X", { prepared: X2 }],
			["another T", { target: T1 }],
			["another schema", { schema: 2 }],
			["unknown verdict", { verdict: "approve" }],
		] as const)
			refused(await submit(t, actor, verdictText(w(), "rework", over), nonPass), "invalid_content", `WR08 ${label}`);
		refused(await submit(t, actor, "Looks fine to me.", nonPass), "invalid_content", "WR08 free text");
		refused(await submit(t, actor, verdictText(w(), "rework"), undefined), "invalid_content", "WR08 no assessment");
		refused(
			await t.f.command(
				{ type: "recordImplementationSource", assignment: id, generation: 1, attempt: w().attempt, kind: "final", text: "{}" },
				actor,
			),
			"forbidden_principal",
			"WR09 Watchdog cannot record source",
		);
		refused(await t.f.command({ type: "requestImplementationAudit" }, actor), "missing_content", "WR09 Watchdog has no pass to Audit");
		refused(await t.f.command(t.handoff, actor), "missing_content", "WR09 Watchdog cannot hand off source");
		assert.equal(w().status, "running");
		assert.equal(completed(t), 0, "no refused submission counts");
		const reply = await submit(t, actor, verdictText(w(), "rework"), nonPass, "watchdog-verdict");
		assert.equal(accepted(reply).reviews, 1);
		const duplicate = await submit(t, actor, verdictText(w(), "rework"), nonPass, "watchdog-verdict");
		assert.deepEqual({ ...duplicate, duplicate: false }, reply, "duplicate returns the receipt");
		assert.equal((duplicate as { duplicate?: boolean }).duplicate, true);
		refused(await submit(t, actor, verdictText(w(), "pass"), passing), "assignment_not_running", "a settled review cannot complete twice");
		assert.equal(completed(t), 1);
	} finally {
		await t.close();
	}
	const f = await handedOff();
	try {
		const preparation = await prepare(f, T0, X1);
		const id = accepted(await launch(f, preparation, T0)).assignment as string;
		const actor = await f.start(id);
		accepted(await recordChecks(f, own(f, id), receipt(f, own(f, id), { exitCode: 1, status: "failed" })));
		refused(await submit(f, actor, verdictText(own(f, id), "pass"), passing), "missing_content", "WR07 pass over failed own checks");
		assert.equal(accepted(await submit(f, actor, verdictText(own(f, id), "rework"), nonPass)).reviews, 1);
	} finally {
		await f.close();
	}
});

test("WR10/WR11 every completed round counts once across passing drift rounds; the default cap stops the third non-pass", async () => {
	const t = await handedOff();
	try {
		const first = await round(t, T0, X1, "pass");
		assert.equal(first.reviews, 1);
		const second = await round(t, T1, X2, "pass");
		assert.equal(second.reviews, 2);
		assert.deepEqual(own(t, second.id).watchdogReview!.prior, [first.report], "the next round receives earlier findings");
		const third = await round(t, T2, X3, "rework");
		assert.equal(third.reviews, 3, "passing drift rounds are not exempt");
		assert.equal(completed(t), 3);
		assert.deepEqual(own(t, third.id).watchdogReview!.prior, [first.report, second.report]);
		const before = structuredClone(passes(t));
		refused(await openRework(t, third, X3, T2), "human_direction_required", "default limit 2 stops automatic rework");
		assert.deepEqual(passes(t), before);
		for (const r of [first, second, third]) {
			const read = await Effect.runPromise(t.f.ledger.artifact(admin, { read: r.report }));
			assert.ok("content" in read, "every completed review stays retained");
		}
	} finally {
		await t.close();
	}
});

test("WR12/WR15/WR16 a valid current pass qualifies even at limit zero; stale target or policy refuses it without uncounting", async () => {
	const t = await handedOff({ limit: 0 });
	try {
		const passed = await round(t, T0, X1, "pass");
		assert.equal(passed.reviews, 1, "the initial review still happens at limit zero");
		assert.equal(await qualification(t, passed, T0), undefined, "valid current pass is never rejected by the cap");
		const stale = await qualification(t, passed, T1);
		assert.equal(stale?.code, "stale_basis", "a moved target never qualifies a completed pass");
		assert.match(stale?.reason ?? "", new RegExp(`${T0}.*${T1}`), "names reviewed and current targets");
		await adoptLimit(t, 5);
		assert.equal((await qualification(t, passed, T0))?.code, "stale_basis", "WR16 policy adopted after the review");
		assert.equal(completed(t), 1, "the completed review stays counted and visible");
	} finally {
		await t.close();
	}
	const r = await handedOff({ limit: 0 });
	try {
		const rework = await round(r, T0, X1, "rework");
		assert.equal((await qualification(r, rework, T0))?.code, "forbidden_scope", "rework never qualifies");
		refused(await openRework(r, rework, X1, T0), "human_direction_required", "no automatic rework at limit zero");
		assert.equal(passes(r).length, 1);
	} finally {
		await r.close();
	}
});

test("WR13 needs-human stops immediately for every cause before the budget is spent", async () => {
	const t = await handedOff();
	try {
		const stopped = await round(t, T0, X1, "needs-human");
		assert.equal(stopped.reviews, 1);
		refused(await openRework(t, stopped, X1, T0), "human_direction_required", "rework");
		const a = own(t, t.id);
		const conflict = JSON.stringify({
			schema: 1,
			cause: "preparation-conflict",
			repository: "owned",
			source: pass(t).handoff!.source,
			sourceCommit: S,
			baseCommit: S,
			targetCommit: T1,
			algorithm: "git-merge-tree-write-tree-z/v1",
			resultTree: "d".repeat(40),
			conflicts: ["value"],
		});
		refused(
			await t.f.command(
				{ type: "openSuccessorPass", assignment: a.id, generation: a.generation, attempt: a.attempt, text: conflict },
				effects,
			),
			"human_direction_required",
			"conflict",
		);
		assert.equal(passes(t).length, 1);
	} finally {
		await t.close();
	}
});

test("WR14 after a cap stop, explicit larger-cap adoption and retry re-settle the retained verdict into a successor that needs its own Audit", async () => {
	const t = await handedOff({ limit: 0 });
	try {
		const rework = await round(t, T0, X1, "rework");
		refused(await openRework(t, rework, X1, T0), "human_direction_required", "limit zero stop");
		const a = own(t, t.id);
		accepted(
			await t.f.command({
				type: "recordPreparationBlocker",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				reason: "review_limit_reached: human direction required",
			}),
		);
		await adoptLimit(t, 3);
		const retried = accepted(
			await t.f.command({ type: "retryPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin),
		);
		assert.equal(retried.settles, rework.preparation, "retry re-settles the reviewed X instead of preparing again");
		const opened = accepted(await openRework(t, rework, X1, T0));
		assert.equal(opened.passRef, P2);
		assert.equal(pass(t, P2).cause, "watchdog-rework");
		assert.equal(pass(t, P2).opening?.base, X1, "the successor starts from reviewed X");
		assert.equal(completed(t), 1, "adoption and pass transition keep the count");
		assert.ok(
			(await Effect.runPromise(t.f.ledger.artifact(admin, { read: rework.report }))) &&
				"content" in (await Effect.runPromise(t.f.ledger.artifact(admin, { read: rework.report }))),
		);
		const actor = await t.start(opened.assignment as string);
		refused(await t.f.command(t.handoff, actor), "missing_content", "P1's Audit cannot satisfy P2");
		refused(await t.f.command({ type: "requestImplementationAudit" }, actor), "missing_content", "P2 needs its own A first");
	} finally {
		await t.close();
	}
});

test("WR17/WR18 an interrupted review resumes the same Assignment uncounted; bindings, checks and reports survive reopen and export", async () => {
	const t = await handedOff();
	try {
		const first = await round(t, T0, X1, "pass");
		const preparation = await prepare(t, T1, X2);
		const id = accepted(await launch(t, preparation, T1)).assignment as string;
		await t.start(id);
		accepted(await recordChecks(t, own(t, id), receipt(t, own(t, id))));
		const checks = own(t, id).watchdogReview!.checks!;
		assert.ok(checks, "checks receipt is bound once");
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(completed(t), 1, "interruption adds nothing");
		const before = own(t, id);
		assert.equal(before.watchdogReview!.checks, checks);
		accepted(
			await t.f.command({
				type: "rebindAttempt",
				assignment: id,
				generation: before.generation,
				attempt: before.attempt,
				providerIdle: true,
				environment: "absent",
				effects: "reconciled",
				executorEpoch: t.f.ledger.status().executorEpoch,
			}),
		);
		const resumed = own(t, id);
		assert.equal(resumed.attempt, before.attempt, "same review resumes");
		const actor = t.agent(resumed);
		const result = accepted(await submit(t, actor, verdictText(resumed, "pass"), passing));
		assert.equal(result.reviews, 2);
		await quiesce(t, id);
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(completed(t), 2);
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [first.report, result.report as string, checks, own(t, id).packetRef, own(t, first.id).packetRef, preparation])
			assert.ok(exported.content[ref], `export retains ${ref}`);
	} finally {
		await t.close();
	}
});

test("WR22 missing prior Watchdog material stays explicit without resetting the count", async () => {
	const engine = new LedgerOnlyEngine();
	const t = await handedOff();
	try {
		await t.f.reopen(engine);
		const first = await round(t, T0, X1, "pass");
		const preparation = await prepare(t, T1, X2);
		const id = accepted(await launch(t, preparation, T1)).assignment as string;
		damageImplementation(t.f.data, first.report, "missing_content");
		const rendered = JSON.parse(await Effect.runPromise(engine.render(own(t, id)))) as {
			watchdogReview?: { prior: { ref: string; unavailable?: string; text?: string }[] };
		};
		assert.deepEqual(rendered.watchdogReview?.prior, [{ ref: first.report, unavailable: "missing_content" }]);
		assert.equal(completed(t), 1);
	} finally {
		await t.close();
	}
});

test("WR21 a canceled round counts nothing and its settled handoff can be prepared and reviewed again", async () => {
	const t = await handedOff();
	try {
		const preparation = await prepare(t, T0, X1);
		const id = accepted(await launch(t, preparation, T0)).assignment as string;
		await t.start(id);
		const a = own(t, t.id);
		const retry = () => t.f.command({ type: "retryPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin);
		refused(await retry(), "stale_basis", "retry while the round runs");
		const canceled = accepted(await t.f.command({ type: "cancelWork", assignment: id, generation: 1, attempt: own(t, id).attempt }, admin));
		const w = own(t, id);
		accepted(
			await t.f.command({
				type: "recordQuiescence",
				assignment: id,
				generation: canceled.generation,
				attempt: w.attempt,
				providerIdle: true,
				environment: "absent",
				effects: "reconciled",
			}),
		);
		assert.equal(own(t, id).status, "canceled");
		assert.equal(completed(t), 0, "a canceled round is not a completed review");
		const retried = accepted(await retry());
		assert.equal(retried.settles, null, "nothing completed to settle: prepare again");
		const next = await prepare(t, T0, X1);
		accepted(await launch(t, next, T0));
		assert.equal(watchdogs(t).length, 2);
	} finally {
		await t.close();
	}
});

const blockHandoff = async (t: Lifecycle, reason: string) => {
	const a = own(t, t.id);
	accepted(await t.f.command({ type: "recordPreparationBlocker", assignment: a.id, generation: a.generation, attempt: a.attempt, reason }));
};
function direct(t: Lifecycle, review: string, text: string, context = admin, over: Record<string, unknown> = {}) {
	const a = own(t, t.id);
	return t.f.command(
		{ type: "directRework", assignment: a.id, generation: a.generation, attempt: a.attempt, review, text, ...over },
		context,
	);
}
const directedObservation = (t: Lifecycle, r: { id: string; report: string }, direction: string, X: string, target: string) =>
	JSON.stringify({ ...JSON.parse(reworkObservation(t, r, X, target)), cause: "human-direction", direction });
function openDirected(t: Lifecycle, r: { id: string; report: string }, direction: string, X: string, target: string) {
	const a = own(t, t.id);
	return t.f.command(
		{
			type: "openSuccessorPass",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			text: directedObservation(t, r, direction, X, target),
		},
		effects,
	);
}
const agent = (a: RoleAssignment) =>
	mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });

test("WR25 a rework successor reads the exact Watchdog findings that returned it; missing ones refuse instead of guessing", async () => {
	const engine = new LedgerOnlyEngine();
	const t = await handedOff();
	try {
		await t.f.reopen(engine);
		const rework = await round(t, T0, X1, "rework");
		const opened = accepted(await openRework(t, rework, X1, T0));
		await t.start(opened.assignment as string);
		const successor = own(t, opened.assignment as string);
		assert.ok(successor.packet.inputs.includes(rework.report), "the cited report is a required successor input");
		const read = await Effect.runPromise(t.f.ledger.artifact(agent(successor), { read: rework.report }));
		assert.ok("content" in read, `successor reads its findings: ${JSON.stringify(read)}`);
		assert.match(read.content.toString(), /Value must be B/);
		const rendered = JSON.parse(await Effect.runPromise(engine.render(successor))) as { inputs: { ref: string; text: string }[] };
		assert.match(rendered.inputs.find((i) => i.ref === rework.report)?.text ?? "", /Value must be B/);
		damageImplementation(t.f.data, rework.report, "missing_content");
		await assert.rejects(
			Effect.runPromise(engine.render(own(t, successor.id))),
			new RegExp(`Required exact input ${rework.report}: missing_content`),
		);
	} finally {
		await t.close();
	}
});

test("WR26 only an authenticated human direction on the exact stopped round resolves Needs Human into a successor needing its own Audit", async () => {
	const t = await handedOff();
	try {
		const passed = await round(t, T0, X1, "pass");
		const preparation = await prepare(t, T1, X2);
		accepted(await launch(t, preparation, T1));
		const w = watchdogs(t).find((r) => r.watchdogReview?.preparation === preparation)!;
		const actor = await t.start(w.id);
		accepted(await recordChecks(t, own(t, w.id), receipt(t, own(t, w.id))));
		refused(await direct(t, w.id, "Make value C."), "stale_basis", "an open round is not a stop");
		const stopped = accepted(await submit(t, actor, verdictText(own(t, w.id), "needs-human"), nonPass));
		assert.equal(stopped.reviews, 2);
		await quiesce(t, w.id);
		const r = { id: w.id, report: stopped.report as string };
		refused(await openRework(t, r, X2, T1), "human_direction_required", "Needs Human stops automatic rework");
		refused(await direct(t, w.id, "Make value C."), "stale_basis", "an unsettled handoff takes no direction");
		await blockHandoff(t, `needs_human: Watchdog ${w.id} requires human direction`);
		for (const [context, label] of [
			[scheduler, "scheduling"],
			[effects, "Effects host"],
			[recovery, "recovery"],
			[t.actor, "owner agent"],
			[actor, "Watchdog agent"],
		] as const)
			refused(await direct(t, w.id, "Make value C.", context), "forbidden_principal", label);
		refused(await direct(t, passed.id, "Make value C."), "stale_basis", "a round of another X");
		refused(await direct(t, w.id, " "), "invalid_content", "empty direction");
		refused(await direct(t, w.id, "Make value C.", admin, { generation: 9 }), "stale_assignment", "stale owner generation");
		refused(await openDirected(t, r, "revision:1", X2, T1), "human_direction_required", "no recorded human direction");
		const directed = accepted(await direct(t, w.id, "Make value C, keeping the interface."));
		assert.equal(directed.settles, preparation, "the stopped round settles again, nothing is re-prepared");
		const direction = directed.direction as string;
		const retained = await Effect.runPromise(t.f.ledger.artifact(admin, { read: direction }));
		assert.ok("content" in retained && retained.content.toString() === "Make value C, keeping the interface.");
		refused(await direct(t, w.id, "Something else."), "stale_basis", "a stop takes one direction");
		refused(await openDirected(t, r, "revision:1", X2, T1), "human_direction_required", "a direction other than the recorded one");
		const opened = accepted(await openDirected(t, r, direction, X2, T1));
		assert.equal(opened.passRef, P2);
		assert.equal(pass(t, P2).cause, "human-direction");
		assert.equal(pass(t, P2).opening?.base, X2, "the successor starts from reviewed X");
		assert.equal(completed(t), 2, "direction and pass transition keep the count");
		const successor = own(t, opened.assignment as string);
		const successorActor = await t.start(successor.id);
		for (const ref of [r.report, direction]) {
			assert.ok(successor.packet.inputs.includes(ref), `successor input ${ref}`);
			assert.ok("content" in (await Effect.runPromise(t.f.ledger.artifact(successorActor, { read: ref }))), `successor reads ${ref}`);
		}
		refused(await t.f.command(t.handoff, successorActor), "missing_content", "P1's Audit cannot satisfy P2");
		await t.f.reopen(new LedgerOnlyEngine());
		assert.deepEqual(pass(t).handoff?.direction, { review: w.id, revision: direction }, "the direction survives reopen");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [direction, r.report, pass(t, P2).opening!.observation]) assert.ok(exported.content[ref], `export retains ${ref}`);
	} finally {
		await t.close();
	}
});

test("WR28 below the cap a human-direction return needs the recorded direction; legal rework stays automatic", async () => {
	const t = await handedOff();
	try {
		const rework = await round(t, T0, X1, "rework");
		assert.equal(completed(t), 1, "one completed review, below the default limit 2");
		refused(await openDirected(t, rework, rework.report, X1, T0), "human_direction_required", "the report is no human direction");
		refused(await openDirected(t, rework, "revision:1", X1, T0), "human_direction_required", "an unrecorded direction");
		assert.equal(passes(t).length, 1, "a refused return opens no pass");
		const opened = accepted(await openRework(t, rework, X1, T0));
		assert.equal(opened.passRef, P2);
		assert.equal(pass(t, P2).cause, "watchdog-rework", "undirected rework is not attributed to a human");
		assert.equal(completed(t), 1);
	} finally {
		await t.close();
	}
});

test("WR26 human direction also resolves a cap stop without adopting a larger limit; cap adoption alone never passes Needs Human", async () => {
	const capped = await handedOff({ limit: 0 });
	try {
		const rework = await round(capped, T0, X1, "rework");
		refused(await openRework(capped, rework, X1, T0), "human_direction_required", "limit zero stop");
		await blockHandoff(capped, "preparation_return_refused: human_direction_required");
		const direction = accepted(await direct(capped, rework.id, "Apply W1 as written.")).direction as string;
		accepted(await openDirected(capped, rework, direction, X1, T0));
		assert.equal(pass(capped, P2).cause, "human-direction");
		assert.equal(completed(capped), 1);
	} finally {
		await capped.close();
	}
	const t = await handedOff();
	try {
		const stopped = await round(t, T0, X1, "needs-human");
		await blockHandoff(t, "needs_human");
		await adoptLimit(t, 5);
		const a = own(t, t.id);
		accepted(await t.f.command({ type: "retryPreparation", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin));
		refused(await openRework(t, stopped, X1, T0), "human_direction_required", "a larger cap is not a Needs Human direction");
		assert.equal(passes(t).length, 1);
	} finally {
		await t.close();
	}
});
