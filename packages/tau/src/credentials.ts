import { mkdir, open, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	AuthOperationOptions,
	Credential,
	CredentialStore,
} from "@earendil-works/pi-ai";
import lockfile from "proper-lockfile";

/** Shares pi's resolved auth.json lock for the entire read, refresh, and write. */
export function piLogins(file: string): CredentialStore {
	const locked = async <T>(
		work: (
			logins: Record<string, Credential>,
			resolved: string,
			check: () => void,
		) => Promise<T>,
		options?: AuthOperationOptions,
	): Promise<T> => {
		options?.signal?.throwIfAborted();
		await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
		try {
			const created = await open(file, "wx", 0o600);
			try {
				await created.writeFile("{}");
			} finally {
				await created.close();
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		const resolved = await realpath(file);
		let compromised: Error | undefined;
		const release = await lockfile.lock(resolved, {
			stale: 30_000,
			retries: { retries: 20, minTimeout: 10, maxTimeout: 2_000 },
			onCompromised: (error) => {
				compromised = error;
			},
		});
		const check = () => {
			if (compromised !== undefined) throw compromised;
			options?.signal?.throwIfAborted();
		};
		try {
			check();
			const text = (await readFile(resolved, "utf8")).replace(/^\uFEFF/, "");
			const logins = text.trim() === "" ? {} : JSON.parse(text);
			const result = await work(logins, resolved, check);
			check();
			return result;
		} finally {
			if (compromised === undefined) await release();
		}
	};
	const update = async (
		provider: string,
		change: (
			current: Credential | undefined,
		) => Promise<Credential | undefined>,
		options?: AuthOperationOptions,
	) =>
		locked(async (logins, resolved, check) => {
			const next = await change(logins[provider]);
			check();
			if (next === undefined) return logins[provider];
			await writeFile(
				resolved,
				JSON.stringify({ ...logins, [provider]: next }, null, 2),
				{ mode: 0o600 },
			);
			return next;
		}, options);
	return {
		read: (provider, options) =>
			locked(async (logins) => logins[provider], options),
		list: (options) =>
			locked(
				async (logins) =>
					Object.entries(logins).map(([providerId, credential]) => ({
						providerId,
						type: credential.type,
					})),
				options,
			),
		modify: update,
		delete: (provider, options) =>
			locked(async (logins, resolved, check) => {
				check();
				delete logins[provider];
				await writeFile(resolved, JSON.stringify(logins, null, 2), {
					mode: 0o600,
				});
			}, options),
	};
}
