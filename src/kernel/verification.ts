// Pure evidence bounds. A trusted runner observation is necessary, never sufficient judgment.
import type { CatalogEvidence, CatalogResult, CatalogRow, ExecutionResult, VerificationSelection } from "./evidence-schema.ts";

export type { CatalogEvidence, CatalogResult, CatalogRow, SelectedCatalog, VerificationSelection } from "./evidence-schema.ts";
export type VerificationAssessment = { outcome: "pass" | "non-pass"; rank: string | null; reason: string };
/** One row's verify-maintain status from its observed basis: changed is proven harness drift. */
export type MaintenanceRow = {
	status: "clean" | "changed" | "blocked";
	reason: string;
	cause?: "product" | "prerequisite";
	compared?: string[];
};
export type Maintenance = Record<string, MaintenanceRow>;

export function requiredCatalogRows(selection: VerificationSelection): string[] {
	return [...new Set(["full-suite", "typecheck", "lint", ...selection.behavioralRows])];
}
/** Rows are unique and include every required row, which also makes them nonempty. */
export function selectionRowsComplete(selection: VerificationSelection): boolean {
	return (
		new Set(selection.rows).size === selection.rows.length &&
		new Set(selection.behavioralRows).size === selection.behavioralRows.length &&
		requiredCatalogRows(selection).every((name) => selection.rows.includes(name))
	);
}

/**
 * Why a selected row cannot prove required behavior by its own definition, before anything runs. A behavioral row
 * also passes the policy's `minimum` rank (null: any ladder rank); omit `minimum` for full-suite/typecheck/lint.
 */
export function rowDefinitionGap(row: CatalogRow | undefined, ranks: readonly string[], minimum?: string | null): string | undefined {
	if (!row || !["executed", "journey"].includes(row.kind)) return "Discovery/human/missing rows cannot prove behavior.";
	if (!ranks.includes(row.rank ?? "")) return "Row rank is not in the selected project ladder.";
	if (!minimum) return undefined;
	if (!ranks.includes(minimum)) return `Project minimum rank ${minimum} is not in the selected project ladder.`;
	if (ranks.indexOf(row.rank ?? "") > ranks.indexOf(minimum)) return `Row rank ${row.rank} is below the project minimum ${minimum}.`;
	return undefined;
}
/** One successful independent execution of a row against exactly this verifier revision. */
export function rowExecuted(row: CatalogRow, result: CatalogResult | undefined, digest: string): boolean {
	const ok = (r: ExecutionResult | undefined) => !!r && r.exitCode === 0 && !r.timedOut && r.verifierRevision === digest;
	return (
		!!result &&
		result.status === "completed" &&
		result.steps.length > 0 &&
		result.steps.every(ok) &&
		(row.kind !== "journey" || ok(result.sanity))
	);
}
export function completionGap(
	selection: VerificationSelection,
	role: string,
	assessment: VerificationAssessment,
	evidence: readonly CatalogEvidence[],
	minimum: string | null,
): string | undefined {
	if (assessment.outcome === "non-pass") return undefined;
	if (!selection.behavioralRows.length || !requiredCatalogRows(selection).every((name) => selection.rows.includes(name)))
		return "Required full-suite/typecheck/lint coverage is missing.";
	const receipt = evidence.find(
		(e) =>
			e.kind === "catalog-check" &&
			e.role === role &&
			(["repository", "commit", "path", "digest", "contract"] as const).every((key) => e.catalog.selection[key] === selection[key]) &&
			requiredCatalogRows(selection).every((name) => e.catalog.selection.rows.includes(name)),
	);
	if (!receipt) return "Missing independent exact-source/Contract/verifier evidence for this role.";
	if (
		receipt.verification.status !== "needs_assessment" ||
		receipt.cleanup.status !== "complete" ||
		receipt.verification.inputCommit !== selection.commit ||
		receipt.verification.inputTree !== receipt.verification.resultTree
	)
		return "Execution, exact source or cleanup remains non-pass.";
	const ranks = receipt.catalog.ranks;
	const claimed = ranks.indexOf(assessment.rank ?? "");
	const min = minimum === null ? ranks.length - 1 : ranks.indexOf(minimum);
	if (claimed < 0 || min < 0) return "Rank is not in the selected project ladder.";
	let weakest = 0;
	for (const name of requiredCatalogRows(selection)) {
		const row = receipt.catalog.rows.find((r) => r.name === name);
		const result = receipt.results.find((r) => r.name === name);
		if (!row || !result || !["executed", "journey"].includes(row.kind)) return "Discovery/human/missing rows cannot prove behavior.";
		const rank = ranks.indexOf(row.rank ?? "");
		if (rank < 0 || !rowExecuted(row, result, selection.digest)) return `Required row ${name} has no successful independent execution.`;
		if (selection.behavioralRows.includes(name)) weakest = Math.max(weakest, rank);
	}
	if (claimed < weakest || claimed > min || weakest > min) return "Passing rank exceeds required evidence or is below the project minimum.";
	return undefined;
}

/** Report text `{schema:1, maintenance:{row:{status, reason, cause?, compared?}}}`, or undefined when malformed. */
export function maintenanceReport(text: string): Maintenance | undefined {
	try {
		const v = JSON.parse(text);
		if (v?.schema !== 1 || typeof v.maintenance !== "object" || !v.maintenance || Array.isArray(v.maintenance)) return;
		for (const row of Object.values(v.maintenance) as MaintenanceRow[]) {
			if (typeof row !== "object" || !row || typeof row.reason !== "string" || !row.reason.trim()) return;
			if (!["clean", "changed", "blocked"].includes(row.status)) return;
			if ((row.status === "blocked") !== ["product", "prerequisite"].includes(row.cause as string)) return;
			if (row.compared !== undefined && !(Array.isArray(row.compared) && row.compared.every((n) => typeof n === "string"))) return;
		}
		return v.maintenance;
	} catch {
		return;
	}
}
const ran = (row: CatalogRow, result: CatalogResult | undefined, digest: string) =>
	row.kind === "generated"
		? result?.status === "completed" && result.steps.every((s) => s.exitCode === 0 && !s.timedOut && s.verifierRevision === digest)
		: rowExecuted(row, result, digest);
/**
 * Why a classification does not rest on its observed basis. Pre-edit (no basis): every non-human row classified once
 * against an exact maintenance run, clean only when it executed. Against a basis: corrected source touches only
 * verifier files, only rows classified changed are corrected and keep their expectations, and a changed claim is
 * re-executed successfully.
 */
export function maintenanceGap(
	selection: VerificationSelection,
	role: string,
	rows: Maintenance,
	evidence: readonly CatalogEvidence[],
	basis?: { selection: VerificationSelection; rows: Maintenance },
): string | undefined {
	const run = (s: VerificationSelection) =>
		evidence.find(
			(e) =>
				e.kind === "catalog-check" &&
				e.role === role &&
				!!e.catalog.selection.maintenance &&
				(["repository", "commit", "path", "digest"] as const).every((key) => e.catalog.selection[key] === s[key]) &&
				e.verification.inputTree === e.verification.resultTree,
		);
	const current = run(selection);
	if (!current) return "Cite this role's exact unchanged-source maintenance run of the selected asset.";
	const rowsOf = (e: CatalogEvidence) => e.catalog.rows.filter((r) => r.kind !== "human");
	const named = rowsOf(current).map((r) => r.name);
	if (Object.keys(rows).length !== named.length || !named.every((name) => Object.hasOwn(rows, name)))
		return "Classify every non-human row exactly once; human observations stay advisory.";
	const dependents = rowsOf(current)
		.filter((r) => r.kind !== "generated")
		.map((r) => r.name);
	for (const row of rowsOf(current)) {
		const c = rows[row.name]!;
		const executed = ran(
			row,
			current.results.find((r) => r.name === row.name),
			selection.digest,
		);
		if (row.kind === "generated" && !c.compared?.every((name) => dependents.includes(name)))
			return `Compare discovery ${row.name} with the dependent rows it indexes.`;
		if (c.status === "clean" && !executed) return `Row ${row.name} did not execute successfully; it cannot be clean.`;
		if (basis && c.status === "changed" && basis.rows[row.name]?.status !== "changed")
			return `Row ${row.name} was not classified changed before editing.`;
		if (basis && c.status === "changed" && !executed)
			return `Re-execute corrected row ${row.name} successfully before claiming it changed.`;
	}
	if (!basis) return undefined;
	const prior = run(basis.selection);
	if (!prior) return "Cite the basis's exact maintenance run.";
	if (prior.catalog.selection.commit === selection.commit) return "Findings without edits are no corrected run; cite corrected source.";
	const verifier = new Set([selection.path, ...[prior, current].flatMap((e) => e.catalog.rows.flatMap((r) => r.journey?.path ?? []))]);
	const entries = (e: CatalogEvidence) => new Map((e.source?.base.entries ?? []).map((x) => [x.path, `${x.mode} ${x.oid}`]));
	const [before, after] = [entries(prior), entries(current)];
	if (!before.size || !after.size) return "Maintenance runs must retain their literal source entries.";
	for (const path of new Set([...before.keys(), ...after.keys()]))
		if (before.get(path) !== after.get(path) && !verifier.has(path))
			return `Maintenance corrects only the selected asset and its journeys; ${path} is separate accepted work.`;
	const old = new Map(rowsOf(prior).map((r) => [r.name, r]));
	if (old.size !== named.length || !named.every((name) => old.has(name))) return "Adding or removing rows changes expectations.";
	for (const row of rowsOf(current)) {
		const p = old.get(row.name)!;
		if (basis.rows[row.name]?.status !== "changed") {
			if (row.literal !== p.literal || row.journey?.digest !== p.journey?.digest)
				return `Row ${row.name} was not classified changed before editing; its definition stays literal.`;
		} else if (row.kind !== p.kind || row.expectations !== p.expectations || row.rank !== p.rank)
			return `A drift correction keeps row ${row.name}'s kind, expectations and rank.`;
	}
	return undefined;
}
