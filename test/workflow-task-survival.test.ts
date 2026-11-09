import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { ConversationId } from "@earendil-works/pi-durable";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, allowSameFamily, claudeFixture, packet, roleFixture } from "./support/roles.ts";

export async function until(check: () => boolean | Promise<boolean>) {
	const end = Date.now() + 5000;
	while (!(await check())) {
		assert.ok(Date.now() < end, "role did not settle within 5s");
		await setTimeout(10);
	}
}
function provider() {
	return fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
}
export function assignments(f: Awaited<ReturnType<typeof roleFixture>>): RoleAssignment[] {
	return (f.ledger.snapshot(admin) as import("../src/ledger/ledger.ts").Frame).assignments as RoleAssignment[];
}

test("R01/R07 accepted child survives submitting turn abort; own report and fixed parent notification survive reopen", async () => {
	const p = provider();
	let release!: () => void;
	const childGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	p.setResponses([
		fauxAssistantMessage(fauxToolCall("request_role", { key: "challenge" }, { id: "same-call-id" }), { stopReason: "toolUse" }),
		async () => {
			await childGate;
			return fauxAssistantMessage(
				fauxToolCall("submit_role_result", { supports: [], text: "Independent objection: retain exact bytes.\n" }, { id: "same-call-id" }),
				{ stopReason: "toolUse" },
			);
		},
		fauxAssistantMessage("Done"),
	]);
	const engine = new Engine({ provider: p.provider, ...claudeFixture });
	const f = await roleFixture(engine);
	await allowSameFamily(f.ledger);
	try {
		const accepted = await f.command({
			type: "assignTask",
			slice: "slice:1",
			delivery: true,
			packet: packet({ requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }),
		});
		assert.equal(accepted.status, "accepted");
		await until(() => assignments(f).length === 2);
		await (await f.harness.conversation(assignments(f)[0]!.conversation as ConversationId, BACKGROUND_CONTEXT))!.abort(BACKGROUND_CONTEXT);
		release();
		await until(() => assignments(f)[1]?.status === "submitted" && !assignments(f)[1]?.executing);
		const child = assignments(f)[1]!;
		assert.ok(child.report);
		assert.ok(child.task);
		assert.notEqual(child.conversation, assignments(f)[0]!.conversation);
		const report = await Effect.runPromise(f.ledger.artifact(admin, { read: child.report! }));
		assert.ok("content" in report);
		assert.equal(report.content.toString(), "Independent objection: retain exact bytes.\n");
		await f.reopen();
		assert.equal(assignments(f)[1]?.report, child.report);
		const retained = await Effect.runPromise(f.ledger.artifact(admin, { read: child.report! }));
		assert.ok("content" in retained);
		assert.equal(retained.content.toString(), "Independent objection: retain exact bytes.\n");
	} finally {
		release();
		await f.close();
	}
});

test("R02 same scoped role submission returns one receipt; new call rechecks eligibility; stale worker learns no receipt", async () => {
	const p = provider();
	const held = Promise.withResolvers<void>();
	p.setResponses([
		async () => {
			await held.promise;
			return fauxAssistantMessage("Done");
		},
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, ...claudeFixture }));
	try {
		const accepted = await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() }, undefined, "root");
		assert.equal(accepted.status, "accepted");
		const duplicate = await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() }, undefined, "root");
		assert.ok(duplicate.status === "accepted" && duplicate.duplicate);
		assert.equal(assignments(f).length, 1);
		await until(() => assignments(f)[0]?.executing === true);
		const a = assignments(f)[0]!;
		const identity = {
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: a.packet.role,
		} as const;
		const scoped = mintContext(identity);
		const submit = { type: "submitRoleResult", supports: [], text: "One exact report.\n" };

		const first = await f.command(submit, scoped, "submit-once");
		assert.ok(first.status === "accepted", JSON.stringify(first));
		const retried = await f.command(submit, scoped, "submit-once");
		assert.ok(retried.status === "accepted" && retried.duplicate, "retrying the same call must return its receipt");
		assert.deepEqual([retried.sequence, retried.result], [first.sequence, first.result]);
		assert.equal(assignments(f)[0]?.report, first.result.report);

		const second = await f.command(submit, scoped, "submit-again");
		assert.equal(
			"code" in second ? second.code : second.status,
			"assignment_not_running",
			"a new call must be rechecked against current executing authority",
		);
		assert.equal(assignments(f)[0]?.report, first.result.report);

		const own = await Effect.runPromise(f.ledger.receipt(scoped, "submit-once"));
		assert.ok(own.status === "accepted");
		assert.deepEqual(own.result, first.result);
		const stale = mintContext({ ...identity, attempt: "attempt:stale" });
		const learned = await Effect.runPromise(f.ledger.receipt(stale, "submit-once"));
		assert.equal(
			"code" in learned ? learned.code : learned.status,
			"unauthorized",
			"a stale worker must not learn another Attempt's receipt",
		);
		const refused = await Effect.runPromise(f.ledger.receipt(scoped, "submit-again"));
		assert.equal("code" in refused ? refused.code : refused.status, "not_found", "a refused call retains no receipt");
	} finally {
		held.resolve();
		await f.close();
	}
});
