import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import { packetSettings, withSettingsModels } from "../src/engine/settings.ts";
import type { EngineSettings, ModelEntry } from "../src/kernel/engine-settings.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import type { Frame, Ledger } from "../src/ledger/ledger.ts";
import { type AuthenticatedContext, mintContext } from "../src/ledger/principals.ts";
import { admin, editEngineSettings, packet, roleFixture, scheduler } from "./support/roles.ts";

type Revision = { revision: number; value: EngineSettings };
const current = (ledger: Ledger, context: AuthenticatedContext = admin) => (ledger.snapshot(context) as Frame).settings as Revision | null;
let n = 0;
const change = (ledger: Ledger, settings: unknown, expectedRevision: number, context: AuthenticatedContext = admin) =>
	Effect.runPromise(
		ledger.command(
			{
				version: 1,
				authorityEpoch: ledger.status().authorityEpoch,
				commandId: `engine-settings:${++n}`,
				command: { type: "changeEngineSettings", expectedRevision, settings },
			},
			context,
		),
	);
const withCoordinator = (s: EngineSettings, template: Partial<EngineSettings["roles"]["coordinator"]>): EngineSettings => ({
	...s,
	roles: { ...s.roles, coordinator: { ...s.roles.coordinator, ...template } },
});

test("default settings are revision 1 with Claude writers and ChatGPT reviewers", async () => {
	const f = await roleFixture();
	try {
		const s = current(f.ledger);
		assert.ok(s);
		assert.equal(s.revision, 1);
		assert.deepEqual(
			s.value.families.map((x) => [x.name, x.provider, x.auth]),
			[
				["claude", "anthropic", "pi-login"],
				["chatgpt", "openai", "pi-login"],
			],
		);
		for (const role of ["coordinator", "implementer", "candidate", "experiment-candidate", "experiment-parent"] as const)
			assert.deepEqual(s.value.roles[role].model, { provider: "anthropic", id: "claude-opus-5-5" }, role);
		for (const role of ["challenger", "audit-standards", "audit-contracts", "watchdog"] as const)
			assert.deepEqual(s.value.roles[role].model, { provider: "openai", id: "gpt-6.1-sol" }, role);
		assert.equal(s.value.schema, 1);
	} finally {
		await f.close();
	}
});

test("S1 a stale expected revision refuses and names the current revision", async () => {
	const f = await roleFixture();
	try {
		const base = current(f.ledger)!.value;
		const r2 = await change(f.ledger, withCoordinator(base, { maxTurns: 5 }), 1);
		assert.equal(r2.status, "accepted");
		const r3 = await change(f.ledger, withCoordinator(base, { maxTurns: 6 }), 2);
		assert.equal(r3.status, "accepted");
		assert.equal(current(f.ledger)!.revision, 3);
		const stale = await change(f.ledger, withCoordinator(base, { maxTurns: 7 }), 2);
		assert.equal(stale.status, "refused");
		assert.ok(stale.status === "refused" && stale.code === "stale_basis");
		assert.equal(stale.refs?.current, "3");
		assert.equal(current(f.ledger)!.value.roles.coordinator.maxTurns, 6, "a stale change must not apply");
		await f.reopen();
		assert.equal(current(f.ledger)!.revision, 3, "accepted revisions survive restart");
		assert.equal(current(f.ledger)!.value.roles.coordinator.maxTurns, 6);
	} finally {
		await f.close();
	}
});

test("S2 an existing packet keeps its revision; the next assignment uses the new one", async () => {
	const f = await roleFixture();
	try {
		const base = current(f.ledger)!.value;
		const rev3 = withCoordinator(base, { model: { provider: "anthropic", id: "claude-sonnet-4-6" }, thinking: "low", maxTurns: 3 });
		assert.equal((await change(f.ledger, rev3, 1)).status, "accepted");
		assert.equal((await change(f.ledger, rev3, 2)).status, "accepted");
		const built = packetSettings(current(f.ledger)!, "coordinator");
		assert.equal(built.settingsRevision, 3);
		assert.equal((await f.command({ type: "assignTask", slice: "slice:1", delivery: false, packet: packet(built) })).status, "accepted");
		const rev4 = withCoordinator(base, { model: { provider: "anthropic", id: "claude-opus-5-5" }, thinking: "high", maxTurns: 9 });
		assert.equal((await change(f.ledger, rev4, 3)).status, "accepted");
		const queued = ((f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[])[0]!;
		assert.equal(queued.packet.settingsRevision, 3);
		assert.equal(queued.packet.model, "claude-sonnet-4-6");
		assert.equal(queued.packet.thinking, "low");
		assert.equal(queued.packet.maxTurns, 3);
		const next = packetSettings(current(f.ledger)!, "coordinator");
		assert.deepEqual(
			{ ...next },
			{
				settingsRevision: 4,
				provider: "anthropic",
				model: "claude-opus-5-5",
				family: "claude",
				requiredFamily: "claude",
				thinking: "high",
				maxInputBytes: base.roles.coordinator.maxInputBytes,
				maxOutputTokens: base.roles.coordinator.maxOutputTokens,
				maxTurns: 9,
			},
		);
		assert.equal(packetSettings(current(f.ledger)!, "challenger").family, "chatgpt");
	} finally {
		await f.close();
	}
});

test("S3 an added model entry with a catalog base is accepted; invalid references refuse", async () => {
	const f = await roleFixture();
	try {
		const base = current(f.ledger)!.value;
		const terra: EngineSettings = {
			...base,
			models: [...base.models, { provider: "openai", id: "gpt-6.1-terra", family: "chatgpt", base: "gpt-6.1-sol", contextWindow: 400000 }],
			roles: { ...base.roles, watchdog: { ...base.roles.watchdog, model: { provider: "openai", id: "gpt-6.1-terra" } } },
		};
		const accepted = await change(f.ledger, terra, 1);
		assert.equal(accepted.status, "accepted", JSON.stringify(accepted));
		assert.equal(packetSettings(current(f.ledger)!, "watchdog").model, "gpt-6.1-terra");
		const invalid: [string, EngineSettings][] = [
			[
				"role model with no entry and no catalog model",
				{ ...base, roles: { ...base.roles, watchdog: { ...base.roles.watchdog, model: { provider: "openai", id: "gpt-6.1-terra" } } } },
			],
			[
				"family provider outside PROVIDERS",
				{ ...base, families: [...base.families, { name: "x", provider: "mistral" as never, auth: "api-key" }] },
			],
			[
				"base absent from the catalog",
				{ ...terra, models: [...base.models, { provider: "openai", id: "gpt-6.1-terra", family: "chatgpt", base: "gpt-9" }] },
			],
		];
		for (const [label, settings] of invalid) {
			const r = await change(f.ledger, settings, 2);
			assert.equal(r.status === "refused" && r.code, "invalid_content", label);
		}
		assert.equal(current(f.ledger)!.revision, 2);
	} finally {
		await f.close();
	}
});

test("S3 Engine resolves an added entry from its catalog base and the current entries", () => {
	let entries: ModelEntry[] = [
		{ provider: "openai", id: "gpt-6.1-terra", family: "chatgpt", base: "gpt-6.1-sol", contextWindow: 400000, maxTokens: 64000 },
	];
	const models = createModels({ authContext: { env: async () => undefined, fileExists: async () => false } });
	models.setProvider(withSettingsModels(openaiProvider(), () => entries));
	const sol = models.getModel("openai", "gpt-6.1-sol");
	const terra = models.getModel("openai", "gpt-6.1-terra");
	assert.ok(sol && terra);
	assert.equal(terra.provider, "openai");
	assert.equal(terra.api, sol.api);
	assert.equal(terra.baseUrl, sol.baseUrl);
	assert.equal(terra.contextWindow, 400000);
	assert.equal(terra.maxTokens, 64000);
	entries = [];
	assert.equal(models.getModel("openai", "gpt-6.1-terra"), undefined, "a later revision without the entry no longer resolves it");
});

/** A temporary pi login file with an openai login, never the operator's. */
async function openaiLogin() {
	const dir = await mkdtemp(join(tmpdir(), "render-engine-settings-"));
	const path = join(dir, "auth.json");
	await writeFile(path, JSON.stringify({ openai: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 3_600_000 } }));
	return { path, remove: () => rm(dir, { recursive: true, force: true }) };
}
async function settled(f: Awaited<ReturnType<typeof roleFixture>>, status: RoleAssignment["status"]) {
	for (let n = 0; n < 500; n++) {
		const a = ((f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[])[0];
		if (a?.status === status && !a.executing) return a;
		await setTimeout(10);
	}
	throw new Error(`role did not reach ${status}`);
}
const chatgptPacket = (model: string) => packet({ provider: "openai", model, family: "chatgpt", requiredFamily: "chatgpt" });

test("S3 a role runs on a settings-added model through its registered provider", async () => {
	const login = await openaiLogin();
	const p = fauxProvider({ provider: "openai", api: "openai-responses", models: [{ id: "gpt-6.1-sol" }] });
	let requested: string | undefined;
	p.setResponses([
		(_context, _options, _state, model) => {
			requested = model.id;
			return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Own bounded report." }), {
				stopReason: "toolUse",
			});
		},
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, piAuth: login.path }));
	try {
		await editEngineSettings(f.ledger, (s) => ({
			...s,
			models: [{ provider: "openai", id: "gpt-6.1-terra", family: "chatgpt", base: "gpt-6.1-sol" }],
		}));
		await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: chatgptPacket("gpt-6.1-terra") });
		await settled(f, "submitted");
		assert.equal(requested, "gpt-6.1-terra");
	} finally {
		await f.close();
		await login.remove();
	}
});

test("Engine checks a packet's family against the current settings revision", async () => {
	const login = await openaiLogin();
	const f = await roleFixture(new Engine({ piAuth: login.path }));
	try {
		await editEngineSettings(f.ledger, (s) => ({
			...s,
			families: s.families.map((family) => (family.name === "chatgpt" ? { ...family, name: "gpt" } : family)),
		}));
		await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: chatgptPacket("gpt-6.1-sol") });
		assert.equal((await settled(f, "blocked")).blocker, "required_model_family_unavailable");
	} finally {
		await f.close();
		await login.remove();
	}
});

test("S4 only a project-wide human changes or reads Engine settings", async () => {
	const f = await roleFixture();
	try {
		const base = current(f.ledger)!.value;
		assert.equal((await f.command({ type: "assignTask", slice: "slice:1", delivery: false, packet: packet() })).status, "accepted");
		const a = ((f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[])[0]!;
		const agent = mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: a.packet.role,
		});
		for (const context of [scheduler, agent]) {
			const r = await change(f.ledger, base, 1, context);
			assert.equal(r.status === "refused" && r.code, "forbidden_principal");
		}
		const enrolled = await Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "enroll-narrow",
					command: { type: "enrollDevice", label: "narrow", scope: { workflows: ["workflow:2"] } },
				},
				admin,
			),
		);
		assert.ok(enrolled.status === "accepted");
		const narrow = mintContext({
			kind: "human",
			human: "human:owner",
			route: "device",
			device: String(enrolled.result.device),
			workflows: ["workflow:2"],
		});
		const r = await change(f.ledger, base, 1, narrow);
		assert.equal(r.status === "refused" && r.code, "forbidden_scope");
		assert.equal(current(f.ledger, narrow), null, "a narrow device does not see settings");
		assert.equal(current(f.ledger)!.revision, 1);
	} finally {
		await f.close();
	}
});

test("settings revisions are retained and exported with their author", async () => {
	const f = await roleFixture();
	try {
		const base = current(f.ledger)!.value;
		assert.equal((await change(f.ledger, withCoordinator(base, { maxTurns: 5 }), 1)).status, "accepted");
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: {} }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		const records = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((r) => r.kind === "engine_settings");
		assert.equal(records.length, 1);
		assert.equal(records[0].settings.revision, 2);
		assert.equal(records[0].settings.value.roles.coordinator.maxTurns, 5);
		assert.deepEqual(records[0].createdBy, { principal: "human", route: "local-admin" });
	} finally {
		await f.close();
	}
});
