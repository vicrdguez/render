// AR01–AR08: ready-promotion eligibility, admission and actual-state reconciliation at the Ledger/Kernel interface over
// real SQLite (AR08 at the pure Kernel). Forge observations are literal host results; the GitHub adapter is covered in
// automatic-readiness-forge.test.ts and the Engine journey in github-publication.integration.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { change, type KernelState, type Principal } from "../src/kernel/kernel.ts";
import { type Publication, publicationView } from "../src/kernel/publication.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { accepted, LedgerOnlyEngine } from "./support/implementation.ts";
import {
	admitted,
	effects,
	handedOff,
	handOffNext,
	type Lifecycle,
	lineage,
	observation,
	passedRound,
	R1,
	R2,
	record,
	refused,
	T0,
	W,
	X2,
} from "./support/integration.ts";
import { decision } from "./support/kernel.ts";
import { admin, scheduler } from "./support/roles.ts";

type Item = {
	id: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	head: string | null;
	marker: string | null;
	actor: boolean;
	merge: { main: boolean; commit: string } | null;
};
type Op = { operation: string; kind: string; status: string; canonical: string; attempts: { id: string }[] };
type Readiness = {
	eligible: boolean;
	gaps: string[];
	promotion: { operation: string; status: string; canonical: string; pr: string } | null;
	observed: string | null;
	package: { slice: string; result: string }[];
	advisory: string;
	uncertain: string[];
};
type View = { status: string; unsupported: string[]; operations: Op[]; blocked: string[]; readiness: Readiness };
const PR = "github:pr:7:n";
const AT = "2026-11-01T00:00:00.000Z";
const view = (t: Lifecycle) => ((t.f.ledger.snapshot(admin) as Frame).workflows as { publication: View }[])[0]!.publication;
const readiness = (t: Lifecycle) => view(t).readiness;
const op = (t: Lifecycle, operation: string) => view(t).operations.find((o) => o.operation === operation)!;
const stageF = (t: Lifecycle, kind: string, context = effects) => t.f.command({ type: "stageForgeOperation", kind }, context);
const admitF = (t: Lifecycle, operation: string) => t.f.command({ type: "admitForgeOperation", operation }, effects);
function observe(t: Lifecycle, over: Record<string, unknown> = {}): Promise<CommandReply> {
	const text = JSON.stringify({
		schema: 1,
		operation: null,
		attempt: null,
		mode: "reconcile",
		outcome: null,
		reason: null,
		created: null,
		head: null,
		proposals: null,
		capabilities: null,
		observedAt: AT,
		...over,
	});
	return t.f.command({ type: "recordForgeObservation", text }, effects);
}
const dispatch = (t: Lifecycle, operation: string, attempt: string, outcome: string, over: Record<string, unknown> = {}) =>
	observe(t, { operation, attempt, mode: "dispatch", outcome, ...over });
const pr = (over: Partial<Item> = {}): Item => ({
	id: PR,
	state: "open",
	draft: true,
	head: R2,
	marker: null,
	actor: true,
	merge: null,
	...over,
});
const listing = (items: Item[], complete = true) => ({ proposals: { complete, items } });
async function read(t: Lifecycle, ref: string) {
	const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
	assert.ok("content" in value, `read ${ref}`);
	return value.content.toString();
}

async function qualified(second: "integration" | "record" = "integration") {
	const t = await handedOff(second);
	const r = await passedRound(t);
	const { operation, attempt } = await admitted(t, t.id, r);
	accepted(await record(t, t.id, operation, observation(operation, attempt)));
	return t;
}
async function publish(t: Lifecycle, head: string) {
	const publication = accepted(await stageF(t, "publish-source")).operation as string;
	const attempt = accepted(await admitF(t, publication)).forgeAttempt as string;
	accepted(await dispatch(t, publication, attempt, "applied", { head: { commit: head } }));
}
/** read-fix qualified as R1, published, and the one draft PR created and associated. */
async function associated(second: "integration" | "record" = "integration") {
	const t = await qualified(second);
	accepted(await observe(t, { head: { commit: null } }));
	await publish(t, R1);
	const create = accepted(await stageF(t, "create-proposal")).operation as string;
	accepted(await observe(t, { operation: create, ...listing([]) }));
	const attempt = accepted(await admitF(t, create)).forgeAttempt as string;
	accepted(await dispatch(t, create, attempt, "applied", { created: PR }));
	return t;
}
/** read-next's handoff with a passing Watchdog round, not yet admitted: merely passing. */
async function nextPassing(t: Lifecycle) {
	const id = await handOffNext(t);
	const l = lineage(R1, X2);
	return { id, l, round: await passedRound(t, id, "read-next", l) };
}
async function integrateNext(t: Lifecycle, next?: Awaited<ReturnType<typeof nextPassing>>) {
	const { id, l, round } = next ?? (await nextPassing(t));
	const { operation, attempt } = await admitted(t, id, round, l, R2);
	assert.equal(accepted(await record(t, id, operation, observation(operation, attempt, {}, l, R2))).outcome, "applied");
}
/** Both Slices integrated, R2 published, PR associated: eligible. */
async function eligible() {
	const t = await associated();
	await integrateNext(t);
	await publish(t, R2);
	return t;
}
/** An eligible promotion reobserved as a draft on R2 and admitted. */
async function admittedReady(t: Lifecycle) {
	const ready = accepted(await stageF(t, "mark-ready")).operation as string;
	accepted(await observe(t, { operation: ready, ...listing([pr()]) }));
	const attempt = accepted(await admitF(t, ready)).forgeAttempt as string;
	return { ready, attempt };
}

test("AR01 only host Effects stages a ready promotion; no human or agent principal can", async () => {
	const t = await eligible();
	try {
		for (const [label, context] of [
			["local admin", admin],
			["scheduling", scheduler],
			["implementer agent", t.actor],
		] as const)
			refused(await stageF(t, "mark-ready", context), "forbidden_principal", `${label} stage`);
		assert.deepEqual(
			view(t).operations.filter((o) => o.kind === "mark-ready"),
			[],
			"nothing retained",
		);
	} finally {
		await t.close();
	}
});

test("AR02 every required Slice must have recorded qualifying integration and the current head must be published", async () => {
	const t = await associated();
	try {
		assert.deepEqual([readiness(t).eligible, readiness(t).gaps], [false, ["read-next: not yet integrated"]], "unfinished Slice");
		refused(await stageF(t, "mark-ready"), "stale_basis", "unfinished Slice blocks promotion");
		const next = await nextPassing(t);
		assert.deepEqual(readiness(t).gaps, ["read-next: not yet integrated"], "a merely passing Slice does not count");
		refused(await stageF(t, "mark-ready"), "stale_basis", "merely passing blocks promotion");
		await integrateNext(t, next);
		assert.deepEqual(readiness(t).gaps, [`awaiting publication: ${R2}`], "unpublished current source");
		refused(await stageF(t, "mark-ready"), "stale_basis", "unpublished source blocks promotion");
		assert.ok(view(t).blocked.includes("ready-promotion"));
		await publish(t, R2);
		assert.deepEqual([readiness(t).eligible, readiness(t).gaps], [true, []], "all qualify and current source is published");
		assert.ok(!view(t).blocked.includes("ready-promotion"));
		assert.deepEqual(
			readiness(t).package.map((e) => [e.slice, e.result]),
			[
				["read-fix", R1],
				["read-next", R2],
			],
		);
	} finally {
		await t.close();
	}
});

test("AR03 an unfinished Record Slice blocks readiness like any required Slice", async () => {
	const t = await handedOff("record");
	try {
		assert.deepEqual(
			readiness(t).gaps,
			["read-fix: Record not yet integrated", "read-next: not yet integrated", "no qualifying integration"],
			"an unfinished Record Slice is a gap",
		);
		const r = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, r);
		accepted(await record(t, t.id, operation, observation(operation, attempt)));
		assert.deepEqual(readiness(t).gaps, ["read-next: not yet integrated", `awaiting publication: ${R1}`, "no associated proposal PR"]);
		assert.equal(readiness(t).eligible, false);
	} finally {
		await t.close();
	}
});

test("AR04 an eligible proposal is promoted narrowly: reobserve the exact PR head, then one admitted mark-ready", async () => {
	const t = await eligible();
	try {
		const summary = accepted(await stageF(t, "update-summary")).operation as string;
		assert.ok(
			JSON.parse(await read(t, summary)).summary.includes("- Ready promotion: eligible; the forge ready state is observed separately"),
		);
		const ready = accepted(await stageF(t, "mark-ready")).operation as string;
		assert.deepEqual(JSON.parse(await read(t, ready)), {
			schema: 1,
			kind: "mark-ready",
			proposal: W,
			pr: PR,
			canonical: R2,
			published: R2,
		});
		assert.equal(op(t, ready).status, "planned");
		refused(await admitF(t, ready), "stale_basis", "no admission before reobserving the PR");
		accepted(await observe(t, { operation: ready, ...listing([pr({ head: R1 })]) }));
		refused(await admitF(t, ready), "stale_basis", "a PR head other than the published basis");
		accepted(await observe(t, { operation: ready, ...listing([pr()]) }));
		const admission = accepted(await admitF(t, ready));
		assert.match(String(admission.forgeAttempt), /^forge-attempt:\d+$/);
		assert.equal(admission.executorEpoch, t.f.ledger.status().executorEpoch);
		refused(await stageF(t, "mark-ready"), "ownership_conflict", "one promotion per basis at a time");
		accepted(await dispatch(t, ready, admission.forgeAttempt as string, "applied"));
		accepted(await observe(t, { operation: ready, ...listing([pr({ draft: false })]) }));
		assert.equal(op(t, ready).status, "applied");
		assert.equal(readiness(t).observed, "ready");
		assert.deepEqual(readiness(t).promotion, { operation: ready, status: "applied", canonical: R2, pr: PR });
		refused(await stageF(t, "mark-ready"), "stale_basis", "already promoted on this basis");
		assert.equal(view(t).operations.filter((o) => o.kind === "create-proposal").length, 1, "no new PR");
	} finally {
		await t.close();
	}
});

test("AR05 a forge without ready promotion is a visible limitation, never an internal ready flag", async () => {
	const t = await eligible();
	try {
		accepted(
			await observe(t, {
				capabilities: {
					draftProposalPR: true,
					markProposalReady: false,
					guardedSourceUpdate: true,
					createIdempotency: false,
					stableObjectIdentity: true,
					mergeObservation: false,
					observationCompleteness: true,
				},
			}),
		);
		assert.ok(view(t).unsupported.includes("markProposalReady"));
		refused(await stageF(t, "mark-ready"), "capability_unavailable", "no ready capability");
		assert.deepEqual([readiness(t).eligible, readiness(t).promotion, readiness(t).observed], [true, null, "draft"]);
	} finally {
		await t.close();
	}
});

test("AR06 a lost ready reply is reconciled from the same PR; only ready on the exact head is satisfaction", async () => {
	const t = await eligible();
	try {
		const { ready, attempt } = await admittedReady(t);
		accepted(await dispatch(t, ready, attempt, "unknown", { reason: "reply lost" }));
		assert.equal(op(t, ready).status, "unknown");
		assert.equal(view(t).status, "uncertain");
		assert.deepEqual(readiness(t).uncertain, [ready]);
		accepted(await observe(t, { operation: ready, ...listing([pr({ draft: false, head: R1 })]) }));
		assert.equal(op(t, ready).status, "unknown", "ready on a changed head is not success");
		accepted(await observe(t, { operation: ready, ...listing([], false) }));
		assert.equal(op(t, ready).status, "unknown", "an incomplete observation is not success");
		accepted(await observe(t, { operation: ready, ...listing([pr({ state: "closed" })]) }));
		assert.equal(op(t, ready).status, "unknown", "a closed PR is not success");
		assert.equal(readiness(t).observed, "closed");
		assert.ok(readiness(t).gaps.includes(`associated PR ${PR} is closed`));
		accepted(await observe(t, { operation: ready, ...listing([pr({ draft: false })]) }));
		assert.equal(op(t, ready).status, "satisfied");
		assert.equal(readiness(t).observed, "ready");
		assert.deepEqual(readiness(t).uncertain, []);
		assert.equal(op(t, ready).attempts.length, 1, "no second dispatch");
	} finally {
		await t.close();
	}
});

test("AR07 an unknown promotion is never redispatched on a partial draft observation; a fresh admission needs a new basis check", async () => {
	const t = await eligible();
	try {
		const { ready, attempt } = await admittedReady(t);
		await t.f.reopen(new LedgerOnlyEngine());
		refused(await dispatch(t, ready, attempt, "applied"), "stale_executor", "the recovered epoch cannot use the old permit");
		const recovered = accepted(await observe(t, { operation: ready, ...listing([pr()], false) })).observation as string;
		assert.equal(op(t, ready).status, "unknown", "a partial observation that still says draft keeps it unknown");
		refused(await admitF(t, ready), "stale_basis", "no readmission of an uncertain promotion");
		refused(await stageF(t, "mark-ready"), "ownership_conflict", "no duplicate promotion while unknown");
		accepted(await observe(t, { operation: ready, ...listing([pr()]) }));
		assert.equal(op(t, ready).status, "unapplied", "a complete observation still draft on the exact head");
		const fresh = accepted(await stageF(t, "mark-ready")).operation as string;
		assert.equal(op(t, fresh).status, "planned");
		refused(await admitF(t, fresh), "stale_basis", "a fresh admission reobserves first");
		assert.deepEqual(
			op(t, ready).attempts.map((a) => a.id),
			[attempt],
		);
		assert.equal(view(t).operations.filter((o) => o.kind === "create-proposal").length, 1, "no new create");
		const before = JSON.stringify(view(t));
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(JSON.stringify(view(t)), before, "readiness and promotion survive reopen");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [ready, fresh, recovered]) assert.ok(exported.content[ref], `export contains ${ref}`);
	} finally {
		await t.close();
	}
});

const KW = "workflow:9";
const KPR = "github:pr:3:k";
const host: Principal = { kind: "host", scope: "effects" };
const slice = (id: string) => ({
	id,
	contract: `contract:${id}`,
	intake: "intake:1",
	acceptance: "intake-record:1",
	everAssigned: true,
	status: "accepted" as const,
	review: "report:1",
	record: false,
	predecessors: [],
});
const pass = (id: string, target: string, result: string, sequence: number) => ({
	ref: `pass:${id}`,
	ordinal: 1,
	workflow: KW,
	slice: id,
	contract: `contract:${id}`,
	assignment: `assignment:${id}`,
	captureA: `capture-a:${id}`,
	audit: { record: `audit:${id}` },
	handoff: {
		record: `handoff:${id}`,
		source: `b:${id}`,
		integrations: [
			{
				operation: `integration:${id}`,
				preparation: `preparation:${id}`,
				review: `watchdog:${id}`,
				target,
				result,
				tree: `tree:${id}`,
				status: "qualified",
				attempts: [{ id: `attempt:${id}`, executorEpoch: "epoch:1", sequence, observations: [] }],
			},
		],
	},
});
const kItem = (over: Partial<Item>): Item => ({
	id: KPR,
	state: "open",
	draft: true,
	head: R1,
	marker: null,
	actor: true,
	merge: null,
	...over,
});
const kObservation = (over: Record<string, unknown>) =>
	JSON.stringify({
		schema: 1,
		operation: null,
		attempt: null,
		mode: "reconcile",
		outcome: null,
		reason: null,
		created: null,
		head: null,
		proposals: null,
		capabilities: null,
		observedAt: AT,
		...over,
	});

/** One integrated Slice `a` at R1, published, with an associated open draft PR: eligible, driven through pure Kernel. */
function kernelProposal() {
	let state = {
		workflow: { id: KW, messageCount: 0, title: "Ready" },
		document: null,
		device: null,
		intakes: { revision: "intake-record:1", drafts: [], concerns: [], slices: [slice("a")], dependencies: [] },
		roleWork: { assignments: [], passes: [pass("a", T0, R1, 1)] },
		publication: {
			operations: [],
			remote: { head: R1, observation: "revision:1" },
			divergence: null,
			association: { pr: KPR, by: "created", draft: true, state: "open" },
			duplicates: [],
		} as Publication,
	} as unknown as KernelState;
	let sequence = 10;
	const run = (command: Record<string, unknown>) => {
		sequence++;
		const d = decision(
			change(state, { ...command, workflow: KW } as never, {
				principal: host,
				sequence,
				executorEpoch: "epoch:1",
				ids: { revision: `revision:${sequence}`, fact: `fact:${sequence}` },
			}),
		);
		if (d.outcome !== "accepted") return { code: d.code, result: {}, text: "" };
		const write = d.writes.find((w) => w.type === "publication.replace") as { state: Publication; documents: { text: string }[] };
		state = { ...state, publication: write.state };
		return { code: "accepted", result: d.result as Record<string, string>, text: write.documents[0]?.text ?? "" };
	};
	const r = () =>
		publicationView(state.publication, state.roleWork, KW, state.intakes).readiness as unknown as Readiness & { promotion: unknown };
	const kop = (operation: string) => state.publication!.operations.find((o) => o.operation === operation)!;
	const view = () =>
		publicationView(state.publication, state.roleWork, KW, state.intakes) as unknown as View & {
			canonical: string | null;
			summaryStale: boolean;
		};
	const update = (next: Partial<KernelState>) => {
		state = { ...state, ...next } as KernelState;
	};
	return { run, r, kop, view, update, state: () => state };
}

test("AR08 an old ready flag never certifies new scope or source; the existing summary states the ineligibility", () => {
	const { run, r, kop, update, state } = kernelProposal();

	assert.deepEqual([r().eligible, r().gaps], [true, []]);
	const old = run({ type: "stageForgeOperation", kind: "mark-ready" }).result.operation!;
	run({ type: "recordForgeObservation", text: kObservation({ operation: old, proposals: { complete: true, items: [kItem({})] } }) });
	const attempt = run({ type: "admitForgeOperation", operation: old }).result.forgeAttempt!;
	assert.match(attempt, /^forge-attempt:/);

	update({ intakes: { ...state().intakes!, slices: [slice("a"), slice("b")] } });
	assert.deepEqual([r().eligible, r().gaps], [false, ["b: not yet integrated"]], "a scope change recomputes eligibility");
	update({ roleWork: { assignments: [], passes: [pass("a", T0, R1, 1), pass("b", R1, R2, 2)] as never } });
	assert.deepEqual(r().gaps, [`awaiting publication: ${R2}`], "new source needs its own publication");

	assert.equal(
		run({ type: "recordForgeObservation", text: kObservation({ operation: old, attempt, mode: "dispatch", outcome: "applied" }) }).code,
		"accepted",
		"the admitted old-basis promotion still completes",
	);
	run({
		type: "recordForgeObservation",
		text: kObservation({ operation: old, proposals: { complete: true, items: [kItem({ draft: false })] } }),
	});
	assert.deepEqual(r().promotion, { operation: old, status: "applied", canonical: R1, pr: KPR }, "old basis retained");
	assert.deepEqual([r().observed, r().eligible], ["ready", false], "the ready flag does not bless new source");
	assert.equal(run({ type: "stageForgeOperation", kind: "mark-ready" }).code, "stale_basis");
	const summary = JSON.parse(run({ type: "stageForgeOperation", kind: "update-summary" }).text).summary as string;
	assert.ok(summary.includes(`- Ready promotion: not eligible: awaiting publication: ${R2}`), "the summary states ineligibility");

	run({ type: "recordForgeObservation", text: kObservation({ head: { commit: R2 } }) });
	assert.deepEqual([r().eligible, r().gaps], [true, []]);
	const current = run({ type: "stageForgeOperation", kind: "mark-ready" }).result.operation!;
	run({
		type: "recordForgeObservation",
		text: kObservation({ operation: current, proposals: { complete: true, items: [kItem({ draft: false, head: R2 })] } }),
	});
	assert.deepEqual([kop(current).status, kop(current).attempts.length], ["satisfied", 0], "observed satisfaction, no dispatch");
	assert.equal(kop(old).canonical, R1);
});

test("AR09 a scope-only change on an unchanged head makes the stated summary stale until it is restaged", () => {
	const { run, view, update, state } = kernelProposal();
	assert.equal(view().summaryStale, true, "no summary states eligibility yet");
	assert.ok(JSON.parse(run({ type: "stageForgeOperation", kind: "update-summary" }).text).summary.includes("- Ready promotion: eligible;"));
	assert.equal(view().summaryStale, false, "the staged summary states the current eligibility");
	update({ intakes: { ...state().intakes!, slices: [slice("a"), slice("b")] } });
	assert.equal(view().canonical, R1, "the head is unchanged");
	assert.equal(view().summaryStale, true, "a scope change the summary does not state makes it stale");
	const restaged = JSON.parse(run({ type: "stageForgeOperation", kind: "update-summary" }).text).summary as string;
	assert.ok(restaged.includes("- Ready promotion: not eligible: b: not yet integrated"), "the summary states the new ineligibility");
	assert.equal(view().summaryStale, false);
});
