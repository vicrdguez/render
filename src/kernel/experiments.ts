// Experiment identity is an immutable protocol revision, never a mutable document pointer.
import type { RoleAssignment, RolePacket } from "./roles.ts";

export type Experiment = { protocol: string; candidate: string | null };
export type ExperimentProtocol = {
	schema: 1;
	ground: string;
	question: string;
	hypothesis: string;
	falsifier: string;
	decisionRule: string;
	controls: string[];
	fixtures: string[];
	failureCases: string[];
	retainedOutputs: string[];
	budget: { maxCommands: number; timeoutMs: number };
	profile: { image: string; exclusions: string[]; maxBytes: number; maxEntries: number };
	source: { repository: string; commit: string };
	candidates: string[];
};
function object(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === "object" && !Array.isArray(v);
}
function text(v: unknown): v is string {
	return typeof v === "string" && v.trim().length > 0;
}
function texts(v: unknown): v is string[] {
	return Array.isArray(v) && v.length > 0 && v.every(text);
}
function bound(v: unknown, max: number): boolean {
	return Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= max;
}
function parse(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}
export function readExperimentProtocol(value: string): ExperimentProtocol | undefined {
	const p = parse(value);
	if (
		!object(p) ||
		p.schema !== 1 ||
		![p.ground, p.question, p.hypothesis, p.falsifier, p.decisionRule].every(text) ||
		![p.controls, p.fixtures, p.failureCases, p.retainedOutputs, p.candidates].every(texts) ||
		!object(p.budget) ||
		!bound(p.budget.maxCommands, 32) ||
		!bound(p.budget.timeoutMs, 300000) ||
		!object(p.source) ||
		!text(p.source.repository) ||
		typeof p.source.commit !== "string" ||
		!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(p.source.commit) ||
		!object(p.profile) ||
		typeof p.profile.image !== "string" ||
		!/^sha256:[a-f0-9]{64}$/.test(p.profile.image) ||
		!texts(p.profile.exclusions) ||
		p.profile.exclusions[0] !== ".git" ||
		!bound(p.profile.maxBytes, 1048576) ||
		!bound(p.profile.maxEntries, 10000)
	)
		return;
	const candidates = p.candidates as string[];
	if (
		candidates.length > 4 ||
		new Set(candidates).size !== candidates.length ||
		candidates.some((id) => !/^[a-z][a-z0-9-]{0,31}$/.test(id))
	)
		return;
	return p as ExperimentProtocol;
}
export function experimentCandidates(assignments: readonly RoleAssignment[], protocol: string): RoleAssignment[] {
	return assignments.filter((a) => a.packet.role === "experiment-candidate" && a.packet.experiment?.protocol === protocol);
}
export function experimentInputs(assignments: readonly RoleAssignment[], packet: RolePacket): string[] {
	if (!packet.experiment || packet.role !== "experiment-parent") return [];
	return experimentCandidates(assignments, packet.experiment.protocol).flatMap((a) =>
		[a.experimentSource, a.report].filter((r): r is string => !!r),
	);
}
export function experimentOutcome(value: string, protocol: string): boolean {
	const r = parse(value);
	return (
		object(r) &&
		r.schema === 1 &&
		r.protocol === protocol &&
		["positive", "negative", "inconclusive", "deviation"].includes(String(r.outcome)) &&
		text(r.summary) &&
		Array.isArray(r.measurements) &&
		r.measurements.every((m) => object(m) && text(m.name) && typeof m.value === "number" && Number.isFinite(m.value) && text(m.unit)) &&
		Array.isArray(r.failures) &&
		r.failures.every(text) &&
		texts(r.limits)
	);
}
