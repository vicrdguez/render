// Pure autonomous proposal integration legality (spec §§9.1, 9.3). Ledger supplies the exact retained bytes; Effects
// performs the canonical-ref CAS. Intent is never permission, and only a recorded `applied` observation qualifies.
import { isDeepStrictEqual } from "node:util";
import { boundVerdict, preparationRecord, reviewQualification } from "./implementation.ts";
import type { KernelState, Refusal, VerifiedFacts } from "./kernel.ts";
import { initialPolicy, type PolicyBasis, policyBasis } from "./policy.ts";
import type { ImplementationPass, RoleAssignment, RoleWorkState } from "./roles.ts";

/** What host Effects stages: every input the integration rests on, pinned before any canonical ref may change. */
export type IntegrationIntent = {
	schema: 1;
	kind: "proposal-integration";
	proposal: string;
	ref: string;
	slice: string;
	contract: string;
	passRef: string;
	handoff: string;
	source: string;
	captureA: string;
	audit: string;
	reports: string[];
	preparation: string;
	prepared: string;
	tree: string;
	target: string;
	review: string;
	report: string;
	/** Squash R: exactly prepared X's tree on parent T, with fixed metadata. */
	result: { commit: string; tree: string; parent: string; message: string };
	policy: PolicyBasis;
	assignment: string;
	generation: number;
	attempt: string;
	/** Unresolved canonical-ref operations of the proposal at staging: always none, or staging refuses. */
	unresolved: [];
};
export type CanonicalState = { commit: string; tree: string; parents: string[] } | null;
/** What Effects saw: its own dispatch result, or a read-only reconciliation, plus the ref and any held ref lock. */
export type IntegrationObservation = {
	schema: 1;
	operation: string;
	attempt: string;
	mode: "dispatch" | "reconcile";
	dispatch: "applied" | "refused" | null;
	ref: string;
	observed: CanonicalState;
	lock: boolean;
};
export type IntegrationOutcome = "applied" | "stale" | "unapplied" | "divergent";
/** One admission: the one-use permit bound to the executor epoch that may dispatch it. */
export type IntegrationAttempt = {
	id: string;
	executorEpoch: string;
	sequence: number;
	observations: string[];
	outcome?: Exclude<IntegrationOutcome, "divergent">;
};
export type Integration = {
	operation: string;
	preparation: string;
	review: string;
	target: string;
	result: string;
	tree: string;
	status: "planned" | "admitted" | "qualified" | "stale" | "unapplied" | "divergent";
	attempts: IntegrationAttempt[];
	qualification?: string;
};
export type IntegrationCommand =
	| { type: "stageOperation"; workflow: string; assignment: string; generation: number; attempt: string; text: string }
	| { type: "admitEffect"; workflow: string; assignment: string; generation: number; attempt: string; operation: string }
	| {
			type: "recordIntegration";
			workflow: string;
			assignment: string;
			generation: number;
			attempt: string;
			operation: string;
			text: string;
	  };
export const INTEGRATION_COMMANDS = ["stageOperation", "admitEffect", "recordIntegration"];

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const closed = (v: Record<string, unknown>, keys: string[]) =>
	Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const objectId = (format: "sha1" | "sha256") => (v: unknown) =>
	typeof v === "string" && v.length === (format === "sha1" ? 40 : 64) && /^[0-9a-f]+$/.test(v);
function refusal(code: Refusal["code"], reason: string): Refusal {
	return { outcome: "refused", code, reason };
}
const INTENT_KEYS = [
	"schema",
	"kind",
	"proposal",
	"ref",
	"slice",
	"contract",
	"passRef",
	"handoff",
	"source",
	"captureA",
	"audit",
	"reports",
	"preparation",
	"prepared",
	"tree",
	"target",
	"review",
	"report",
	"result",
	"policy",
	"assignment",
	"generation",
	"attempt",
	"unresolved",
];
/** Closed shape only; lineage and eligibility belong to the caller's current state. */
export function integrationIntent(value: string, format: "sha1" | "sha256"): IntegrationIntent | undefined {
	try {
		const v: unknown = JSON.parse(value);
		const id = objectId(format);
		if (!object(v) || v.schema !== 1 || v.kind !== "proposal-integration" || !closed(v, INTENT_KEYS)) return;
		const names = ["proposal", "ref", "slice", "contract", "passRef", "handoff", "source", "captureA", "audit", "preparation"];
		if (![...names, "review", "report", "assignment", "attempt"].every((k) => text(v[k]))) return;
		if (![v.prepared, v.tree, v.target].every(id) || !Number.isSafeInteger(v.generation) || Number(v.generation) < 1) return;
		if (!Array.isArray(v.reports) || v.reports.length !== 2 || !v.reports.every(text)) return;
		if (!Array.isArray(v.unresolved) || v.unresolved.length) return;
		const r = v.result;
		if (!object(r) || !closed(r, ["commit", "tree", "parent", "message"]) || ![r.commit, r.tree, r.parent].every(id)) return;
		if (!text(r.message) || r.message.length > 4096) return;
		const p = v.policy;
		if (!object(p) || !closed(p, ["binding", "revision", "minimumEvidenceRank"]) || !text(p.binding) || !text(p.revision)) return;
		if (p.minimumEvidenceRank !== null && !text(p.minimumEvidenceRank)) return;
		return v as IntegrationIntent;
	} catch {
		return;
	}
}
export function integrationObservation(value: string, format: "sha1" | "sha256"): IntegrationObservation | undefined {
	try {
		const v: unknown = JSON.parse(value);
		const id = objectId(format);
		if (!object(v) || v.schema !== 1 || !closed(v, ["schema", "operation", "attempt", "mode", "dispatch", "ref", "observed", "lock"]))
			return;
		if (![v.operation, v.attempt, v.ref].every(text) || typeof v.lock !== "boolean") return;
		if (
			!((v.mode === "dispatch" && ["applied", "refused"].includes(String(v.dispatch))) || (v.mode === "reconcile" && v.dispatch === null))
		)
			return;
		const o = v.observed;
		if (o !== null) {
			if (!object(o) || !closed(o, ["commit", "tree", "parents"]) || !id(o.commit) || !id(o.tree)) return;
			if (!Array.isArray(o.parents) || o.parents.length > 64 || !o.parents.every(id)) return;
		}
		return v as IntegrationObservation;
	} catch {
		return;
	}
}
/**
 * The three explicit outcomes of the SQL/ref gap (spec §9.3), decided from what Effects observed, never from intent:
 * exactly R with X's tree on parent T is `applied`; exactly T means nothing applied; a CAS the dispatching executor saw
 * refused on a moved ref is `stale`; anything else, including a held ref lock, is divergence.
 */
export function integrationOutcome(o: IntegrationObservation, intent: IntegrationIntent): IntegrationOutcome {
	const ref = o.observed;
	if (o.lock || !ref) return "divergent";
	if (ref.commit === intent.result.commit)
		return ref.tree === intent.result.tree && isDeepStrictEqual(ref.parents, [intent.target]) ? "applied" : "divergent";
	if (o.mode === "dispatch" && o.dispatch === "applied") return "divergent";
	if (ref.commit === intent.target) return "unapplied";
	return o.mode === "dispatch" ? "stale" : "divergent";
}
/** Admitted and unresolved, or divergent: the proposal's integration is serialized until it resolves. */
export function unresolved(i: Integration | undefined): boolean {
	return i?.status === "admitted" || i?.status === "divergent";
}
/** The proposal's unresolved operation, other than `except`, that every other staging and admission waits behind. */
export function serializing(passes: readonly ImplementationPass[], workflow: string, except?: string): Integration | undefined {
	return passes
		.filter((p) => p.workflow === workflow)
		.flatMap((p) => p.handoff?.integrations ?? [])
		.find((i) => unresolved(i) && i.operation !== except);
}
export function integrated(pass: ImplementationPass): boolean {
	return !!pass.handoff?.integrations?.some((i) => i.status === "qualified");
}
/** Why a handoff takes no further preparation, review or return: it integrated, or a human canceled it. */
export function handoffClosed(pass: ImplementationPass): string | undefined {
	if (integrated(pass)) return "This handoff already has recorded qualifying integration.";
	if (pass.handoff?.canceled) return "A human canceled this handoff; no further preparation, review or admission.";
	return undefined;
}
/** Slices of the proposal whose current accepted Contract has recorded qualifying integration (spec I9). */
export function qualifiedSlices(
	passes: readonly ImplementationPass[],
	workflow: string,
	slices: readonly { id: string; contract: string; status: string }[],
): string[] {
	return slices
		.filter(
			(s) =>
				s.status === "accepted" &&
				passes.some((p) => p.workflow === workflow && p.slice === s.id && p.contract === s.contract && integrated(p)),
		)
		.map((s) => s.id);
}
/** In-flight attempts a cancellation cannot retract: the view lists them, and their observations still record. */
export function cancelHandoff(pass: ImplementationPass, a: RoleAssignment, sequence: number): Refusal | { inFlight: number } {
	const h = pass.handoff;
	if (!h || pass.assignment !== a.id || integrated(pass) || h.canceled)
		return refusal("assignment_closed", "Only an unintegrated, uncanceled current handoff can be canceled.");
	const latest = h.integrations?.at(-1);
	const attempt = latest?.attempts.at(-1);
	const inFlight = unresolved(latest) && attempt && !attempt.outcome ? [attempt.id] : [];
	a.generation++;
	h.canceled = { sequence, inFlight };
	h.blocker = `canceled: no further preparation, review or integration admission; ${inFlight.length} admitted attempt(s) in flight`;
	a.blocker = h.blocker;
	return { inFlight: inFlight.length };
}

/** Current eligibility shared by staging and every admission: lineage, Contract, exact review, policy and serialization. */
function eligibility(
	state: KernelState,
	work: RoleWorkState,
	a: RoleAssignment,
	pass: ImplementationPass,
	intent: IntegrationIntent,
	facts: VerifiedFacts,
	format: "sha1" | "sha256",
	except?: string,
): Refusal | undefined {
	const h = pass.handoff!;
	const results = pass.audit?.results;
	if (
		intent.proposal !== a.workflow ||
		intent.slice !== pass.slice ||
		intent.passRef !== pass.ref ||
		intent.handoff !== h.record ||
		intent.source !== h.source ||
		intent.captureA !== pass.captureA ||
		intent.audit !== pass.audit?.record ||
		!isDeepStrictEqual(intent.reports, [results?.standards?.report, results?.contracts?.report]) ||
		intent.assignment !== a.id ||
		intent.generation !== a.generation ||
		intent.attempt !== a.attempt
	)
		return refusal("stale_basis", "Intent names other lineage than this handoff and its current owner generation.");
	const slice = state.intakes?.slices.find((s) => s.id === pass.slice);
	if (slice?.status !== "accepted") return refusal("contract_superseded", "Superseded work is not integrated.");
	if (slice.contract !== pass.contract || intent.contract !== pass.contract)
		return refusal("stale_basis", "Intent must bind the Slice's current accepted Contract.");
	if (h.preparations?.at(-1) !== intent.preparation) return refusal("stale_basis", "Integrate only this handoff's latest prepared X.");
	const record = preparationRecord(facts.checkpointInputs?.[intent.preparation]?.text ?? "", format);
	if (!record?.preparation) return refusal("missing_content", "Restore the exact preparation record this intent names.");
	const review = work.assignments.find((r) => r.id === intent.review);
	if (!review?.watchdogReview || !review.report || review.report !== intent.report)
		return refusal("stale_basis", "Intent must name a completed host-launched Watchdog round and its exact report.");
	const basis = policyBasis(state.policy ?? initialPolicy(), a.workflow);
	if (!basis) return refusal("missing_content", "The workflow's current policy is unavailable.");
	const gap = reviewQualification({
		pass,
		preparation: intent.preparation,
		record,
		review,
		verdict: boundVerdict(facts.checkpointInputs?.[review.report]?.text ?? "", review.watchdogReview),
		target: intent.target,
		basis,
	});
	if (gap) return refusal(gap.code as Refusal["code"], gap.reason);
	if (!isDeepStrictEqual(intent.policy, basis)) return refusal("stale_basis", "Intent names another policy basis than the current one.");
	if (intent.prepared !== record.preparation.result || intent.tree !== record.preparation.tree || intent.ref !== record.target.ref)
		return refusal("stale_basis", "Intent names other prepared X or canonical ref than the reviewed record.");
	if (intent.result.tree !== intent.tree || intent.result.parent !== intent.target)
		return refusal("invalid_content", "R must carry exactly prepared X's tree on parent T; nothing is recomputed after review.");
	const blocking = serializing(work.passes ?? [], a.workflow, except);
	if (blocking)
		return refusal("ownership_conflict", `Proposal integration is serialized: ${blocking.operation} is unresolved; reconcile it first.`);
	return undefined;
}

/**
 * Host Effects staging, admission and observation of one handoff's integration. Mutates the caller's working copy of
 * role state; returns the receipt result or a refusal with no writes.
 */
export function changeIntegration(
	state: KernelState,
	work: RoleWorkState,
	a: RoleAssignment,
	pass: ImplementationPass | undefined,
	c: IntegrationCommand,
	facts: VerifiedFacts,
	latest: boolean,
): Refusal | Record<string, string | number | null> {
	const h = pass?.handoff;
	if (!pass || !h || pass.assignment !== a.id || a.status !== "submitted" || !latest)
		return refusal("assignment_closed", "Integration belongs to the current handed-off pass.");
	const format = facts.implementationSource?.source.source.objectFormat;
	if (!format) return refusal("missing_content", "Restore the exact sealed handoff source.");
	const revision = facts.ids.revision!;
	if (c.type === "stageOperation") {
		const closedReason = handoffClosed(pass);
		if (closedReason) return refusal("assignment_closed", closedReason);
		const intent = integrationIntent(c.text, format);
		if (!intent) return refusal("invalid_content", "Stage the complete closed integration intent with an empty unresolved basis.");
		const gap = eligibility(state, work, a, pass, intent, facts, format);
		if (gap) return gap;
		const prior = h.integrations?.filter((i) => i.preparation === intent.preparation) ?? [];
		if (prior.some((i) => i.status === "stale"))
			return refusal("stale_basis", "This prepared X's CAS was refused on a moved target; prepare the current target again.");
		if (prior.length) return refusal("role_already_requested", "This prepared X already has its integration operation.");
		h.integrations = [
			...(h.integrations ?? []),
			{
				operation: revision,
				preparation: intent.preparation,
				review: intent.review,
				target: intent.target,
				result: intent.result.commit,
				tree: intent.result.tree,
				status: "planned",
				attempts: [],
			},
		];
		return { operation: revision, passRef: pass.ref, document0: revision };
	}
	const op = h.integrations?.at(-1);
	if (!op || op.operation !== c.operation) return refusal("stale_basis", "Name this handoff's latest integration operation.");
	const intent = integrationIntent(facts.checkpointInputs?.[op.operation]?.text ?? "", format);
	if (!intent) return refusal("missing_content", "Restore the exact staged integration intent.");
	if (c.type === "admitEffect") {
		// Cancellation and admission share the Ledger's serialized order: a committed fence refuses every later admission.
		if (h.canceled) return refusal("assignment_closed", "Cancellation fenced this handoff before admission.");
		if (op.status !== "planned" && op.status !== "unapplied")
			return refusal("stale_basis", "Only a planned or observed-unapplied operation takes a fresh admission.");
		if (!facts.executorEpoch) return refusal("capability_unavailable", "No current executor epoch can consume a permit.");
		const gap = eligibility(state, work, a, pass, intent, facts, format, op.operation);
		if (gap) return gap;
		const id = `integration-attempt:${facts.sequence}`;
		op.attempts.push({ id, executorEpoch: facts.executorEpoch, sequence: facts.sequence, observations: [] });
		op.status = "admitted";
		return { operation: op.operation, integrationAttempt: id, executorEpoch: facts.executorEpoch, passRef: pass.ref };
	}
	const attempt = op.attempts.at(-1);
	if (!attempt || attempt.outcome || !unresolved(op))
		return refusal("assignment_closed", "This operation has no unresolved admitted attempt to observe.");
	const observation = integrationObservation(c.text, format);
	if (!observation) return refusal("invalid_content", "Record a complete closed canonical-ref observation.");
	if (observation.operation !== op.operation || observation.attempt !== attempt.id || observation.ref !== intent.ref)
		return refusal("stale_basis", "Observation names another operation, attempt or ref.");
	// Only the executor that consumed the permit knows what its dispatch did; any other executor reconciles.
	if (observation.mode === "dispatch" && attempt.executorEpoch !== facts.executorEpoch)
		return refusal("stale_executor", "Another executor epoch cannot report this attempt's dispatch; reconcile the canonical ref.");
	const outcome = integrationOutcome(observation, intent);
	attempt.observations.push(revision);
	if (outcome === "divergent") {
		op.status = "divergent";
		h.blocker = `integration_divergent: ${op.operation} observed ${observation.observed?.commit ?? "no ref"}${observation.lock ? " with a held ref lock" : ""}, expected ${intent.target} or ${intent.result.commit}; reconcile the canonical ref explicitly, then retry`;
		a.blocker = h.blocker;
	} else {
		attempt.outcome = outcome;
		op.status = outcome === "applied" ? "qualified" : outcome;
		if (outcome === "applied") op.qualification = revision;
		if (h.blocker?.startsWith("integration_")) {
			delete h.blocker;
			a.blocker = null;
		}
	}
	return {
		operation: op.operation,
		integrationAttempt: attempt.id,
		outcome,
		observation: revision,
		passRef: pass.ref,
		document0: revision,
	};
}
