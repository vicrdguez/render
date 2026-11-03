import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckpointRequest } from "../src/kernel/checkpoints.ts";
import { change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { packet } from "./support/roles.ts";

const accepted: CheckpointRequest = {
	id: "checkpoint:old",
	stage: "seams",
	scope: "ground:1",
	mode: "human",
	required: { candidates: false, experiment: false },
	status: "approved",
	emission: "emission:old",
	manifest: "manifest:old",
	annotations: 0,
	reviewedAnnotations: 0,
	review: "review:old",
	approved: "emission:old",
	nonbinding: [],
	seams: null,
	coordinator: "coordinator",
	ready: true,
	manifestValue: null,
	decision: "decision:old",
	policyBinding: "policy-binding:initial",
	emissions: ["emission:old"],
};
function assignment(id: string, role: "coordinator" | "implementer", inputs: string[]): RoleAssignment {
	return {
		id,
		workflow: "workflow:1",
		slice: id,
		generation: 1,
		attempt: `attempt:${id}`,
		executorEpoch: "executor",
		packet: packet({ role, inputs }),
		packetRef: `packet:${id}`,
		conversation: 1,
		task: 1,
		parent: null,
		requestKey: null,
		delivery: role === "implementer",
		status: "running",
		executing: true,
		executionOrdinal: 1,
		blocker: null,
		report: null,
	};
}
const facts: VerifiedFacts = {
	principal: { kind: "assignment-agent", assignment: "coordinator", generation: 1, attempt: "attempt:coordinator", role: "coordinator" },
	executorEpoch: "executor",
	sequence: 20,
	ids: { fact: "fact:20" },
	checkpointInputs: { "ground:1": { human: true, document: "ground", text: "Human scope" } },
};

test("C13 revised Seams block an already executing dependent without erasing accepted history or unrelated work", () => {
	const state: KernelState = {
		workflow: { id: "workflow:1", messageCount: 0 },
		document: null,
		device: null,
		checkpoints: { requests: [accepted], concerns: [] },
		roleWork: {
			assignments: [
				assignment("coordinator", "coordinator", ["ground:1"]),
				assignment("affected", "implementer", ["emission:old"]),
				assignment("unrelated", "implementer", ["other:1"]),
			],
		},
	};
	const before = structuredClone(state);
	const d = change(
		state,
		{
			type: "requestCheckpoint",
			workflow: "workflow:1",
			stage: "seams",
			scope: "ground:1",
			required: { candidates: false, experiment: false },
		},
		facts,
	);
	assert.equal(d.outcome, "accepted");
	if (d.outcome !== "accepted") return;
	const work = d.writes.find((w) => w.type === "roles.replace");
	assert.ok(work && work.type === "roles.replace", "affected execution must block when revised seam is requested");
	assert.equal(work.state.assignments[1]!.status, "blocked");
	assert.equal(work.state.assignments[1]!.executing, true, "blocking cannot claim quiescence");
	assert.equal(work.state.assignments[2]!.status, "running");
	const checkpoints = d.writes.find((w) => w.type === "checkpoints.replace");
	assert.ok(checkpoints && checkpoints.type === "checkpoints.replace");
	assert.deepEqual(checkpoints.state.requests[0], accepted);
	assert.deepEqual(state, before, "checkpoint legality remains pure");
});

test("C13 resolving revised Seams does not revive execution bound to the old approved bytes", () => {
	const latest = {
		...accepted,
		id: "checkpoint:new",
		emission: "emission:new",
		approved: "emission:new",
		manifest: "manifest:new",
		decision: "decision:new",
		emissions: ["emission:new"],
	};
	const state: KernelState = {
		workflow: { id: "workflow:1", messageCount: 0 },
		document: null,
		device: null,
		checkpoints: { requests: [accepted, latest], concerns: [] },
	};
	for (const [ref, expected] of [
		["emission:old", "seams_required"],
		["emission:new", "accepted"],
	]) {
		const d = change(
			state,
			{
				type: "assignTask",
				workflow: "workflow:1",
				slice: "delivery",
				delivery: true,
				packet: packet({ role: "implementer", inputs: [ref!] }),
			},
			{
				...facts,
				principal: { kind: "host", scope: "scheduling" },
				ids: { fact: "fact:20", assignment: "assignment:20", attempt: "attempt:20" },
			},
		);
		assert.equal(d.outcome === "refused" ? d.code : d.outcome, expected);
	}
});

test("C05 replacement of a canceled exact challenge preserves its reviewed basis", () => {
	const child = {
		...assignment("challenger", "coordinator", ["emission:old", "manifest:old"]),
		packet: packet({ role: "challenger", inputs: ["emission:old", "manifest:old"] }),
		status: "canceled" as const,
		executing: false,
		checkpointReview: { request: "checkpoint:old", emission: "emission:old", manifest: "manifest:old", annotations: 0 },
	};
	const d = change(
		{ workflow: { id: "workflow:1", messageCount: 0 }, document: null, device: null, roleWork: { assignments: [child] } },
		{ type: "replaceTask", workflow: "workflow:1", assignment: child.id, generation: 1, attempt: child.attempt, packet: child.packet },
		{
			...facts,
			principal: { kind: "host", scope: "scheduling" },
			ids: { fact: "fact:20", assignment: "replacement", attempt: "attempt:replacement" },
		},
	);
	assert.equal(d.outcome, "accepted");
	if (d.outcome !== "accepted") return;
	const work = d.writes.find((w) => w.type === "roles.replace");
	assert.ok(work && work.type === "roles.replace");
	assert.deepEqual(work.state.assignments.at(-1)!.checkpointReview, child.checkpointReview);
});

test("C16 coordinator cannot launder another Ground revision outside its assigned inputs", () => {
	const d = change(
		{
			workflow: { id: "workflow:1", messageCount: 0 },
			document: null,
			device: null,
			roleWork: { assignments: [assignment("coordinator", "coordinator", [])] },
		},
		{
			type: "requestCheckpoint",
			workflow: "workflow:1",
			stage: "seams",
			scope: "ground:1",
			required: { candidates: false, experiment: false },
		},
		facts,
	);
	assert.equal(d.outcome === "refused" ? d.code : d.outcome, "forbidden_scope");
});
