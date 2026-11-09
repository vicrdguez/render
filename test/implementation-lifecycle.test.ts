import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import type { TaskId } from "@earendil-works/pi-durable";
import { type Command, change, type KernelState, type Principal, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { ImplementationPass, RoleAssignment, RolePacket } from "../src/kernel/roles.ts";
import { parseEnvelope } from "../src/ledger/envelope.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import {
	accepted,
	acceptedImplementation,
	assessment,
	capture,
	damageImplementation,
	implementationLifecycle,
	implementationTasks,
	LedgerOnlyEngine,
	selection,
} from "./support/implementation.ts";
import { ground, saveGround } from "./support/investigation.ts";
import { decision } from "./support/kernel.ts";
import { admin, packet } from "./support/roles.ts";

const scheduling: Principal = { kind: "host", scope: "scheduling" };
const effects: Principal = { kind: "host", scope: "effects" };
const humanOwner: Principal = { kind: "human", human: "owner", route: "local-admin" };
function pure(overrides: Partial<RolePacket> = {}) {
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
					review: "review:fixture",
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
		...overrides,
	});
	function command(c: Record<string, unknown>, principal: Principal = scheduling, extra: Record<string, unknown> = {}) {
		sequence++;
		const before = structuredClone(state);
		const result = decision(
			change(
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
			),
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
	const supersede = () => {
		state = {
			...state,
			intakes: { ...state.intakes!, slices: state.intakes!.slices.map((s) => ({ ...s, status: "superseded" as const })) },
		};
	};
	return { command, ok, own, owner, id, first, writer, assignments, start, retain, audit, reports, pass, supersede, state: () => state };
}

test("trusted mutable execution admission invalidates final B, not the retained workspace or Audit", () => {
	const f = pure();
	f.audit();
	f.reports([]);
	const B = f.retain("final");
	const before = structuredClone(f.pass());
	const execution = { type: "recordImplementationExecution", assignment: f.id, generation: 1, attempt: f.own(f.id).attempt };
	const admitted = f.command(execution, effects);
	const handoff = { type: "submitImplementationHandoff", text: "Raw caller handoff", dispositions: [], verification: assessment };
	assert.equal(f.command(handoff, f.owner).outcome, "refused", "new mutable execution cannot submit the obsolete captured B");
	assert.equal(admitted.outcome, "accepted");
	assert.equal(f.pass().captureB, undefined);
	assert.deepEqual({ ...f.pass(), captureB: B }, before);
	assert.equal(f.pass().workspace, B, "retained recovery snapshot remains available, but is not current final evidence");
	if (admitted.outcome !== "accepted") throw Error("unreachable");
	const fact = admitted.writes.find((w) => w.type === "fact.record");
	assert.ok(fact?.type === "fact.record");
	assert.equal(fact.refs.source, B, "the admission retains its invalidated source identity in history");
	const next = f.retain("final");
	assert.notEqual(next, B);
	f.ok(handoff, f.owner);
	const sealed = structuredClone(f.pass());
	assert.equal(f.command(execution, effects).outcome, "refused", "handoff cannot be reopened by execution admission");
	assert.deepEqual(f.pass(), sealed);
});

test("superseded Contract refuses a successor pass after an otherwise valid handoff", () => {
	const f = pure();
	f.audit();
	f.reports([]);
	const B = f.retain("final");
	f.ok({ type: "submitImplementationHandoff", text: "Sealed", dispositions: [], verification: assessment }, f.owner);
	f.ok({
		type: "recordQuiescence",
		assignment: f.id,
		generation: 1,
		attempt: f.own(f.id).attempt,
		providerIdle: true,
		environment: "stopped",
		effects: "reconciled",
	});
	f.supersede();
	const before = structuredClone(f.state().roleWork!.passes);
	const reply = f.command(
		{
			type: "openSuccessorPass",
			assignment: f.id,
			generation: 1,
			attempt: f.own(f.id).attempt,
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
		},
		effects,
	);
	assert.equal(reply.outcome === "refused" && reply.code, "contract_superseded");
	assert.deepEqual(f.state().roleWork!.passes, before);
});

test("untrusted, stale-epoch and revoked execution admission cannot invalidate final evidence", () => {
	const f = pure();
	f.audit();
	f.reports([]);
	f.retain("final");
	const before = structuredClone(f.pass());
	const execution = { type: "recordImplementationExecution", assignment: f.id, generation: 1, attempt: f.own(f.id).attempt };
	for (const principal of [f.owner, scheduling, { kind: "human", human: "owner", route: "local-admin" } as Principal]) {
		assert.equal(f.command(execution, principal).outcome, "refused");
		assert.deepEqual(f.pass(), before);
	}
	for (const command of [
		{ ...execution, generation: 0 },
		{ ...execution, attempt: "old-attempt" },
	]) {
		assert.equal(f.command(command, effects).outcome, "refused");
		assert.deepEqual(f.pass(), before);
	}
	assert.equal(f.command(execution, effects, { executorEpoch: "new-executor" }).outcome, "refused");
	assert.deepEqual(f.pass(), before);
	f.ok(
		{ type: "cancelWork", assignment: f.id, generation: 1, attempt: f.own(f.id).attempt },
		{ kind: "human", human: "owner", route: "local-admin" },
	);
	assert.equal(f.command({ ...execution, generation: f.own(f.id).generation }, effects).outcome, "refused");
	assert.equal(f.command(execution, effects).outcome, "refused");
	assert.deepEqual(f.pass(), before);
});

test("execution admission envelope has a closed host-effects shape", () => {
	const command = { type: "recordImplementationExecution", assignment: "a", generation: 1, attempt: "attempt" };
	const envelope = { version: 1, authorityEpoch: "authority", commandId: "execution", workflow: "w", command };
	assert.equal("status" in parseEnvelope(envelope), false);
	for (const invalid of [
		{ ...command, generation: 0 },
		{ ...command, attempt: "" },
		{ ...command, executorEpoch: "caller-selected" },
		{ ...command, source: "caller-selected" },
	]) {
		const parsed = parseEnvelope({ ...envelope, command: invalid });
		assert.ok("status" in parsed && parsed.status === "refused");
	}
});

test("real Ledger execution admission refuses raw obsolete-B handoff and preserves exact prior evidence through reopen", async () => {
	const t = await implementationLifecycle();
	try {
		await t.audit();
		await t.reports();
		const B = await t.retain("final");
		const pass = () => ((t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[])[0]!;
		const before = structuredClone(pass());
		const execution = { type: "recordImplementationExecution", assignment: t.id, generation: 1, attempt: t.owner().attempt };
		const admission = await t.f.command(execution, mintContext(effects), "execute-after-final");
		const refused = await t.f.command(t.handoff, t.actor, "obsolete-b-handoff");
		assert.equal(refused.status, "refused", "raw handoff must not bypass Engine recapture");
		accepted(admission);
		assert.equal(pass().captureB, undefined);
		assert.equal(pass().workspace, B);
		assert.equal(pass().captureA, before.captureA);
		assert.deepEqual(pass().audit, before.audit);
		const source = await t.f.ledger.artifact(t.actor, { read: B });
		assert.ok("content" in source);
		const next = await t.retain("final");
		assert.notEqual(next, B);
		accepted(await t.f.command(t.handoff, t.actor, "current-b-handoff"));
		assert.equal((await t.f.command(execution, mintContext(effects))).status, "refused");
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(pass().captureB, next);
		assert.equal(pass().captureA, before.captureA);
		assert.deepEqual(pass().audit, before.audit);
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.equal(Buffer.from(exported.content[B]!, "base64").toString(), source.content.toString());
		assert.ok(exported.content[next]);
		const facts = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.ok(facts.some((record) => record.command === "recordImplementationExecution" && record.refs?.source === B));
	} finally {
		await t.close();
	}
});

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

// An accepted pass is constructed from a usable owner and reviewers; every unusable configuration stays out of Kernel state.
test("accepted pass refuses an owner or Audit reviewers its lifecycle cannot use before retaining anything, and the Slice stays assignable", async () => {
	const engine = new LedgerOnlyEngine();
	const t = await acceptedImplementation(engine);
	try {
		const experimentGround = await saveGround(t.f.ledger, ground, t.ground, "experiment-ground");
		const protocol = accepted(
			await t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: "audit-experiment-protocol",
					workflow: "workflow:2",
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "audit-experiment-protocol",
						mediaType: "text/plain",
						content: Buffer.from(
							JSON.stringify({
								schema: 1,
								ground: experimentGround,
								question: "Does the candidate preserve exact bytes?",
								hypothesis: "Bytes match",
								falsifier: "Any changed byte",
								decisionRule: "Accept only exact equality",
								controls: ["Same input"],
								fixtures: ["Literal bytes"],
								failureCases: ["Missing output is inconclusive"],
								retainedOutputs: ["Exact output and limitations"],
								budget: { maxCommands: 4, timeoutMs: 1000 },
								profile: { image: `sha256:${"0".repeat(64)}`, exclusions: [".git"], maxBytes: 1048576, maxEntries: 1000 },
								source: { repository: "owned", commit: "a".repeat(40) },
								candidates: ["favorite", "control"],
							}),
						).toString("base64"),
					},
				},
				admin,
			),
		).revision as string;
		const standards = packet({ role: "audit-standards" });
		const contracts = packet({ role: "audit-contracts" });
		const pair = (left: Partial<RolePacket>, right: Partial<RolePacket> = {}) => [
			{ key: "standards", packet: { ...standards, ...left } },
			{ key: "contracts", packet: { ...contracts, ...right } },
		];
		const investigation = { ground: t.ground, repository: "owned", commit: "a".repeat(40), paths: ["src/read.ts"] };
		const selected = selection(t.contract);
		const choose = (change: Partial<typeof selected>) => ({ verification: { ...selected, ...change } });
		const incompatible: [string, Partial<RolePacket>][] = [
			["owner without a verification selection", { verification: undefined }],
			["read-only owner", { execution: "read-only" }],
			["selection without rows", choose({ rows: [] })],
			["selection without behavioral rows", choose({ behavioralRows: [] })],
			["selection repeating a row", choose({ rows: [...selected.rows, "lint"] })],
			["selection repeating a behavioral row", choose({ behavioralRows: ["read", "read"] })],
			["selection missing a required row", choose({ rows: ["full-suite", "typecheck", "read"] })],
			["behavioral row outside the selected rows", choose({ behavioralRows: ["other"] })],
			["selection naming another retained document", choose({ contract: t.ground })],
			["traversing catalog path", choose({ path: "../verify.md" })],
			["absolute catalog path", choose({ path: "/verify.md" })],
			["catalog path inside Git metadata", choose({ path: ".git/verify.md" })],
			["standards reviewer freezing a verifier before A", { requests: pair({ verification: selected }) }],
			["contracts reviewer freezing a verifier before A", { requests: pair({}, { verification: selected }) }],
			["standards reviewer with an unusable selection", { requests: pair({ verification: { ...selected, rows: [] } }) }],
			["standards experiment candidate", { requests: pair({ experiment: { protocol, candidate: "favorite" } }) }],
			["contracts experiment candidate", { requests: pair({}, { experiment: { protocol, candidate: "favorite" } }) }],
			["standards experiment comparison", { requests: pair({ experiment: { protocol, candidate: null } }) }],
			["contracts experiment comparison", { requests: pair({}, { experiment: { protocol, candidate: null } }) }],
			["writer standards reviewer", { requests: pair({ execution: "linux-writer" }) }],
			["writer contracts reviewer", { requests: pair({}, { execution: "linux-writer" }) }],
			["nested reviewer request", { requests: pair({ requests: [{ key: "nested", packet: packet({ role: "challenger" }) }] }) }],
			["investigating reviewer", { requests: pair({ investigation }) }],
			["reviewer outside its required family", { requests: pair({}, { family: "review", requiredFamily: "other" }) }],
			["no reviewers", { requests: [] }],
			["missing contracts axis", { requests: [{ key: "standards", packet: standards }] }],
			["missing standards axis", { requests: [{ key: "contracts", packet: contracts }] }],
			[
				"duplicate standards axis",
				{
					requests: [
						{ key: "standards", packet: standards },
						{ key: "again", packet: standards },
						{ key: "contracts", packet: contracts },
					],
				},
			],
			["unrelated requested role", { requests: [...pair({}), { key: "extra", packet: packet({ role: "challenger" }) }] }],
			["owner that may not request Audit roles", { role: "coordinator", execution: "read-only" }],
		];
		const writer = t.writer({ verification: selection(t.contract) });
		const slice = () =>
			(
				(t.f.ledger.snapshot(admin) as Frame).workflows as {
					workflow: string;
					intakes: { slices: { id: string; everAssigned: boolean }[] };
				}[]
			)
				.find((w) => w.workflow === "workflow:2")!
				.intakes.slices.find((s) => s.id === "read-fix")!;
		const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const ids = t.assignments().map((assignment) => assignment.id);
		const tasks = await implementationTasks(engine.harness);
		const refuseAll = async () => {
			for (const [name, overrides] of incompatible) {
				const reply = await t.f.command({ type: "assignTask", slice: "read-fix", delivery: true, packet: { ...writer, ...overrides } });
				assert.equal(reply.status === "refused" && reply.code, "invalid_content", `${name}: ${JSON.stringify(reply)}`);
				assert.deepEqual(passes(), [], `${name}: no pass exists to strand`);
				assert.deepEqual(
					t.assignments().map((assignment) => assignment.id),
					ids,
					`${name}: no owner or reviewer is staged`,
				);
				assert.equal(slice().everAssigned, false, `${name}: refusal does not consume the accepted Slice`);
			}
			assert.deepEqual(await implementationTasks(engine.harness), tasks);
		};
		await refuseAll();
		await t.f.reopen(engine);
		await refuseAll();

		// Independent experiment work keeps its own authority beside the refused reviewers.
		const experiment = accepted(
			await t.f.command({
				type: "assignTask",
				slice: "independent-experiment",
				delivery: false,
				packet: packet({ role: "experiment-candidate", execution: "linux-writer", experiment: { protocol, candidate: "favorite" } }),
			}),
		);
		const independent = t.assignments().find((assignment) => assignment.id === experiment.assignment)!;
		assert.deepEqual(independent.packet.experiment, { protocol, candidate: "favorite" });
		assert.equal(independent.passRef, undefined);
		assert.deepEqual(passes(), []);

		// The correction is an ordinary first assignment, and that pass reaches its one Audit across a reopen.
		const id = accepted(await t.f.command({ type: "assignTask", slice: "read-fix", delivery: true, packet: writer })).assignment as string;
		assert.deepEqual(passes()[0]!.configuration.verification, selected);
		assert.deepEqual(
			Object.entries(passes()[0]!.configuration.reviewers).map(([axis, reviewer]) => [
				axis,
				reviewer.key,
				reviewer.packet.role,
				reviewer.packet.execution,
			]),
			[
				["standards", "arbitrary-left", "audit-standards", "read-only"],
				["contracts", "arbitrary-right", "audit-contracts", "read-only"],
			],
		);
		let actor = await t.start(id);
		const owner = () => t.assignments().find((assignment) => assignment.id === id)!;
		accepted(
			await t.f.command(
				{
					type: "recordImplementationSource",
					assignment: id,
					generation: 1,
					attempt: owner().attempt,
					kind: "audit",
					text: JSON.stringify(capture(owner(), t.f.ledger.status().executorEpoch, t.contract)),
				},
				mintContext(effects),
			),
		);
		await t.f.reopen(engine);
		assert.deepEqual(passes()[0]!.configuration.verification, selected, "ordinary restart keeps the accepted configuration");
		accepted(
			await t.f.command({
				type: "rebindAttempt",
				assignment: id,
				generation: 1,
				attempt: owner().attempt,
				providerIdle: true,
				environment: "stopped",
				effects: "reconciled",
				executorEpoch: t.f.ledger.status().executorEpoch,
			}),
		);
		actor = await t.start(id);
		const audit = accepted(await t.f.command({ type: "requestImplementationAudit" }, actor));
		const children = t.assignments().filter((assignment) => assignment.parent === id);
		assert.deepEqual(children.map((child) => [child.id, child.requestKey, child.packet.role, child.packet.execution]).sort(), [
			[audit.contracts, "arbitrary-right", "audit-contracts", "read-only"],
			[audit.standards, "arbitrary-left", "audit-standards", "read-only"],
		]);
		assert.deepEqual(
			children.map((child) => child.packet.verification),
			[undefined, undefined],
			"reviewers receive the verifier retained with A",
		);
	} finally {
		await t.close();
	}
});

test("Audit keeps checking current family authority dynamically, and a replacement owner can satisfy it", () => {
	const f = pure({ family: "review", requiredFamily: "review" });
	f.retain("audit");
	const refused = f.command({ type: "requestImplementationAudit" }, f.owner);
	assert.equal(refused.outcome === "refused" && refused.code, "capability_unavailable");
	assert.equal(f.pass().audit, undefined, "refusal must not consume the one Audit invocation");
	assert.deepEqual(
		f.assignments().map((a) => a.id),
		[f.id],
		"neither axis may be staged",
	);
	const cancelled = f.ok({ type: "cancelWork", assignment: f.id, generation: 1, attempt: f.own(f.id).attempt }, humanOwner);
	const identity = { assignment: f.id, generation: cancelled.result.generation, attempt: f.own(f.id).attempt };
	f.ok({ type: "recordQuiescence", ...identity, providerIdle: true, environment: "stopped", effects: "reconciled" });
	const next = f.ok({ type: "replaceTask", ...identity, packet: { ...f.writer, family: "claude", requiredFamily: "claude" } }).result
		.assignment as string;
	assert.equal(f.pass().assignment, next);
	const audit = f.ok({ type: "requestImplementationAudit" }, f.start(next));
	assert.equal(f.pass().audit?.ref, audit.result.audit);
	assert.equal(f.assignments().filter((a) => a.parent === next).length, 2);
});

test("replacement cannot change a pass's frozen configuration or turn a reviewer into other work", () => {
	const f = pure();
	f.audit();
	const cancel = (a: RoleAssignment) => {
		const stopped = f.ok({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, humanOwner);
		const identity = { assignment: a.id, generation: stopped.result.generation, attempt: a.attempt };
		f.ok({ type: "recordQuiescence", ...identity, providerIdle: true, environment: "stopped", effects: "reconciled" });
		return identity;
	};
	const frozen = structuredClone(f.pass().configuration);
	const reviewer = f.assignments().find((a) => a.packet.role === "audit-standards")!;
	const stoppedReviewer = cancel(reviewer);
	for (const changed of [
		{ experiment: { protocol: "protocol:1", candidate: "favorite" } },
		{ investigation: { ground: "ground:1", repository: "owned", commit: "a".repeat(40), paths: ["src/read.ts"] } },
		{ execution: "linux-writer" },
		{ requests: [{ key: "nested", packet: packet({ role: "challenger" }) }] },
		{ verification: selection("contract:accepted") },
		{ family: "other" },
	])
		assert.equal(f.command({ type: "replaceTask", ...stoppedReviewer, packet: { ...reviewer.packet, ...changed } }).outcome, "refused");
	const stoppedOwner = cancel(f.own(f.id));
	const [left, right] = f.writer.requests;
	const swapped = { ...f.writer, requests: [{ ...left!, packet: { ...left!.packet, model: "other-model" } }, right!] };
	const refused = f.command({ type: "replaceTask", ...stoppedOwner, packet: swapped });
	assert.equal(refused.outcome === "refused" && refused.code, "forbidden_scope");
	const chosen = selection("contract:accepted");
	for (const changed of [
		{ verification: undefined },
		{ verification: { ...chosen, rows: [...chosen.rows, "extra"] } },
		{ verification: { ...chosen, path: "../verify.md" } },
		{ execution: "read-only" },
		{ role: "coordinator" },
	]) {
		const reply = f.command({ type: "replaceTask", ...stoppedOwner, packet: { ...f.writer, ...changed } });
		assert.equal(reply.outcome === "refused" && reply.code, "forbidden_scope", JSON.stringify(changed));
	}
	assert.deepEqual(f.pass().configuration, frozen);
	const next = f.ok({ type: "replaceTask", ...stoppedOwner, packet: f.writer }).result.assignment as string;
	assert.equal(f.pass().assignment, next);
	assert.deepEqual(f.pass().configuration, frozen);
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
	const B = f.retain("final");
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
		f.command({ type: "recordImplementationExecution", assignment: a.id, generation: 1, attempt: a.attempt }, effects).outcome,
		"refused",
	);
	assert.equal(f.pass().captureB, B, "policy adoption cannot authorize evidence invalidation by the old execution");
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

test("queued Audit exports both exact child packets before any runtime archive", async () => {
	const t = await implementationLifecycle();
	try {
		await t.audit();
		const children = t.assignments().filter((a) => a.parent === t.id);
		assert.equal(children.length, 2);
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const child of children) {
			assert.equal(child.status, "queued");
			assert.equal(child.runtimeHistory, undefined);
			assert.equal(Buffer.from(exported.content[child.packetRef] ?? "", "base64").toString(), JSON.stringify(child.packet));
		}
	} finally {
		await t.close();
	}
});

for (const axis of ["audit-standards", "audit-contracts"])
	for (const failure of ["missing_content", "content_corrupt"] as const) {
		test(`queued Audit ${axis} packet ${failure} makes export incomplete without runtime history`, async () => {
			const t = await implementationLifecycle();
			try {
				await t.audit();
				const child = t.assignments().find((a) => a.parent === t.id && a.packet.role === axis)!;
				assert.equal(child.status, "queued");
				assert.equal(child.runtimeHistory, undefined);
				damageImplementation(t.f.data, child.packetRef, failure);
				await t.f.reopen(new LedgerOnlyEngine());
				const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
				assert.ok("manifest" in exported);
				assert.equal(exported.manifest.complete, false);
				assert.ok(exported.manifest.missing.some((gap) => gap.ref === child.packetRef && gap.code === failure));
				assert.equal(child.packetRef in exported.content, false);
			} finally {
				await t.close();
			}
		});
	}

test("preparation blockage retains exact immutable task/reason history independently of null runtime result", async () => {
	const t = await implementationLifecycle();
	try {
		await t.audit();
		await t.reports();
		await t.retain("final");
		const handoff = accepted(await t.f.command(t.handoff, t.actor, "handoff-once"));
		const command = {
			type: "recordPreparationBlocker",
			assignment: t.id,
			generation: 1,
			attempt: t.owner().attempt,
			reason: "Preparation unavailable: exact blocker\\r\\nNo Watchdog capability.",
		};
		const blocked = accepted(await t.f.command(command));
		assert.equal(typeof blocked.preparationResult, "string", "blocker needs an immutable result document");
		const ref = blocked.preparationResult as string;
		const expected = {
			schema: 1,
			passRef: t.owner().passRef,
			handoff: handoff.handoff,
			task: handoff.preparationTask,
			reason: command.reason,
		};
		const read = await t.f.ledger.artifact(t.actor, { read: ref });
		assert.ok("content" in read, "implementer can read its own preparation outcome");
		assert.deepEqual(JSON.parse(read.content.toString()), expected);
		const reviewer = t.assignments().find((a) => a.parent === t.id)!;
		assert.ok("code" in (await t.f.ledger.artifact(t.agent(reviewer), { read: ref })));
		const cutoff = await t.f.ledger.observe(admin, { history: { workflow: "workflow:2", limit: "1" } });
		assert.ok("next" in cutoff && cutoff.next);
		const later = accepted(await t.f.command({ ...command, reason: "A later operational retry is still blocked." }));
		assert.notEqual(later.preparationResult, ref, "each outcome has an independent immutable identity");
		assert.equal(t.owner().status, "submitted");
		assert.equal(t.owner().executing, true, "blockage cannot release ownership");
		const original = await t.f.ledger.artifact(admin, { read: ref });
		assert.ok("content" in original);
		assert.deepEqual(JSON.parse(original.content.toString()), expected);
		const frozen = await t.f.ledger.artifact(admin, { export: { cursor: cutoff.next } });
		assert.ok("manifest" in frozen && frozen.manifest.complete);
		assert.deepEqual(JSON.parse(Buffer.from(frozen.content[ref]!, "base64").toString()), expected);
		assert.equal((later.preparationResult as string) in frozen.content, false);
		const reopened = new LedgerOnlyEngine();
		await t.f.reopen(reopened);
		let task = await reopened.harness.getTask(handoff.preparationTask as TaskId, ctx);
		for (let tries = 0; tries < 100 && task?.state.status !== "terminal"; tries++) {
			await setTimeout(10);
			task = await reopened.harness.getTask(handoff.preparationTask as TaskId, ctx);
		}
		assert.ok(task?.state.status === "terminal" && task.state.outcome.status === "completed");
		assert.equal(task.state.outcome.result, null, "runtime result cannot supply the retained blocker");
		const restored = await t.f.ledger.artifact(admin, { read: ref });
		assert.ok("content" in restored);
		assert.equal(restored.content.toString(), read.content.toString());
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.deepEqual(JSON.parse(Buffer.from(exported.content[ref]!, "base64").toString()), expected);
		assert.ok(exported.content[later.preparationResult as string]);
		const history = await t.f.ledger.artifact(admin, { export: { cursor: cutoff.next } });
		assert.ok("manifest" in history);
		assert.equal(history.jsonl, frozen.jsonl);
	} finally {
		await t.close();
	}
});

test("second-axis Durable staging failure rolls back packets, assignments, tasks and accepted receipt; retry creates one Audit", async () => {
	const engine = new LedgerOnlyEngine();
	const t = await implementationLifecycle(engine);
	try {
		const before = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in before && before.manifest.complete);
		const tasks = await implementationTasks(engine.harness);
		const ids = t.assignments().map((a) => a.id);
		engine.failSecondAuditStage = true;
		const failed = await t.f.command({ type: "requestImplementationAudit" }, t.actor, "paired-audit");
		assert.equal(failed.status === "refused" && failed.code, "outcome_unknown");
		const recovered = new LedgerOnlyEngine();
		await t.f.reopen(recovered);
		assert.deepEqual(
			t.assignments().map((a) => a.id),
			ids,
		);
		assert.deepEqual(await implementationTasks(recovered.harness), tasks);
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.deepEqual(Object.keys(exported.content).sort(), Object.keys(before.content).sort(), "neither staged packet nor Audit survived");
		const receipt = await t.f.ledger.receipt(t.actor, "paired-audit");
		assert.ok("code" in receipt && receipt.code === "not_found", "no accepted receipt survived rollback");
		accepted(
			await t.f.command({
				type: "rebindAttempt",
				assignment: t.id,
				generation: 1,
				attempt: t.owner().attempt,
				providerIdle: true,
				environment: "stopped",
				effects: "reconciled",
				executorEpoch: t.f.ledger.status().executorEpoch,
			}),
		);
		await t.start(t.id);
		const audit = await t.audit();
		assert.deepEqual(await t.audit(), audit);
		assert.equal(t.assignments().filter((a) => a.parent === t.id).length, 2);
		assert.equal((await implementationTasks(recovered.harness)).length, tasks.length + 2);
		assert.equal((await t.f.command({ type: "requestImplementationAudit" }, t.actor)).status, "refused");
	} finally {
		await t.close();
	}
});

for (const evidence of ["A", "B", "Audit", "standards-report", "contracts-report"] as const)
	for (const failure of ["missing_content", "content_corrupt"] as const)
		test(`handoff refuses exact ${evidence} ${failure} from real SQLite instead of reconstructing it`, async () => {
			const t = await implementationLifecycle();
			try {
				const audit = await t.audit();
				await t.reports();
				const B = await t.retain("final");
				const ref =
					evidence === "A"
						? t.A
						: evidence === "B"
							? B
							: evidence === "Audit"
								? (audit.auditRecord as string)
								: t
										.assignments()
										.find(
											(a) =>
												a.parent === t.id && a.packet.role === (evidence === "standards-report" ? "audit-standards" : "audit-contracts"),
										)!.report!;
				const tasks = (await implementationTasks(t.f.harness)).length;
				damageImplementation(t.f.data, ref, failure);
				const reopened = new LedgerOnlyEngine();
				await t.f.reopen(reopened);
				const reply = await t.f.command(t.handoff, t.actor, "damaged-handoff");
				assert.equal(reply.status === "refused" && reply.code, failure);
				assert.equal(t.owner().status, "running");
				assert.equal((await implementationTasks(reopened.harness)).length, tasks, "no preparation task staged");
				const receipt = await t.f.ledger.receipt(t.actor, "damaged-handoff");
				assert.ok("code" in receipt && receipt.code === "not_found");
				const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
				assert.ok("manifest" in exported && !exported.manifest.complete);
				assert.ok(exported.manifest.missing.some((gap) => gap.ref === ref && gap.code === failure));
			} finally {
				await t.close();
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
