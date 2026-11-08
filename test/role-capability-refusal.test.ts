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
	for (const [overrides, expected] of [
		[{}, "native_provider_configuration_missing"],
		[{ requiredFamily: "other" }, "required_model_family_unavailable"],
		[{ execution: "linux-writer" as const }, "sandbox_capability_unavailable"],
		[{ maxInputBytes: 1 }, "required_inputs_do_not_fit"],
	] as const) {
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		const providerInstalled = Object.keys(overrides).length > 0;
		const engine = providerInstalled
			? new Engine({ provider: p.provider, apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" } })
			: new Engine();
		const f = await roleFixture(engine);
		try {
			assert.equal(
				(await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet(overrides) })).status,
				"accepted",
			);
			const a = await blocked(f);
			assert.equal(a.blocker, expected, `${JSON.stringify(overrides)} must block for its own reason`);
			assert.equal(a.executing, false);
			if (providerInstalled) assert.equal(p.state.callCount, 0, "a blocked role must not reach its installed provider");
			const own = mintContext({ kind: "assignment-agent", assignment: a.id, generation: 1, attempt: a.attempt, role: a.packet.role });
			const foreign = await f.ledger.artifact(own, { read: "revision:999" });
			assert.equal("code" in foreign ? foreign.code : "disclosed", "not_found");
		} finally {
			await f.close();
		}
	}
});

test("R03 forged model command IDs produce no report; missing retained inputs refuse assignment", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses([
		() =>
			fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "forged", commandId: "model-id" }), {
				stopReason: "toolUse",
			}),
		fauxAssistantMessage("No submission"),
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" } }));
	try {
		await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() });
		const a = await blocked(f);
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
