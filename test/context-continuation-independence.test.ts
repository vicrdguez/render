import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { admin, claudeFixture, packet, roleFixture } from "./support/roles.ts";

function assignments(f: Awaited<ReturnType<typeof roleFixture>>) {
	const frame = f.ledger.snapshot(admin);
	assert.ok("assignments" in frame);
	return frame.assignments as RoleAssignment[];
}
async function blocked(f: Awaited<ReturnType<typeof roleFixture>>) {
	for (let n = 0; n < 200; n++) {
		if (assignments(f)[0]?.status === "blocked") return;
		await setTimeout(10);
	}
	assert.fail("expected configuration blocker");
}

test("context-continuation-independence: replacement requires fencing and quiescence, creates fresh linked non-fork context", async () => {
	const f = await roleFixture();
	try {
		await f.command({ type: "assignTask", slice: "replace", delivery: true, packet: packet() });
		await blocked(f);
		let old = assignments(f)[0]!;
		const replacement = () =>
			f.command({
				type: "replaceTask",
				assignment: old.id,
				generation: old.generation,
				attempt: old.attempt,
				packet: packet({ role: "implementer" }),
			});
		assert.equal((await replacement()).status, "refused");
		await f.command({ type: "fenceAttempt", assignment: old.id, generation: old.generation, attempt: old.attempt });
		old = assignments(f)[0]!;
		const uncertain = await f.command({
			type: "recordQuiescence",
			assignment: old.id,
			generation: old.generation,
			attempt: old.attempt,
			providerIdle: true,
			environment: "unknown",
			effects: "unknown",
		});
		assert.ok(uncertain.status === "refused" && uncertain.code === "quiescence_unconfirmed");
		for (let n = 0; n < 200 && assignments(f)[0]?.status !== "canceled"; n++) await setTimeout(10);
		old = assignments(f)[0]!;
		assert.equal(old.status, "canceled");
		const replaced = await replacement();
		assert.equal(replaced.status, "accepted");
		const fresh = assignments(f)[1]!;
		assert.notEqual(fresh.conversation, old.conversation);
		assert.notEqual(fresh.id, old.id);
		assert.equal(fresh.predecessor, old.id);
		assert.equal(fresh.delivery, true);
		assert.equal(fresh.generation, 1);
		assert.equal(fresh.packet.role, "implementer");
		assert.equal(assignments(f)[0]?.status, "canceled");
		await f.reopen();
		assert.equal(assignments(f)[1]?.predecessor, old.id);
		const bundle = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in bundle && bundle.manifest.complete);
		assert.ok(bundle.jsonl.includes(old.id));
		assert.ok(bundle.jsonl.includes(fresh.id));
	} finally {
		await f.close();
	}
});

test("context-continuation-independence: same-family review requires recorded human policy direction", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let requestOutput = "";
	p.setResponses([
		fauxAssistantMessage(fauxToolCall("request_role", { key: "review" }), { stopReason: "toolUse" }),
		(ctx) => {
			const result = ctx.messages.find((m) => m.role === "toolResult" && m.toolName === "request_role");
			assert.ok(result?.role === "toolResult", "the parent's role request must reach its tool");
			requestOutput = result.content.map((c) => (c.type === "text" ? c.text : "")).join("");
			return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Parent report without a review.\n" }), {
				stopReason: "toolUse",
			});
		},
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, ...claudeFixture }));
	try {
		await f.command({
			type: "assignTask",
			slice: "diversity",
			delivery: true,
			packet: packet({ requests: [{ key: "review", packet: packet({ role: "challenger" }) }] }),
		});
		for (let n = 0; n < 300 && assignments(f).length === 1 && assignments(f)[0]?.status !== "submitted"; n++) await setTimeout(10);
		assert.equal(assignments(f).length, 1, "same-family review must not silently start without human direction");
		assert.equal(assignments(f)[0]?.status, "submitted", "the parent must reach and continue past its role request");
		const reply = JSON.parse(requestOutput);
		assert.deepEqual(
			[reply.status, reply.code],
			["refused", "capability_unavailable"],
			"same-family request must be refused for missing human direction",
		);
		assert.match(reply.reason, /recorded human policy direction/);
	} finally {
		await f.close();
	}
});

test("context-continuation-independence: forbidden scheduling refuses before private input lookup", async () => {
	const f = await roleFixture();
	try {
		for (const type of ["assignTask", "replaceTask"]) {
			const reply = await f.command(
				type === "assignTask"
					? { type, slice: "forbidden", delivery: false, packet: packet({ inputs: ["revision:private-missing"] }) }
					: {
							type,
							assignment: "assignment:missing",
							generation: 1,
							attempt: "attempt:missing",
							packet: packet({ inputs: ["revision:private-missing"] }),
						},
				admin,
			);
			assert.ok(
				reply.status === "refused" && reply.code === "forbidden_principal",
				"scheduling principal must be checked before input-dependent diagnostics",
			);
		}
	} finally {
		await f.close();
	}
});

for (const source of [
	{ role: "watchdog", kind: "packet" },
	{ role: "candidate", kind: "report" },
] as const) {
	test(`context-continuation-independence: watchdog cannot inherit earlier ${source.role} ${source.kind}`, async () => {
		const canary = "PRIVATE-RESULT-CANARY-6";
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		p.setResponses([fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: canary }), { stopReason: "toolUse" })]);
		const f = await roleFixture(new Engine({ provider: p.provider, ...claudeFixture }));
		try {
			assert.equal(
				(
					await f.command({
						type: "assignTask",
						slice: "private-source",
						delivery: false,
						packet: packet({ role: source.role }),
					})
				).status,
				"accepted",
			);
			for (let n = 0; n < 300 && !assignments(f)[0]?.runtimeTaskCaptured; n++) await setTimeout(10);
			const prior = assignments(f)[0]!;
			assert.equal(prior.status, "submitted");
			const ref = source.kind === "packet" ? prior.packetRef : prior.report;
			assert.ok(ref);
			const retained = await Effect.runPromise(f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in retained);
			if (source.kind === "report") assert.equal(retained.content.toString(), canary);
			const reply = await f.command({
				type: "assignTask",
				slice: "independent",
				delivery: false,
				packet: packet({ role: "watchdog", inputs: [ref] }),
			});
			assert.ok(reply.status === "refused" && reply.code === "forbidden_scope", JSON.stringify(reply));
			assert.equal(assignments(f).length, 1);
		} finally {
			await f.close();
		}
	});
}

for (const role of ["challenger", "candidate", "audit-standards", "audit-contracts", "watchdog"] as const) {
	test(`context-continuation-independence: ${role} cannot inherit an earlier private packet canary`, async () => {
		const f = await roleFixture();
		try {
			await f.command({
				type: "assignTask",
				slice: "private",
				delivery: false,
				packet: packet({ role: "candidate", expectedOutput: "PRIVATE-CANDIDATE-CANARY-6" }),
			});
			await blocked(f);
			const prior = assignments(f)[0]!;
			const reply = await f.command({
				type: "assignTask",
				slice: "independent",
				delivery: false,
				packet: packet({ role, inputs: [prior.packetRef] }),
			});
			assert.ok(reply.status === "refused" && reply.code === "forbidden_scope", JSON.stringify(reply));
			assert.equal(assignments(f).length, 1);
		} finally {
			await f.close();
		}
	});
}
