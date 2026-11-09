// HM01–HM07 at the Ledger/Kernel interface over real SQLite. Forge observations are literal host results here; the
// GitHub adapter producing them is human-merge-observation-forge.test.ts, the Engine journey GP-E1.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { accepted, LedgerOnlyEngine, type SecondSlice } from "./support/implementation.ts";
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
	W,
	X2,
} from "./support/integration.ts";
import { admin, packet, scheduler, selection } from "./support/roles.ts";
import { watched } from "./support/watchdog.ts";

const PR = "github:pr:7:PR_node7";
const M = "3".repeat(40);
const FOREIGN = "f00d".repeat(10);
const AT = "2026-11-02T00:00:00.000Z";
type Main = { pr: string; source: string; commit: string; observation: string; canonical: string | null; uncovered: string[] };
type View = {
	workflow: string;
	intakes: { revision: string; slices: { id: string; contract: string }[]; dependencies: unknown[] };
	publication: {
		main: Main | null;
		mainUnknown: string | null;
		choices: string[];
		association: { pr: string } | null;
		divergence: { head: string } | null;
		summaryStale: boolean;
	};
	blocker: { code: string; reason: string } | null;
	commitment: { status: string };
	owner: { status: string; assignments: { slice: string }[] };
	evidence: { status: string };
	nextHumanAction: { type: string };
};
const views = (t: Lifecycle, context = admin) => (t.f.ledger.snapshot(context) as Frame).workflows as View[];
const viewOf = (t: Lifecycle, workflow = W) => views(t).find((v) => v.workflow === workflow)!;
const pub = (t: Lifecycle) => viewOf(t).publication;
const mergedItem = (over: Record<string, unknown> = {}) => ({
	id: PR,
	state: "merged",
	draft: false,
	head: R1,
	marker: null,
	actor: true,
	merge: { main: true, commit: M },
	...over,
});
function forge(over: Record<string, unknown>) {
	return JSON.stringify({
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
}
const observe = (t: Lifecycle, over: Record<string, unknown>, context = effects, id?: string) =>
	t.f.command({ type: "recordForgeObservation", text: forge(over) }, context, id);
const listing = (items: Record<string, unknown>[], complete = true) => ({ proposals: { complete, items } });
const mainEdge = (slice: string, requires: string, workflow = W) => ({ slice, requires, kind: "main", workflow });
let amendments = 0;
function amend(t: Lifecycle, dependencies: unknown[], context = admin, workflow = W) {
	return Effect.runPromise(
		t.f.ledger.command(
			{
				version: 1,
				authorityEpoch: t.f.ledger.status().authorityEpoch,
				commandId: `amend:${++amendments}`,
				workflow,
				command: {
					type: "amendDependencies",
					expected: viewOf(t, workflow).intakes.revision,
					dependencies,
					reason: "The consumer needs it on main",
				},
			},
			context,
		),
	);
}
const assignNext = (t: Lifecycle) =>
	t.f.command({
		type: "assignTask",
		slice: "read-next",
		delivery: true,
		packet: t.writer({ inputs: [t.nextContract!], ...watched(t.nextContract!) }),
	});

/** read-fix privately qualified as R1 after a passing Watchdog round, published and associated with PR. */
async function associated(second: SecondSlice = "independent") {
	const t = await handedOff(second);
	const r = await passedRound(t);
	const { operation, attempt } = await admitted(t, t.id, r);
	accepted(await record(t, t.id, operation, observation(operation, attempt)));
	accepted(await observe(t, { head: { commit: null } }));
	const publish = accepted(await t.f.command({ type: "stageForgeOperation", kind: "publish-source" }, effects)).operation as string;
	const sent = accepted(await t.f.command({ type: "admitForgeOperation", operation: publish }, effects)).forgeAttempt;
	accepted(await observe(t, { operation: publish, attempt: sent, mode: "dispatch", outcome: "applied", head: { commit: R1 } }));
	const create = accepted(await t.f.command({ type: "stageForgeOperation", kind: "create-proposal" }, effects)).operation as string;
	accepted(await observe(t, { operation: create, ...listing([]) }));
	const attempt2 = accepted(await t.f.command({ type: "admitForgeOperation", operation: create }, effects)).forgeAttempt;
	accepted(await observe(t, { operation: create, attempt: attempt2, mode: "dispatch", outcome: "applied", created: PR }));
	assert.equal(pub(t).association?.pr, PR);
	return t;
}
/** read-next handed off, reviewed and qualified as R2 on R1. */
async function integrateNext(t: Lifecycle) {
	const id = await handOffNext(t);
	const l = lineage(R1, X2);
	const r = await passedRound(t, id, "read-next", l);
	const { operation, attempt } = await admitted(t, id, r, l, R2);
	assert.equal(accepted(await record(t, id, operation, observation(operation, attempt, {}, l, R2))).outcome, "applied");
}

/** A second proposal with one accepted Slice `cross`, through the real intake commands. */
async function consumer(t: Lifecycle) {
	const ledger = t.f.ledger;
	let n = 0;
	const send = (command: Record<string, unknown>, context: Parameters<typeof ledger.command>[1], workflow?: string) =>
		Effect.runPromise(
			ledger.command(
				{
					version: 1,
					authorityEpoch: ledger.status().authorityEpoch,
					commandId: `consumer:${++n}`,
					...(workflow ? { workflow } : {}),
					...(command.type === "saveDocument" ? { expected: { document: null } } : {}),
					command,
				},
				context,
			),
		);
	const C = accepted(await send({ type: "createWorkflow", title: "Consumer" }, admin)).workflow as string;
	const save = async (document: string, text: string) =>
		accepted(
			await send({ type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") }, admin, C),
		).revision as string;
	const base = await save("principles", "Keep exact constraints.\n");
	const refs = { principles: base, instructions: base, policy: base, profile: base };
	const source = await save("existing-seam", "Approved existing seam: exact literal bytes.");
	const catalog = await save(
		"verification",
		"## Ranks\n1. `tests`\n2. `inspection`\n## Launch\nowned\n## Doctor\nnode\n## Channels\ntests\n## Catalog\n| Name | Channel | Kind | Run | Expectations | Rank |\n|---|---|---|---|---|---|\n| read | Tests | executed | `node read.js` | exact bytes | tests |\n## Cleanup\nnone\n## Extend\nowned\n## Traps\nnone\n",
	);
	const ground = await save(
		"ground",
		JSON.stringify({
			schema: 1,
			shape: { value: "bug", origin: "human", confirmed: true },
			goal: "Consume read-fix",
			constraints: [],
			clarifications: [],
			donePredicate: "Literal bytes",
			facts: [],
			approvedSources: [source],
			reproduction: { trigger: "node read.js", observed: "read returned altered bytes" },
			expected: "read returns exact bytes",
		}),
	);
	const policy = (ledger.snapshot(admin) as Frame).policy as { defaultRevision: string; bindings: Record<string, { revision: string }> };
	const directed = ((ledger.snapshot(admin) as Frame).policy as { bindings: Record<string, { policy: string }> }).bindings[W]!.policy;
	accepted(await send({ type: "adoptPolicy", revision: directed, expectedBinding: policy.bindings[C]!.revision }, admin, C));
	const all = () =>
		(ledger.snapshot(admin) as Frame).assignments as {
			id: string;
			generation: number;
			attempt: string;
			packet: { role: string };
			intakeReview?: object;
		}[];
	const start = async (id: string) => {
		const a = all().find((a) => a.id === id)!;
		accepted(
			await send(
				{ type: "stageTask", assignment: a.id, generation: a.generation, attempt: a.attempt, executorEpoch: ledger.status().executorEpoch },
				scheduler,
				C,
			),
		);
		return mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: a.packet.role as never,
		});
	};
	const coordinator = accepted(
		await send(
			{
				type: "assignTask",
				slice: "design",
				delivery: false,
				packet: packet({
					...refs,
					inputs: [ground, source, catalog],
					requests: [{ key: "fidelity", packet: packet({ ...refs, role: "challenger" }) }],
				}),
			},
			scheduler,
			C,
		),
	).assignment as string;
	const actor = await start(coordinator);
	const manifest = {
		schema: 1,
		shape: "bug",
		ground,
		sources: [source],
		decisions: [],
		catalog,
		breakdown: null,
		reproduction: { obligation: "B1", observed: "read returned altered bytes", expected: "read returns exact bytes" },
		slices: [
			{
				id: "cross",
				title: "Consume read-fix",
				record: false,
				delegated: [],
				forbidden: [],
				obligations: [{ id: "B1", kind: "behavior", text: "Read exact bytes", sources: [] }],
			},
		],
		checks: [{ id: "read", row: "read", kind: "executed", rank: "tests", new: false, run: "node read.js", expectations: "exact bytes" }],
		mapping: [{ slice: "cross", obligation: "B1", checks: ["read"] }],
		dependencies: [],
		responses: [],
		unresolved: [],
	};
	const intake = accepted(await send({ type: "stageIntake", expected: null, text: "# Contract\nConsume.\n", manifest }, actor, C))
		.intake as string;
	const review = accepted(await send({ type: "requestIntakeReview", intake, key: "fidelity" }, actor, C)).assignment as string;
	const reviewer = await start(review);
	const report = accepted(
		await send(
			{
				type: "submitRoleResult",
				text: JSON.stringify({
					schema: 1,
					...all().find((a) => a.id === review)!.intakeReview,
					checks: { omitted: "Compared", weakened: "Compared", strengthened: "Compared", contradictory: "Compared", invented: "Compared" },
					findings: [],
				}),
				supports: [],
			},
			reviewer,
			C,
		),
	).report;
	const draft = (views(t).find((v) => v.workflow === C)!.intakes as unknown as { drafts: { annotations: number; policyBinding: string }[] })
		.drafts[0]!;
	accepted(
		await send(
			{ type: "acceptIntake", intake, review: report, annotations: draft.annotations, policyBinding: draft.policyBinding, decisions: [] },
			admin,
			C,
		),
	);
	const contract = viewOf(t, C).intakes.slices[0]!.contract;
	const assign = () =>
		send(
			{
				type: "assignTask",
				slice: "cross",
				delivery: true,
				packet: packet({
					...refs,
					role: "implementer",
					execution: "linux-writer",
					verification: selection(contract),
					inputs: [contract],
					requests: [
						{ key: "standards", packet: packet({ ...refs, role: "audit-standards" }) },
						{ key: "contracts", packet: packet({ ...refs, role: "audit-contracts" }) },
					],
				}),
			},
			scheduler,
			C,
		);
	return { C, assign };
}

test("HM01 only host Effects records merge observations and only a human declares main edges", async () => {
	const t = await associated();
	try {
		for (const [label, context] of [
			["local admin", admin],
			["implementer agent", t.actor],
		] as const)
			refused(await observe(t, listing([mergedItem()]), context), "forbidden_principal", `${label} merge observation`);
		assert.equal(pub(t).main, null);
		for (const [label, context] of [
			["host Effects", effects],
			["scheduling host", scheduler],
			["implementer agent", t.actor],
		] as const)
			refused(await amend(t, [mainEdge("read-next", "read-fix")], context), "forbidden_principal", `${label} amendment`);
		assert.deepEqual(viewOf(t).intakes.dependencies, []);
	} finally {
		await t.close();
	}
});

test("HM02 a main-delivery edge stays blocked on a private ref, a passing review and a ready flag; the observed human merge clears it", async () => {
	const t = await associated();
	try {
		accepted(await amend(t, [mainEdge("read-next", "read-fix")]));
		refused(await assignNext(t), "dependency_blocked", "private qualifying ref and passing review");
		accepted(await observe(t, listing([{ ...mergedItem(), state: "open", merge: null }])));
		refused(await assignNext(t), "dependency_blocked", "a ready flag is not main integration");
		assert.equal(viewOf(t).blocker?.code, "dependency_blocked");
		const seen = accepted(await observe(t, listing([mergedItem()]))).observation as string;
		assert.deepEqual(pub(t).main, { pr: PR, source: R1, commit: M, observation: seen, canonical: R1, uncovered: [] });
		accepted(await assignNext(t));
		assert.notEqual(viewOf(t).blocker?.code, "dependency_blocked");
	} finally {
		await t.close();
	}
});

test("HM03 a merged label without a complete main mapping records nothing and keeps the edge blocked", async () => {
	const t = await associated();
	try {
		accepted(await amend(t, [mainEdge("read-next", "read-fix")]));
		for (const [label, seen] of [
			["incomplete listing", listing([mergedItem()], false)],
			["merged outside main", listing([mergedItem({ merge: { main: false, commit: M } })])],
			["no merge mapping", listing([mergedItem({ merge: null })])],
		] as const) {
			accepted(await observe(t, seen));
			assert.equal(pub(t).main, null, `${label}: an incomplete listing or a merge outside main is not main integration`);
			assert.equal(typeof pub(t).mainUnknown, "string", `${label}: the observation blocker is named`);
			assert.ok(pub(t).choices.includes("recheck"), `${label}: re-observation is offered`);
			refused(await assignNext(t), "dependency_blocked", label);
		}
	} finally {
		await t.close();
	}
});

test("HM04 an older or foreign merged source names both sources and the uncovered Slices", async () => {
	for (const [label, source, uncovered] of [
		["older published head", R1, ["read-next"]],
		["foreign head", FOREIGN, ["read-fix", "read-next"]],
	] as const) {
		const t = await associated();
		try {
			await integrateNext(t);
			const seen = accepted(await observe(t, listing([mergedItem({ head: source })]))).observation as string;
			assert.deepEqual(
				pub(t).main,
				{ pr: PR, source, commit: M, observation: seen, canonical: R2, uncovered },
				`${label}: older merged source leaves its later Slices uncovered`,
			);
		} finally {
			await t.close();
		}
	}
});

test("HM05 a cross-proposal edge clears only on the prerequisite's observed main merge; inclusion is unavailable; scope holds", async () => {
	const t = await associated();
	try {
		const { C, assign } = await consumer(t);
		refused(
			await amend(t, [{ slice: "cross", requires: "read-fix", kind: "inclusion", workflow: W }], admin, C),
			"capability_unavailable",
			"separately reviewed inclusion",
		);
		const enrolled = await Effect.runPromise(
			t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: "enroll:consumer",
					command: { type: "enrollDevice", label: "consumer", scope: { workflows: [C] } },
				},
				admin,
			),
		);
		assert.ok(enrolled.status === "accepted" && enrolled.credential);
		const device = t.f.ledger.authenticate(`Bearer ${enrolled.credential.bearer}`)!;
		refused(await amend(t, [mainEdge("cross", "read-fix")], device, C), "forbidden_scope", "edge outside device scope");
		accepted(await amend(t, [mainEdge("cross", "read-fix")], admin, C));
		refused(await assign(), "dependency_blocked", "a prerequisite's private ref and passing review clear no cross-proposal edge");
		const scoped = views(t, device);
		assert.deepEqual(
			scoped.map((v) => v.workflow),
			[C],
		);
		assert.equal(scoped[0]!.blocker?.code, "dependency_blocked");
		for (const secret of [R1, PR]) assert.ok(!JSON.stringify(scoped).includes(secret), `the consumer view omits ${secret}`);
		accepted(await observe(t, listing([mergedItem()])));
		accepted(await assign());
	} finally {
		await t.close();
	}
});

test("HM06 a lost observation reply recovers once; later observations never replace the recorded mapping", async () => {
	const t = await associated();
	try {
		accepted(await amend(t, [mainEdge("read-next", "read-fix")]));
		const first = (await observe(t, listing([mergedItem()]), effects, "merge-observation")) as CommandReply;
		const again = (await observe(t, listing([mergedItem()]), effects, "merge-observation")) as CommandReply;
		assert.ok(first.status === "accepted" && again.status === "accepted");
		assert.equal(again.duplicate, true);
		assert.equal(again.sequence, first.sequence);
		const recorded = pub(t).main;
		accepted(await observe(t, listing([mergedItem({ merge: { main: true, commit: FOREIGN } })])));
		assert.deepEqual(pub(t).main, recorded, "the first accepted mapping is kept");
		accepted(await observe(t, listing([], false)));
		assert.deepEqual(pub(t).main, recorded, "an incomplete listing keeps the first accepted mapping");
		accepted(await assignNext(t));
	} finally {
		await t.close();
	}
});

test("HM07 the merge mapping survives reopen and export; a fresh client reads the handover", async () => {
	const t = await associated();
	try {
		accepted(await amend(t, [mainEdge("read-next", "read-fix")]));
		const seen = accepted(await observe(t, listing([mergedItem()]))).observation as string;
		const next = accepted(await assignNext(t)).assignment as string;
		const before = pub(t).main;
		await t.f.reopen(new LedgerOnlyEngine());
		assert.deepEqual(pub(t).main, before);
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.deepEqual(JSON.parse(Buffer.from(String(exported.content[seen]), "base64").toString()).proposals.items[0].merge, {
			main: true,
			commit: M,
		});
		const v = viewOf(t);
		assert.equal(v.commitment.status, "accepted");
		assert.ok(v.owner.assignments.some((a) => (a as { id?: string }).id === next));
		assert.equal(v.evidence.status, "available");
		assert.notEqual(v.blocker?.code, "dependency_blocked");
		assert.ok(v.nextHumanAction.type);
	} finally {
		await t.close();
	}
});

test("HM08 once the human merge is observed, a deleted branch stages and admits no further forge operation", async () => {
	const t = await associated();
	try {
		const summary = accepted(await t.f.command({ type: "stageForgeOperation", kind: "update-summary" }, effects)).operation as string;
		accepted(await observe(t, { head: { commit: null }, ...listing([mergedItem()]) }));
		assert.equal(pub(t).main?.source, R1);
		for (const kind of ["publish-source", "update-summary"])
			refused(
				await t.f.command({ type: "stageForgeOperation", kind }, effects),
				"stale_basis",
				`${kind}: a delivered proposal publishes nothing more`,
			);
		refused(
			await t.f.command({ type: "admitForgeOperation", operation: summary }, effects),
			"stale_basis",
			"a planned operation is never admitted after the merge",
		);
	} finally {
		await t.close();
	}
});

test("HM09 an observed human merge or a recorded divergence never leaves the summary stale, so reconciles stop rescheduling forge reads", async () => {
	const t = await associated();
	try {
		accepted(await observe(t, listing([mergedItem()])));
		assert.equal(pub(t).main?.source, R1);
		assert.equal(pub(t).summaryStale, false, "the merged PR's summary is final: no further update or read is scheduled");
	} finally {
		await t.close();
	}
	const d = await associated();
	try {
		accepted(await observe(d, { head: { commit: FOREIGN } }));
		assert.equal(pub(d).divergence?.head, FOREIGN);
		assert.equal(pub(d).summaryStale, false, "a divergent head blocks the summary: no reconcile reschedules publication");
	} finally {
		await d.close();
	}
});
