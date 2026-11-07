import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, change, type KernelState, type Principal } from "../src/kernel/kernel.ts";
import { packet, selection } from "./support/roles.ts";

const host: Principal = { kind: "host", scope: "scheduling" };
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
function fixture(retained?: KernelState) {
	let state: KernelState = retained ?? {
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
					review: "review:fixture",
					status: "accepted",
					record: false,
					predecessors: [],
				},
			],
		},
	};
	let sequence = 0;
	function command(c: Record<string, unknown>, principal = host) {
		sequence++;
		const before = structuredClone(state);
		const result = change(state, { ...c, workflow } as Command, {
			principal,
			sequence,
			executorEpoch: "executor:1",
			ids: {
				fact: `fact:${sequence}`,
				assignment: `assignment:${sequence}`,
				attempt: `attempt:${sequence}`,
				revision: `revision:${sequence}`,
			},
		});
		assert.deepEqual(state, before, "pass transitions must preserve Kernel input state");
		if (result.outcome === "accepted")
			for (const write of result.writes) {
				if (write.type === "roles.replace") state = { ...state, roleWork: write.state };
				if (write.type === "intakes.replace") state = { ...state, intakes: write.state };
			}
		return result;
	}
	function accepted(c: Record<string, unknown>, principal = host) {
		const result = command(c, principal);
		assert.equal(result.outcome, "accepted", JSON.stringify(result));
		if (result.outcome !== "accepted") throw new Error("unreachable");
		return result.result;
	}
	function assign() {
		return accepted({ type: "assignTask", slice: "slice", delivery: true, packet: writer });
	}
	function start(assignment: string) {
		const a = state.roleWork!.assignments.find((a) => a.id === assignment)!;
		accepted({ type: "stageTask", assignment, generation: a.generation, attempt: a.attempt, executorEpoch: "executor:1" });
		return { kind: "assignment-agent", assignment, generation: a.generation, attempt: a.attempt, role: a.packet.role } as Principal;
	}
	function cancel(first: Record<string, unknown>) {
		const canceled = accepted(
			{ type: "cancelWork", assignment: first.assignment, generation: 1, attempt: first.attempt },
			{ kind: "human", human: "owner", route: "local-admin" },
		);
		accepted({
			type: "recordQuiescence",
			assignment: first.assignment,
			generation: canceled.generation,
			attempt: first.attempt,
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		});
		return canceled.generation;
	}
	return { command, accepted, assign, start, cancel, state: () => state };
}

test("accepted implementation opens host pass 1, not an assignment-selected identity", () => {
	const f = fixture();
	const result = f.assign();
	assert.equal(result.passOrdinal, 1, "accepted implementation must open ordinal 1");
	assert.equal(result.passRef, "pass:workflow:implementation:slice:1");
	assert.equal(result.contract, "contract:accepted");
	assert.equal(f.state().intakes!.slices[0]!.everAssigned, true);
});

test("replacement after confirmed quiescence retains the same open pass", () => {
	const f = fixture();
	const first = f.assign();
	const assignment = first.assignment as string;
	f.start(assignment);
	const canceled = f.accepted(
		{ type: "cancelWork", assignment, generation: 1, attempt: first.attempt },
		{ kind: "human", human: "owner", route: "local-admin" },
	);
	f.accepted({
		type: "recordQuiescence",
		assignment,
		generation: canceled.generation,
		attempt: first.attempt,
		providerIdle: true,
		environment: "stopped",
		effects: "reconciled",
	});
	const replacement = f.accepted({
		type: "replaceTask",
		assignment,
		generation: canceled.generation,
		attempt: first.attempt,
		packet: writer,
	});
	assert.equal(replacement.passOrdinal, 1, "Attempt replacement must not open another pass");
	assert.equal(replacement.passRef, first.passRef);
	assert.notEqual(replacement.assignment, first.assignment);
});

test("generic report submission cannot release accepted implementation before its Audit and handoff", () => {
	const f = fixture();
	const first = f.assign();
	const agent = f.start(first.assignment as string);
	// A non-pass assessment needs no catalog evidence, so only the pass guard stands between this report and closure.
	const verification = { outcome: "non-pass", rank: null, reason: "Checks not run" };
	const result = f.command({ type: "submitRoleResult", text: "done", supports: [], verification }, agent);
	assert.equal(result.outcome, "refused", "accepted implementation cannot bypass sealed handoff with a role report");
	assert.equal(f.state().roleWork!.assignments[0]!.status, "running");
});

test("generic child request cannot substitute for the pass-bound paired Audit", () => {
	const f = fixture();
	const first = f.assign();
	const agent = f.start(first.assignment as string);
	const result = f.command({ type: "requestRole", key: "standards" }, agent);
	assert.equal(result.outcome, "refused", "accepted implementation Audit must retain A and stage both fresh axes together");
	assert.equal(f.state().roleWork!.assignments.length, 1);
});

test("ordinary state reload retains pass identity and refuses an unrelated second owner", () => {
	const f = fixture();
	const first = f.assign();
	assert.equal(first.passOrdinal, 1);
	const resumed = fixture(structuredClone(f.state()));
	assert.equal(resumed.command({ type: "assignTask", slice: "slice", delivery: true, packet: writer }).outcome, "refused");
	const generation = resumed.cancel(first);
	const next = resumed.accepted({ type: "replaceTask", assignment: first.assignment, generation, attempt: first.attempt, packet: writer });
	assert.equal(next.passOrdinal, 1, "restart is not a new implementation interval");
	assert.equal(next.passRef, first.passRef);
	assert.equal(next.passRecord, first.passRecord, "immutable opening basis survives replacement");
});

test("canceling a pass requires linked replacement rather than a new initial interval", () => {
	const f = fixture();
	const first = f.assign();
	f.cancel(first);
	assert.equal(f.command({ type: "assignTask", slice: "slice", delivery: true, packet: writer }).outcome, "refused");
});

test("accepted implementer cannot evade exclusive pass ownership with delivery false", () => {
	const f = fixture();
	const first = f.accepted({ type: "assignTask", slice: "slice", delivery: false, packet: writer });
	assert.equal(first.passOrdinal, 1);
	assert.equal(f.state().roleWork!.assignments[0]!.delivery, true);
	const result = f.command({ type: "assignTask", slice: "slice", delivery: false, packet: { ...writer, execution: "read-only" } });
	assert.equal(result.outcome, "refused");
});

test("replacement cannot change an accepted implementation into another role to bypass handoff", () => {
	const f = fixture();
	const first = f.assign();
	const generation = f.cancel(first);
	const result = f.command({
		type: "replaceTask",
		assignment: first.assignment,
		generation,
		attempt: first.attempt,
		packet: packet({ inputs: [contract] }),
	});
	assert.equal(result.outcome, "refused");
});

test("owned-check receipt cannot masquerade as a sealed implementation handoff", () => {
	const f = fixture();
	const first = f.assign();
	f.start(first.assignment as string);
	const result = f.command(
		{
			type: "recordRunnerObservation",
			assignment: first.assignment,
			generation: 1,
			attempt: first.attempt,
			text: '{"verification":"passed"}',
		},
		{ kind: "host", scope: "effects" },
	);
	assert.equal(result.outcome, "refused", "ordinary owned-check completion is not implementation delivery");
	assert.equal(f.state().roleWork!.assignments[0]!.status, "running");
});
