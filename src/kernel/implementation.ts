// Pure implementation evidence validation. Ledger resolves and integrity-checks the actual bytes.
import type { SourceReceipt } from "../effects/source.ts";
import type { PolicyBasis } from "./policy.ts";
import type { ImplementationPass, RoleAssignment, RolePacket } from "./roles.ts";
import { validatePath } from "./source-path.ts";
import {
	type CatalogEvidence,
	completionGap,
	selectionRowsComplete,
	type VerificationAssessment,
	type VerificationSelection,
} from "./verification.ts";

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
type AuditRole = "audit-standards" | "audit-contracts";
type ReviewRole = AuditRole | "watchdog";
type AuditReviewer<R extends ReviewRole> = {
	key: string;
	/** Runs in its one family: `requiredFamily` is derived, so it cannot differ. */
	packet: Omit<RolePacket, "role" | "execution" | "requests" | "experiment" | "investigation" | "verification" | "requiredFamily"> & {
		role: R;
		execution: "read-only";
		requests: [];
	};
};
/** The fresh read-only reviewers an accepted pass runs its one Audit with. */
export type AuditReviewers = { standards: AuditReviewer<"audit-standards">; contracts: AuditReviewer<"audit-contracts"> };
/** The read-only reviewer each Watchdog round of this pass's Slice starts fresh from. */
export type WatchdogReviewer = AuditReviewer<"watchdog">;
/**
 * What an accepted pass executes with, frozen when it opens: only `passConfiguration` builds one, for a Linux-writer implementer.
 * The selected file may not exist yet, since bootstrapping it is accepted source work. Owner packets stay as retained input.
 * Without `watchdog` a checked pass waits visibly: no review is invented.
 */
export type PassConfiguration = { verification: VerificationSelection; reviewers: AuditReviewers; watchdog?: WatchdogReviewer };
/** What one Watchdog round judges: exact handed-off B, prepared X/T and X's own verifier; `checks` is its own receipt. */
export type WatchdogBinding = {
	passRef: string;
	handoff: string;
	source: string;
	preparation: string;
	prepared: string;
	tree: string;
	target: string;
	verifier: string;
	/** Earlier rounds' reports and return observations: context, never required, so missing ones mean a full review. */
	prior: string[];
	checks?: string;
};
/** The Watchdog's own checks of exact X: literal X as reviewed plus its scoped Linux catalog receipt. */
export type ReviewChecks = { schema: 1; source: SourceReceipt["source"]; evidence: CatalogEvidence & { scope: Record<string, unknown> } };
/** `baseCommit` is the pass's recorded target-lineage base T0 that preparation merged against, not B's capture parent. */
type ReturnLineage = {
	schema: 1;
	repository: string;
	source: string;
	sourceCommit: string;
	baseCommit: string;
	targetCommit: string;
};
/** Trusted host result that authorizes returning handed-off source to implementation. Operational retries have no shape here. */
export type ReturnObservation =
	| (ReturnLineage & { cause: "preparation-conflict"; algorithm: string; resultTree: string; conflicts: string[] })
	| (ReturnLineage & {
			cause: "prepared-check-failure";
			preparedCommit: string;
			verifierRevision: string;
			failed: { name: string; exitCode: number }[];
	  })
	/** X's own verifier cannot define a required check: repair needs a source edit, and nothing ran or failed. */
	| (ReturnLineage & { cause: "prepared-verifier-defect"; preparedCommit: string; defect: string })
	| (ReturnLineage & { cause: "watchdog-rework"; preparedCommit: string; review: string; report: string })
	/** A human's recorded direction on a stopped round (Needs Human or the review limit), never automatic. */
	| (ReturnLineage & { cause: "human-direction"; preparedCommit: string; review: string; report: string; direction: string });
export type WatchdogVerdict = {
	schema: 1;
	verdict: "pass" | "rework" | "needs-human";
	passRef: string;
	handoff: string;
	source: string;
	prepared: string;
	target: string;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
export function validAssessment(v: unknown): v is VerificationAssessment {
	return object(v) && ["pass", "non-pass"].includes(String(v.outcome)) && (v.rank === null || text(v.rank)) && text(v.reason);
}
/** A reviewer inspects A through the verifier retained with it, so it freezes none of its own before A exists. */
export function usableReviewer(p: RolePacket): boolean {
	return (
		p.execution === "read-only" &&
		!p.requests.length &&
		!p.experiment &&
		!p.investigation &&
		!p.verification &&
		p.family === p.requiredFamily
	);
}
function auditReviewer<R extends ReviewRole>(owner: RolePacket, role: R): AuditReviewer<R> | undefined {
	const [request, ...others] = owner.requests.filter((r) => r.packet.role === role);
	if (!request || others.length || !usableReviewer(request.packet)) return;
	const { requiredFamily, experiment, investigation, verification, ...packet } = request.packet;
	return { key: request.key, packet: { ...packet, role, execution: "read-only", requests: [] } };
}
function usableSelection(selection: VerificationSelection | undefined, contract: string): selection is VerificationSelection {
	if (!selection || selection.contract !== contract || !selection.behavioralRows.length || !selectionRowsComplete(selection)) return false;
	try {
		validatePath(selection.path);
		return true;
	} catch {
		return false;
	}
}
/** Immutable structure only: catalog contents, check results, model availability and policy can still change after acceptance. */
export function passConfiguration(owner: RolePacket, contract: string): PassConfiguration | undefined {
	const watched = owner.requests.some((r) => r.packet.role === "watchdog");
	if (owner.role !== "implementer" || owner.execution !== "linux-writer" || owner.requests.length !== (watched ? 3 : 2)) return;
	if (!usableSelection(owner.verification, contract)) return;
	const standards = auditReviewer(owner, "audit-standards");
	const contracts = auditReviewer(owner, "audit-contracts");
	const watchdog = watched ? auditReviewer(owner, "watchdog") : undefined;
	if (!standards || !contracts || (watched && !watchdog)) return;
	return { verification: owner.verification, reviewers: { standards, contracts }, ...(watchdog ? { watchdog } : {}) };
}
export function auditReviewerPacket(reviewer: AuditReviewers[AuditAxis] | WatchdogReviewer): RolePacket {
	return { ...reviewer.packet, requiredFamily: reviewer.packet.family };
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
const RETURN_FIELDS = {
	"preparation-conflict": ["algorithm", "resultTree", "conflicts"],
	"prepared-check-failure": ["preparedCommit", "verifierRevision", "failed"],
	"prepared-verifier-defect": ["preparedCommit", "defect"],
	"watchdog-rework": ["preparedCommit", "review", "report"],
	"human-direction": ["preparedCommit", "review", "report", "direction"],
} as const;
const LAUNCH_FAILURES = [126, 127];
/** Bound on a recorded preparation reason; a verifier defect returns that reason verbatim, so both share it. */
export const PREPARATION_REASON_BYTES = 4096;
const objectId = (format: unknown) => (x: unknown) =>
	typeof x === "string" && x.length === (format === "sha1" ? 40 : 64) && /^[0-9a-f]+$/.test(x);
/** Closed shape only: lineage against retained B and any cited review belong to the caller's current state. */
export function returnObservation(value: string, source: ImplementationSource): ReturnObservation | undefined {
	try {
		const v: unknown = JSON.parse(value);
		if (!object(v) || v.schema !== 1 || !Object.hasOwn(RETURN_FIELDS, String(v.cause))) return;
		const cause = v.cause as keyof typeof RETURN_FIELDS;
		const fields = ["schema", "cause", "repository", "source", "sourceCommit", "baseCommit", "targetCommit", ...RETURN_FIELDS[cause]];
		if (Object.keys(v).length !== fields.length || !fields.every((key) => Object.hasOwn(v, key))) return;
		const id = objectId(source.source.source.objectFormat);
		if (![v.repository, v.source].every(text) || ![v.sourceCommit, v.baseCommit, v.targetCommit].every(id)) return;
		if (v.cause === "preparation-conflict")
			return text(v.algorithm) && id(v.resultTree) && texts(v.conflicts) && v.conflicts.length && v.targetCommit !== v.baseCommit
				? (v as ReturnObservation)
				: undefined;
		if (!id(v.preparedCommit)) return;
		if (v.cause === "watchdog-rework" || v.cause === "human-direction")
			return text(v.review) && text(v.report) && (v.cause === "watchdog-rework" || text(v.direction))
				? (v as ReturnObservation)
				: undefined;
		if (v.cause === "prepared-verifier-defect")
			return text(v.defect) && v.defect.length <= PREPARATION_REASON_BYTES ? (v as ReturnObservation) : undefined;
		const rows = source.verification?.catalog.rows.map((row) => row.name) ?? [];
		return text(v.verifierRevision) &&
			Array.isArray(v.failed) &&
			v.failed.length &&
			v.failed.every(
				(f) =>
					object(f) &&
					Object.keys(f).length === 2 &&
					rows.includes(String(f.name)) &&
					Number.isSafeInteger(f.exitCode) &&
					f.exitCode !== 0 &&
					!LAUNCH_FAILURES.includes(Number(f.exitCode)),
			)
			? (v as ReturnObservation)
			: undefined;
	} catch {
		return;
	}
}
export type PreparedChecks = {
	verifierRevision: string;
	scope: { assignment: string; generation: number; attempt: string; executorEpoch: string };
	catalog: CatalogEvidence["catalog"];
	results: CatalogEvidence["results"];
	cleanup: CatalogEvidence["cleanup"];
	verification: { status: "passed" | "failed" | "non-pass" | "source_changed"; inputCommit: string; inputTree: string; resultTree: string };
	failed: { name: string; exitCode: number }[];
};
/** One host preparation attempt of a handed-off pass: the observed canonical T, Effects' receipt and actual X checks. */
export type PreparationRecord = {
	schema: 1;
	passRef: string;
	handoff: string;
	source: string;
	attempt: number;
	target: { proposal: string; ref: string; commit: string };
	/** `verifier-defect`: X's own verifier cannot define a required check; nothing ran, and repair needs a new pass. */
	outcome: "checked" | "check-failure" | "conflict" | "operational" | "verifier-defect";
	reason: string | null;
	preparation: null | {
		kind: "clean" | "conflict";
		algorithm: string;
		profile: string;
		git: string;
		identity: string;
		base: string;
		source: string;
		target: string;
		result: string;
		tree: string;
		conflicts: string[];
		exitCode: 0 | 1;
		stdout: string;
		stderr: string;
	};
	checks: null | PreparedChecks;
	/** The workflow policy binding this attempt qualified X against: only the current one is accepted. */
	policy: PolicyBasis;
};
const closed = (v: Record<string, unknown>, keys: string[]) =>
	Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
/** The pass's recorded target-lineage base: the configured start, or the target a successor opened against. */
export function preparationBase(pass: ImplementationPass): string {
	return pass.opening?.target ?? pass.configuration.verification.commit;
}
/** Closed shape and internal consistency only; lineage against the pass and sealed B belongs to the caller. */
export function preparationRecord(value: string, format: "sha1" | "sha256"): PreparationRecord | undefined {
	try {
		const v: unknown = JSON.parse(value);
		const id = objectId(format);
		if (!object(v) || v.schema !== 1) return;
		if (!closed(v, ["schema", "passRef", "handoff", "source", "attempt", "target", "outcome", "reason", "preparation", "checks", "policy"]))
			return;
		const q = v.policy;
		if (!object(q) || !closed(q, ["binding", "revision", "minimumEvidenceRank"]) || !text(q.binding) || !text(q.revision)) return;
		if (q.minimumEvidenceRank !== null && !text(q.minimumEvidenceRank)) return;
		if (![v.passRef, v.handoff, v.source].every(text) || !Number.isSafeInteger(v.attempt) || Number(v.attempt) < 1) return;
		const t = v.target;
		if (!object(t) || !closed(t, ["proposal", "ref", "commit"]) || !text(t.proposal) || !text(t.ref) || !id(t.commit)) return;
		if (!["checked", "check-failure", "conflict", "operational", "verifier-defect"].includes(String(v.outcome))) return;
		const reasoned = v.outcome === "operational" || v.outcome === "verifier-defect";
		if (reasoned !== text(v.reason) || (v.reason !== null && !text(v.reason)) || String(v.reason ?? "").length > PREPARATION_REASON_BYTES)
			return;
		const p = v.preparation;
		if (p !== null) {
			const keys = ["kind", "algorithm", "profile", "git", "identity", "base", "source", "target", "result", "tree", "conflicts"];
			if (!object(p) || !closed(p, [...keys, "exitCode", "stdout", "stderr"])) return;
			if (![p.algorithm, p.profile, p.git, p.identity].every(text) || ![p.base, p.source, p.target, p.result, p.tree].every(id)) return;
			if (!Array.isArray(p.conflicts) || !p.conflicts.every(text) || typeof p.stdout !== "string" || typeof p.stderr !== "string") return;
			if (!((p.kind === "clean" && p.exitCode === 0 && !p.conflicts.length) || (p.kind === "conflict" && p.exitCode === 1))) return;
		}
		const c = v.checks;
		if (c !== null) {
			if (!object(c) || !closed(c, ["verifierRevision", "scope", "catalog", "results", "cleanup", "verification", "failed"])) return;
			const r = c.verification;
			if (!text(c.verifierRevision) || !object(c.scope) || !Array.isArray(c.results) || !object(r) || !text(r.status)) return;
			if (![r.inputCommit, r.inputTree, r.resultTree].every(id) || !Array.isArray(c.failed)) return;
			const failures = c.failed.every(
				(f) =>
					object(f) &&
					closed(f, ["name", "exitCode"]) &&
					text(f.name) &&
					Number.isSafeInteger(f.exitCode) &&
					f.exitCode !== 0 &&
					!LAUNCH_FAILURES.includes(Number(f.exitCode)),
			);
			if (!failures || !p || p.kind !== "clean" || r.inputCommit !== p.result || r.inputTree !== p.tree) return;
		}
		const checked = (status: string, failed: boolean) =>
			p?.kind === "clean" &&
			object(c) &&
			(c.verification as Record<string, unknown>).status === status &&
			(c.verification as Record<string, unknown>).resultTree === p.tree &&
			(c.failed as unknown[]).length > 0 === failed;
		if (v.outcome === "conflict" && (p?.kind !== "conflict" || !(p.conflicts as unknown[]).length || c !== null)) return;
		if (v.outcome === "verifier-defect" && (p?.kind !== "clean" || c !== null)) return;
		if (v.outcome === "checked" && !checked("passed", false)) return;
		if (v.outcome === "check-failure" && !checked("failed", true)) return;
		return v as PreparationRecord;
	} catch {
		return;
	}
}
/** A round's verdict exactly as bound: its pass, handoff, B, X and T, never restated by the reviewer. */
export function boundVerdict(value: string, binding: WatchdogBinding): WatchdogVerdict | undefined {
	const v = watchdogVerdict(value);
	return v &&
		v.passRef === binding.passRef &&
		v.handoff === binding.handoff &&
		v.source === binding.source &&
		v.prepared === binding.prepared &&
		v.target === binding.target
		? v
		: undefined;
}
/** Closed shape; literal X identity is the Ledger's, the binding the caller's. */
export function reviewChecks(value: string): ReviewChecks | undefined {
	try {
		const v: unknown = JSON.parse(value);
		if (!object(v) || v.schema !== 1 || !closed(v, ["schema", "source", "evidence"]) || !object(v.source) || !object(v.evidence)) return;
		const e = v.evidence;
		const scope = e.scope;
		if (e.kind !== "catalog-check" || !text(e.role) || !object(scope) || !object(e.catalog) || !object(e.catalog.selection)) return;
		if (!["assignment", "attempt", "executorEpoch"].every((k) => text(scope[k])) || !Number.isSafeInteger(scope.generation)) return;
		const r = e.verification;
		if (!object(r) || !["status", "inputCommit", "inputTree", "resultTree"].every((k) => text(r[k]))) return;
		if (!Array.isArray(e.results) || !Array.isArray(e.catalog.rows) || !Array.isArray(e.catalog.ranks) || !object(e.cleanup)) return;
		return v as ReviewChecks;
	} catch {
		return;
	}
}
/** The selection a Watchdog's own receipt must match: the pass's frozen rows, read from exact X's own verifier. */
export function reviewSelection(pass: ImplementationPass, binding: WatchdogBinding): VerificationSelection {
	return { ...pass.configuration.verification, commit: binding.prepared, digest: binding.verifier, receipts: [] };
}
/** Completed Watchdog reviews of a Slice: every submitted launched round counts once, whatever its pass, verdict or drift. */
export function completedReviews(assignments: readonly RoleAssignment[], workflow: string, slice: string): RoleAssignment[] {
	return assignments.filter((a) => !!a.watchdogReview && a.workflow === workflow && a.slice === slice && a.status === "submitted");
}
/**
 * Whether a completed review still qualifies its pass for integration on the current basis (spec §9.4 step 6). The
 * completed-review count never enters: a valid current pass is admissible at or above the cap. Pure; callers supply
 * exact retained bytes and the current target observation.
 */
export function reviewQualification(input: {
	pass: ImplementationPass;
	preparation: string;
	record: PreparationRecord;
	review: RoleAssignment;
	verdict: WatchdogVerdict | undefined;
	target: string;
	basis: PolicyBasis;
}): { code: string; reason: string } | undefined {
	const { pass, preparation, record, review, verdict, target, basis } = input;
	const binding = review.watchdogReview;
	if (!pass.handoff || pass.handoff.preparations?.at(-1) !== preparation || binding?.preparation !== preparation)
		return { code: "stale_basis", reason: "The review is not of this handoff's latest prepared source." };
	if (record.outcome !== "checked" || record.preparation?.result !== binding.prepared || review.status !== "submitted")
		return { code: "missing_content", reason: "Only a completed review of checked prepared X can qualify." };
	if (!verdict || verdict.verdict !== "pass" || verdict.prepared !== binding.prepared || verdict.target !== binding.target)
		return { code: "forbidden_scope", reason: "Only a bound passing verdict qualifies; rework and Needs Human never do." };
	if (record.target.commit !== target)
		return { code: "stale_basis", reason: `Reviewed target ${record.target.commit} is not current target ${target}; prepare again.` };
	if (record.policy.binding !== basis.binding || record.policy.revision !== basis.revision)
		return { code: "stale_basis", reason: "X was qualified under a superseded policy binding; prepare again." };
	return undefined;
}
/** A retained report without this exact shape is a counted review, never an authorizing verdict. */
export function watchdogVerdict(value: string | undefined): WatchdogVerdict | undefined {
	try {
		const v: unknown = JSON.parse(value ?? "");
		return object(v) &&
			v.schema === 1 &&
			["pass", "rework", "needs-human"].includes(String(v.verdict)) &&
			[v.passRef, v.handoff, v.source, v.prepared, v.target].every(text)
			? (v as WatchdogVerdict)
			: undefined;
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
		if (![s.commit, s.tree].every(objectId(s.objectFormat))) return;
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
/**
 * Whether a pre-fix catalog run is red-on-the-bug proof: a regression row fails and its own output shows the observed
 * wrong behavior. A launch failure, a passing row or a failure without that output is a reported gap, never a correction.
 */
export function reproductionOutcome(
	evidence: CatalogEvidence,
	rows: readonly string[],
	observed: string,
): { red: boolean; reason: string } {
	const gaps: string[] = [];
	for (const name of rows) {
		const result = evidence.results.find((r) => r.name === name);
		const steps = result ? [...result.steps, ...(result.sanity ? [result.sanity] : [])] : [];
		const launch = steps.find((s) => LAUNCH_FAILURES.includes(Number(s.exitCode)));
		if (!result || !steps.length) gaps.push(`Regression row ${name} was not run by the selected verifier.`);
		else if (launch)
			gaps.push(`Regression row ${name} did not run (exit ${launch.exitCode}): a missing prerequisite is not red-on-the-bug proof.`);
		else if (steps.every((s) => s.exitCode === 0 && !s.timedOut))
			gaps.push(`Regression row ${name} passed: the reported wrong behavior was not reproduced.`);
		else if (steps.some((s) => s.exitCode !== 0 && !s.timedOut && `${s.stdout}${s.stderr}`.includes(observed)))
			return { red: true, reason: `Regression row ${name} failed showing the reported wrong behavior.` };
		else
			gaps.push(
				`Regression row ${name} failed without showing the reported wrong behavior (${observed}): a setup failure is not red-on-the-bug proof.`,
			);
	}
	return { red: false, reason: gaps[0]! };
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
	pass: ImplementationPass,
	assessment?: VerificationAssessment,
	minimum: string | null = null,
): string | undefined {
	const selected = pass.configuration.verification;
	const e = source?.verification;
	if (
		!source ||
		!e ||
		e.role !== "implementer" ||
		e.catalog.selection.contract !== pass.contract ||
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
