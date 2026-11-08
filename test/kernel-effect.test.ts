import assert from "node:assert/strict";
import { test } from "node:test";
import * as kernel from "../src/kernel/kernel.ts";

const state: kernel.KernelState = { workflow: null, document: null, device: null };
const human: kernel.Principal = { kind: "human", route: "local-admin", human: "owner" };
const facts = { principal: human, sequence: 1, ids: { workflow: "workflow:1", fact: "fact:1" } };
const create = { type: "createWorkflow", title: "First" } as const;

test("Kernel Effect yields the accepted writes without mutating its input", async () => {
	const Effect = await import("effect/Effect");
	const before = structuredClone(state);
	const decision = Effect.runSync(kernel.changeEffect(state, create, facts));
	assert.equal(decision.outcome, "accepted");
	assert.deepEqual(decision.result, { workflow: "workflow:1" });
	assert.deepEqual(decision.writes[0], { type: "workflow.create", workflow: "workflow:1", title: "First" });
	assert.deepEqual(decision.facts, ["fact:1"]);
	assert.deepEqual(state, before);
});

test("Kernel Effect exposes authorization refusal as its typed failure before asking for identities", async () => {
	const Effect = await import("effect/Effect");
	const outcome = Effect.runSync(
		Effect.match(
			kernel.changeEffect(state, create, { ...facts, principal: { kind: "host", scope: "scheduling" }, ids: { fact: "fact:1" } }),
			{
				onFailure: (refusal) => refusal,
				onSuccess: () => assert.fail("an unauthorized host must not create a workflow"),
			},
		),
	);
	assert.equal(outcome.outcome, "refused");
	assert.equal(outcome.code, "forbidden_principal");
	assert.match(outcome.reason, /createWorkflow belongs to the human-decision family/);
});

test("Kernel Effect does not disguise a missing Ledger identity as a domain refusal", async () => {
	const Effect = await import("effect/Effect");
	assert.throws(() => Effect.runSync(kernel.changeEffect(state, create, { ...facts, ids: { fact: "fact:1" } })));
});
