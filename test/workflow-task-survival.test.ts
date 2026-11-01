import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

export async function until(check: () => boolean | Promise<boolean>) {
	const end = Date.now() + 5000;
	while (!(await check())) { assert.ok(Date.now() < end, "role did not settle within 5s"); await setTimeout(10); }
}
function provider() {
	return fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
}
export function assignments(f: Awaited<ReturnType<typeof roleFixture>>): RoleAssignment[] {
	return f.ledger.snapshot(admin).assignments as RoleAssignment[];
}

test("R01/R07 accepted child survives submitting turn abort; own report and fixed parent notification survive reopen", async () => {
	const p = provider();
	p.setResponses([
		fauxAssistantMessage(fauxToolCall("request_role", { key: "challenge" }, { id: "same-call-id" }), { stopReason: "toolUse" }),
		fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "Independent objection: retain exact bytes.\n" }, { id: "same-call-id" }), { stopReason: "toolUse" }),
		fauxAssistantMessage("Done"),
	]);
	const engine = new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } });
	const f = await roleFixture(engine);
	try {
		const accepted = await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet({ requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }) });
		assert.equal(accepted.status, "accepted");
		await until(() => assignments(f).length === 2);
		await engine.abortConversation(assignments(f)[0]!.id);
		await until(() => assignments(f)[1]?.status === "submitted");
		const child = assignments(f)[1]!;
		assert.ok(child.report);
		assert.ok(child.task);
		assert.notEqual(child.conversation, assignments(f)[0]!.conversation);
		const report = await f.ledger.artifact(admin, { read: child.report! });
		assert.ok("content" in report);
		assert.equal(report.content.toString(), "Independent objection: retain exact bytes.\n");
		await f.reopen();
		assert.equal(assignments(f)[1]?.report, child.report);
		const retained = await f.ledger.artifact(admin, { read: child.report! });
		assert.ok("content" in retained);
		assert.equal(retained.content.toString(), "Independent objection: retain exact bytes.\n");
	} finally { await f.close(); }
});

test("R02 same scoped role submission returns one receipt; new call rechecks eligibility; stale worker learns no receipt", async () => {
	const f = await roleFixture();
	try {
		const accepted = await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() }, undefined, "root");
		assert.equal(accepted.status, "accepted");
		const duplicate = await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() }, undefined, "root");
		assert.ok(duplicate.status === "accepted" && duplicate.duplicate);
		assert.equal(assignments(f).length, 1);
		const a = assignments(f)[0]!;
		const scoped = mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
		const forged = await f.command({ type: "submitRoleResult", text: "not running" }, scoped, "forged");
		assert.equal(forged.status, "refused");
		const canceled = await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin);
		assert.equal(canceled.status, "accepted");
		assert.equal((await f.ledger.receipt(scoped, "forged")).status, "refused");
	} finally { await f.close(); }
});
