// Pure implementation evidence validation. Ledger resolves and integrity-checks the actual bytes.
import type { SourceReceipt } from "../effects/source.ts";
import type { RoleAssignment } from "./roles.ts";
import { type CatalogEvidence, completionGap, type VerificationAssessment } from "./verification.ts";

export type ImplementationSource = { schema: 1; source: SourceReceipt; verification?: CatalogEvidence };
export type AuditBinding = { passRef: string; audit: string; source: string; contract: string };
export type AuditFinding = { id: string; text: string; needsHuman: boolean };
export type FindingDisposition = {
	report: string;
	finding: string;
	disposition: "fixed" | "considered" | "dismissed" | "needs-human";
	reason: string;
	changes: string[];
	rechecks: string[];
};
export type AuditAxis = "standards" | "contracts";
export type AuditResult = { assignment: string; report: string; findings: AuditFinding[] };
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
export function validAssessment(v: unknown): v is VerificationAssessment {
	return object(v) && ["pass", "non-pass"].includes(String(v.outcome)) && (v.rank === null || text(v.rank)) && text(v.reason);
}
export function validDispositions(v: unknown): v is FindingDisposition[] {
	return (
		Array.isArray(v) &&
		v.length <= 2048 &&
		v.every(
			(d) =>
				object(d) &&
				text(d.report) &&
				text(d.finding) &&
				["fixed", "considered", "dismissed", "needs-human"].includes(String(d.disposition)) &&
				text(d.reason) &&
				texts(d.changes) &&
				texts(d.rechecks),
		)
	);
}
export function auditFindings(value: string, binding: AuditBinding): AuditFinding[] | undefined {
	try {
		const v: unknown = JSON.parse(value);
		if (
			!object(v) ||
			v.schema !== 1 ||
			!Object.keys(v).every((key) => ["schema", "passRef", "audit", "source", "contract", "findings"].includes(key)) ||
			!Object.entries(binding).every(([k, x]) => v[k] === x) ||
			!Array.isArray(v.findings) ||
			v.findings.length > 2048
		)
			return;
		if (!v.findings.every((f) => object(f) && text(f.id) && f.id.length <= 128 && text(f.text) && typeof f.needsHuman === "boolean"))
			return;
		if (new Set(v.findings.map((f) => f.id)).size !== v.findings.length) return;
		return v.findings as AuditFinding[];
	} catch {
		return;
	}
}
/** Shape validation is total: even trusted-host protocol input can be malformed. */
export function implementationSource(value: unknown): ImplementationSource | undefined {
	if (!object(value) || value.schema !== 1 || !object(value.source)) return;
	const r = value.source;
	if (!object(r.freeze) || !object(r.freeze.scope) || r.freeze.running !== false || !text(r.freeze.runtime)) return;
	if (
		!["assignment", "attempt", "executorEpoch"].every((k) => text((r.freeze as { scope: Record<string, unknown> }).scope[k])) ||
		!Number.isSafeInteger(r.freeze.scope.generation)
	)
		return;
	for (const s of [r.base, r.source]) {
		if (
			!object(s) ||
			!text(s.repository) ||
			!["sha1", "sha256"].includes(String(s.objectFormat)) ||
			!text(s.root) ||
			!Array.isArray(s.entries)
		)
			return;
		const size = s.objectFormat === "sha1" ? 40 : 64;
		if (![s.commit, s.tree].every((x) => typeof x === "string" && x.length === size && /^[0-9a-f]+$/.test(x))) return;
		if (
			!s.entries.every(
				(e) =>
					object(e) &&
					text(e.path) &&
					["100644", "100755", "120000"].includes(String(e.mode)) &&
					text(e.oid) &&
					typeof e.content === "string",
			)
		)
			return;
	}
	if (
		(r.base as Record<string, unknown>).repository !== (r.source as Record<string, unknown>).repository ||
		(r.base as Record<string, unknown>).objectFormat !== (r.source as Record<string, unknown>).objectFormat
	)
		return;
	if (
		!texts(r.exclusions) ||
		!texts(r.deleted) ||
		!texts(r.configurationChanges) ||
		!Number.isSafeInteger(r.bytes) ||
		Number(r.bytes) < 0 ||
		!Number.isSafeInteger(r.entries) ||
		Number(r.entries) < 0 ||
		!object(r.durability) ||
		r.durability.fsync !== "all" ||
		r.durability.method !== "fsync" ||
		!text(r.durability.git)
	)
		return;
	if (value.verification !== undefined) {
		const e = value.verification;
		if (
			!object(e) ||
			e.kind !== "catalog-check" ||
			!text(e.role) ||
			!object(e.catalog) ||
			!object(e.catalog.selection) ||
			!object(e.verification) ||
			!object(e.cleanup)
		)
			return;
		const s = e.catalog.selection;
		if (
			!["repository", "commit", "path", "digest", "contract"].every((k) => text(s[k])) ||
			![s.rows, s.behavioralRows, s.receipts, e.catalog.ranks].every(texts)
		)
			return;
		if (
			!Array.isArray(e.catalog.rows) ||
			!e.catalog.rows.every((row) => object(row) && text(row.name) && text(row.kind) && (row.rank === null || text(row.rank)))
		)
			return;
		if (
			!Array.isArray(e.results) ||
			!e.results.every(
				(row) =>
					object(row) &&
					text(row.name) &&
					text(row.status) &&
					Array.isArray(row.steps) &&
					row.steps.every((step) => object(step)) &&
					(row.sanity === undefined || object(row.sanity)),
			)
		)
			return;
		if (
			!["status", "inputCommit", "inputTree", "resultTree"].every((k) => text((e.verification as Record<string, unknown>)[k])) ||
			!text(e.cleanup.status)
		)
			return;
	}
	return value as ImplementationSource;
}
export function sourceScopeMatches(source: ImplementationSource | undefined, a: RoleAssignment): boolean {
	const scope = source?.source.freeze.scope;
	return (
		!!scope &&
		source?.source.freeze.running === false &&
		scope.assignment === a.id &&
		scope.generation === a.generation &&
		scope.attempt === a.attempt &&
		scope.executorEpoch === a.executorEpoch
	);
}
export function implementationEvidenceGap(
	source: ImplementationSource | undefined,
	a: RoleAssignment,
	contract: string,
	assessment?: VerificationAssessment,
	minimum: string | null = null,
): string | undefined {
	const selected = a.packet.verification;
	const e = source?.verification;
	if (
		!source ||
		!selected ||
		!e ||
		e.role !== "implementer" ||
		e.catalog.selection.contract !== contract ||
		selected.contract !== contract ||
		e.catalog.selection.repository !== selected.repository ||
		e.catalog.selection.path !== selected.path ||
		!selected.behavioralRows.every((row) => e.catalog.selection.behavioralRows.includes(row))
	)
		return "Missing exact implementation source, accepted Contract and frozen verifier inputs.";
	const receipt = source.source;
	if (
		e.catalog.selection.repository !== receipt.source.repository ||
		e.catalog.selection.commit !== receipt.base.commit ||
		e.verification.inputCommit !== receipt.base.commit ||
		e.verification.inputTree !== receipt.base.tree ||
		e.verification.resultTree !== receipt.source.tree ||
		receipt.base.tree !== receipt.source.tree
	)
		return "Verification must name the actual checked base and unchanged resulting source tree.";
	if (assessment) return completionGap(e.catalog.selection, "implementer", assessment, [e], minimum);
	return undefined;
}
