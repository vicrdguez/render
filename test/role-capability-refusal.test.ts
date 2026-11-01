import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

async function blocked(f: Awaited<ReturnType<typeof roleFixture>>) {
	for (let n = 0; n < 500; n++) {
		const a = ((f.ledger.snapshot(admin) as import("../src/ledger/ledger.ts").Frame).assignments as RoleAssignment[])[0];
		if (a?.status === "blocked") return a;
		await setTimeout(10);
	}
	throw new Error("missing visible blocker");
}

test("R04 missing provider, family, sandbox and overflowing constraints block without provider calls", async () => {
	for (const overrides of [{}, { requiredFamily: "other" }, { execution: "linux-writer" as const }, { maxInputBytes: 1 }]) {
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		const engine =
			Object.keys(overrides).length === 0
				? new Engine()
				: new Engine({ provider: p.provider, apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" } });
		const f = await roleFixture(engine);
		try {
			assert.equal(
				(await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet(overrides) })).status,
				"accepted",
			);
			const a = await blocked(f);
			assert.ok(a.blocker);
			assert.equal(a.executing, false);
			assert.equal(p.state.callCount, 0);
			const own = mintContext({ kind: "assignment-agent", assignment: a.id, generation: 1, attempt: a.attempt, role: a.packet.role });
			const foreign = await f.ledger.artifact(own, { read: "revision:999" });
			assert.equal("code" in foreign ? foreign.code : "disclosed", "not_found");
		} finally {
			await f.close();
		}
	}
});

test("R03 explicit role configuration does not inherit tools; model IDs cannot override host identity", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let visibleTools: string[] = [];
	p.setResponses([
		(ctx) => {
			visibleTools = ctx.messages.flatMap((m) => (m.role === "system" ? (m.toolsAdded ?? []).map((t) => t.name) : [])).sort();
			return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "forged", commandId: "model-id" }), { stopReason: "toolUse" });
		},
		fauxAssistantMessage("No submission"),
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" } }));
	try {
		await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() });
		const a = await blocked(f);
		assert.deepEqual(
			visibleTools,
			[
				"read_artifact",
				"read_web_result",
				"request_own_stop",
				"request_role",
				"retain_web_evidence",
				"submit_role_result",
				"web_contents",
				"web_search",
			],
			"role must not inherit broad tools",
		);
		assert.equal(a.report, null);
		assert.equal(a.blocker, "role_did_not_submit");
		const missing = await f.command({
			type: "assignTask",
			slice: "slice:2",
			delivery: true,
			packet: packet({ principles: "revision:999" }),
		});
		assert.equal("code" in missing ? missing.code : missing.status, "missing_content");
	} finally {
		await f.close();
	}
});
