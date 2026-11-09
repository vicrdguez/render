import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { decision } from "./support/kernel.ts";
import { packet } from "./support/roles.ts";

// Merge failure cases: neither experiment correction nor design-packet fidelity may disappear;
// host runner observations must not impersonate either candidate or an investigation coordinator.
const facts: VerifiedFacts = {
	principal: { kind: "host", scope: "scheduling" },
	executorEpoch: "executor",
	sequence: 20,
	ids: { fact: "fact:20", assignment: "assignment:20", attempt: "attempt:20", revision: "report:20" },
};
function assignment(): RoleAssignment {
	return {
		id: "previous",
		workflow: "workflow:1",
		slice: "standalone",
		generation: 1,
		attempt: "attempt:previous",
		executorEpoch: "executor",
		packet: packet({ role: "candidate", inputs: ["ground:1"], instructions: "conditions:1" }),
		packetRef: "packet:previous",
		conversation: 0,
		task: 0,
		parent: "coordinator",
		requestKey: "left",
		delivery: false,
		status: "canceled",
		executing: false,
		executionOrdinal: 1,
		blocker: null,
		report: null,
	};
}
function decide(a: RoleAssignment, c: Command) {
	const state: KernelState = {
		workflow: { id: a.workflow, messageCount: 0 },
		document: null,
		device: null,
		roleWork: { assignments: [a] },
	};
	const before = structuredClone(state);
	const result = decision(
		change(state, c, {
			...facts,
			principal: { kind: "host", scope: c.type === "recordRunnerObservation" ? "effects" : "scheduling" },
		}),
	);
	assert.deepEqual(state, before, "legality must leave input state unchanged");
	return result;
}

test("E18 experiment correction and design-candidate replacement retain distinct refusals and faithful design retry", () => {
	const a = { ...assignment(), checkpointCandidate: { request: "checkpoint:1", key: "left" } };
	const replace = (replacement: RoleAssignment["packet"]) =>
		decide(a, {
			type: "replaceTask",
			workflow: a.workflow,
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			packet: replacement,
		});
	for (const replacement of [packet(), { ...a.packet, inputs: [] }, { ...a.packet, instructions: "conditions:changed" }]) {
		assert.deepEqual(replace(replacement), {
			outcome: "refused",
			code: "forbidden_scope",
			reason: "Candidate replacement retains exact question, conditions and role; changed comparison needs a new checkpoint.",
		});
	}
	const faithful = replace(a.packet);
	assert.equal(faithful.outcome, "accepted");
	if (faithful.outcome !== "accepted") throw new Error("unreachable");
	const work = faithful.writes.find((w) => w.type === "roles.replace");
	assert.ok(work?.type === "roles.replace");
	const fresh = work.state.assignments.find((v) => v.id === "assignment:20");
	assert.equal(fresh?.predecessor, "previous");
	assert.deepEqual(fresh?.checkpointCandidate, { request: "checkpoint:1", key: "left" });

	const experiment = assignment();
	experiment.packet = packet({
		role: "experiment-candidate",
		execution: "linux-writer",
		experiment: { protocol: "protocol:1", candidate: "favorite" },
	});
	assert.deepEqual(
		decide(experiment, {
			type: "replaceTask",
			workflow: experiment.workflow,
			assignment: experiment.id,
			generation: 1,
			attempt: experiment.attempt,
			packet: packet(),
		}),
		{
			outcome: "refused",
			code: "forbidden_scope",
			reason: "Experimental corrections require a new protocol/round, not replacement or adoption.",
		},
	);
});

test("E19 host receipts cannot replace independent design, experiment or investigation answers", () => {
	const a = { ...assignment(), status: "running" as const, executing: true };
	const observe = (current: RoleAssignment) =>
		decide(current, {
			type: "recordRunnerObservation",
			workflow: current.workflow,
			assignment: current.id,
			generation: 1,
			attempt: current.attempt,
			text: "Runner output is not an independent answer",
		});
	const experiment = packet({
		role: "experiment-candidate",
		execution: "linux-writer",
		experiment: { protocol: "protocol:1", candidate: "favorite" },
	});
	const investigation = packet({
		investigation: { ground: "ground:1", repository: "owned", commit: "1".repeat(40), paths: ["README.md"] },
	});
	for (const p of [experiment, investigation]) {
		assert.deepEqual(observe({ ...a, packet: p }), {
			outcome: "refused",
			code: "forbidden_scope",
			reason: "Only the assigned coordinator can submit a cited investigation outcome.",
		});
	}
	assert.deepEqual(observe({ ...a, checkpointCandidate: { request: "checkpoint:1", key: "left" } }), {
		outcome: "refused",
		code: "forbidden_scope",
		reason: "Only the assigned candidate can submit its competing answer.",
	});
	assert.equal(
		observe({ ...a, packet: packet({ role: "implementer" }) }).outcome,
		"accepted",
		"ordinary owned runner receipts remain eligible",
	);
});
