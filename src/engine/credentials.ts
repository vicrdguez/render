// The only module that knows pi's auth.json format and lock protocol (pi-coding-agent 1.5.0 AuthStorage): a
// proper-lockfile lock on the file itself, a re-read under the lock, and the OAuth refresh inside `modify`, so pi
// and Render can refresh the same login without overwriting each other. Nothing here caches or returns a value
// outside the CredentialStore interface Pi AI's Models consumes.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import lockfile from "proper-lockfile";
import type { Family, ProviderId } from "./providers.ts";

/** The host-only secrets, read afresh on every call. */
export type SecretsFile = () => { readonly apiKeys: Readonly<Partial<Record<ProviderId, string>>> };

/** `<data>/secrets.json`: `{"api-key:<provider>": {"value", "updatedAt"}, ...}`, mode 0600, outside the store. */
export function secretsFile(path: string): SecretsFile {
	return () => {
		const stored = readJson(path) as Record<string, { value?: unknown }>;
		const apiKeys: Partial<Record<ProviderId, string>> = {};
		for (const [name, secret] of Object.entries(stored))
			if (name.startsWith("api-key:") && typeof secret?.value === "string") apiKeys[name.slice(8) as ProviderId] = secret.value;
		return { apiKeys };
	};
}

const LOCK_WAIT_MS = 30_000;

export function credentialStore(options: {
	readonly piAuth: string | undefined;
	readonly secrets: SecretsFile;
	readonly families: () => readonly Family[];
}): CredentialStore {
	const piLogins = () => (options.piAuth ? (readJson(options.piAuth) as Record<string, Credential>) : {});
	const readers: Record<Family["auth"], (provider: ProviderId) => Credential | undefined> = {
		"pi-login": (provider) => piLogins()[provider],
		"api-key": (provider) => {
			const key = options.secrets().apiKeys[provider];
			return key ? { type: "api_key", key } : undefined;
		},
	};
	const family = (provider: string) => options.families().find((f) => f.provider === provider);
	const read = (provider: string) => {
		const f = family(provider);
		return f ? readers[f.auth](f.provider) : undefined;
	};
	return {
		read: async (provider) => read(provider),
		list: async () =>
			[...new Set(options.families().map((f) => f.provider))].flatMap((providerId) => {
				const credential = read(providerId);
				return credential ? [{ providerId, type: credential.type }] : [];
			}),
		modify: async (provider, fn) => {
			const path = options.piAuth;
			if (family(provider)?.auth !== "pi-login" || !path) throw new Error(`Render does not write the ${provider} credential.`);
			let compromised: Error | undefined;
			const release = await lock(path, (error) => {
				compromised = error;
			});
			try {
				const logins = piLogins();
				const current = logins[provider];
				const next = await fn(current);
				if (compromised) throw compromised;
				if (next === undefined || isDeepStrictEqual(next, current)) return current;
				writeFileSync(path, JSON.stringify({ ...logins, [provider]: next }, null, 2), { encoding: "utf8", mode: 0o600 });
				chmodSync(path, 0o600);
				return next;
			} finally {
				await release().catch(() => {});
			}
		},
		delete: async () => {
			throw new Error("Render never removes a pi login.");
		},
	};
}

/** pi's acquisition: no library retries, a 30-second stale bound, and jittered backoff while another holder has it. */
async function lock(path: string, onCompromised: (error: Error) => void): Promise<() => Promise<void>> {
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (let retry = 0; ; retry++) {
		try {
			return await lockfile.lock(path, { realpath: false, retries: 0, stale: LOCK_WAIT_MS, onCompromised });
		} catch (error) {
			const remaining = deadline - Date.now();
			if ((error as { code?: string }).code !== "ELOCKED" || remaining <= 0) throw error;
			await sleep(Math.min(Math.round(Math.min(10 * 2 ** retry, 1000) * (1 + Math.random())), remaining));
		}
	}
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}
