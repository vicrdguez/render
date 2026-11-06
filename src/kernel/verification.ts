// Pure evidence bounds. A trusted runner observation is necessary, never sufficient judgment.
import type { ExecutionResult } from "../sandboxes/sandboxes.ts";

export type VerificationSelection = {
	repository: string;
	commit: string;
	path: string;
	digest: string;
	contract: string;
	rows: string[];
	behavioralRows: string[];
	receipts: string[];
};
export type VerificationAssessment = { outcome: "pass" | "non-pass"; rank: string | null; reason: string };
export type CatalogRow = {
	name: string;
	channel: string;
	kind: "generated" | "executed" | "journey" | "human";
	run: string;
	expectations: string;
	rank: string | null;
	literal: string;
	journey?: { path: string; digest: string; text: string; steps: string[]; sanity: string };
};
export type SelectedCatalog = {
	selection: VerificationSelection;
	text: string;
	ranks: string[];
	sections: Record<string, string>;
	rows: CatalogRow[];
	cleanup: string[];
};
export type CatalogResult = {
	name: string;
	status: "completed" | "failed" | "unrun" | "advisory";
	steps: ExecutionResult[];
	sanity?: ExecutionResult;
};
export type CatalogEvidence = {
	kind: "catalog-check";
	role: string;
	catalog: SelectedCatalog;
	results: CatalogResult[];
	verification: { status: string; inputCommit: string; inputTree: string; resultTree: string };
	cleanup: { status: "complete" | "pending"; results: ExecutionResult[] };
};

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

/** Why a selected row cannot prove required behavior by its own definition, before anything runs. */
export function rowDefinitionGap(row: CatalogRow | undefined, ranks: readonly string[]): string | undefined {
	if (!row || !["executed", "journey"].includes(row.kind)) return "Discovery/human/missing rows cannot prove behavior.";
	if (!ranks.includes(row.rank ?? "")) return "Row rank is not in the selected project ladder.";
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
