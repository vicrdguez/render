import assert from "node:assert/strict";
import { test } from "node:test";
import { change, type KernelState, type Principal, type VerifiedFacts } from "../src/kernel/kernel.ts";
import { packet } from "./support/roles.ts";

const host: Principal = { kind: "host", scope: "scheduling" };
const human: Principal = { kind: "human", human: "human:owner", route: "local-admin" };
const state = () => ({ workflow: { id: "workflow:1", messageCount: 0 }, document: null, device: null, roleWork: { assignments: [] } });
function decide(s: KernelState, c: Record<string, unknown>, principal = host, sequence = 1) {
	return change(
		s,
		{ workflow: "workflow:1", ...c } as never,
		{
			principal,
			sequence,
			ids: {
				fact: `fact:${sequence}`,
				assignment: `assignment:${sequence}`,
				attempt: `attempt:${sequence}`,
				revision: `revision:${sequence}`,
			},
			executorEpoch: "executor:1",
		} as VerifiedFacts,
	);
}
function accept(s: KernelState, c: Record<string, unknown>, principal = host, sequence = 1) {
	const d = decide(s, c, principal, sequence);
	assert.equal(d.outcome, "accepted", JSON.stringify(d));
	if (d.outcome !== "accepted") throw new Error("refused");
	for (const write of d.writes) if (write.type === "roles.replace") Object.assign(s, { roleWork: write.state });
	return d;
}
function refused(s: KernelState, c: Record<string, unknown>, code: string, principal = host) {
	const before = JSON.stringify(s);
	const d = decide(s, c, principal);
	assert.equal(d.outcome === "refused" ? d.code : d.outcome, code);
	assert.equal(JSON.stringify(s), before);
}

test("R05 four executing attempts includes a blocked live owner; quiescence frees capacity, not ownership", () => {
	const s = state();
	for (let i = 1; i <= 5; i++) accept(s, { type: "assignTask", slice: `slice:${i}`, packet: packet(), delivery: true }, host, i);
	for (let i = 1; i <= 4; i++)
		accept(s, { type: "stageTask", assignment: `assignment:${i}`, generation: 1, attempt: `attempt:${i}`, executorEpoch: "executor:1" });
	accept(s, { type: "recordBlocker", assignment: "assignment:1", generation: 1, attempt: "attempt:1", reason: "human decision" });
	refused(
		s,
		{ type: "stageTask", assignment: "assignment:5", generation: 1, attempt: "attempt:5", executorEpoch: "executor:1" },
		"capacity_exhausted",
	);
	refused(
		s,
		{
			type: "recordQuiescence",
			assignment: "assignment:1",
			generation: 1,
			attempt: "attempt:1",
			providerIdle: false,
			environment: "absent",
			effects: "reconciled",
		},
		"quiescence_unconfirmed",
	);
	accept(s, {
		type: "recordQuiescence",
		assignment: "assignment:1",
		generation: 1,
		attempt: "attempt:1",
		providerIdle: true,
		environment: "absent",
		effects: "reconciled",
	});
	accept(s, { type: "stageTask", assignment: "assignment:5", generation: 1, attempt: "attempt:5", executorEpoch: "executor:1" });
	refused(s, { type: "assignTask", slice: "slice:1", packet: packet(), delivery: true }, "ownership_conflict");
	const otherWorkflow = { ...s, workflow: { id: "workflow:2", messageCount: 0 } };
	refused(
		otherWorkflow,
		{ type: "assignTask", workflow: "workflow:2", slice: "slice:1", packet: packet(), delivery: true },
		"ownership_conflict",
	);
});

test("R06 cancellation fences first, keeps uncertain capacity, and stale role/Attempt cannot mutate or release", () => {
	const s = state();
	accept(s, { type: "assignTask", slice: "slice:1", packet: packet(), delivery: true });
	accept(s, { type: "stageTask", assignment: "assignment:1", generation: 1, attempt: "attempt:1", executorEpoch: "executor:1" });
	const agent: Principal = {
		kind: "assignment-agent",
		assignment: "assignment:1",
		generation: 1,
		attempt: "attempt:1",
		role: "coordinator",
	};
	refused(s, { type: "submitRoleResult", supports: [], text: "foreign" }, "forbidden_scope", { ...agent, role: "challenger" });
	accept(s, { type: "cancelWork", assignment: "assignment:1", generation: 1, attempt: "attempt:1" }, human);
	refused(s, { type: "submitRoleResult", supports: [], text: "late" }, "stale_assignment", agent);
	refused(
		s,
		{
			type: "recordQuiescence",
			assignment: "assignment:1",
			generation: 1,
			attempt: "attempt:1",
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		},
		"stale_assignment",
	);
	refused(
		s,
		{
			type: "recordQuiescence",
			assignment: "assignment:1",
			generation: 2,
			attempt: "attempt:1",
			providerIdle: true,
			environment: "unknown",
			effects: "unknown",
		},
		"quiescence_unconfirmed",
	);
	accept(s, {
		type: "recordQuiescence",
		assignment: "assignment:1",
		generation: 2,
		attempt: "attempt:1",
		providerIdle: true,
		environment: "absent",
		effects: "reconciled",
	});
});
