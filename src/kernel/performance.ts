// Performance commitments inside existing Ground, Contract and receipt records; pure, no new authority or store.
import type { CheckpointInput } from "./checkpoints.ts";
import type { RoleAssignment } from "./roles.ts";
import { type CatalogEvidence, requiredCatalogRows, rowExecuted } from "./verification.ts";

type GroundFields = {
	scenario: string;
	/** Catalog row whose execution measures the scenario. */
	row: string;
	/** Key of the number in the JSON object on the last non-empty stdout line of the row's final step. */
	metric: string;
	better: "lower" | "higher";
	method: string;
	controls: string[];
	limitations: string[];
	uncertainty: string[];
};
export type Measurement = {
	receipt: string;
	repository: string;
	commit: string;
	verifier: string;
	platform: { os: string; cpu: string };
	image: string;
	/** The measured row's literal catalog line: the workload and method as executed. */
	workload: string;
	value: number;
	/** Literal line of every row the baseline ran; changed or missing rows mean changed semantics. */
	rows: Record<string, string>;
};
export type PerformanceCommitment = GroundFields & { target: number; baseline: Measurement };
export type Comparison = { outcome: "met" | "not-met" | "mismatch" | "regressed"; reason: string; value: number | null };

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
function parse(value: string | undefined): unknown {
	try {
		return JSON.parse(value ?? "null");
	} catch {
		return null;
	}
}

/** The measured value of `row` in a receipt, or why it has none. */
function measured(
	e: CatalogEvidence,
	row: string,
	metric: string,
): { value: number; step: CatalogEvidence["results"][0]["steps"][0] } | string {
	const definition = e.catalog.rows.find((r) => r.name === row);
	const result = e.results.find((r) => r.name === row);
	if (!definition || !rowExecuted(definition, result, e.catalog.selection.digest)) return `Row ${row} has no successful execution.`;
	const step = result!.steps.at(-1)!;
	const line = step.stdout.trim().split("\n").at(-1);
	const value = (parse(line) as Record<string, unknown> | null)?.[metric];
	if (typeof value !== "number" || !Number.isFinite(value)) return `Row ${row} printed no numeric ${metric}.`;
	return { value, step };
}

/**
 * The commitment a human performance Ground supports: `null` while its target or baseline is unknown (an explicit
 * question, never an invented criterion), a reason when it cannot be one.
 */
export function performanceCommitment(
	groundText: string | undefined,
	inputs: Record<string, CheckpointInput>,
	assignments: readonly RoleAssignment[],
): PerformanceCommitment | null | string {
	const p = (parse(groundText) as Record<string, unknown> | null)?.performance;
	if (
		!object(p) ||
		![p.scenario, p.row, p.metric, p.method].every(text) ||
		!["lower", "higher"].includes(String(p.better)) ||
		![p.controls, p.limitations, p.uncertainty].every(texts) ||
		!(p.baseline === null || text(p.baseline)) ||
		!(p.target === null || (typeof p.target === "number" && Number.isFinite(p.target)))
	)
		return "Performance Ground needs scenario, row, metric, better, method, controls, limitations, uncertainty, baseline and target (null when unknown).";
	if (p.baseline === null || p.target === null) return null;
	const ref = p.baseline as string;
	const owner = assignments.find((a) => a.report === ref);
	const input = inputs[ref];
	const e = parse(input?.text) as CatalogEvidence | null;
	if (!owner || !input || input.human || input.document !== `owned-check/${owner.id}` || e?.kind !== "catalog-check")
		return "The baseline must be a trusted host catalog receipt on actual source.";
	const m = measured(e, p.row as string, p.metric as string);
	if (typeof m === "string") return `Baseline: ${m}`;
	const names = [...new Set([...requiredCatalogRows(e.catalog.selection), p.row as string])];
	const rows: Record<string, string> = {};
	for (const name of names) {
		const row = e.catalog.rows.find((r) => r.name === name);
		if (
			!row ||
			!rowExecuted(
				row,
				e.results.find((r) => r.name === name),
				e.catalog.selection.digest,
			)
		)
			return `Baseline row ${name} has no successful execution.`;
		rows[name] = row.literal;
	}
	const { baseline: _b, target: _t, ...fields } = p as GroundFields & { baseline: string; target: number };
	return {
		...fields,
		target: p.target as number,
		baseline: {
			receipt: ref,
			repository: e.catalog.selection.repository,
			commit: e.catalog.selection.commit,
			verifier: e.catalog.selection.digest,
			platform: m.step.platform,
			image: m.step.image,
			workload: rows[p.row as string]!,
			value: m.value,
			rows,
		},
	};
}

export function readCommitment(contractText: string | undefined): PerformanceCommitment | undefined {
	const c = (parse(contractText) as Record<string, unknown> | null)?.performance;
	return object(c) ? (c as PerformanceCommitment) : undefined;
}

/** Whether a receipt on new source supports the committed target against the same workload and unchanged checks. */
export function comparePerformance(c: PerformanceCommitment, e: CatalogEvidence | undefined): Comparison {
	const row = e?.catalog.rows.find((r) => r.name === c.row);
	if (!e || !row || row.literal !== c.baseline.workload)
		return { outcome: "mismatch", reason: `No measurement of the baseline workload ${c.row}.`, value: null };
	for (const [name, literal] of Object.entries(c.baseline.rows)) {
		const now = e.catalog.rows.find((r) => r.name === name);
		if (
			!now ||
			now.literal !== literal ||
			!rowExecuted(
				now,
				e.results.find((r) => r.name === name),
				e.catalog.selection.digest,
			)
		)
			return {
				outcome: "regressed",
				reason: `Row ${name} changed or failed since the baseline; a human decision is required.`,
				value: null,
			};
	}
	const m = measured(e, c.row, c.metric);
	if (typeof m === "string") return { outcome: "mismatch", reason: m, value: null };
	if (m.step.image !== c.baseline.image || JSON.stringify(m.step.platform) !== JSON.stringify(c.baseline.platform))
		return { outcome: "mismatch", reason: "Measured on another platform or image than the baseline.", value: m.value };
	const met = c.better === "lower" ? m.value <= c.target : m.value >= c.target;
	return {
		outcome: met ? "met" : "not-met",
		reason: `${c.metric} ${m.value} against target ${c.target} (baseline ${c.baseline.value}).`,
		value: m.value,
	};
}
