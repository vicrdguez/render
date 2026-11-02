// Ledger-retained operational facts. No destination credentials or paths belong in the store/export.
export type VerifiedBackup = {
	id: string;
	cutoff: number;
	cutoffRecordedAt: number;
	verifiedAt: number;
	digest: string;
};
export type BackupState = {
	version: 1;
	verified: VerifiedBackup | null;
	/** Null time denotes acknowledged legacy work whose original time was not retained. */
	pending: { sequence: number; at: number | null }[];
	lastAttempt: { completedAt: number; outcome: "verified" | "failed"; durationMs: number; windowSeconds: number | null } | null;
};
export function initialBackup(sequence: number): BackupState {
	return { version: 1, verified: null, pending: sequence > 0 ? [{ sequence, at: null }] : [], lastAttempt: null };
}
export function validBackup(value: unknown, sequence: number): value is BackupState {
	if (value === null || typeof value !== "object") return false;
	const b = value as BackupState;
	const time = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
	const v = b.verified;
	const a = b.lastAttempt;
	return (
		b.version === 1 &&
		(v === null ||
			(typeof v === "object" &&
				/^package-[a-f0-9-]{36}$/.test(v.id) &&
				Number.isSafeInteger(v.cutoff) &&
				v.cutoff > 0 &&
				v.cutoff <= sequence &&
				time(v.cutoffRecordedAt) &&
				time(v.verifiedAt) &&
				v.verifiedAt >= v.cutoffRecordedAt &&
				/^[a-f0-9]{64}$/.test(v.digest))) &&
		Array.isArray(b.pending) &&
		b.pending.every(
			(p, i) =>
				p &&
				Number.isSafeInteger(p.sequence) &&
				p.sequence > (v?.cutoff ?? 0) &&
				p.sequence <= sequence &&
				(p.at === null || time(p.at)) &&
				(i === 0 || p.sequence > (b.pending[i - 1]?.sequence ?? 0)),
		) &&
		(a === null ||
			(typeof a === "object" &&
				["verified", "failed"].includes(a.outcome) &&
				time(a.completedAt) &&
				time(a.durationMs) &&
				(a.windowSeconds === null || time(a.windowSeconds))))
	);
}
