// Host-only secrets: the one module that knows `<data>/secrets.json`, a 0600 JSON file outside the store, export and
// packets. Values are written and read by Engine, never listed.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import type { SecretsFile } from "../engine/credentials.ts";
import { PROVIDERS, type ProviderId } from "../engine/providers.ts";

export type SecretName = "github-token" | "exa" | "tavily" | `api-key:${ProviderId}`;
export const SECRET_NAMES: readonly SecretName[] = [
	"github-token",
	"exa",
	"tavily",
	...(Object.keys(PROVIDERS) as ProviderId[]).map((p) => `api-key:${p}` as const),
];
export const isSecretName = (name: string): name is SecretName => SECRET_NAMES.includes(name as SecretName);

export type SecretStatus = { readonly name: SecretName; readonly set: boolean; readonly updatedAt: string | null };
type Stored = Partial<Record<SecretName, { value: string; updatedAt: string }>>;

/** Every read loads the file afresh, so a new value applies to the next use. */
export type Secrets = SecretsFile & {
	read(name: SecretName): string | undefined;
	list(): SecretStatus[];
	set(name: SecretName, value: string): Promise<SecretStatus & { readonly set: true; readonly updatedAt: string }>;
};

/** `{"<name>": {"value", "updatedAt"}, ...}` */
export function secretsFile(path: string): Secrets {
	const load = (): Stored => {
		try {
			return JSON.parse(readFileSync(path, "utf8")) as Stored;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw error;
		}
	};
	const own = (stored: Stored, name: SecretName) => (Object.hasOwn(stored, name) ? stored[name] : undefined);
	let writing = Promise.resolve();
	return {
		read(name) {
			return own(load(), name)?.value;
		},
		apiKeys() {
			const stored = load();
			return Object.fromEntries(
				(Object.keys(PROVIDERS) as ProviderId[]).flatMap((p) => {
					const value = own(stored, `api-key:${p}`)?.value;
					return value === undefined ? [] : [[p, value]];
				}),
			);
		},
		list() {
			const stored = load();
			return SECRET_NAMES.map((name) => ({ name, set: own(stored, name) !== undefined, updatedAt: own(stored, name)?.updatedAt ?? null }));
		},
		set(name, value) {
			if (!isSecretName(name)) return Promise.reject(new Error("Unknown secret name."));
			if (typeof value !== "string" || value.length === 0) return Promise.reject(new Error("A secret value is a nonempty string."));
			const result = writing.then(async () => {
				const stored = load();
				const updatedAt = new Date().toISOString();
				stored[name] = { value, updatedAt };
				const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
				const file = await open(temporary, "wx", 0o600);
				try {
					await file.writeFile(JSON.stringify(stored));
					await file.sync();
				} finally {
					await file.close();
				}
				try {
					await rename(temporary, path);
				} catch (error) {
					await rm(temporary, { force: true });
					throw error;
				}
				return { name, set: true as const, updatedAt };
			});
			writing = result.then(
				() => undefined,
				() => undefined,
			);
			return result;
		},
	};
}
