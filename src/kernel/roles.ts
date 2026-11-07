// Pure role ownership and execution legality, reached only through Kernel.change.

import { isDeepStrictEqual } from "node:util";
import { validCandidateAnswer } from "./candidates.ts";
import { blockedBySeams } from "./checkpoints.ts";
import { type Experiment, experimentCandidates, experimentOutcome } from "./experiments.ts";
import {
	type AuditAxis,
	type AuditBinding,
	type AuditResult,
	auditFindings,
	auditReviewerPacket,
	boundVerdict,
	completedReviews,
	type FindingDisposition,
	implementationEvidenceGap,
	type PassConfiguration,
	passConfiguration,
	preparationBase,
	preparationRecord,
	type ReturnObservation,
	returnObservation,
	reviewChecks,
	reviewSelection,
	sourceScopeMatches,
	usableReviewer,
	validAssessment,
	validDispositions,
	type WatchdogBinding,
	watchdogVerdict,
} from "./implementation.ts";
import { consumeIntake, type IntakeReview, intakeAssignmentGap } from "./intake.ts";
import {
	cancelHandoff,
	changeIntegration,
	handoffClosed,
	INTEGRATION_COMMANDS,
	type Integration,
	type IntegrationCommand,
	unresolved,
} from "./integration.ts";
import { type Investigation, readInvestigationOutcome, shapeConfirmed } from "./investigation.ts";
import type { Decision, DomainWrite, KernelState, Principal, VerifiedFacts } from "./kernel.ts";
import { bindingFor, initialPolicy, policyBasis } from "./policy.ts";
import { completionGap, type VerificationAssessment, type VerificationSelection } from "./verification.ts";

export const ROLES = [
	"coordinator",
	"challenger",
	"candidate",
	"experiment-candidate",
	"experiment-parent",
	"implementer",
	"audit-standards",
	"audit-contracts",
	"watchdog",
] as const;
export type Role = (typeof ROLES)[number];
export type RolePacket = {
	experiment?: Experiment;
	investigation?: Investigation;
	verification?: VerificationSelection;
	/** Ledger-generated binding; callers cannot submit or inherit it. */
	policyBinding?: string;
	role: Role;
	inputs: string[];
	principles: string;
	instructions: string;
	policy: string;
	profile: string;
	execution: "read-only" | "linux-writer";
	provider: "anthropic";
	model: string;
	family: string;
	requiredFamily: string;
	thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	maxInputBytes: number;
	maxOutputTokens: number;
	maxTurns: number;
	expectedOutput: string;
	submission: "submit_role_result";
	requests: { key: string; packet: RolePacket }[];
};
export type ImplementationPass = {
	configuration: PassConfiguration;
	captureA?: string;
	captureB?: string;
	workspace?: string;
	audit?: {
		ref: string;
		record: string;
		source: string;
		contract: string;
		roles: Record<AuditAxis, { assignment: string; packet: string }>;
		results: Partial<Record<AuditAxis, AuditResult>>;
	};
	handoff?: {
		record: string;
		source: string;
		preparationTask?: number;
		preparationResult?: string;
		blocker?: string;
		/** Every host preparation attempt of this handoff, in order; retries and drift append, never replace. */
		preparations?: string[];
		/** The one human direction resolving a stopped round of this handoff: Needs Human or the review limit. */
		direction?: { review: string; revision: string };
		/** Every proposal integration operation of this handoff, in order; at most one ever qualifies. */
		integrations?: Integration[];
		/** A human cancellation fence: attempts admitted before it stay in flight and are still observed. */
		canceled?: { sequence: number; inFlight: string[] };
	};
	ref: string;
	ordinal: number;
	workflow: string;
	slice: string;
	contract: string;
	cause: "initial-implementation" | ReturnObservation["cause"];
	predecessor: string | null;
	/** Exact authorizing result and the commit this pass's fresh workspace starts from. */
	opening?: { observation: string; source: string; target: string; base: string };
	assignment: string;
	packet: string;
	policyBinding: string;
	record: string;
};
export type RoleAssignment = {
	/** The policy that authorized this implementation execution; adoption cannot rewrite it. */
	implementationBinding?: string;
	auditReview?: AuditBinding;
	/** Host-launched Watchdog round: exact X/T it judges. Only a bound round can authorize rework or qualify. */
	watchdogReview?: WatchdogBinding;
	passRef?: string;
	checkpointCandidate?: { request: string; key: string };
	checkpointReview?: { request: string; emission: string; manifest: string; annotations: number };
	intakeReview?: IntakeReview;
	id: string;
	workflow: string;
	slice: string;
	generation: number;
	attempt: string;
	executorEpoch: string | null;
	packet: RolePacket;
	packetRef: string;
	policyBinding?: string;
	predecessor?: string | null;
	runtimeHistory?: string;
	runtimeTaskCaptured?: boolean;
	conversation: number;
	task: number;
	parent: string | null;
	requestKey: string | null;
	delivery: boolean;
	status: "queued" | "running" | "blocked" | "submitted" | "canceling" | "canceled";
	executing: boolean;
	executionOrdinal: number;
	blocker: string | null;
	report: string | null;
	evidence?: string[];
	investigationSource?: string;
	experimentSource?: string;
};
export type RoleWorkState = { assignments: RoleAssignment[]; passes?: ImplementationPass[] };
/** `from`: preparation attempts a staged preparation task inherits as settled history rather than continues. */
export type RoleIntent = { kind: "run-role" | "notify-role" | "prepare-pass"; assignment: string; from?: number };
export type RoleCommand =
	| IntegrationCommand
	| { type: "recordImplementationExecution"; workflow: string; assignment: string; generation: number; attempt: string }
	| {
			type: "recordImplementationSource";
			workflow: string;
			assignment: string;
			generation: number;
			attempt: string;
			kind: "audit" | "final" | "checkpoint";
			text: string;
	  }
	| { type: "requestImplementationAudit"; workflow: string }
	| {
			type: "submitImplementationHandoff";
			workflow: string;
			text: string;
			dispositions: FindingDisposition[];
			verification: VerificationAssessment;
	  }
	| { type: "recordPreparationBlocker"; workflow: string; assignment: string; generation: number; attempt: string; reason: string }
	| { type: "recordPreparation"; workflow: string; assignment: string; generation: number; attempt: string; text: string }
	| { type: "retryPreparation"; workflow: string; assignment: string; generation: number; attempt: string }
	| { type: "directRework"; workflow: string; assignment: string; generation: number; attempt: string; review: string; text: string }
	| {
			type: "requestWatchdogReview";
			workflow: string;
			assignment: string;
			generation: number;
			attempt: string;
			preparation: string;
			target: string;
	  }
	| { type: "recordReviewChecks"; workflow: string; assignment: string; generation: number; attempt: string; text: string }
	| { type: "openSuccessorPass"; workflow: string; assignment: string; generation: number; attempt: string; text: string }
	| { type: "assignTask"; workflow: string; slice: string; delivery: boolean; packet: RolePacket }
	| { type: "replaceTask"; workflow: string; assignment: string; generation: number; attempt: string; packet: RolePacket }
	| { type: "recordRuntimeHistory"; workflow: string; assignment: string; generation: number; attempt: string; key: string }
	| { type: "requestRole"; workflow: string; key: string; request?: string }
	| { type: "submitRoleResult"; workflow: string; text: string; supports: string[]; verification?: VerificationAssessment }
	| {
			type: "retainWebEvidence";
			workflow: string;
			handle: string;
			observation: string;
			start: number;
			end: number;
			claim: string;
			stance: "supporting" | "negative" | "conflicting";
	  }
	| { type: "requestOwnStop"; workflow: string }
	| {
			type: "recordRecoveryState" | "recordRunnerObservation" | "recordRunnerDiagnostic" | "recordSourceObservation";
			workflow: string;
			assignment: string;
			generation: number;
			attempt: string;
			text: string;
	  }
	| {
			type: "cancelWork" | "fenceAttempt" | "stageTask";
			workflow: string;
			assignment: string;
			generation: number;
			attempt: string;
			executorEpoch?: string;
	  }
	| { type: "recordBlocker"; workflow: string; assignment: string; generation: number; attempt: string; reason: string }
	| {
			type: "recordQuiescence" | "rebindAttempt";
			workflow: string;
			assignment: string;
			generation: number;
			attempt: string;
			providerIdle: boolean;
			environment: "absent" | "stopped" | "unknown";
			effects: "reconciled" | "unknown";
			executorEpoch?: string;
	  };

export const ROLE_COMMANDS = [
	...INTEGRATION_COMMANDS,
	"recordImplementationExecution",
	"recordImplementationSource",
	"requestImplementationAudit",
	"submitImplementationHandoff",
	"recordPreparationBlocker",
	"recordPreparation",
	"retryPreparation",
	"directRework",
	"requestWatchdogReview",
	"recordReviewChecks",
	"openSuccessorPass",
	"assignTask",
	"replaceTask",
	"recordRuntimeHistory",
	"requestRole",
	"submitRoleResult",
	"retainWebEvidence",
	"requestOwnStop",
	"cancelWork",
	"fenceAttempt",
	"stageTask",
	"recordBlocker",
	"recordQuiescence",
	"recordRecoveryState",
	"recordRunnerObservation",
	"recordRunnerDiagnostic",
	"recordSourceObservation",
	"rebindAttempt",
];

function refusal(code: string, reason: string): Decision {
	return { outcome: "refused", code, reason } as Decision;
}
export function sameAgent(a: RoleAssignment, p: Principal): boolean {
	return (
		p.kind === "assignment-agent" &&
		a.id === p.assignment &&
		a.generation === p.generation &&
		a.attempt === p.attempt &&
		a.packet.role === p.role &&
		a.status !== "canceling" &&
		a.status !== "canceled"
	);
}
/** Linked replacements satisfy the same child obligation; predecessors remain historical.
 * A canceled child with no replacement still blocks its parent.
 */
export function currentChildren(assignments: readonly RoleAssignment[], parent: string): RoleAssignment[] {
	const children = assignments.filter((child) => child.parent === parent);
	const replaced = new Set(children.map((child) => child.predecessor));
	return children.filter((child) => !replaced.has(child.id));
}
export function packetRefs(p: RolePacket): string[] {
	return [
		...new Set([
			...p.inputs,
			...(p.experiment ? [p.experiment.protocol] : []),
			p.principles,
			p.instructions,
			p.policy,
			p.profile,
			...(p.investigation ? [p.investigation.ground] : []),
			...(p.verification ? [p.verification.contract, ...p.verification.receipts] : []),
		]),
	];
}
export function changeRole(state: KernelState, command: RoleCommand, facts: VerifiedFacts): Decision {
	if (!state.workflow || state.workflow.id !== command.workflow) return refusal("not_found", "Role work requires an existing workflow.");
	const work: RoleWorkState = structuredClone(state.roleWork ?? { assignments: [] });
	const p = facts.principal;
	const c = command;
	const intents: RoleIntent[] = [];
	let result: Record<string, string | number | null> = {};
	const target = p.kind === "assignment-agent" ? p.assignment : "assignment" in c ? c.assignment : null;
	const a = work.assignments.find((a) => a.id === target);
	if (p.kind === "assignment-agent") {
		if (!a || a.generation !== p.generation || a.attempt !== p.attempt || a.status === "canceling" || a.status === "canceled")
			return refusal("stale_assignment", "This assignment generation or Attempt is fenced.");
		if (a.workflow !== c.workflow || a.packet.role !== p.role)
			return refusal("forbidden_scope", "Effective assignment role or workflow differs.");
		if (a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)
			return refusal("assignment_not_running", "A new call requires current executing authority.");
	}
	// Check proposed experiment authority first, then Seams and accepted-Contract gaps, before command-specific fidelity.
	const proposedPacket =
		c.type === "assignTask" || c.type === "replaceTask"
			? c.packet
			: c.type === "requestRole"
				? a?.packet.requests.find((request) => request.key === c.key)?.packet
				: undefined;
	if (proposedPacket && ["experiment-candidate", "experiment-parent"].includes(proposedPacket.role) && !proposedPacket.experiment)
		return refusal("invalid_content", "Every experiment role requires an immutable preregistered protocol.");
	if (proposedPacket?.experiment) {
		const e = proposedPacket.experiment;
		const protocol = facts.experimentProtocols?.[e.protocol];
		if (!protocol) return refusal("invalid_content", "Retain the complete immutable protocol before assigning experiment work.");
		if (
			proposedPacket.investigation ||
			proposedPacket.verification ||
			proposedPacket.requests.length ||
			proposedPacket.execution !== "linux-writer" ||
			proposedPacket.role !== (e.candidate === null ? "experiment-parent" : "experiment-candidate") ||
			(c.type === "assignTask" && c.delivery)
		)
			return refusal("forbidden_scope", "Experiments confer no delivery/adoption authority or child role requests.");
		if (e.candidate !== null && !protocol.candidates.includes(e.candidate))
			return refusal("forbidden_scope", "Candidate is outside the preregistered protocol.");
		if (
			work.assignments.some(
				(other) => other.packet.experiment?.protocol === e.protocol && other.packet.experiment.candidate === e.candidate,
			)
		)
			return refusal("ownership_conflict", "This protocol/round already owns that candidate or comparison; use a new round.");
		if (e.candidate === null) {
			const candidates = experimentCandidates(work.assignments, e.protocol);
			if (
				protocol.candidates.some(
					(id) =>
						!candidates.some(
							(candidate) =>
								candidate.packet.experiment?.candidate === id &&
								candidate.status === "submitted" &&
								!candidate.executing &&
								candidate.experimentSource &&
								candidate.report,
						),
				)
			)
				return refusal("missing_content", "Retain sealed source and report for every exact protocol candidate before comparison.");
		}
	}
	const affectedPacket = c.type === "assignTask" || c.type === "replaceTask" ? c.packet : a?.packet;
	if (
		[
			"assignTask",
			"replaceTask",
			"stageTask",
			"rebindAttempt",
			"requestRole",
			"requestImplementationAudit",
			"submitImplementationHandoff",
			"openSuccessorPass",
		].includes(c.type) &&
		blockedBySeams(state.checkpoints, affectedPacket, c.type === "assignTask" ? c.delivery : (a?.delivery ?? false))
	)
		return refusal("seams_required", "Revised Seams block affected execution; historical approvals remain retained.");
	const slice = c.type === "assignTask" ? c.slice : a?.slice;
	const acceptedSlice = state.intakes?.slices.find((s) => s.id === slice);
	// An accepted implementer cannot opt out of exclusive delivery ownership.
	const delivery = c.type === "assignTask" ? c.delivery || (!!acceptedSlice && c.packet?.role === "implementer") : (a?.delivery ?? false);
	if (
		(delivery || state.intakes?.slices.some((s) => s.id === slice)) &&
		slice &&
		affectedPacket &&
		[
			"assignTask",
			"replaceTask",
			"stageTask",
			"rebindAttempt",
			"requestImplementationAudit",
			"submitImplementationHandoff",
			"recordImplementationSource",
			"recordImplementationExecution",
			"openSuccessorPass",
		].includes(c.type)
	) {
		const gap = intakeAssignmentGap(state, slice, affectedPacket);
		if (gap) return gap;
	}
	if (proposedPacket?.investigation) {
		if (proposedPacket.role !== "coordinator" || proposedPacket.execution !== "read-only" || proposedPacket.requests.length)
			return refusal("forbidden_scope", "Investigation is coordinator-only, read-only and cannot schedule child/delivery roles.");
		if (!facts.investigationGround) return refusal("missing_content", "Restore the exact human Ground revision.");
		if (!shapeConfirmed(facts.investigationGround))
			return refusal("shape_confirmation_required", "Human confirmation is required for a classifier-proposed task shape.");
	}
	const pass = work.passes?.find((p) => p.ref === (a?.passRef ?? a?.auditReview?.passRef));
	if ((a?.passRef || a?.auditReview) && !pass) return refusal("missing_content", "Retained implementation pass is missing.");
	if (
		(a?.passRef || a?.auditReview) &&
		![
			"cancelWork",
			"fenceAttempt",
			"requestOwnStop",
			"recordQuiescence",
			"recordBlocker",
			"recordPreparationBlocker",
			"recordPreparation",
			"retryPreparation",
			"directRework",
			"requestWatchdogReview",
			"recordRunnerDiagnostic",
			"recordRuntimeHistory",
			"replaceTask",
			"openSuccessorPass",
			// Integration eligibility checks the reviewed X's policy basis against the current one itself.
			...INTEGRATION_COMMANDS,
		].includes(c.type) &&
		a?.policyBinding !== bindingFor(state.policy ?? initialPolicy(), c.workflow).revision
	)
		return refusal("stale_basis", "Implementation authority belongs to an older policy binding.");
	if (
		a?.passRef &&
		[
			"recordImplementationSource",
			"recordImplementationExecution",
			"requestImplementationAudit",
			"submitImplementationHandoff",
			"rebindAttempt",
			"stageTask",
		].includes(c.type) &&
		(a.implementationBinding ?? pass?.policyBinding) !== a.policyBinding
	)
		return refusal("stale_basis", "Policy adoption fenced this implementation execution; quiesce and replace it explicitly.");
	// A pass enters Kernel state only through this configuration; a successor inherits it.
	let configuration: PassConfiguration | undefined;
	// Debt: repeated current-policy lookups below could share one command-local binding without changing adoption semantics.
	let returned: ReturnObservation | undefined;
	function create(packet: RolePacket, slice: string, delivery: boolean, parent: string | null, key: string | null, axis?: AuditAxis) {
		const id = axis ? `${facts.ids.assignment}:${axis}` : facts.ids.assignment;
		const attempt = axis ? `${facts.ids.attempt}:${axis}` : facts.ids.attempt;
		if (!id || !attempt) throw new Error("Ledger omitted role identities");
		const created: RoleAssignment = {
			...(c.type === "replaceTask" && a?.checkpointCandidate ? { checkpointCandidate: { ...a.checkpointCandidate } } : {}),
			...(c.type === "requestRole" && c.request ? { checkpointCandidate: { request: c.request, key: c.key } } : {}),
			...(c.type === "replaceTask" && a?.checkpointReview ? { checkpointReview: { ...a.checkpointReview } } : {}),
			...(c.type === "replaceTask" && a?.intakeReview ? { intakeReview: { ...a.intakeReview } } : {}),
			id,
			workflow: c.workflow,
			slice,
			generation: 1,
			attempt,
			executorEpoch: null,
			packet: {
				...packet,
				...(packet.experiment
					? { inputs: [...new Set([...packet.inputs, facts.experimentProtocols![packet.experiment.protocol]!.ground])] }
					: {}),
				policyBinding: bindingFor(state.policy ?? initialPolicy(), c.workflow).revision,
			},
			policyBinding: bindingFor(state.policy ?? initialPolicy(), c.workflow).revision,
			predecessor: c.type === "replaceTask" || c.type === "openSuccessorPass" ? c.assignment : null,
			packetRef: `packet:${facts.sequence}${axis ? `:${axis}` : ""}`,
			conversation: 0,
			task: 0,
			parent,
			requestKey: key,
			delivery,
			status: "queued",
			executing: false,
			executionOrdinal: 0,
			blocker: null,
			report: null,
		};
		work.assignments.push(created);
		intents.push({ kind: "run-role", assignment: id });
		result = { assignment: id, attempt, packet: created.packetRef };
		if (c.type === "replaceTask" && a?.auditReview) {
			created.auditReview = { ...a.auditReview };
			const axis = a.packet.role === "audit-standards" ? "standards" : "contracts";
			pass!.audit!.roles[axis] = { assignment: created.id, packet: created.packetRef };
		}
		if (c.type === "replaceTask" && a?.watchdogReview) {
			// The same round continues in a fresh context; its own checks run again under the replacement's scope.
			const { checks: _checks, ...binding } = a.watchdogReview;
			created.watchdogReview = binding;
		}
		if (c.type === "replaceTask" && a?.passRef) {
			created.passRef = a.passRef;
			pass!.assignment = created.id;
			for (const child of work.assignments) if (child.parent === a.id) child.parent = created.id;
		} else if (acceptedSlice && configuration) {
			const ordinal = (returned && pass ? pass.ordinal : 0) + 1;
			const successor: ImplementationPass = {
				ref: `pass:${c.workflow}:${slice}:${ordinal}`,
				ordinal,
				workflow: c.workflow,
				slice,
				contract: acceptedSlice.contract,
				configuration,
				cause: returned?.cause ?? "initial-implementation",
				predecessor: returned ? pass!.ref : null,
				...(returned
					? {
							opening: {
								observation: facts.ids.revision!,
								source: returned.source,
								target: returned.targetCommit,
								base: returned.cause === "preparation-conflict" ? returned.targetCommit : returned.preparedCommit,
							},
						}
					: {}),
				assignment: id,
				packet: created.packetRef,
				policyBinding: created.policyBinding!,
				record: `implementation-pass:${facts.sequence}`,
			};
			work.passes ??= [];
			work.passes.push(successor);
			created.passRef = successor.ref;
		}
		if (created.passRef) {
			created.implementationBinding = created.policyBinding;
			const pass = work.passes?.find((p) => p.ref === created.passRef);
			if (!pass) throw new Error("Implementation pass missing from retained role state");
			Object.assign(result, { passRef: pass.ref, passOrdinal: pass.ordinal, passRecord: pass.record, contract: pass.contract });
		}
		return created;
	}
	if (c.type === "assignTask") {
		if (!c.packet || !c.slice || typeof c.delivery !== "boolean")
			return refusal("invalid_content", "Assignment requires an explicit packet, Slice and ownership mode.");
		if (c.delivery && c.packet.investigation) return refusal("forbidden_scope", "Investigation creates no delivery commitment.");
		if (acceptedSlice && c.packet.role === "watchdog")
			return refusal("forbidden_scope", "Watchdog rounds on accepted work are host-launched on exact prepared X/T, never assigned.");
		if (hasOwner(work, c.packet, c.slice, delivery))
			return refusal("ownership_conflict", "Slice already has a delivery owner or workspace writer.");
		if (delivery && work.passes?.some((p) => p.workflow === c.workflow && p.slice === c.slice))
			return refusal(
				"ownership_conflict",
				"Resume the retained implementation pass with a linked replacement; assignment is not a return to implementation.",
			);
		if (acceptedSlice && delivery) {
			configuration = passConfiguration(c.packet, acceptedSlice.contract);
			if (!configuration)
				return refusal(
					"invalid_content",
					"Accepted implementation needs a Linux-writer implementer, a verification selection for its Contract with a retainable path and unique required and behavioral rows, and exactly one read-only reviewer per Audit axis, in its required family, with no verifier, investigation, experiment or nested requests.",
				);
		}
		create(c.packet, c.slice, delivery, null, null);
	} else if (c.type === "replaceTask") {
		if ((a?.passRef || a?.auditReview) && (!pass || pass.handoff))
			return refusal("assignment_closed", "Handed-off implementation cannot be replaced; only an authorized return opens its successor.");
		if (
			a?.auditReview &&
			(c.packet.role !== a.packet.role ||
				!usableReviewer(c.packet) ||
				c.packet.requiredFamily !== a.packet.requiredFamily ||
				JSON.stringify(c.packet.inputs) !== JSON.stringify(a.packet.inputs) ||
				c.packet.principles !== a.packet.principles ||
				c.packet.instructions !== a.packet.instructions ||
				c.packet.policy !== a.packet.policy ||
				c.packet.profile !== a.packet.profile)
		)
			return refusal("forbidden_scope", "Audit replacement must preserve its exact axis, source, obligations and private input scope.");
		if (
			a?.passRef &&
			(JSON.stringify(c.packet.inputs) !== JSON.stringify(a.packet.inputs) ||
				!isDeepStrictEqual(passConfiguration(c.packet, pass!.contract), pass!.configuration) ||
				c.packet.profile !== a.packet.profile)
		)
			return refusal("forbidden_scope", "Implementation replacement cannot widen source scope or change its frozen pass configuration.");
		if (a?.packet.experiment)
			return refusal("forbidden_scope", "Experimental corrections require a new protocol/round, not replacement or adoption.");
		if (a?.watchdogReview && !samePacket(a.packet, c.packet))
			return refusal("forbidden_scope", "A Watchdog round keeps its exact frozen reviewer, inputs and read-only scope.");
		if (a?.checkpointCandidate) {
			if (!samePacket(a.packet, c.packet))
				return refusal(
					"forbidden_scope",
					"Candidate replacement retains exact question, conditions and role; changed comparison needs a new checkpoint.",
				);
		}
		if (a?.intakeReview && (c.packet.role !== "challenger" || !a.packet.inputs.every((ref) => c.packet.inputs.includes(ref))))
			return refusal("forbidden_scope", "Replacement fidelity must retain exact intake, decisions and concerns.");
		if (
			a?.checkpointReview &&
			(c.packet.role !== "challenger" ||
				!c.packet.inputs.includes(a.checkpointReview.emission) ||
				!c.packet.inputs.includes(a.checkpointReview.manifest) ||
				!a.packet.inputs.every((ref) => c.packet.inputs.includes(ref)))
		)
			return refusal("forbidden_scope", "Replacement challenge must retain its exact emission/manifest inputs and independent role.");
		if (a?.packet.investigation && !c.packet.investigation)
			return refusal("forbidden_scope", "Investigation replacement cannot authorize a different playbook; retain an escalation instead.");
		if (!a || a.generation !== c.generation || a.attempt !== c.attempt || a.workflow !== c.workflow)
			return refusal("stale_assignment", "Replacement predecessor differs.");
		if (a.status !== "canceled" || a.executing)
			return refusal("quiescence_unconfirmed", "Fence and quiesce the predecessor before replacement.");
		if (work.assignments.some((child) => child.predecessor === a.id))
			return refusal("ownership_conflict", "Predecessor already has a replacement.");
		if (hasOwner(work, c.packet, a.slice, a.delivery))
			return refusal("ownership_conflict", "Replacement would overlap a current delivery owner or writer.");
		create(c.packet, a.slice, a.delivery, a.parent, a.requestKey);
		result.predecessor = a.id;
	} else if (c.type === "requestImplementationAudit") {
		if (!a?.passRef || !pass || pass.assignment !== a.id || pass.handoff || !pass.captureA)
			return refusal("missing_content", "Current implementation requires retained Audit source A.");
		if (pass.audit) return refusal("role_already_requested", "This pass already has its one Audit invocation.");
		const gap = implementationEvidenceGap(facts.implementationSource, pass);
		if (gap) return refusal("missing_content", gap);
		const policy = state.policy ?? initialPolicy();
		if (
			Object.values(pass.configuration.reviewers).some((reviewer) => reviewer.packet.family === a.packet.family) &&
			policy.revisions[bindingFor(policy, a.workflow).policy]?.reviewerDiversity !== "human-directed-same-family"
		)
			return refusal("capability_unavailable", "Same-family independent Audit needs recorded human policy direction; no family fallback.");
		const audit = {
			ref: `audit:${facts.sequence}`,
			record: `implementation-audit:${facts.sequence}`,
			source: pass.captureA,
			contract: pass.contract,
			roles: {} as NonNullable<ImplementationPass["audit"]>["roles"],
			results: {},
		};
		for (const axis of ["standards", "contracts"] as const) {
			const reviewer = pass.configuration.reviewers[axis];
			const packet = auditReviewerPacket(reviewer);
			const child = create(
				{ ...packet, inputs: [...new Set([...packet.inputs, pass.contract, pass.captureA])] },
				a.slice,
				false,
				a.id,
				reviewer.key,
				axis,
			);
			child.auditReview = { passRef: pass.ref, audit: audit.ref, source: pass.captureA, contract: pass.contract };
			audit.roles[axis] = { assignment: child.id, packet: child.packetRef };
		}
		pass.audit = audit;
		result = {
			assignment: a.id,
			passRef: pass.ref,
			source: pass.captureA,
			audit: audit.ref,
			auditRecord: audit.record,
			standards: audit.roles.standards.assignment,
			contracts: audit.roles.contracts.assignment,
			document0: audit.roles.standards.packet,
			document1: audit.roles.contracts.packet,
		};
	} else if (c.type === "submitImplementationHandoff") {
		if (!a?.passRef || !pass || pass.assignment !== a.id || pass.handoff || !pass.audit || !pass.captureA || !pass.captureB)
			return refusal("missing_content", "Handoff requires current pass A, Audit and final B, with no prior handoff.");
		if (
			!c.text ||
			Buffer.byteLength(c.text) > 1024 * 1024 ||
			!validDispositions(c.dispositions) ||
			!validAssessment(c.verification) ||
			c.verification.outcome !== "pass"
		)
			return refusal("invalid_content", "Handoff requires literal text, complete dispositions and a passing assessment.");
		const reports: AuditResult[] = [];
		for (const axis of ["standards", "contracts"] as const) {
			const binding = pass.audit.roles[axis],
				report = pass.audit.results[axis];
			const reviewer = work.assignments.find((r) => r.id === binding.assignment);
			if (
				!report ||
				!reviewer ||
				reviewer.status !== "submitted" ||
				reviewer.report !== report.report ||
				report.assignment !== reviewer.id ||
				reviewer.auditReview?.audit !== pass.audit.ref ||
				reviewer.auditReview.source !== pass.captureA
			)
				return refusal("missing_content", "Both current Audit axes must complete on this pass and A.");
			reports.push(report);
		}
		const evidence = facts.implementationSource;
		if (pass.workspace !== pass.captureB || !sourceScopeMatches(evidence, a))
			return refusal("stale_basis", "Final B must be the current owner's latest captured workspace.");
		const policy = state.policy ?? initialPolicy();
		const gap = implementationEvidenceGap(
			evidence,
			pass,
			c.verification,
			policy.revisions[bindingFor(policy, a.workflow).policy]!.minimumEvidenceRank,
		);
		if (gap) return refusal("missing_content", gap);
		const findings = reports.flatMap((r) => r.findings.map((f) => ({ ...f, report: r.report })));
		if (c.dispositions.length !== findings.length) return refusal("invalid_content", "Every finding needs exactly one disposition.");
		for (const finding of findings) {
			const dispositions = c.dispositions.filter((d) => d.report === finding.report && d.finding === finding.id);
			if (dispositions.length !== 1) return refusal("invalid_content", "Missing or duplicate finding disposition.");
			const d = dispositions[0]!;
			if (finding.needsHuman || d.disposition === "needs-human")
				return refusal("capability_unavailable", "Unresolved product/Contract questions require human resolution.");
			// Debt: extract the successful-row predicate if reused; keep exact B, row selection and verifier identity checks together.
			if (
				d.disposition === "fixed" &&
				(!d.changes.length ||
					!d.changes.every((ref) => ref === pass.captureB) ||
					!d.rechecks.length ||
					!d.rechecks.every((name) =>
						evidence!.verification!.results.some(
							(r) =>
								r.name === name &&
								r.status === "completed" &&
								r.steps.length &&
								r.steps.every(
									(s) => s.exitCode === 0 && !s.timedOut && s.verifierRevision === evidence!.verification!.catalog.selection.digest,
								) &&
								evidence!.verification!.catalog.selection.rows.includes(name),
						),
					))
			)
				return refusal("missing_content", "Fixed findings need exact B and successful relevant catalog row rechecks.");
		}
		pass.handoff = { record: `implementation-handoff:${facts.sequence}`, source: pass.captureB };
		a.status = "submitted";
		intents.push({ kind: "prepare-pass", assignment: a.id });
		result = {
			assignment: a.id,
			passRef: pass.ref,
			source: pass.captureB,
			captureA: pass.captureA,
			audit: pass.audit.ref,
			auditRecord: pass.audit.record,
			handoff: pass.handoff.record,
		};
	} else if (c.type === "requestWatchdogReview") {
		if (!a?.passRef || !pass?.handoff || pass.assignment !== a.id || a.status !== "submitted" || !latestPass(work.passes, pass))
			return refusal("assignment_closed", "Watchdog reviews only the current handed-off pass.");
		if (handoffClosed(pass)) return refusal("assignment_closed", handoffClosed(pass)!);
		if (a.workflow !== c.workflow || a.generation !== c.generation || a.attempt !== c.attempt)
			return refusal("stale_assignment", "Generation or Attempt is no longer current.");
		if (pass.handoff.preparations?.at(-1) !== c.preparation)
			return refusal("stale_basis", "Review only this handoff's latest prepared source.");
		const sealed = facts.implementationSource;
		const record = sealed
			? preparationRecord(facts.checkpointInputs?.[c.preparation]?.text ?? "", sealed.source.source.objectFormat)
			: undefined;
		if (!record) return refusal("missing_content", "Restore the exact preparation record and sealed handoff source.");
		if (record.outcome !== "checked" || !record.preparation || !record.checks)
			return refusal("forbidden_scope", "Only prepared X whose required checks passed can be reviewed.");
		if (record.target.commit !== c.target)
			return refusal("stale_basis", "Target moved since X was prepared; prepare the current target before review.");
		const basis = policyBasis(state.policy ?? initialPolicy(), c.workflow);
		if (!basis || record.policy.binding !== basis.binding || record.policy.revision !== basis.revision)
			return refusal("stale_basis", "X was qualified under a superseded policy binding; prepare again.");
		if (work.assignments.some((r) => r.watchdogReview?.preparation === c.preparation && r.status !== "canceled"))
			return refusal("role_already_requested", "This prepared X already has its Watchdog round.");
		const reviewer = pass.configuration.watchdog;
		if (!reviewer) return refusal("capability_unavailable", "This pass froze no Watchdog reviewer; no review is invented.");
		const policy = state.policy ?? initialPolicy();
		if (
			reviewer.packet.family === a.packet.family &&
			policy.revisions[bindingFor(policy, a.workflow).policy]?.reviewerDiversity !== "human-directed-same-family"
		)
			return refusal("capability_unavailable", "Same-family independent review needs recorded human policy direction; no family fallback.");
		// Return observations and the human directions that resolved stopped rounds, oldest first.
		const lineage: string[] = [];
		for (let p: ImplementationPass | undefined = pass; p; p = work.passes!.find((x) => x.ref === p!.predecessor))
			lineage.unshift(...[p.opening?.observation, p.handoff?.direction?.revision].filter((ref) => ref !== undefined));
		const prior = [...completedReviews(work.assignments, c.workflow, a.slice).map((r) => r.report!), ...lineage];
		const packet = auditReviewerPacket(reviewer);
		const required = [
			pass.contract,
			pass.record,
			pass.handoff.record,
			pass.handoff.source,
			pass.captureA!,
			pass.audit!.record,
			...Object.values(pass.audit!.results).map((r) => r!.report),
			c.preparation,
		];
		const w = create({ ...packet, inputs: [...new Set([...packet.inputs, ...required])] }, a.slice, false, null, reviewer.key);
		w.watchdogReview = {
			passRef: pass.ref,
			handoff: pass.handoff.record,
			source: pass.handoff.source,
			preparation: c.preparation,
			prepared: record.preparation.result,
			tree: record.preparation.tree,
			target: record.target.commit,
			verifier: record.checks.verifierRevision,
			prior,
		};
		Object.assign(result, { review: w.id, passRef: pass.ref, handoff: pass.handoff.record, preparation: c.preparation });
	} else if (c.type === "openSuccessorPass") {
		if (!a?.passRef || !pass || a.workflow !== c.workflow)
			return refusal("not_found", "Successor requires the owner of a retained implementation pass.");
		if (a.generation !== c.generation || a.attempt !== c.attempt)
			return refusal("stale_assignment", "Generation or Attempt is no longer current.");
		if (!pass.handoff) return refusal("missing_content", "Only an accepted handoff can return to implementation; the pass stays open.");
		if (handoffClosed(pass)) return refusal("assignment_closed", handoffClosed(pass)!);
		const latest = Math.max(...work.passes!.filter((p) => p.workflow === pass.workflow && p.slice === pass.slice).map((p) => p.ordinal));
		if (pass.assignment !== a.id || pass.ordinal !== latest)
			return refusal("assignment_closed", "This pass already has its one successor.");
		if (a.executing) return refusal("quiescence_unconfirmed", "The handed-off writer must be quiescent before another writer.");
		const sealed = facts.implementationSource;
		const observation = sealed && c.text ? returnObservation(c.text, sealed) : undefined;
		if (!sealed || !observation) return refusal("invalid_content", "Return requires a closed trusted result; a reason alone is not one.");
		const receipt = sealed.source;
		if (
			observation.source !== pass.handoff.source ||
			observation.sourceCommit !== receipt.source.commit ||
			observation.baseCommit !== preparationBase(pass) ||
			observation.repository !== receipt.source.repository
		)
			return refusal("stale_basis", "Result names other lineage than this pass's sealed source.");
		const policy = state.policy ?? initialPolicy();
		const limit = policy.revisions[bindingFor(policy, c.workflow).policy]!.completedReviewLimit;
		const reviews = completedReviews(work.assignments, c.workflow, a.slice);
		const verdicts = reviews.flatMap((r) => {
			const verdict = watchdogVerdict(facts.checkpointInputs?.[r.report!]?.text);
			return verdict?.handoff === pass.handoff!.record ? [verdict] : [];
		});
		// Only the human direction recorded for this exact stopped round lets its return through the stop.
		const directed =
			observation.cause === "human-direction" &&
			pass.handoff.direction?.review === observation.review &&
			pass.handoff.direction.revision === observation.direction;
		// A return is human-directed only by that recorded direction, whatever automatic budget remains.
		if (observation.cause === "human-direction" && !directed)
			return refusal("human_direction_required", "A human-directed return must cite the direction recorded for its exact round.");
		if (!directed && verdicts.some((v) => v.verdict === "needs-human" || (v.verdict === "rework" && reviews.length >= limit)))
			return refusal(
				"human_direction_required",
				`Needs Human or ${reviews.length} completed reviews at limit ${limit} stop automatic return; adopt policy or direct explicitly.`,
			);
		if (observation.cause === "watchdog-rework" || observation.cause === "human-direction") {
			const review = reviews.find((r) => r.id === observation.review && r.report === observation.report);
			const verdict = watchdogVerdict(review && facts.checkpointInputs?.[review.report!]?.text);
			if (!review || !verdict) return refusal("missing_content", "Rework must cite a submitted Watchdog report on this Slice.");
			if (verdict.verdict === "pass" || (observation.cause === "watchdog-rework" && verdict.verdict !== "rework"))
				return refusal("forbidden_scope", "Only a rework verdict, or a human-directed stopped round, authorizes this return.");
			if (
				// Only a host-launched round authorizes rework; its verdict was bound to that round's exact X/T on submission.
				review.watchdogReview?.passRef !== pass.ref ||
				!review.packet.inputs.includes(pass.handoff.record) ||
				verdict.passRef !== pass.ref ||
				verdict.handoff !== pass.handoff.record ||
				verdict.source !== pass.handoff.source ||
				verdict.prepared !== observation.preparedCommit ||
				verdict.target !== observation.targetCommit
			)
				return refusal("stale_basis", "Rework verdict is bound to other lineage.");
		}
		if (hasOwner(work, a.packet, a.slice, a.delivery))
			return refusal("ownership_conflict", "Slice already has a delivery owner or workspace writer.");
		returned = observation;
		configuration = pass.configuration;
		const predecessor = pass.ref;
		// A conflict successor also reads the exact retained record: Git's own conflict output and the B/T0/T1 it merged.
		const conflict = observation.cause === "preparation-conflict" ? pass.handoff.preparations?.at(-1) : undefined;
		// A rework successor reads the exact findings it must address; they are required inputs, never guessed.
		const findings =
			observation.cause === "watchdog-rework"
				? [observation.report]
				: observation.cause === "human-direction"
					? [observation.report, observation.direction]
					: [];
		const inputs = [...a.packet.inputs, facts.ids.revision!, ...(conflict ? [conflict] : []), ...findings];
		create({ ...a.packet, inputs: [...new Set(inputs)] }, a.slice, a.delivery, null, null);
		Object.assign(result, { predecessorPass: predecessor, observation: facts.ids.revision!, document0: facts.ids.revision! });
	} else if (c.type === "requestRole") {
		if (a?.passRef) return refusal("forbidden_scope", "Accepted implementation requires its pass-bound paired Audit on retained source.");
		if (!a) return refusal("stale_assignment", "No current assignment.");
		const request = a.packet.requests.find((r) => r.key === c.key);
		if (a.packet.investigation || request?.packet.investigation || !request || !mayRequest(a.packet.role, request.packet.role))
			return refusal("forbidden_scope", "Request is not a predefined role within this packet.");
		if (c.request) {
			const checkpoint = state.checkpoints?.requests.find((r) => r.id === c.request);
			if (
				request.packet.role !== "candidate" ||
				checkpoint?.status !== "pending" ||
				checkpoint.coordinator !== a.id ||
				!checkpoint.candidateKeys?.includes(c.key)
			)
				return refusal("forbidden_scope", "Candidate must belong to this coordinator's pending comparison and captured request key.");
		}
		const policy = state.policy ?? initialPolicy();
		if (
			request.packet.family === a.packet.family &&
			policy.revisions[bindingFor(policy, a.workflow).policy]?.reviewerDiversity !== "human-directed-same-family"
		)
			return refusal("capability_unavailable", "Same-family independent work needs recorded human policy direction; no family fallback.");
		if (
			work.assignments.some(
				(child) => child.parent === a.id && child.requestKey === c.key && child.checkpointCandidate?.request === c.request,
			)
		)
			return refusal("role_already_requested", "This bounded role request already has durable work.");
		create(request.packet, a.slice, false, a.id, c.key);
	} else if (c.type === "recordRunnerDiagnostic") {
		if (!a || a.workflow !== c.workflow || c.attempt !== a.attempt || c.generation > a.generation)
			return refusal("stale_assignment", "Diagnostic identity must belong to the original assignment Attempt.");
		if (!c.text || Buffer.byteLength(c.text) > 16 * 1024 * 1024)
			return refusal("invalid_content", "Diagnostic exceeds retained evidence bounds.");
		result = { assignment: a.id, diagnostic: facts.ids.revision ?? null };
	} else if (c.type === "recordRecoveryState") {
		if (!a || a.workflow !== c.workflow || (c.generation >= a.generation && c.attempt === a.attempt))
			return refusal("invalid_content", "Only evidence from a fenced prior identity is quarantined.");
		result = { assignment: a.id, quarantined: facts.ids.revision ?? null };
	} else if (c.type === "retainWebEvidence") {
		if (!a || !facts.ids.revision) return refusal("stale_assignment", "No current assignment.");
		a.evidence ??= [];
		a.evidence.push(facts.ids.revision);
		result = { assignment: a.id, evidence: facts.ids.revision };
	} else if (c.type === "submitRoleResult") {
		if (a?.passRef)
			return refusal("forbidden_scope", "Accepted implementation closes only through its sealed pass handoff, not a generic report.");
		if (!a) return refusal("stale_assignment", "No current assignment.");
		if (a.auditReview) {
			const axis = a.packet.role === "audit-standards" ? "standards" : a.packet.role === "audit-contracts" ? "contracts" : undefined;
			if (
				!axis ||
				!pass?.audit ||
				pass.audit.roles[axis].assignment !== a.id ||
				pass.audit.ref !== a.auditReview.audit ||
				pass.captureA !== a.auditReview.source ||
				pass.contract !== a.auditReview.contract ||
				pass.audit.results[axis]
			)
				return refusal("forbidden_scope", "Report is not the current host-bound Audit axis.");
			const findings = auditFindings(c.text, a.auditReview);
			if (!findings) return refusal("invalid_content", "Audit report must name its exact host binding and unique structured findings.");
			pass.audit.results[axis] = { assignment: a.id, report: facts.ids.revision!, findings };
		}
		// A launched round judges exact X/T from its own retained checks; its verdict is bound, never restated.
		const binding = a.watchdogReview;
		const reviewed = binding && work.passes?.find((p) => p.ref === binding.passRef);
		if (binding) {
			if (!reviewed?.handoff || reviewed.handoff.record !== binding.handoff)
				return refusal("missing_content", "The handed-off pass this round reviews is not retained.");
			if (!binding.checks) return refusal("missing_content", "Run and retain this round's own checks of exact X before judging it.");
			if (!c.text || !boundVerdict(c.text, binding))
				return refusal(
					"invalid_content",
					"Submit JSON schema:1 with verdict pass|rework|needs-human and this round's exact passRef, handoff, source, prepared and target.",
				);
			if (!c.verification || !validAssessment(c.verification))
				return refusal("invalid_content", "Declare your own assessment of exact X's checks, with its reason.");
			if (boundVerdict(c.text, binding)!.verdict === "pass" && c.verification.outcome !== "pass")
				return refusal("invalid_content", "A passing verdict needs a passing assessment of your own checks.");
			if (c.verification.outcome === "pass") {
				const policy = state.policy ?? initialPolicy();
				const minimum = policy.revisions[bindingFor(policy, a.workflow).policy]!.minimumEvidenceRank;
				const gap = completionGap(
					reviewSelection(reviewed, binding),
					"watchdog",
					c.verification,
					facts.verificationEvidence ?? [],
					minimum,
				);
				if (gap) return refusal("missing_content", gap);
			}
		}
		if (!c.text || Buffer.byteLength(c.text) > 1024 * 1024)
			return refusal("invalid_content", "Report must contain at most 1 MiB of complete UTF-8 text.");
		if (a.checkpointCandidate && !validCandidateAnswer(c.text))
			return refusal(
				"invalid_content",
				"Candidate result needs schema:1, answer, assumptions, consequences and incidentalChoices arrays; no winner authority.",
			);
		if (!Array.isArray(c.supports)) return refusal("invalid_content", "Declare required retained supports, or [] for no web reliance.");
		if (c.supports.some((ref) => !a.evidence?.includes(ref)))
			return refusal("missing_content", "Promote exact required web support before reliance.");
		if (a.packet.experiment && (!a.experimentSource || !experimentOutcome(c.text, a.packet.experiment.protocol)))
			return refusal(
				"invalid_content",
				"Seal exact source and decisive raw results before submitting a protocol-bound outcome, numbers, failures and limitations.",
			);
		if (a.packet.verification) {
			if (!c.verification?.reason || !["pass", "non-pass"].includes(c.verification.outcome))
				return refusal("invalid_content", "Declare catalog adequacy and rationale; command exit is not judgment.");
			const policy = state.policy ?? initialPolicy();
			const minimum = policy.revisions[bindingFor(policy, a.workflow).policy]!.minimumEvidenceRank;
			const gap = completionGap(a.packet.verification, a.packet.role, c.verification, facts.verificationEvidence ?? [], minimum);
			if (gap) return refusal("missing_content", gap);
		} else if (c.verification && !binding) return refusal("invalid_content", "Assessment requires a selected verification catalog.");
		const outcome = a.packet.investigation
			? readInvestigationOutcome(c.text, [...packetRefs(a.packet), ...c.supports], a.investigationSource, a.packet.investigation.paths)
			: undefined;
		if (a.packet.investigation && !outcome)
			return refusal("invalid_content", "Investigation requires cited facts, uncertainty, limits and a finding or actionable escalation.");
		a.status = outcome?.outcome === "escalation" ? "blocked" : "submitted";
		if (outcome?.next)
			a.blocker = `${outcome.next.playbook === "experiment" ? "experiment_preregistration_required" : `playbook_unavailable:${outcome.next.playbook}`}; ${outcome.next.reason}; ${outcome.next.question}`;
		a.report = facts.ids.revision ?? null;
		// Every completed round counts once; its owner's host task settles the verdict against current state.
		if (reviewed?.handoff && latestPass(work.passes, reviewed) && reviewed.handoff.preparations?.at(-1) === binding!.preparation)
			intents.push({ kind: "prepare-pass", assignment: reviewed.assignment, from: reviewed.handoff.preparations.length - 1 });
		result = {
			...(binding ? { reviews: completedReviews(work.assignments, a.workflow, a.slice).length } : {}),
			assignment: a.id,
			report: a.report,
			webEvidence: c.supports.length ? "retained" : "none",
			...(c.verification
				? { verificationOutcome: c.verification.outcome, verificationRank: c.verification.rank, verificationReason: c.verification.reason }
				: {}),
			...Object.fromEntries(c.supports.map((ref, i) => [`support${i}`, ref])),
		};
		if (a.parent) intents.push({ kind: "notify-role", assignment: a.id });
	} else {
		if (!a || a.workflow !== c.workflow) return refusal("not_found", "Assignment is outside this workflow.");
		if ("generation" in c && (a.generation !== c.generation || a.attempt !== c.attempt))
			return refusal("stale_assignment", "Generation or Attempt is no longer current.");
		result = { assignment: a.id };
		switch (c.type) {
			case "stageOperation":
			case "admitEffect":
			case "recordIntegration": {
				const outcome = changeIntegration(state, work, a, pass, c, facts, !!pass && latestPass(work.passes, pass));
				if ("code" in outcome) return outcome as Decision;
				Object.assign(result, outcome);
				break;
			}
			case "recordImplementationExecution":
			case "recordImplementationSource": {
				if (!a.passRef || !pass || pass.assignment !== a.id || pass.handoff)
					return refusal("forbidden_scope", "Only current accepted implementation can record execution or source.");
				if (c.type === "recordImplementationExecution") {
					if (a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)
						return refusal("stale_assignment", "Mutable execution admission requires the current executing owner and executor.");
					result.source = pass.captureB ?? null;
					result.passRef = pass.ref;
					delete pass.captureB;
					break;
				}
				if (!c.text || Buffer.byteLength(c.text) > 16 * 1024 * 1024 || !["audit", "final", "checkpoint"].includes(c.kind))
					return refusal("invalid_content", "Complete literal source must fit retained source bounds.");
				if (
					!sourceScopeMatches(facts.implementationSource, a) ||
					!["running", ...(c.kind === "checkpoint" ? ["blocked"] : [])].includes(a.status) ||
					(c.kind !== "checkpoint" && (!a.executing || a.executorEpoch !== facts.executorEpoch))
				)
					return refusal(
						"stale_assignment",
						"Source freeze must identify this actual executing scope; a checkpoint observes an already-admitted current Attempt.",
					);
				if (pass.opening && !pass.workspace && facts.implementationSource?.source.base.commit !== pass.opening.base)
					return refusal(
						"stale_basis",
						"A successor's first capture must descend from its host-selected base, not a worker-chosen parent.",
					);
				if (c.kind === "audit" && pass.captureA) return refusal("assignment_closed", "Audit A is immutable and captured once.");
				if (c.kind === "final" && !pass.audit) return refusal("missing_content", "Request this pass's Audit before final capture.");
				if (c.kind !== "checkpoint") {
					const gap = implementationEvidenceGap(facts.implementationSource, pass);
					if (gap) return refusal("missing_content", gap);
				}
				const ref = facts.ids.revision!;
				pass.workspace = ref;
				if (c.kind === "audit") pass.captureA = ref;
				if (c.kind === "final") pass.captureB = ref;
				result.source = ref;
				result.passRef = pass.ref;
				break;
			}
			case "recordPreparation": {
				if (!pass?.handoff || pass.assignment !== a.id || a.status !== "submitted" || !latestPass(work.passes, pass))
					return refusal("assignment_closed", "Preparation attempts belong to the current handed-off pass.");
				if (reviewing(work, pass))
					return refusal("stale_basis", "A Watchdog round of this handoff is in progress; it settles before another preparation.");
				if (handoffClosed(pass)) return refusal("assignment_closed", handoffClosed(pass)!);
				if (unresolved(pass.handoff.integrations?.at(-1)))
					return refusal("stale_basis", "This handoff's admitted integration is unresolved; reconcile it before preparing again.");
				const sealed = facts.implementationSource;
				const record = sealed && c.text ? preparationRecord(c.text, sealed.source.source.objectFormat) : undefined;
				if (!sealed || !record) return refusal("invalid_content", "Preparation requires a complete closed host result.");
				const prior = pass.handoff.preparations ?? [];
				if (
					record.passRef !== pass.ref ||
					record.handoff !== pass.handoff.record ||
					record.source !== pass.handoff.source ||
					record.attempt !== prior.length + 1 ||
					(record.preparation &&
						(record.preparation.base !== preparationBase(pass) ||
							record.preparation.source !== sealed.source.source.commit ||
							record.preparation.target !== record.target.commit))
				)
					return refusal("stale_basis", "Preparation names other lineage, attempt order or recorded base than this handoff.");
				const basis = policyBasis(state.policy ?? initialPolicy(), c.workflow);
				if (
					!basis ||
					record.policy.binding !== basis.binding ||
					record.policy.revision !== basis.revision ||
					record.policy.minimumEvidenceRank !== basis.minimumEvidenceRank
				)
					return refusal("stale_basis", "Preparation qualified X against another policy than the workflow's current binding.");
				const ref = `implementation-preparation:${facts.sequence}`;
				pass.handoff.preparations = [...prior, ref];
				pass.handoff.preparationResult = ref;
				if (record.outcome === "operational") {
					pass.handoff.blocker = record.reason!;
					a.blocker = record.reason;
				}
				Object.assign(result, { passRef: pass.ref, handoff: pass.handoff.record, preparation: ref, document0: ref });
				break;
			}
			case "retryPreparation": {
				if (!pass?.handoff || pass.assignment !== a.id || a.status !== "submitted" || !latestPass(work.passes, pass))
					return refusal("assignment_closed", "Only the current handed-off pass can be prepared again.");
				// A canceled handoff may still reconcile an attempt admitted before the cancellation.
				if (handoffClosed(pass) && !unresolved(pass.handoff.integrations?.at(-1)))
					return refusal("assignment_closed", handoffClosed(pass)!);
				// A blocker is recorded only by a settled preparation task, so this also keeps one preparation in flight. A round
				// canceled without replacement leaves no blocker; its handoff is settled too and may be prepared again.
				const latest = pass.handoff.preparations?.at(-1);
				const rounds = work.assignments.filter((r) => !!latest && r.watchdogReview?.preparation === latest);
				const abandoned = rounds.length > 0 && rounds.every((r) => r.status === "canceled");
				if ((!pass.handoff.blocker && !abandoned) || reviewing(work, pass))
					return refusal("stale_basis", "Preparation or review is still in progress; retry a settled blocked preparation.");
				delete pass.handoff.blocker;
				a.blocker = null;
				// A completed round's verdict is settled again under current policy and target, never re-prepared away.
				const settles = rounds.some((r) => r.status === "submitted");
				const from = (pass.handoff.preparations?.length ?? 0) - (settles ? 1 : 0);
				intents.push({ kind: "prepare-pass", assignment: a.id, from });
				Object.assign(result, { passRef: pass.ref, handoff: pass.handoff.record, settles: settles ? latest! : null });
				break;
			}
			case "directRework": {
				if (!pass?.handoff || pass.assignment !== a.id || a.status !== "submitted" || !latestPass(work.passes, pass))
					return refusal("assignment_closed", "Only the current handed-off pass takes direction.");
				if (handoffClosed(pass)) return refusal("assignment_closed", handoffClosed(pass)!);
				const latest = pass.handoff.preparations?.at(-1);
				const round = work.assignments.find((r) => r.id === c.review);
				// The human directs the exact settled stop they saw: this handoff's latest completed round, once.
				if (
					!round?.watchdogReview ||
					round.watchdogReview.passRef !== pass.ref ||
					round.watchdogReview.preparation !== latest ||
					round.status !== "submitted" ||
					!pass.handoff.blocker ||
					pass.handoff.direction ||
					reviewing(work, pass)
				)
					return refusal("stale_basis", "Direct only the settled stop of this handoff's latest completed Watchdog round, once.");
				const verdict = boundVerdict(facts.checkpointInputs?.[round.report!]?.text ?? "", round.watchdogReview);
				if (!verdict) return refusal("missing_content", "Restore the exact Watchdog report this direction answers.");
				if (verdict.verdict === "pass") return refusal("forbidden_scope", "A passing round is not a stop; it needs no direction.");
				if (!c.text?.trim() || Buffer.byteLength(c.text) > 1024 * 1024)
					return refusal("invalid_content", "Direction must contain at most 1 MiB of nonblank UTF-8 text.");
				// Direction is implementer input within the frozen Contract, not a waiver; the count and reports stay.
				pass.handoff.direction = { review: round.id, revision: facts.ids.revision! };
				delete pass.handoff.blocker;
				a.blocker = null;
				intents.push({ kind: "prepare-pass", assignment: a.id, from: pass.handoff.preparations!.length - 1 });
				Object.assign(result, {
					passRef: pass.ref,
					handoff: pass.handoff.record,
					review: round.id,
					direction: facts.ids.revision!,
					settles: latest,
					document0: facts.ids.revision!,
				});
				break;
			}
			case "recordReviewChecks": {
				const binding = a.watchdogReview;
				if (!binding || a.packet.role !== "watchdog")
					return refusal("forbidden_scope", "Only a host-launched Watchdog round retains its own checks.");
				if (binding.checks) return refusal("assignment_closed", "This round's checks are retained once.");
				if (a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)
					return refusal("stale_assignment", "Checks belong to the current executing review.");
				const receipt = c.text && Buffer.byteLength(c.text) <= 16 * 1024 * 1024 ? reviewChecks(c.text) : undefined;
				if (!receipt) return refusal("invalid_content", "Checks require literal X and a complete scoped catalog receipt.");
				const reviewed = work.passes?.find((p) => p.ref === binding.passRef);
				const e = receipt.evidence;
				const selection = reviewed && reviewSelection(reviewed, binding);
				if (
					!selection ||
					e.role !== "watchdog" ||
					e.scope.assignment !== a.id ||
					e.scope.generation !== a.generation ||
					e.scope.attempt !== a.attempt ||
					e.scope.executorEpoch !== facts.executorEpoch ||
					receipt.source.commit !== binding.prepared ||
					receipt.source.tree !== binding.tree ||
					e.verification.inputCommit !== binding.prepared ||
					e.verification.inputTree !== binding.tree ||
					!(["repository", "commit", "path", "digest", "contract"] as const).every((k) => e.catalog.selection[k] === selection[k])
				)
					return refusal("stale_basis", "Checks must be this round's own run on exact X under X's own verifier.");
				binding.checks = facts.ids.revision!;
				Object.assign(result, { checks: binding.checks, document0: binding.checks });
				break;
			}
			case "recordPreparationBlocker":
				// A blocker is visible state only: Watchdog launch and qualification recheck the current verified policy basis.
				if (!pass?.handoff || pass.assignment !== a.id || a.status !== "submitted" || !c.reason?.trim())
					return refusal("assignment_closed", "Preparation blockage requires a handed-off pass.");
				pass.handoff.blocker = c.reason;
				pass.handoff.preparationResult = `implementation-preparation:${facts.sequence}`;
				a.blocker = c.reason;
				result.handoff = pass.handoff.record;
				result.preparationResult = pass.handoff.preparationResult;
				result.document0 = pass.handoff.preparationResult;
				break;
			case "recordSourceObservation":
				if (a.packet.experiment) {
					if (a.experimentSource || a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)
						return refusal("stale_assignment", "Only a current open experiment can retain its sealed source.");
					if (!c.text || Buffer.byteLength(c.text) > 16 * 1024 * 1024)
						return refusal("invalid_content", "Complete experiment evidence exceeds retention bounds.");
					a.experimentSource = facts.ids.revision!;
					result.source = a.experimentSource;
					break;
				}
				if (!a.packet.investigation || a.investigationSource || !["queued", "running"].includes(a.status))
					return refusal(
						"forbidden_scope",
						"Only an open investigation without a retained source can accept its exact source observation.",
					);
				if (!c.text || Buffer.byteLength(c.text) > 16 * 1024 * 1024)
					return refusal("invalid_content", "Investigation source exceeds retained evidence bounds.");
				a.investigationSource = facts.ids.revision!;
				result.source = a.investigationSource;
				break;
			case "recordRunnerObservation":
				if (a.passRef) return refusal("forbidden_scope", "An owned-check receipt cannot close an implementation pass.");
				if (a.checkpointCandidate) return refusal("forbidden_scope", "Only the assigned candidate can submit its competing answer.");
				if (a.packet.investigation || a.packet.experiment)
					return refusal("forbidden_scope", "Only the assigned coordinator can submit a cited investigation outcome.");
				if (a.status !== "running" || !a.executing || a.executorEpoch !== facts.executorEpoch)
					return refusal("stale_assignment", "Owned check receipt requires the current executing generation.");
				if (!c.text || Buffer.byteLength(c.text) > 16 * 1024 * 1024)
					return refusal("invalid_content", "Owned check receipt exceeds evidence bounds.");
				a.report = facts.ids.revision ?? null;
				a.status = "submitted";
				result.report = a.report;
				if (a.parent) intents.push({ kind: "notify-role", assignment: a.id });
				break;
			case "recordRuntimeHistory":
				a.runtimeHistory = `runtime-history:${facts.sequence}`;
				result.runtimeHistory = a.runtimeHistory;
				break;
			case "stageTask":
				if (a.status !== "queued") return refusal("assignment_not_queued", "Only queued work starts.");
				if (c.executorEpoch !== facts.executorEpoch) return refusal("stale_executor", "Dispatch belongs to another executor epoch.");
				if (work.assignments.filter((a) => a.executing).length >= 4)
					return refusal("capacity_exhausted", "Four executing attempts already consume capacity.");
				a.status = "running";
				a.executing = true;
				a.executionOrdinal++;
				a.executorEpoch = c.executorEpoch ?? null;
				break;
			case "recordBlocker":
				if (a.status === "submitted" || a.status === "canceled") return refusal("assignment_closed", "Closed work cannot become blocked.");
				a.blocker = c.reason;
				if (a.status !== "canceling") a.status = "blocked";
				break;
			case "requestOwnStop":
			case "cancelWork":
			case "fenceAttempt":
				// A handed-off pass is canceled through its handoff: the owner's generation fences new admissions.
				if (c.type === "cancelWork" && a.status === "submitted" && a.passRef) {
					const canceled = pass && latestPass(work.passes, pass) ? cancelHandoff(pass, a, facts.sequence) : undefined;
					if (!canceled || "outcome" in canceled)
						return canceled ?? refusal("assignment_closed", "Only the current handed-off pass can be canceled.");
					Object.assign(result, { generation: a.generation, inFlight: canceled.inFlight });
					break;
				}
				if (a.status === "canceled" || a.status === "canceling" || a.status === "submitted")
					return refusal("assignment_closed", "Work is closed or already fenced.");
				a.generation++;
				a.status = "canceling";
				a.blocker = "stop_pending";
				result.generation = a.generation;
				break;
			case "recordQuiescence":
			case "rebindAttempt":
				if (!c.providerIdle || (c.environment !== "absent" && c.environment !== "stopped") || c.effects !== "reconciled")
					return refusal(
						"quiescence_unconfirmed",
						"Provider, whole environment and outstanding effects must all be reconciled; timeout is not death.",
					);
				if (c.type === "rebindAttempt") {
					if (a.passRef) {
						if (
							!pass?.workspace ||
							pass.handoff ||
							pass.assignment !== a.id ||
							!sourceScopeMatches(facts.implementationSource, a) ||
							!["running", "blocked"].includes(a.status) ||
							c.environment !== "stopped" ||
							c.executorEpoch !== facts.executorEpoch
						)
							return refusal(
								"recovery_required",
								"Writer continuation requires retained workspace, confirmed whole-runtime stop and current pass authority.",
							);
						a.status = "queued";
						a.blocker = null;
						a.executing = false;
						a.executorEpoch = c.executorEpoch ?? null;
						break;
					}
					if (
						(a.packet.execution !== "read-only" && !(a.packet.experiment && a.experimentSource && c.environment === "stopped")) ||
						c.executorEpoch !== facts.executorEpoch
					)
						return refusal("recovery_required", "Only checked read-only same-assignment continuation is available.");
					if (
						a.status === "blocked" &&
						a.blocker === "awaiting_role_results" &&
						!a.executing &&
						currentChildren(work.assignments, a.id).every((child) => child.status === "submitted")
					) {
						a.status = "queued";
						a.blocker = null;
					} else if (a.status !== "running") return refusal("recovery_required", "Blocked work needs resolution before continuation.");
					a.executorEpoch = c.executorEpoch ?? null;
				} else {
					a.executing = false;
					if (a.status === "canceling") {
						a.status = "canceled";
						a.blocker = null;
					}
				}
				break;
		}
	}
	const writes: DomainWrite[] = [
		{ type: "roles.replace", state: work, intents },
		{
			type: "fact.record",
			fact: facts.ids.fact,
			command: c.type,
			refs: {
				workflow: c.workflow,
				...Object.fromEntries(Object.entries(result).filter(([key, v]) => key !== "webEvidence" && typeof v === "string")),
			} as Record<string, string>,
		},
	];
	if ((c.type === "assignTask" || c.type === "replaceTask") && slice) {
		const consumed = consumeIntake(state, slice, facts.ids.assignment!, facts.sequence);
		if (consumed) {
			writes.push(consumed);
			const index = writes.findIndex((w) => w.type === "fact.record");
			const fact = writes[index];
			if (fact?.type === "fact.record") writes[index] = { ...fact, refs: { ...fact.refs, document0: consumed.documents[0]!.ref } };
		}
	}
	return { outcome: "accepted", result, writes, facts: [facts.ids.fact] };
}
/** The same packet apart from the Ledger-generated policy binding a replacement receives. */
function samePacket(old: RolePacket, next: RolePacket): boolean {
	const { policyBinding: _old, ...a } = old;
	const { policyBinding: _next, ...b } = next;
	return isDeepStrictEqual(a, b);
}
/** An unsettled Watchdog round of this handoff: no preparation or retry runs beside it. */
function reviewing(work: RoleWorkState, pass: ImplementationPass): boolean {
	return work.assignments.some(
		(r) => r.watchdogReview?.handoff === pass.handoff?.record && r.status !== "submitted" && r.status !== "canceled",
	);
}
/** A returned pass has a successor; its handoff no longer accepts preparation. */
export function latestPass(passes: readonly ImplementationPass[] | undefined, pass: ImplementationPass): boolean {
	return !passes?.some((p) => p.workflow === pass.workflow && p.slice === pass.slice && p.ordinal > pass.ordinal);
}
function hasOwner(work: RoleWorkState, packet: RolePacket, slice: string, delivery: boolean): boolean {
	return work.assignments.some(
		(a) =>
			a.slice === slice &&
			((delivery && a.delivery && a.status !== "submitted" && a.status !== "canceled") ||
				(packet.execution === "linux-writer" &&
					!packet.experiment &&
					a.packet.execution === "linux-writer" &&
					(a.executing || (a.status !== "submitted" && a.status !== "canceled")))),
	);
}
function mayRequest(parent: Role, child: Role): boolean {
	return parent === "coordinator"
		? ["challenger", "candidate", "experiment-candidate", "experiment-parent"].includes(child)
		: parent === "implementer" && ["audit-standards", "audit-contracts"].includes(child);
}
