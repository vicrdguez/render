import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import { change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { decision } from "./support/kernel.ts";
import { admin, claudeFixture, packet, roleFixture } from "./support/roles.ts";

// These values are literal accepted-boundary oracles, not derived from report implementation.
test("B4 Kernel requires an explicit web reliance declaration and own promoted support", () => {
	const facts: VerifiedFacts = {
		principal: { kind: "assignment-agent", assignment: "assignment:1", generation: 1, attempt: "attempt:1", role: "coordinator" },
		sequence: 5,
		executorEpoch: "executor:1",
		ids: { revision: "revision:6", fact: "fact:6" },
	};
	const a: RoleAssignment = {
		id: "assignment:1",
		workflow: "workflow:1",
		slice: "slice:1",
		generation: 1,
		attempt: "attempt:1",
		executorEpoch: "executor:1",
		packet: packet(),
		packetRef: "packet:1",
		conversation: 1,
		task: 1,
		parent: null,
		requestKey: null,
		delivery: true,
		status: "running",
		executing: true,
		executionOrdinal: 1,
		blocker: null,
		report: null,
		evidence: ["revision:5"],
	};
	const state: KernelState = {
		workflow: { id: "workflow:1", messageCount: 0 },
		document: null,
		device: null,
		roleWork: { assignments: [a] },
	};
	for (const [declaration, expected] of [
		[{}, "invalid_content"],
		[{ supports: ["web:temporary"] }, "missing_content"],
		[{ supports: ["revision:foreign"] }, "missing_content"],
		[{ supports: [] }, "none"],
		[{ supports: ["revision:5"] }, "retained"],
	] as const) {
		const before = structuredClone(state);
		const d = decision(
			change(state, { type: "submitRoleResult", workflow: "workflow:1", text: "Exact report.", ...declaration } as never, facts),
		);
		assert.equal(
			d.outcome === "refused" ? d.code : d.result.webEvidence,
			expected,
			"omitted declaration must not authorize report reliance",
		);
		if (d.outcome === "accepted") {
			if (expected === "retained") assert.equal(d.result.support0, "revision:5");
			for (const write of d.writes)
				if (write.type === "fact.record") assert.equal("webEvidence" in write.refs, false, "a declaration is not an artifact ref");
		}
		assert.deepEqual(state, before, "Kernel remains pure");
	}
});

test("B4 registered report omission refuses; explicit no-web declaration survives export and restart", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let f!: Awaited<ReturnType<typeof roleFixture>>;
	let checked = false;
	p.setResponses([
		fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "Not yet declared." }), { stopReason: "toolUse" }),
		async (ctx) => {
			const tool = ctx.messages.filter((m) => m.role === "toolResult").at(-1)!;
			assert.equal(tool.isError, true, "registered report must refuse omitted declaration");
			const a = (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments[0]!;
			assert.equal(a.report, null);
			const own = mintContext({
				kind: "assignment-agent",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				role: a.packet.role,
			});
			for (const declaration of [{}, { supports: null }, { supports: "none" }, { supports: Array(33).fill("revision:4") }]) {
				const reply = await f.command({ type: "submitRoleResult", text: "Undeclared.", ...declaration }, own);
				assert.equal(
					"code" in reply ? reply.code : reply.status,
					"malformed_envelope",
					"Ledger must refuse missing or malformed declaration",
				);
			}
			checked = true;
			return fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "No web reliance.\r\n", supports: [] }), {
				stopReason: "toolUse",
			});
		},
	]);
	f = await roleFixture(new Engine({ provider: p.provider, ...claudeFixture }));
	try {
		await f.command({ type: "assignTask", slice: "slice:declaration", delivery: true, packet: packet() });
		let a!: RoleAssignment;
		for (let n = 0; n < 300; n++) {
			a = (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments[0]!;
			if (!a.executing && (a.status === "submitted" || a.status === "blocked")) break;
			await setTimeout(10);
		}
		assert.ok(checked, "registered report must refuse omitted declaration before accepting correction");
		assert.equal(a.status, "submitted");
		await f.reopen();
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("jsonl" in exported);
		assert.match(exported.jsonl, /"webEvidence":"none"/, "retained result must distinguish explicit no-reliance from historical omission");
		assert.equal(Buffer.from(exported.content[a.report!]!, "base64").toString(), "No web reliance.\r\n");
	} finally {
		await f.close();
	}
});
