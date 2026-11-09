// Engine authenticates each role through the credential store of its packet's provider. The scripted provider stands
// in for the network only; auth resolution is the real provider's, against a temporary auth.json or secrets file.
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { secretsFile } from "../src/engine/credentials.ts";
import type { Family } from "../src/engine/providers.ts";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

const claude: Family = { name: "claude", provider: "anthropic", auth: "pi-login" };
const chatgpt: Family = { name: "chatgpt", provider: "openai", auth: "pi-login" };
const OPENAI_TOKEN = "openai-access-token-must-not-leak-7f3a";
const DEEPSEEK_KEY = "sk-deepseek-key-must-not-leak-91c2";

type Fixture = Awaited<ReturnType<typeof roleFixture>>;

async function scratch(files: Record<string, unknown>) {
	const dir = await mkdtemp(join(tmpdir(), "render-models-"));
	for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), JSON.stringify(content), { mode: 0o600 });
	return dir;
}
async function settled(f: Fixture, status: RoleAssignment["status"]) {
	for (let n = 0; n < 500; n++) {
		const a = ((f.ledger.snapshot(admin) as { assignments: RoleAssignment[] }).assignments ?? [])[0];
		if (a?.status === status && !a.executing) return a;
		await setTimeout(10);
	}
	throw new Error(`role did not reach ${status}`);
}
const submit = () =>
	fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Own bounded report." }), { stopReason: "toolUse" });

/** The secret must be absent from every record, packet, receipt and export Render keeps. */
async function assertAbsent(f: Fixture, secret: string) {
	const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
	assert.ok("manifest" in exported);
	const decoded = Object.values(exported.content).map((value) => Buffer.from(value, "base64").toString());
	assert.ok(!`${exported.jsonl}${decoded.join("")}`.includes(secret), "the secret leaked into an export");
	assert.ok(!JSON.stringify(f.ledger.snapshot(admin)).includes(secret), "the secret leaked into a snapshot or packet");
	const files = (await readdir(f.data, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
	for (const file of files)
		assert.ok(!(await readFile(join(file.parentPath, file.name))).includes(secret), `the secret leaked into ${file.name}`);
}

test("M1 a role on openai/gpt-6.1-sol authenticates with the operator's openai pi login and stores no token", async () => {
	const dir = await scratch({ "auth.json": { openai: { type: "oauth", access: OPENAI_TOKEN, refresh: "r", expires: Date.now() + 3_600_000 } } });
	const p = fauxProvider({ provider: "openai", api: "openai-responses", models: [{ id: "gpt-6.1-sol" }] });
	let carried: string | undefined;
	p.setResponses([
		(_context, options) => {
			carried = options?.apiKey;
			return submit();
		},
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, families: [chatgpt], piAuth: join(dir, "auth.json") }));
	try {
		const assigned = await f.command({
			type: "assignTask",
			slice: "slice:1",
			delivery: true,
			packet: packet({ provider: "openai", model: "gpt-6.1-sol", family: "chatgpt", requiredFamily: "chatgpt" }),
		});
		assert.equal(assigned.status, "accepted", JSON.stringify(assigned));
		await settled(f, "submitted");
		assert.equal(carried, OPENAI_TOKEN, "the request must carry the stored openai login");
		await assertAbsent(f, OPENAI_TOKEN);
	} finally {
		await f.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("M4 an absent login blocks with its provider and makes no request, even with an ambient API key", async () => {
	const dir = await scratch({ "auth.json": { openai: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 3_600_000 } } });
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses([submit()]);
	process.env.ANTHROPIC_API_KEY = "ambient-key";
	const f = await roleFixture(new Engine({ provider: p.provider, families: [claude, chatgpt], piAuth: join(dir, "auth.json") }));
	try {
		await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() });
		const a = await settled(f, "blocked");
		assert.equal(a.blocker, "native_provider_configuration_missing: anthropic");
		assert.equal(p.state.callCount, 0, "a blocked role must not reach its provider");
	} finally {
		delete process.env.ANTHROPIC_API_KEY;
		await f.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("M5 a deepseek api-key family carries the key from the secrets file and stores it nowhere", async () => {
	const dir = await scratch({ "secrets.json": { "api-key:deepseek": { value: DEEPSEEK_KEY, updatedAt: "2026-11-09T00:00:00.000Z" } } });
	const p = fauxProvider({ provider: "deepseek", api: "openai-completions", models: [{ id: "deepseek-chat" }] });
	let carried: string | undefined;
	p.setResponses([
		(_context, options) => {
			carried = options?.apiKey;
			return submit();
		},
	]);
	const f = await roleFixture(
		new Engine({
			provider: p.provider,
			families: [{ name: "deepseek", provider: "deepseek", auth: "api-key" }],
			secrets: secretsFile(join(dir, "secrets.json")),
		}),
	);
	try {
		const assigned = await f.command({
			type: "assignTask",
			slice: "slice:1",
			delivery: true,
			packet: packet({ provider: "deepseek", model: "deepseek-chat", family: "deepseek", requiredFamily: "deepseek" }),
		});
		assert.equal(assigned.status, "accepted", JSON.stringify(assigned));
		await settled(f, "submitted");
		assert.equal(carried, DEEPSEEK_KEY);
		await assertAbsent(f, DEEPSEEK_KEY);
	} finally {
		await f.close();
		await rm(dir, { recursive: true, force: true });
	}
});

test("M6 a model the pinned catalog lacks blocks with required_model_unavailable", async () => {
	const dir = await scratch({ "auth.json": { openai: { type: "oauth", access: "a", refresh: "r", expires: Date.now() + 3_600_000 } } });
	const f = await roleFixture(new Engine({ families: [chatgpt], piAuth: join(dir, "auth.json") }));
	try {
		await f.command({
			type: "assignTask",
			slice: "slice:1",
			delivery: true,
			packet: packet({ provider: "openai", model: "gpt-not-in-catalog", family: "chatgpt", requiredFamily: "chatgpt" }),
		});
		assert.equal((await settled(f, "blocked")).blocker, "required_model_unavailable");
	} finally {
		await f.close();
		await rm(dir, { recursive: true, force: true });
	}
});
