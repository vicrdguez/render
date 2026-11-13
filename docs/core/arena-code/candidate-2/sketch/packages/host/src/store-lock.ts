/** A kernel-managed lock held by an otherwise empty SQLite file beside store.sqlite.
 * Node:sqlite DatabaseSync, journal_mode=DELETE, busy_timeout=0, BEGIN EXCLUSIVE.
 * No application rows, heartbeat, stale-file deletion or lease expiry.
 * Open BEFORE pi-durable storage, close AFTER it. Kernel releases the lock on process death.
 * Probe: probe/lock.test.mjs. The file is a lock, never a project catalogue.
 */
export async function acquireStoreLock(
	file: string,
): Promise<{ release(): void }> {
	throw new Error("not implemented");
}
