import { readFile, rename, writeFile } from "node:fs/promises";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";

/** pi's own login file, `auth.json`: one credential per provider. The server reads it at each use, so a login the
 * owner makes with pi reaches it without a restart, and it writes back a refreshed OAuth token. */
export function piLogins(file: string): CredentialStore {
	const read = async (): Promise<Record<string, Credential>> => {
		try {
			return JSON.parse(await readFile(file, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
			throw new Error(`${file} cannot be read`);
		}
	};
	const write = async (logins: Record<string, Credential>) => {
		const temporary = `${file}.tau.tmp`;
		await writeFile(temporary, JSON.stringify(logins, null, 2), {
			mode: 0o600,
		});
		await rename(temporary, file);
	};
	let queue: Promise<unknown> = Promise.resolve();
	const serial = <T>(work: () => Promise<T>) => {
		const next = queue.then(work);
		queue = next.catch(() => {});
		return next;
	};
	return {
		read: async (provider) => (await read())[provider],
		list: async () =>
			Object.entries(await read()).map(([providerId, credential]) => ({
				providerId,
				type: credential.type,
			})),
		modify: (provider, change) =>
			serial(async () => {
				const logins = await read();
				const next = await change(logins[provider]);
				if (next === undefined) return logins[provider];
				await write({ ...logins, [provider]: next });
				return next;
			}),
		delete: (provider) =>
			serial(async () => {
				const { [provider]: _gone, ...rest } = await read();
				await write(rest);
			}),
	};
}
