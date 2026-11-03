import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckpointRequest } from "../src/kernel/checkpoints.ts";
import { change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { seeded } from "./support/random.ts";
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

test("C13 read-only revised-Seams challenge may inspect historical approved evidence", () => {
	const pending = { ...accepted, id: "checkpoint:pending", status: "pending" as const, approved: null };
	const d = change(
		{
			workflow: { id: "workflow:1", messageCount: 0 },
			document: null,
			device: null,
			checkpoints: { requests: [accepted, pending], concerns: [] },
		},
		{
			type: "assignTask",
			workflow: "workflow:1",
			slice: "review",
			delivery: false,
			packet: packet({ role: "challenger", inputs: ["emission:old"] }),
		},
		{
			...facts,
			principal: { kind: "host", scope: "scheduling" },
			ids: { fact: "fact:20", assignment: "reviewer", attempt: "attempt:reviewer" },
		},
	);
	assert.equal(d.outcome, "accepted", "historical evidence must remain readable by the revised-Seams reviewer");
});

test("C05 replacement of a canceled exact challenge preserves its reviewed basis", () => {
	const child = {
		...assignment("challenger", "coordinator", ["emission:old", "manifest:old"]),
		packet: packet({ role: "challenger", inputs: ["emission:old", "manifest:old", "concern:old", "ground:1"] }),
		status: "canceled" as const,
		executing: false,
		checkpointReview: { request: "checkpoint:old", emission: "emission:old", manifest: "manifest:old", annotations: 0 },
	};
	const omitted = change(
		{ workflow: { id: "workflow:1", messageCount: 0 }, document: null, device: null, roleWork: { assignments: [child] } },
		{
			type: "replaceTask",
			workflow: "workflow:1",
			assignment: child.id,
			generation: 1,
			attempt: child.attempt,
			packet: { ...child.packet, inputs: ["emission:old", "manifest:old"] },
		},
		{
			...facts,
			principal: { kind: "host", scope: "scheduling" },
			ids: { fact: "fact:20", assignment: "replacement", attempt: "attempt:replacement" },
		},
	);
	assert.equal(
		omitted.outcome === "refused" ? omitted.code : omitted.outcome,
		"forbidden_scope",
		"replacement must not drop exact saved concerns or Ground",
	);
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

test("V1 checkpoint exact-basis seeded save/approval schedules preserve every concern and accepted bytes", () => {
	const count = Number(process.env.RENDER_V1_SCHEDULES ?? 10000);
	for (let seed = 0; seed < count; seed++) {
		const random = seeded(seed + 841);
		const pending: CheckpointRequest = {
			...accepted,
			status: "pending",
			approved: null,
			decision: null,
			policyBinding: "workflow:1:policy:initial",
			manifestValue: {
				schema: 1,
				stage: "seams",
				nodes: [
					{
						id: "N1",
						decision: "ownership",
						rationale: "locality",
						alternatives: ["combined", "separate"],
						evidence: ["evidence:1"],
						classification: "judgment",
						default: "separate",
					},
				],
				decompositions: [],
				verificationStrategy: "real SQLite",
				incidentalChoices: [],
				responses: [],
			},
		};
		let state: KernelState = {
			workflow: { id: "workflow:1", messageCount: 0 },
			document: null,
			device: null,
			checkpoints: { requests: [pending], concerns: [] },
		};
		const approve = {
			type: "approveCheckpoint" as const,
			workflow: "workflow:1",
			request: pending.id,
			emission: "emission:old",
			manifest: "manifest:old",
			annotations: 0,
			policyBinding: "workflow:1:policy:initial",
			decisions: { N1: "separate" },
			nonbinding: [] as string[],
		};
		const save = {
			type: "saveCheckpointConcern" as const,
			workflow: "workflow:1",
			request: pending.id,
			base: "emission:old",
			text: `complete concern ${seed}`,
		};
		const saveFirst = random() < 0.5;
		let sequence = 30;
		for (const command of saveFirst ? [save, approve] : [approve, save]) {
			const before = structuredClone(state);
			const d = change(state, command, {
				...facts,
				principal: { kind: "human", human: "human:owner", route: "local-admin" },
				sequence: sequence++,
				checkpointInputs: { "emission:old": { text: "original bytes", human: false, document: "emission" } },
			});
			assert.deepEqual(state, before, `seed ${seed}: pure transformation`);
			assert.equal(
				d.outcome === "accepted" ? d.outcome : d.code,
				command.type === "approveCheckpoint" && saveFirst ? "stale_basis" : "accepted",
				`seed ${seed}: exact commit order`,
			);
			if (d.outcome === "accepted") {
				const write = d.writes.find((w) => w.type === "checkpoints.replace");
				assert.ok(write && write.type === "checkpoints.replace");
				state = { ...state, checkpoints: write.state };
			}
		}
		assert.equal(state.checkpoints!.concerns.length, 1, `seed ${seed}: no acknowledged concern loss`);
		assert.equal(
			state.checkpoints!.requests[0]!.approved,
			saveFirst ? null : "emission:old",
			`seed ${seed}: immutable original acceptance`,
		);
		assert.equal(state.checkpoints!.concerns[0]!.changeRequest, !saveFirst);
	}
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
