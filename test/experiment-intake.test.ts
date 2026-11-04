import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExperimentProtocol } from "../src/kernel/experiments.ts";
import { type Command, change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { packet } from "./support/roles.ts";

const protocol: ExperimentProtocol = {
	schema: 1,
	ground: "ground:1",
	question: "Does the favorite measure at most 10?",
	hypothesis: "The favorite measures at most 10",
	falsifier: "A measurement above 10",
	decisionRule: "Above 10 is negative",
	controls: ["Same fixture"],
	fixtures: ["fixture.txt"],
	failureCases: ["Missing measurement is inconclusive"],
	retainedOutputs: ["Source, raw measurement and limits"],
	budget: { maxCommands: 1, timeoutMs: 1000 },
	profile: { image: `sha256:${"0".repeat(64)}`, exclusions: [".git"], maxBytes: 1024, maxEntries: 10 },
	source: { repository: "owned", commit: "1".repeat(40) },
	candidates: ["favorite"],
};
const candidate = packet({
	role: "experiment-candidate",
	execution: "linux-writer",
	experiment: { protocol: "protocol:1", candidate: "favorite" },
});
const facts: VerifiedFacts = {
	principal: { kind: "host", scope: "scheduling" },
	executorEpoch: "executor",
	sequence: 20,
	ids: { fact: "fact:20", assignment: "assignment:20", attempt: "attempt:20" },
	experimentProtocols: { "protocol:1": protocol },
};
function state(): KernelState {
	return {
		workflow: { id: "workflow:1", messageCount: 0 },
		document: null,
		device: null,
		roleWork: { assignments: [] },
		intakes: {
			revision: "intake:1",
			drafts: [],
			concerns: [],
			dependencies: [],
			slices: [
				{
					id: "accepted-slice",
					contract: "contract:1",
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
}
function assignment(): RoleAssignment {
	return {
		id: "previous",
		workflow: "workflow:1",
		slice: "standalone",
		generation: 1,
		attempt: "attempt:previous",
		executorEpoch: null,
		packet: candidate,
		packetRef: "packet:previous",
		conversation: 0,
		task: 0,
		parent: null,
		requestKey: null,
		delivery: false,
		status: "canceled",
		executing: false,
		executionOrdinal: 0,
		blocker: null,
		report: null,
	};
}
function decide(s: KernelState, command: Command) {
	const before = structuredClone(s);
	const result = change(s, command, facts);
	assert.deepEqual(s, before, "legality must leave input state unchanged");
	return result;
}

test("E15 protocol legality precedes intake gaps; standalone experiments do not consume accepted Contracts", () => {
	const s = state();
	const command = { type: "assignTask", workflow: "workflow:1", slice: "accepted-slice", delivery: false, packet: candidate } as const;
	assert.deepEqual(decide(s, { ...command, packet: packet({ role: "experiment-candidate" }) }), {
		outcome: "refused",
		code: "invalid_content",
		reason: "Every experiment role requires an immutable preregistered protocol.",
	});
	assert.deepEqual(decide(s, { ...command, delivery: true }), {
		outcome: "refused",
		code: "forbidden_scope",
		reason: "Experiments confer no delivery/adoption authority or child role requests.",
	});
	assert.deepEqual(decide(s, command), {
		outcome: "refused",
		code: "stale_basis",
		reason: "Assignment must bind the current immutable Contract revision.",
	});
	const standalone = decide(s, { ...command, slice: "standalone" });
	assert.equal(standalone.outcome, "accepted");
	if (standalone.outcome !== "accepted") throw new Error("unreachable");
	assert.equal(
		standalone.writes.some((w) => w.type === "intakes.replace"),
		false,
	);
	const bound = decide(s, { ...command, packet: { ...candidate, inputs: ["contract:1"] } });
	assert.equal(bound.outcome, "accepted");
	if (bound.outcome !== "accepted") throw new Error("unreachable");
	const consumed = bound.writes.find((w) => w.type === "intakes.replace");
	assert.equal(consumed?.type === "intakes.replace" && consumed.state.slices[0]?.everAssigned, true);
});

test("E16 experiment correction and intake fidelity each retain their distinct replacement refusal", () => {
	const a = assignment();
	const s = { ...state(), roleWork: { assignments: [a] } };
	const command = {
		type: "replaceTask",
		workflow: "workflow:1",
		assignment: a.id,
		generation: a.generation,
		attempt: a.attempt,
		packet: packet(),
	} as const;
	assert.deepEqual(decide(s, command), {
		outcome: "refused",
		code: "forbidden_scope",
		reason: "Experimental corrections require a new protocol/round, not replacement or adoption.",
	});
	a.packet = packet({ role: "challenger", inputs: ["intake:1", "decision:1", "concern:1"] });
	a.intakeReview = { intake: "intake:1", manifest: "manifest:1", annotations: 1 };
	assert.deepEqual(decide(s, { ...command, packet: packet({ role: "challenger", inputs: ["intake:1", "decision:1"] }) }), {
		outcome: "refused",
		code: "forbidden_scope",
		reason: "Replacement fidelity must retain exact intake, decisions and concerns.",
	});
	const faithful = decide(s, { ...command, packet: a.packet });
	assert.equal(faithful.outcome, "accepted", "retaining exact fidelity inputs permits a quiescent replacement");
});

test("E17 accepted-Contract gaps still fence experiment staging, replacement and rebind", () => {
	const a = assignment();
	a.slice = "accepted-slice";
	const s = { ...state(), roleWork: { assignments: [a] } };
	const identity = { workflow: "workflow:1", assignment: a.id, generation: a.generation, attempt: a.attempt };
	for (const command of [
		{ ...identity, type: "stageTask", executorEpoch: "executor" },
		{ ...identity, type: "replaceTask", packet: packet() },
		{ ...identity, type: "rebindAttempt", executorEpoch: "executor", providerIdle: true, environment: "stopped", effects: "reconciled" },
	] as const) {
		assert.deepEqual(decide(s, command), {
			outcome: "refused",
			code: "stale_basis",
			reason: "Assignment must bind the current immutable Contract revision.",
		});
	}
});
