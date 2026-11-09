// Render's credential store against a temporary auth.json, the real proper-lockfile and pi-coding-agent 1.5.0's own
// AuthStorage in a second process. Never the operator's real login file.
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { credentialStore, secretsFile } from "../src/engine/credentials.ts";
import type { Family } from "../src/engine/providers.ts";

const claude: Family = { name: "claude", provider: "anthropic", auth: "pi-login" };
const expired = { type: "oauth", access: "expired-access", refresh: "expired-refresh", expires: Date.now() - 60_000 };

async function authFile(content: Record<string, unknown>) {
	const dir = await mkdtemp(join(tmpdir(), "render-credentials-"));
	const path = join(dir, "auth.json");
	await writeFile(path, JSON.stringify(content, null, 2), { mode: 0o600 });
	return { dir, path, log: join(dir, "refreshes.log") };
}
const stored = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const refreshes = async (log: string) => (await readFile(log, "utf8").catch(() => "")).split("\n").filter(Boolean);

function pi(path: string, access: string, holdMs: number, log: string): { child: ChildProcess; locked: Promise<void> } {
	const child = spawn(process.execPath, ["test/support/pi-auth-worker.mjs", path, access, String(holdMs), log], {
		stdio: ["ignore", "pipe", "inherit"],
	});
	const locked = new Promise<void>((resolve) => child.stdout!.on("data", (chunk) => String(chunk).includes("locked") && resolve()));
	return { child, locked };
}

test("M3 Render waits for pi's lock and never writes while pi holds it", async () => {
	const f = await authFile({ anthropic: expired });
	try {
		const holder = pi(f.path, "pi-access", 1500, f.log);
		await holder.locked;
		const exited = once(holder.child, "exit");
		const store = credentialStore({ piAuth: f.path, secrets: () => ({ apiKeys: {} }), families: () => [claude] });
		let seen: unknown;
		await store.modify("anthropic", async (current) => {
			seen = current;
			return { ...(current as OAuthCredential), access: "render-access" };
		});
		assert.equal(holder.child.exitCode, 0, "Render's write must wait until pi has released its lock");
		await exited;
		assert.equal((seen as OAuthCredential).access, "pi-access", "Render must re-read under the lock, never write a stale read");
		assert.equal((await stored(f.path)).anthropic.access, "render-access");
	} finally {
		await rm(f.dir, { recursive: true, force: true });
	}
});

test("M2 Render and pi refreshing the same expired login at once refresh exactly once and agree", async () => {
	const f = await authFile({ anthropic: expired, openai: { type: "oauth", access: "kept", refresh: "kept", expires: 1 } });
	try {
		const store = credentialStore({ piAuth: f.path, secrets: () => ({ apiKeys: {} }), families: () => [claude] });
		const models = createModels({ credentials: store, authContext: { env: async () => undefined, fileExists: async () => false } });
		const real = anthropicProvider();
		const oauth = real.auth.oauth!;
		models.setProvider({
			...real,
			auth: {
				oauth: {
					...oauth,
					toAuth: async (credential) => ({ apiKey: credential.access }),
					refresh: async (credential) => {
						await writeFile(f.log, "render\n", { flag: "a" });
						return { ...credential, access: "render-access", expires: Date.now() + 3_600_000 };
					},
				},
			},
		});
		const holder = pi(f.path, "pi-access", 300, f.log);
		const [auth] = await Promise.all([models.getAuth("anthropic"), once(holder.child, "exit")]);
		assert.equal((await refreshes(f.log)).length, 1, "exactly one process may refresh a rotated login");
		const final = await stored(f.path);
		assert.equal(auth?.auth.apiKey, final.anthropic.access, "Render must end with the token now in the file");
		assert.ok(final.anthropic.expires > Date.now(), "the shared token must be valid");
		assert.equal(final.openai.access, "kept", "other logins in pi's file must survive Render's write");
	} finally {
		await rm(f.dir, { recursive: true, force: true });
	}
});

test("a Render write leaves auth.json at mode 0600", async () => {
	const f = await authFile({ anthropic: expired });
	try {
		await chmod(f.path, 0o644);
		const store = credentialStore({ piAuth: f.path, secrets: () => ({ apiKeys: {} }), families: () => [claude] });
		await store.modify("anthropic", async (current) => ({ ...(current as OAuthCredential), access: "next" }));
		assert.equal((await stat(f.path)).mode & 0o777, 0o600);
	} finally {
		await rm(f.dir, { recursive: true, force: true });
	}
});

test("reads are fresh, list shows no values, and Render never logs the operator out", async () => {
	const f = await authFile({ anthropic: expired });
	try {
		const store = credentialStore({ piAuth: f.path, secrets: () => ({ apiKeys: {} }), families: () => [claude] });
		assert.equal(((await store.read("anthropic")) as OAuthCredential).access, "expired-access");
		await writeFile(f.path, JSON.stringify({ anthropic: { ...expired, access: "pi-logged-in-again" } }));
		assert.equal(((await store.read("anthropic")) as OAuthCredential).access, "pi-logged-in-again", "no cached read");
		assert.deepEqual(await store.list(), [{ providerId: "anthropic", type: "oauth" }]);
		await assert.rejects(store.delete("anthropic"));
		assert.equal((await stored(f.path)).anthropic.access, "pi-logged-in-again");
	} finally {
		await rm(f.dir, { recursive: true, force: true });
	}
});

test("an api-key family reads its key from the secrets file on every use and never from pi's file", async () => {
	const f = await authFile({ deepseek: { type: "api_key", key: "from-pi-file" } });
	try {
		const secrets = join(f.dir, "secrets.json");
		await writeFile(secrets, JSON.stringify({ "api-key:deepseek": { value: "first", updatedAt: "2026-11-09T00:00:00.000Z" } }));
		const store = credentialStore({
			piAuth: f.path,
			secrets: secretsFile(secrets),
			families: () => [{ name: "deepseek", provider: "deepseek", auth: "api-key" }],
		});
		assert.deepEqual(await store.read("deepseek"), { type: "api_key", key: "first" });
		await writeFile(secrets, JSON.stringify({ "api-key:deepseek": { value: "second", updatedAt: "2026-11-09T00:00:01.000Z" } }));
		assert.deepEqual(await store.read("deepseek"), { type: "api_key", key: "second" });
		await assert.rejects(store.modify("deepseek", async () => ({ type: "api_key", key: "x" })));
		assert.equal(await store.read("anthropic"), undefined, "a provider without a configured family has no credential");
	} finally {
		await rm(f.dir, { recursive: true, force: true });
	}
});
