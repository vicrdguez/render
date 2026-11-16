import { DatabaseSync } from "node:sqlite";

/** An exclusive transaction on an empty SQLite file. The kernel drops it when the process dies, so a killed server
 * leaves nothing to clean up. Take it before the store opens, and release it after the store closes. */
export function acquireLock(file: string): { release(): void } {
	const db = new DatabaseSync(file);
	try {
		db.exec(
			"PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE",
		);
	} catch (error) {
		db.close();
		throw new Error(`${file} is locked: another Tau server holds it`, {
			cause: error,
		});
	}
	return { release: () => db.close() };
}
