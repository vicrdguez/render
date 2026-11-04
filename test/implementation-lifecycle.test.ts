import assert from "node:assert/strict";
import { test } from "node:test";
import type { SourceReceipt } from "../src/effects/source.ts";
import { type Command, change, type KernelState, type Principal, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment, RolePacket } from "../src/kernel/roles.ts";
import type { CatalogEvidence, VerificationSelection } from "../src/kernel/verification.ts";
import { parseEnvelope } from "../src/ledger/envelope.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { accepted, acceptedImplementation, LedgerOnlyEngine } from "./support/implementation.ts";
import { admin, packet } from "./support/roles.ts";

const scheduling: Principal = { kind: "host", scope: "scheduling" };
const effects: Principal = { kind: "host", scope: "effects" };
const selection = (contract: string): VerificationSelection => ({
	repository: "owned",
	commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	path: ".render/verify.md",
	digest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	contract,
	rows: ["full-suite", "typecheck", "lint", "read"],
	behavioralRows: ["read"],
	receipts: [],
});
function capture(a: RoleAssignment, epoch: string, contract: string) {
	const source = {
		repository: "owned",
		objectFormat: "sha1" as const,
		commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		tree: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
		root: "refs/render/source/literal",
		entries: [],
	};
	const receipt: SourceReceipt = {
		base: source,
		source,
		freeze: {
			scope: { assignment: a.id, generation: a.generation, attempt: a.attempt, executorEpoch: epoch },
			runtime: "owned-runtime",
			running: false,
		},
		exclusions: [".git"],
		bytes: 0,
		entries: 0,
		deleted: [],
		configurationChanges: [],
		durability: { git: "rooted", fsync: "all", method: "fsync" },
	};
	const selected = selection(contract);
	const evidence: CatalogEvidence = {
		kind: "catalog-check",
		role: "implementer",
		catalog: {
			selection: selected,
			text: "literal selected catalog",
			ranks: ["tests", "inspection"],
			sections: {},
			rows: selected.rows.map((name) => ({
				name,
				channel: "Tests",
				kind: "executed",
				run: "true",
				expectations: "Exact behavior",
				rank: "tests",
				literal: name,
			})),
			cleanup: [],
		},
		results: selected.rows.map((name) => ({
			name,
			status: "completed",
			steps: [
				{
					argv: ["true"],
					exitCode: 0,
					stdout: "",
					stderr: "",
					platform: { os: "linux", cpu: "owned" },
					image: "owned",
					timedOut: false,
					verifierRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				},
			],
		})),
		verification: { status: "needs_assessment", inputCommit: source.commit, inputTree: source.tree, resultTree: source.tree },
		cleanup: { status: "complete", results: [] },
	};
	return { schema: 1, source: receipt, verification: evidence };
}
const assessment = { outcome: "pass", rank: "tests", reason: "Required literal rows independently passed." };
function pure() {
	let sequence = 0;
	let retainedSource: ReturnType<typeof capture> | undefined;
	let state: KernelState = {
		workflow: { id: "workflow:implementation", messageCount: 0 },
		document: null,
		device: null,
		roleWork: { assignments: [] },
		intakes: {
			revision: "acceptance:1",
			drafts: [],
			concerns: [],
			dependencies: [],
			slices: [
				{
					id: "slice",
					contract: "contract:accepted",
					intake: "intake:1",
					acceptance: "acceptance:1",
					everAssigned: false,
					status: "accepted",
					record: false,
					predecessors: [],
				},
			],
		},
	};
	const writer = packet({
		role: "implementer",
		execution: "linux-writer",
		inputs: ["contract:accepted"],
		verification: selection("contract:accepted"),
		requests: [
			{ key: "left", packet: packet({ role: "audit-standards", family: "review", requiredFamily: "review" }) },
			{ key: "right", packet: packet({ role: "audit-contracts", family: "review", requiredFamily: "review" }) },
		],
	});
	function command(c: Record<string, unknown>, principal: Principal = scheduling, extra: Record<string, unknown> = {}) {
		sequence++;
		const before = structuredClone(state);
		const result = change(
			state,
			{ ...c, workflow: state.workflow!.id } as Command,
			{
				principal,
				sequence,
				executorEpoch: "executor:1",
				implementationSource: retainedSource,
				ids: {
					fact: `fact:${sequence}`,
					revision: `revision:${sequence}`,
					assignment: `assignment:${sequence}`,
					attempt: `attempt:${sequence}`,
				},
				...extra,
			} as VerifiedFacts,
		);
		assert.deepEqual(state, before, "Kernel cannot mutate its input");
		if (result.outcome === "accepted")
			for (const write of result.writes) {
				if (write.type === "roles.replace") state = { ...state, roleWork: write.state };
				if (write.type === "intakes.replace") state = { ...state, intakes: write.state };
				if (write.type === "policy.replace") state = { ...state, policy: write.state };
			}
		return result;
	}
	function ok(c: Record<string, unknown>, principal = scheduling, extra = {}) {
		const r = command(c, principal, extra);
		assert.equal(r.outcome, "accepted", JSON.stringify(r));
		if (r.outcome !== "accepted") throw Error("unreachable");
		return r;
	}
	const assignments = () => state.roleWork!.assignments;
	const own = (id: string) => assignments().find((a) => a.id === id)!;
	const agent = (a: RoleAssignment): Principal => ({
		kind: "assignment-agent",
		assignment: a.id,
		generation: a.generation,
		attempt: a.attempt,
		role: a.packet.role,
	});
	function start(id: string) {
		const a = own(id);
		ok({ type: "stageTask", assignment: id, generation: a.generation, attempt: a.attempt, executorEpoch: "executor:1" });
		return agent(own(id));
	}
	const first = ok({ type: "assignTask", slice: "slice", delivery: true, packet: writer }).result;
	const id = first.assignment as string;
	const owner = start(id);
	function retain(kind: "audit" | "final", data = capture(own(id), "executor:1", "contract:accepted")) {
		const result = ok(
			{ type: "recordImplementationSource", assignment: id, generation: 1, attempt: own(id).attempt, kind, text: JSON.stringify(data) },
			effects,
			{ implementationSource: data },
		).result.source as string;
		retainedSource = data;
		return result;
	}
	function audit() {
		retain("audit");
		return ok({ type: "requestImplementationAudit" }, owner);
	}
	function reports(findings = [{ id: "F1", text: "Explain fix", needsHuman: false }]) {
		for (const a of assignments().filter((a) => a.parent === id)) {
			const principal = start(a.id);
			const binding = (own(a.id) as RoleAssignment & { auditReview: object }).auditReview;
			ok(
				{
					type: "submitRoleResult",
					text: JSON.stringify({ schema: 1, ...binding, findings: a.packet.role === "audit-standards" ? findings : [] }),
					supports: [],
				},
				principal,
			);
		}
	}
	const pass = () => state.roleWork!.passes![0]!;
	return { command, ok, own, owner, id, first, writer, assignments, start, retain, audit, reports, pass, state: () => state };
}

test("paired Audit uses literal current pass/A bindings and atomically requests exactly two fresh non-delivery tasks", () => {
	const f = pure();
	assert.equal(f.command({ type: "requestImplementationAudit" }, f.owner).outcome, "refused");
	const A = f.retain("audit");
	const result = f.ok({ type: "requestImplementationAudit" }, f.owner);
	const children = f.assignments().filter((a) => a.parent === f.id);
	assert.deepEqual(children.map((a) => a.packet.role).sort(), ["audit-contracts", "audit-standards"]);
	assert.equal(new Set(children.map((a) => a.id)).size, 2);
	assert.equal(new Set(children.map((a) => a.packetRef)).size, 2);
	for (const child of children) {
		assert.equal(child.delivery, false);
		assert.equal(child.packet.execution, "read-only");
		assert.equal(child.passRef, undefined);
		assert.deepEqual(child.packet.inputs, ["contract:accepted", A]);
		assert.deepEqual((child as RoleAssignment & { auditReview: object }).auditReview, {
			passRef: "pass:workflow:implementation:slice:1",
			audit: result.result.audit,
			source: A,
			contract: "contract:accepted",
		});
	}
	const write = result.writes.find((w) => w.type === "roles.replace")!;
	assert.equal(write.type, "roles.replace");
	if (write.type === "roles.replace")
		assert.deepEqual(
			write.intents.map((i) => i.kind),
			["run-role", "run-role"],
		);
	assert.equal(f.command({ type: "requestImplementationAudit" }, f.owner).outcome, "refused", "no same-pass reaudit with a new command");
	assert.equal(
		f.command(
			{ type: "recordImplementationSource", assignment: f.id, generation: 1, attempt: f.own(f.id).attempt, kind: "audit", text: "{}" },
			effects,
		).outcome,
		"refused",
		"A cannot be replaced",
	);
});

test("Audit report refuses wrong role/pass/source/Contract and malformed or duplicate findings", () => {
	const f = pure();
	f.audit();
	const child = f.assignments().find((a) => a.packet.role === "audit-standards")!;
	const actor = f.start(child.id);
	const binding = (f.own(child.id) as RoleAssignment & { auditReview: Record<string, string> }).auditReview;
	for (const change of [
		{ passRef: "pass:old:1" },
		{ source: "revision:other" },
		{ contract: "contract:other" },
		{ audit: "audit:old" },
		{ findings: null },
		{
			findings: [
				{ id: "same", text: "one", needsHuman: false },
				{ id: "same", text: "two", needsHuman: false },
			],
		},
	]) {
		assert.equal(
			f.command({ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...binding, findings: [], ...change }), supports: [] }, actor)
				.outcome,
			"refused",
			`Audit must refuse mismatched report ${JSON.stringify(change)}`,
		);
	}
	assert.equal(
		f.command({ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...binding, findings: [] }), supports: [] }, {
			...actor,
			role: "audit-contracts",
		} as Principal).outcome,
		"refused",
	);
	assert.equal(f.own(child.id).report, null);
});

test("handoff requires both axes, exact dispositions, fixed B/rechecks and passing final checks; one prepare intent holds execution", () => {
	const f = pure();
	f.audit();
	const B = f.retain("final");
	const final = capture(f.own(f.id), "executor:1", "contract:accepted");
	const handoff = { type: "submitImplementationHandoff", text: "Final implementation\r\n", dispositions: [], verification: assessment };
	assert.equal(f.command(handoff, f.owner, { implementationSource: final }).outcome, "refused");
	f.reports();
	assert.equal(f.command(handoff, f.owner, { implementationSource: final }).outcome, "refused", "missing disposition");
	const report = f.assignments().find((a) => a.packet.role === "audit-standards")!.report!;
	const fixed = { report, finding: "F1", disposition: "fixed", reason: "Exact repair", changes: [B], rechecks: ["read"] };
	for (const disposition of [
		{ ...fixed, rechecks: [] },
		{ ...fixed, changes: ["revision:wrong"] },
		{ ...fixed, disposition: "needs-human" },
		{ ...fixed, reason: "" },
	])
		assert.equal(f.command({ ...handoff, dispositions: [disposition] }, f.owner, { implementationSource: final }).outcome, "refused");
	assert.equal(f.command({ ...handoff, dispositions: [fixed, fixed] }, f.owner, { implementationSource: final }).outcome, "refused");
	const failed = structuredClone(final);
	failed.verification.results[0]!.status = "failed";
	assert.equal(f.command({ ...handoff, dispositions: [fixed] }, f.owner, { implementationSource: failed }).outcome, "refused");
	const result = f.ok({ ...handoff, dispositions: [fixed] }, f.owner, { implementationSource: final });
	const write = result.writes.find((w) => w.type === "roles.replace")!;
	if (write.type !== "roles.replace") throw Error("unreachable");
	assert.deepEqual(write.intents, [{ kind: "prepare-pass", assignment: f.id }]);
	assert.equal(f.own(f.id).status, "submitted");
	assert.equal(f.own(f.id).executing, true);
	assert.equal(f.command({ ...handoff, dispositions: [fixed] }, f.owner, { implementationSource: final }).outcome, "refused");
	f.ok({
		type: "recordPreparationBlocker",
		assignment: f.id,
		generation: 1,
		attempt: f.own(f.id).attempt,
		reason: "preparation_unavailable",
	});
	assert.equal(f.own(f.id).status, "submitted");
	assert.equal((f.pass() as unknown as { handoff: { blocker: string } }).handoff.blocker, "preparation_unavailable");
});

test("unresolved product finding cannot be dismissed by implementer; source host authority and scope are mandatory", () => {
	const f = pure();
	const source = capture(f.own(f.id), "executor:1", "contract:accepted");
	const command = {
		type: "recordImplementationSource",
		assignment: f.id,
		generation: 1,
		attempt: f.own(f.id).attempt,
		kind: "audit",
		text: JSON.stringify(source),
	};
	assert.equal(f.command(command, f.owner, { implementationSource: source }).outcome, "refused");
	assert.equal(f.command(command, scheduling, { implementationSource: source }).outcome, "refused");
	const wrong = structuredClone(source);
	wrong.source.freeze.scope.attempt = "another";
	assert.equal(f.command(command, effects, { implementationSource: wrong }).outcome, "refused");
	f.audit();
	f.reports([{ id: "F1", text: "Product question", needsHuman: true }]);
	f.retain("final");
	const report = f.assignments().find((a) => a.packet.role === "audit-standards")!.report;
	assert.equal(
		f.command(
			{
				type: "submitImplementationHandoff",
				text: "done",
				verification: assessment,
				dispositions: [{ report, finding: "F1", disposition: "dismissed", reason: "I decide", changes: [], rechecks: [] }],
			},
			f.owner,
			{ implementationSource: source },
		).outcome,
		"refused",
	);
});

test("reviewer and implementer replacement retain original Audit and completed axis without widening packet inputs", () => {
	const f = pure();
	f.audit();
	const standards = f.assignments().find((a) => a.packet.role === "audit-standards")!;
	const actor = f.start(standards.id);
	const binding = (standards as RoleAssignment & { auditReview: object }).auditReview;
	f.ok({ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...binding, findings: [] }), supports: [] }, actor);
	const originalReport = f.own(standards.id).report;
	const oldPass = structuredClone(f.pass());
	function cancel(a: RoleAssignment) {
		const result = f.ok(
			{ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt },
			{ kind: "human", human: "owner", route: "local-admin" },
		);
		f.ok({
			type: "recordQuiescence",
			assignment: a.id,
			generation: result.result.generation,
			attempt: a.attempt,
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		});
		return { assignment: a.id, generation: result.result.generation, attempt: a.attempt };
	}
	const incomplete = f.assignments().find((a) => a.packet.role === "audit-contracts")!;
	const old = cancel(incomplete);
	assert.equal(f.command({ type: "replaceTask", ...old, packet: { ...incomplete.packet, role: "audit-standards" } }).outcome, "refused");
	const reviewer = f.ok({ type: "replaceTask", ...old, packet: incomplete.packet }).result.assignment as string;
	assert.deepEqual(
		(f.own(reviewer) as RoleAssignment & { auditReview: object }).auditReview,
		(incomplete as RoleAssignment & { auditReview: object }).auditReview,
	);
	const owner = cancel(f.own(f.id));
	assert.equal(f.command({ type: "requestImplementationAudit" }, f.owner).outcome, "refused");
	assert.equal(
		f.command({ type: "replaceTask", ...owner, packet: { ...f.writer, inputs: ["contract:accepted", "private:other"] } }).outcome,
		"refused",
	);
	const next = f.ok({ type: "replaceTask", ...owner, packet: f.writer }).result.assignment as string;
	assert.equal(f.own(next).passRef, f.first.passRef);
	assert.equal(f.own(standards.id).report, originalReport);
	assert.equal(f.own(reviewer).parent, next);
	assert.deepEqual((f.pass() as unknown as { captureA: string }).captureA, (oldPass as unknown as { captureA: string }).captureA);
	assert.equal(f.command({ type: "requestImplementationAudit" }, f.start(next)).outcome, "refused");
});

test("checkpoint and quiescent writer rebind preserve pass/Audit and refuse unknown quiescence", () => {
	const f = pure();
	f.audit();
	const before = structuredClone(f.pass());
	const a = f.own(f.id);
	const source = capture(a, "executor:1", "contract:accepted");
	f.ok(
		{
			type: "recordImplementationSource",
			assignment: a.id,
			generation: 1,
			attempt: a.attempt,
			kind: "checkpoint",
			text: JSON.stringify(source),
		},
		effects,
		{ implementationSource: source },
	);
	const c = {
		type: "rebindAttempt",
		assignment: a.id,
		generation: 1,
		attempt: a.attempt,
		providerIdle: true,
		environment: "stopped",
		effects: "reconciled",
		executorEpoch: "executor:1",
	};
	assert.equal(f.command({ ...c, environment: "unknown" }, scheduling, { implementationSource: source }).outcome, "refused");
	f.ok(c, scheduling, { implementationSource: source });
	assert.equal(f.own(a.id).status, "queued");
	assert.equal(f.own(a.id).executing, false);
	assert.equal(f.own(a.id).attempt, a.attempt);
	assert.equal(f.own(a.id).passRef, before.ref);
	assert.equal(f.command({ type: "requestImplementationAudit" }, f.start(a.id)).outcome, "refused");
});

test("adopted policy cannot convert the old writer execution into a checkpoint/rebind grant", () => {
	const f = pure();
	f.audit();
	const a = f.own(f.id);
	const source = capture(a, "executor:1", "contract:accepted");
	const human: Principal = { kind: "human", human: "owner", route: "local-admin" };
	const policy = f.ok(
		{
			type: "changePolicy",
			expectedRevision: "policy:initial",
			policy: { completedReviewLimit: 2, reviewerDiversity: "different-family", minimumEvidenceRank: "tests" },
		},
		human,
	).result.policy;
	f.ok(
		{
			type: "adoptPolicy",
			workflow: "workflow:implementation",
			revision: policy,
			expectedBinding: "workflow:implementation:policy:initial",
		},
		human,
	);
	assert.equal(
		f.command(
			{
				type: "recordImplementationSource",
				assignment: a.id,
				generation: 1,
				attempt: a.attempt,
				kind: "checkpoint",
				text: JSON.stringify(source),
			},
			effects,
			{ implementationSource: source },
		).outcome,
		"refused",
	);
	assert.equal(
		f.command(
			{
				type: "rebindAttempt",
				assignment: a.id,
				generation: 1,
				attempt: a.attempt,
				providerIdle: true,
				environment: "stopped",
				effects: "reconciled",
				executorEpoch: "executor:1",
			},
			scheduling,
			{ implementationSource: source },
		).outcome,
		"refused",
	);
});

test("lifecycle envelope parsing rejects malformed nested assessment/disposition/source kind instead of throwing", () => {
	for (const command of [
		{ type: "submitImplementationHandoff", text: "done", verification: null, dispositions: [] },
		{ type: "submitImplementationHandoff", text: "done", verification: assessment, dispositions: [null] },
		{
			type: "submitImplementationHandoff",
			text: "done",
			verification: assessment,
			dispositions: [{ report: "r", finding: "f", disposition: "fixed", reason: "why", changes: null, rechecks: [] }],
		},
		{ type: "requestImplementationAudit", source: "model-selected" },
		{ type: "recordImplementationSource", assignment: "a", generation: 1, attempt: "a", kind: "invented", text: "{}" },
	]) {
		const parsed = parseEnvelope({ version: 1, authorityEpoch: "a", commandId: "id", workflow: "w", command });
		assert.ok("status" in parsed && parsed.status === "refused", JSON.stringify(parsed));
	}
});

test("real Ledger paired staging, scoped immutable sources/reports, handoff dedup, export and ordinary reopen", async () => {
	const t = await acceptedImplementation();
	try {
		const opening = accepted(
			await t.f.command({
				type: "assignTask",
				slice: "read-fix",
				delivery: true,
				packet: t.writer({ verification: selection(t.contract) }),
			}),
		);
		const id = opening.assignment as string;
		const actor = await t.start(id);
		const owner = () => t.assignments().find((a) => a.id === id)!;
		const source = capture(owner(), t.f.ledger.status().executorEpoch, t.contract);
		const host = mintContext(effects);
		const captureCommand = (kind: string) => ({
			type: "recordImplementationSource",
			assignment: id,
			generation: 1,
			attempt: owner().attempt,
			kind,
			text: JSON.stringify(source),
		});
		assert.equal((await t.f.command(captureCommand("audit"), actor)).status, "refused");
		const A = accepted(await t.f.command(captureCommand("audit"), host)).source as string;
		const requested = await t.f.command({ type: "requestImplementationAudit" }, actor, "paired-audit");
		const audit = accepted(requested);
		const again = await t.f.command({ type: "requestImplementationAudit" }, actor, "paired-audit");
		assert.deepEqual(accepted(again), audit);
		assert.equal(again.status === "accepted" && again.duplicate, true);
		assert.equal((await t.f.command({ type: "requestImplementationAudit" }, actor)).status, "refused");
		const children = t.assignments().filter((a) => a.parent === id);
		assert.equal(children.length, 2);
		assert.notEqual(children[0]!.task, children[1]!.task);
		assert.notEqual(children[0]!.conversation, children[1]!.conversation);
		for (const child of children) {
			assert.ok("content" in (await t.f.ledger.artifact(t.agent(child), { read: A })));
			assert.ok("code" in (await t.f.ledger.artifact(t.agent(child), { read: children.find((a) => a.id !== child.id)!.packetRef })));
			const principal = await t.start(child.id);
			const binding = (child as RoleAssignment & { auditReview: object }).auditReview;
			accepted(
				await t.f.command(
					{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...binding, findings: [] }), supports: [] },
					principal,
				),
			);
			accepted(
				await t.f.command({
					type: "recordQuiescence",
					assignment: child.id,
					generation: 1,
					attempt: child.attempt,
					providerIdle: true,
					environment: "absent",
					effects: "reconciled",
				}),
			);
		}
		const B = accepted(await t.f.command(captureCommand("final"), host)).source as string;
		assert.notEqual(B, A, "equal bytes still have independent immutable capture identity");
		const handoff = {
			type: "submitImplementationHandoff",
			text: "Final complete literal handoff\r\n",
			dispositions: [],
			verification: assessment,
		};
		const receipt = await t.f.command(handoff, actor, "handoff-once");
		const result = accepted(receipt);
		assert.equal(owner().status, "submitted");
		assert.equal(owner().executing, true);
		assert.equal(typeof result.preparationTask, "number");
		assert.notEqual(result.preparationTask, owner().task);
		assert.deepEqual(accepted(await t.f.command(handoff, actor, "handoff-once")), result);
		assert.equal((await t.f.command(handoff, actor)).status, "refused");
		const handoffRef = result.handoff as string;
		const retained = await t.f.ledger.artifact(admin, { read: handoffRef });
		assert.ok("content" in retained);
		const body = JSON.parse(retained.content.toString());
		assert.equal(body.text, "Final complete literal handoff\r\n");
		assert.equal(body.captureA, A);
		assert.equal(body.captureB, B);
		assert.ok("content" in (await t.f.ledger.artifact(actor, { read: handoffRef })));
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [
			A,
			B,
			handoffRef,
			audit.auditRecord as string,
			...t
				.assignments()
				.filter((a) => a.parent === id)
				.map((a) => a.report!),
		])
			assert.ok(exported.content[ref], `retained ${ref}`);
		const stale = mintContext({ kind: "assignment-agent", assignment: id, generation: 0, attempt: owner().attempt, role: "implementer" });
		assert.notEqual((await t.f.command(handoff, stale, "handoff-once")).status, "accepted");
		assert.ok("code" in (await t.f.ledger.artifact(stale, { read: handoffRef })));
		accepted(
			await t.f.command({
				type: "recordQuiescence",
				assignment: id,
				generation: 1,
				attempt: owner().attempt,
				providerIdle: true,
				environment: "stopped",
				effects: "reconciled",
			}),
		);
		await t.f.reopen(new LedgerOnlyEngine());
		const restored = await t.f.ledger.artifact(admin, { read: handoffRef });
		assert.ok("content" in restored);
		assert.equal(restored.content.toString(), retained.content.toString());
		assert.deepEqual(accepted(await t.f.command(handoff, actor, "handoff-once")), result);
	} finally {
		await t.close();
	}
});
