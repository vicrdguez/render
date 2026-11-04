import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, change, type KernelState, type Principal, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import { assessment, capture, selection } from "./support/implementation.ts";
import { seeded } from "./support/random.ts";
import { packet } from "./support/roles.ts";

const host: Principal = { kind: "host", scope: "scheduling" };
const human: Principal = { kind: "human", human: "owner", route: "local-admin" };
const workflow = "workflow:implementation";
const contract = "contract:accepted";
const writer = packet({
	role: "implementer",
	execution: "linux-writer",
	inputs: [contract],
	verification: selection(contract),
	requests: [
		{ key: "standards", packet: packet({ role: "audit-standards", family: "review", requiredFamily: "review", inputs: [contract] }) },
		{ key: "contracts", packet: packet({ role: "audit-contracts", family: "review", requiredFamily: "review", inputs: [contract] }) },
	],
});
type Probe = "owner" | "audit" | "handoff" | "stale" | "unknown" | "reload";
const probes: Probe[] = ["owner", "audit", "handoff", "stale", "unknown", "reload"];
function generate(seed: number): Probe[] {
	const random = seeded(seed);
	return Array.from({ length: 8 }, () => probes[Math.floor(random() * probes.length)] as Probe);
}
type Coverage = { resumed: number; partialAudit: number; handoff: number; bindings: Set<string>; returns: Set<string> };
function run(steps: Probe[], coverage?: Coverage): string | undefined {
	try {
		let state: KernelState = {
			workflow: { id: workflow, messageCount: 0 },
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
						contract,
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
		let sequence = 0;
		let source: ReturnType<typeof capture> | undefined;
		function command(c: Record<string, unknown>, principal: Principal = host, expected = "accepted") {
			sequence++;
			const input = { ...c, workflow } as Command;
			const facts = {
				principal,
				sequence,
				executorEpoch: "executor:1",
				implementationSource: [
					"recordImplementationSource",
					"requestImplementationAudit",
					"submitImplementationHandoff",
					"openSuccessorPass",
				].includes(String(c.type))
					? source
					: undefined,
				ids: {
					fact: `fact:${sequence}`,
					assignment: `assignment:${sequence}`,
					attempt: `attempt:${sequence}`,
					revision: `revision:${sequence}`,
				},
			};
			const before = JSON.stringify([state, input, facts]);
			const decision = change(state, input, facts as VerifiedFacts);
			assert.equal(JSON.stringify([state, input, facts]), before, "Kernel mutated input");
			assert.equal(decision.outcome, expected, `${String(c.type)}: ${JSON.stringify(decision)}`);
			if (decision.outcome === "refused") {
				assert.ok(!("writes" in decision), "refusal cannot write");
				return {};
			}
			for (const write of decision.writes) {
				if (write.type === "roles.replace") state = { ...state, roleWork: write.state };
				if (write.type === "intakes.replace") state = { ...state, intakes: write.state };
			}
			return decision.result;
		}
		const first = command({ type: "assignTask", slice: "slice", delivery: true, packet: writer });
		assert.equal(first.passRef, "pass:workflow:implementation:slice:1");
		assert.equal(first.passOrdinal, 1);
		const id = first.assignment as string;
		const attempt = first.attempt as string;
		command({ type: "stageTask", assignment: id, generation: 1, attempt, executorEpoch: "executor:1" });
		const actor: Principal = { kind: "assignment-agent", assignment: id, generation: 1, attempt, role: "implementer" };
		for (const step of steps) {
			if (step === "reload") state = structuredClone(state);
			if (step === "owner") command({ type: "assignTask", slice: "slice", delivery: true, packet: writer }, host, "refused");
			if (step === "audit") command({ type: "requestImplementationAudit" }, actor, "refused");
			if (step === "handoff")
				command(
					{
						type: "submitImplementationHandoff",
						text: "done",
						dispositions: [],
						verification: { outcome: "pass", rank: "tests", reason: "done" },
					},
					actor,
					"refused",
				);
			if (step === "stale") command({ type: "requestImplementationAudit" }, { ...actor, generation: 0 }, "refused");
			if (step === "unknown") command({ type: "requestImplementationAuditX" }, actor, "refused");
			assert.equal(state.roleWork?.assignments.filter((a) => a.delivery && a.status === "running").length, 1);
		}
		const canceled = command({ type: "cancelWork", assignment: id, generation: 1, attempt }, human);
		command({
			type: "recordQuiescence",
			assignment: id,
			generation: canceled.generation,
			attempt,
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		});
		state = structuredClone(state);
		command({ type: "assignTask", slice: "slice", delivery: true, packet: writer }, host, "refused");
		const replacement = command({ type: "replaceTask", assignment: id, generation: canceled.generation, attempt, packet: writer });
		assert.equal(replacement.passRef, first.passRef);
		assert.equal(replacement.passRecord, first.passRecord);
		assert.equal(replacement.passOrdinal, 1);
		assert.notEqual(replacement.assignment, id);
		command({ type: "requestImplementationAudit" }, actor, "refused");
		const ownerId = replacement.assignment as string;
		const ownerAttempt = replacement.attempt as string;
		command({ type: "stageTask", assignment: ownerId, generation: 1, attempt: ownerAttempt, executorEpoch: "executor:1" });
		const current: Principal = { kind: "assignment-agent", assignment: ownerId, generation: 1, attempt: ownerAttempt, role: "implementer" };
		const own = (which: string) => {
			const found = state.roleWork?.assignments.find((a) => a.id === which);
			assert.ok(found);
			return found;
		};
		function retain(kind: "audit" | "final") {
			source = capture(own(ownerId), "executor:1", contract);
			return command(
				{
					type: "recordImplementationSource",
					assignment: ownerId,
					generation: 1,
					attempt: ownerAttempt,
					kind,
					text: JSON.stringify(source),
				},
				{ kind: "host", scope: "effects" },
			).source as string;
		}
		// Vary the interruption point rather than repeat the full suffix in every schedule.
		if (steps[0] === "owner" || steps[0] === "unknown") {
			assert.equal(state.roleWork?.passes?.length, 1);
			assert.equal(state.roleWork?.passes?.[0]?.handoff, undefined);
			if (coverage) coverage.resumed++;
			return undefined;
		}
		const A = retain("audit");
		const invocation = command({ type: "requestImplementationAudit" }, current);
		assert.equal(invocation.source, A);
		assert.equal(state.roleWork?.passes?.length, 1);
		assert.equal(state.roleWork?.passes?.[0]?.ref, first.passRef);
		const children = state.roleWork?.assignments.filter((a) => a.parent === ownerId) ?? [];
		assert.deepEqual(children.map((a) => a.packet.role).sort(), ["audit-contracts", "audit-standards"]);
		assert.ok(children.every((a) => !a.delivery && a.auditReview?.source === A && a.auditReview.passRef === first.passRef));
		command({ type: "requestImplementationAudit" }, current, "refused");
		command({ type: "requestImplementationAudit" }, actor, "refused");
		command(
			{
				type: "recordImplementationSource",
				assignment: ownerId,
				generation: 1,
				attempt: ownerAttempt,
				kind: "audit",
				text: JSON.stringify(source),
			},
			{ kind: "host", scope: "effects" },
			"refused",
		);
		const handoff = { type: "submitImplementationHandoff", text: "done", dispositions: [], verification: assessment };
		const prematureHandoff = () => command(handoff, current, "refused");
		prematureHandoff();
		const order = steps.includes("reload") ? children.slice().reverse() : children;
		for (const initial of order) {
			let child = own(initial.id);
			command({
				type: "stageTask",
				assignment: child.id,
				generation: child.generation,
				attempt: child.attempt,
				executorEpoch: "executor:1",
			});
			const old: Principal = {
				kind: "assignment-agent",
				assignment: child.id,
				generation: child.generation,
				attempt: child.attempt,
				role: child.packet.role,
			};
			if (steps.includes("stale") && initial.packet.role === "audit-standards") {
				const canceledChild = command(
					{ type: "cancelWork", assignment: child.id, generation: child.generation, attempt: child.attempt },
					human,
				);
				command({
					type: "recordQuiescence",
					assignment: child.id,
					generation: canceledChild.generation,
					attempt: child.attempt,
					providerIdle: true,
					environment: "absent",
					effects: "reconciled",
				});
				const replaced = command({
					type: "replaceTask",
					assignment: child.id,
					generation: canceledChild.generation,
					attempt: child.attempt,
					packet: child.packet,
				});
				child = own(replaced.assignment as string);
				command({
					type: "stageTask",
					assignment: child.id,
					generation: child.generation,
					attempt: child.attempt,
					executorEpoch: "executor:1",
				});
			}
			const reviewer: Principal = {
				kind: "assignment-agent",
				assignment: child.id,
				generation: child.generation,
				attempt: child.attempt,
				role: child.packet.role,
			};
			const currentPass: ImplementationPass | undefined = state.roleWork?.passes?.[0];
			assert.ok(currentPass?.audit);
			assert.equal(currentPass.captureA, A);
			assert.equal(currentPass.audit.ref, invocation.audit);
			assert.notEqual(currentPass.audit.roles.standards.assignment, currentPass.audit.roles.contracts.assignment);
			assert.equal(state.roleWork?.assignments.filter((a) => a.delivery && a.status === "running").length, 1);
			const binding = child.auditReview;
			assert.ok(binding);
			const findings = child.packet.role === "audit-standards" ? [{ id: "F1", text: "Fix source", needsHuman: false }] : [];
			const report = (override: Record<string, unknown> = {}) => ({
				type: "submitRoleResult",
				text: JSON.stringify({ schema: 1, ...binding, findings, ...override }),
				supports: [],
			});
			const invalidBindings = [
				{ passRef: "pass:wrong" },
				{ source: "revision:wrong" },
				{ audit: "audit:wrong" },
				{ contract: "contract:wrong" },
			];
			const choice = Math.max(0, probes.indexOf(steps[1] ?? "owner"));
			const invalid = invalidBindings[(choice + (child.packet.role === "audit-contracts" ? 1 : 0)) % 4]!;
			command(report(invalid), reviewer, "refused");
			coverage?.bindings.add(Object.keys(invalid)[0]!);
			command(report(), { ...reviewer, role: child.packet.role === "audit-standards" ? "audit-contracts" : "audit-standards" }, "refused");
			if (child.id !== initial.id) command(report(), old, "refused");
			command(report(), reviewer);
			command({ type: "requestImplementationAudit" }, current, "refused");
			prematureHandoff();
			state = structuredClone(state);
			if (steps[0] === "reload" || steps[0] === "stale") {
				assert.equal(Object.keys(state.roleWork!.passes![0]!.audit!.results).length, 1);
				assert.equal(state.roleWork!.passes![0]!.captureA, A);
				if (coverage) coverage.partialAudit++;
				return undefined;
			}
		}
		prematureHandoff();
		const B = retain("final");
		const pass = state.roleWork?.passes?.[0];
		assert.ok(pass?.audit?.results.standards && pass.audit.results.contracts);
		assert.equal(pass.captureA, A);
		assert.equal(pass.captureB, B);
		const disposition = {
			report: pass.audit.results.standards.report,
			finding: "F1",
			disposition: "fixed",
			reason: "Fixed",
			changes: [B],
			rechecks: ["read"],
		};
		command(handoff, current, "refused");
		command({ ...handoff, dispositions: [{ ...disposition, changes: [A] }] }, current, "refused");
		assert.ok(source);
		const valid = source;
		source = structuredClone(valid);
		source.verification.results[0]!.status = "failed";
		command({ ...handoff, dispositions: [disposition] }, current, "refused");
		source = valid;
		command({ ...handoff, dispositions: [disposition] }, current);
		assert.ok(state.roleWork?.passes?.[0]?.handoff);
		command({ ...handoff, dispositions: [disposition] }, current, "refused");
		assert.equal(state.roleWork?.passes?.length, 1);
		if (coverage) coverage.handoff++;
		return undefined;
	} catch (error) {
		return String(error);
	}
}
function shrink(steps: Probe[]): Probe[] {
	let current = steps;
	for (let i = 0; i < current.length; ) {
		const candidate = current.filter((_, index) => index !== i);
		if (run(candidate) !== undefined) current = candidate;
		else i++;
	}
	return current;
}
test("V1 seeded pass ownership, refusal, cancellation and reload schedules", () => {
	const base = Number(process.env.RENDER_V1_SEED ?? 0x5eed);
	const count = Number(process.env.RENDER_V1_SCHEDULES ?? 10_000);
	const coverage = new Set<Probe>();
	const paths: Coverage = { resumed: 0, partialAudit: 0, handoff: 0, bindings: new Set(), returns: new Set() };
	for (let n = 0; n < count; n++) {
		const seed = base + n;
		const steps = process.env.RENDER_PASS_STEPS ? (JSON.parse(process.env.RENDER_PASS_STEPS) as Probe[]) : generate(seed);
		for (const step of steps) coverage.add(step);
		const failure = run(steps, paths);
		if (failure) {
			const minimal = JSON.stringify(shrink(steps));
			assert.fail(
				`seed ${seed}: ${failure}\nreplay: RENDER_V1_SEED=${seed} RENDER_V1_SCHEDULES=1\nshrunk replay: RENDER_V1_SCHEDULES=1 RENDER_PASS_STEPS='${minimal}'`,
			);
		}
	}
	if (count >= 1000 && !process.env.RENDER_PASS_STEPS) {
		assert.deepEqual(coverage, new Set(probes));
		assert.deepEqual(paths.bindings, new Set(["passRef", "source", "audit", "contract"]), "all invalid binding variants are exercised");
		assert.ok(paths.resumed > 0 && paths.partialAudit > 0 && paths.handoff > 0);
	}
	assert.equal(paths.resumed + paths.partialAudit + paths.handoff, count);
	console.log(
		JSON.stringify({
			measure: "implementation_schedule_paths",
			schedules: count,
			resumed: paths.resumed,
			partialAudit: paths.partialAudit,
			handoff: paths.handoff,
		}),
	);
});
