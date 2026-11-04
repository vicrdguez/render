// Exact technical checkpoint legality. All bytes/provenance are supplied by Ledger; no I/O.
import { candidateEvidence, candidatePlan, validCandidateAnswer } from "./candidates.ts";
import { initialCheckpointSettings } from "./checkpoint-settings.ts";
import { readGround, shapeConfirmed } from "./investigation.ts";
import type { Decision, DomainWrite, KernelState, VerifiedFacts } from "./kernel.ts";
import { bindingFor, initialPolicy } from "./policy.ts";
import { type RoleAssignment, type RolePacket, sameAgent } from "./roles.ts";

export const CHECKPOINT_COMMANDS = [
	"requestCheckpoint",
	"stageCheckpoint",
	"requestCheckpointReview",
	"emitCheckpoint",
	"reworkCheckpoint",
	"saveCheckpointConcern",
	"approveCheckpoint",
	"advanceDelegatedCheckpoint",
	"cancelCheckpoint",
];
export type Stage = "seams" | "modules";
export type Response = { concern: string; disposition: "acted-on" | "considered" | "dismissed"; reason: string; resulting: string };
export type Manifest = {
	schema: 1;
	stage: Stage;
	nodes: {
		id: string;
		decision: string;
		rationale: string;
		alternatives: string[];
		evidence: string[];
		classification: "observable" | "judgment" | "product";
		humanDecision?: string;
		default: string;
	}[];
	decompositions: {
		id: string;
		modules: string[];
		dependencies: string[];
		verificationSeams: string[];
		depth: string;
		locality: string;
		deletion: string;
	}[];
	verificationStrategy: string;
	incidentalChoices: string[];
	responses: Response[];
};
export type CheckpointRequest = {
	candidateKeys?: string[];
	id: string;
	stage: Stage;
	scope: string;
	mode: "human" | "delegated";
	/** Absent only on legacy human-only captures. */
	checkpointSettingsRevision?: string;
	agreedScopeRef?: string;
	policyBinding: string;
	required: { candidates: boolean; experiment: boolean };
	status: "pending" | "approved" | "canceled";
	emission: string | null;
	manifest: string | null;
	emissions: string[];
	annotations: number;
	reviewedAnnotations: number | null;
	review: string | null;
	approved: string | null;
	nonbinding: string[];
	seams: string | null;
	coordinator: string;
	ready: boolean;
	manifestValue: Manifest | null;
	decision: string | null;
};
export type Concern = {
	id: string;
	request: string;
	stage: Stage;
	base: string;
	revision: string;
	diff: string;
	changeRequest: boolean;
	conflict: boolean;
	kind: "edit" | "reason";
};
export type Checkpoints = { requests: CheckpointRequest[]; concerns: Concern[] };
export const emptyCheckpoints = (): Checkpoints => ({ requests: [], concerns: [] });
export type CheckpointCommand =
	| { type: "requestCheckpoint"; workflow: string; stage: Stage; scope: string; required: { candidates: boolean; experiment: boolean } }
	| { type: "stageCheckpoint"; workflow: string; request: string; text: string; manifest: Manifest }
	| { type: "requestCheckpointReview"; workflow: string; request: string; key: string }
	| {
			type: "emitCheckpoint";
			workflow: string;
			request: string;
			review: string;
			contested: { objection: string; disposition: string; reason: string; resulting: string }[];
	  }
	| { type: "reworkCheckpoint"; workflow: string; request: string }
	| { type: "saveCheckpointConcern"; workflow: string; request: string; base: string; text: string; kind?: "edit" | "reason" }
	| {
			type: "approveCheckpoint" | "advanceDelegatedCheckpoint";
			workflow: string;
			request: string;
			emission: string;
			manifest: string;
			annotations: number;
			policyBinding: string;
			decisions: Record<string, string>;
			nonbinding: string[];
	  }
	| { type: "cancelCheckpoint"; workflow: string; request: string; expectedEmission: string | null; reason: string };
export type CheckpointInput = { text: string; human: boolean; document: string };
export type CheckpointWrite = {
	type: "checkpoints.replace";
	state: Checkpoints;
	documents: { ref: string; text: string; markdown?: boolean }[];
};
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(nonempty);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const unique = (v: string[]) => new Set(v).size === v.length;
export function validManifest(value: unknown): value is Manifest {
	if (
		!object(value) ||
		value.schema !== 1 ||
		!["seams", "modules"].includes(String(value.stage)) ||
		!Array.isArray(value.nodes) ||
		!value.nodes.length ||
		!Array.isArray(value.decompositions) ||
		!Array.isArray(value.responses) ||
		!nonempty(value.verificationStrategy) ||
		!texts(value.incidentalChoices)
	)
		return false;
	if (
		!value.nodes.every(
			(n) =>
				object(n) &&
				["id", "decision", "rationale", "default"].every((k) => nonempty(n[k])) &&
				texts(n.alternatives) &&
				n.alternatives.length >= 2 &&
				unique(n.alternatives) &&
				n.alternatives.includes(n.default as string) &&
				texts(n.evidence) &&
				n.evidence.length > 0 &&
				["observable", "judgment", "product"].includes(String(n.classification)) &&
				(n.humanDecision === undefined || (nonempty(n.humanDecision) && n.evidence.includes(n.humanDecision))),
		)
	)
		return false;
	if (!unique(value.nodes.map((n) => n.id))) return false;
	if (value.stage === "seams" && value.decompositions.length < 2) return false;
	if (
		!value.decompositions.every(
			(d) =>
				object(d) &&
				["id", "depth", "locality", "deletion"].every((k) => nonempty(d[k])) &&
				["modules", "dependencies", "verificationSeams"].every((k) => texts(d[k]) && (d[k] as string[]).length > 0),
		)
	)
		return false;
	return (
		unique(value.decompositions.map((d) => d.id)) &&
		value.responses.every(
			(r) =>
				object(r) &&
				nonempty(r.concern) &&
				["acted-on", "considered", "dismissed"].includes(String(r.disposition)) &&
				nonempty(r.reason) &&
				nonempty(r.resulting),
		)
	);
}
export function checkpointRefs(work: Checkpoints, c: CheckpointCommand): string[] {
	const r = "request" in c ? work.requests.find((r) => r.id === c.request) : undefined;
	const refs = c.type === "requestCheckpoint" ? [c.scope] : r ? [r.scope, r.emission, r.manifest, r.review] : [];
	if (c.type === "stageCheckpoint" && validManifest(c.manifest)) refs.push(...c.manifest.nodes.flatMap((n) => n.evidence));
	if (c.type === "emitCheckpoint") refs.push(c.review);
	if (c.type === "saveCheckpointConcern") refs.push(c.base);
	if (r) {
		refs.push(...(r.manifestValue?.nodes.flatMap((n) => n.evidence) ?? []));
		refs.push(...work.concerns.filter((n) => n.stage === r.stage).flatMap((n) => [n.base, n.revision, n.diff]));
	}
	return [...new Set(refs.filter((r): r is string => !!r))];
}
export function blockedBySeams(work: Checkpoints | undefined, packet: RolePacket | undefined, delivery: boolean): boolean {
	if (!work || !packet) return false;
	if (!delivery && packet.experiment && ["experiment-candidate", "experiment-parent"].includes(packet.role)) return false;
	// Historical evidence is input to revised design, not a dependency authorizing delivery.
	if (
		!delivery &&
		packet.execution === "read-only" &&
		["coordinator", "challenger", "candidate", "experiment-parent", "experiment-candidate"].includes(packet.role)
	)
		return false;
	const inputs = packet.inputs;
	const pending = work.requests.some((r) => r.stage === "seams" && r.status === "pending");
	const latest = work.requests.findLast((r) => r.stage === "seams" && r.status === "approved")?.approved;
	return work.requests.some(
		(r) =>
			r.approved &&
			(inputs.includes(r.approved) || (r.manifest !== null && inputs.includes(r.manifest))) &&
			(pending || (r.stage === "seams" ? r.approved !== latest : r.seams !== latest)),
	);
}
function refuse(code: string, reason: string, r?: CheckpointRequest): Decision {
	return {
		outcome: "refused",
		code,
		reason,
		...(r ? { refs: { request: r.id, emission: r.emission, annotations: String(r.annotations) } } : {}),
	} as Decision;
}
export function changeCheckpoint(state: KernelState, c: CheckpointCommand, facts: VerifiedFacts): Decision {
	if (!state.workflow || state.workflow.id !== c.workflow) return refuse("not_found", "Checkpoint requires an existing workflow.");
	const p = facts.principal;
	if (p.kind === "human" && p.route === "device" && p.workflows !== "all" && !p.workflows.includes(c.workflow))
		return refuse("forbidden_scope", "Workflow is outside this device's scope.");
	const a = state.roleWork?.assignments.find((a) => sameAgent(a, p));
	if (
		p.kind === "assignment-agent" &&
		(!a ||
			a.workflow !== c.workflow ||
			a.packet.role !== "coordinator" ||
			a.packet.investigation ||
			a.status !== "running" ||
			!a.executing ||
			a.executorEpoch !== facts.executorEpoch)
	)
		return refuse("stale_assignment", "Only the current executing design coordinator can advance a checkpoint.");
	const work = structuredClone(state.checkpoints ?? emptyCheckpoints());
	const policy = state.policy ?? initialPolicy();
	const binding = bindingFor(policy, c.workflow);
	const documents: CheckpointWrite["documents"] = [];
	const writes: DomainWrite[] = [];
	const result: Record<string, string | number | null> = {};
	const ref = `checkpoint-record:${facts.sequence}`;
	const inputs = facts.checkpointInputs ?? {};
	let r = "request" in c ? work.requests.find((r) => r.id === c.request) : undefined;
	if (c.type === "requestCheckpoint") {
		if (c.stage !== "seams" && c.stage !== "modules") return refuse("invalid_content", "Only technical Seams/Modules can be requested.");
		if (work.requests.some((r) => r.stage === c.stage && r.status === "pending"))
			return refuse("checkpoint_pending", "Continue the pending request or ask the human to cancel it.");
		const seams = work.requests.findLast((r) => r.stage === "seams" && r.status === "approved")?.approved ?? null;
		if (c.stage === "modules" && (!seams || work.requests.some((r) => r.stage === "seams" && r.status === "pending")))
			return refuse("seams_required", "Modules require current approved Seams; revised Seams need a decision first.");
		if (!a?.packet.inputs.includes(c.scope)) return refuse("forbidden_scope", "Ground scope must be an explicit coordinator input.");
		if (!inputs[c.scope]?.human || inputs[c.scope]?.document !== "ground")
			return refuse("invalid_content", "Scope must cite exact human-authored Ground, not an assistant proposal.");
		const ground = readGround(inputs[c.scope]!.text);
		if (ground && !shapeConfirmed(ground))
			return refuse(
				"shape_confirmation_required",
				"Confirm the existing classifier-proposed task shape in human Ground before requesting a checkpoint.",
			);
		const candidateKeys = c.required.candidates ? candidatePlan(a.packet, c.scope) : undefined;
		if (c.required.candidates && !candidateKeys)
			return refuse(
				"invalid_content",
				"Required comparison needs at least two read-only candidate packets with common Ground/inputs and distinct explicit conditions.",
			);
		r = {
			...(candidateKeys ? { candidateKeys } : {}),
			id: `checkpoint:${facts.sequence}`,
			stage: c.stage,
			scope: c.scope,
			mode: (state.checkpointSettings ?? initialCheckpointSettings()).modes[c.stage],
			checkpointSettingsRevision: (state.checkpointSettings ?? initialCheckpointSettings()).currentRevision,
			agreedScopeRef: c.scope,
			required: c.required,
			status: "pending",
			emission: null,
			manifest: null,
			annotations: work.concerns.filter((n) => n.stage === c.stage).length,
			reviewedAnnotations: null,
			review: null,
			ready: false,
			approved: null,
			nonbinding: [],
			seams,
			coordinator: a!.id,
			emissions: [],
			policyBinding: binding.revision,
			manifestValue: null,
			decision: null,
		};
		work.requests.push(r);
		if (r.stage === "seams") {
			const roles = structuredClone(state.roleWork ?? { assignments: [] });
			let blocked = false;
			for (const dependent of roles.assignments) {
				if (
					dependent.workflow === c.workflow &&
					!["submitted", "canceled", "canceling"].includes(dependent.status) &&
					blockedBySeams(work, dependent.packet, dependent.delivery)
				) {
					dependent.status = "blocked";
					dependent.blocker = "seams_decision_required";
					blocked = true;
				}
			}
			if (blocked) writes.push({ type: "roles.replace", state: roles, intents: [] });
		}
		result.request = r.id;
	} else {
		if (!r) return refuse("not_found", "No such checkpoint request.");
		if (p.kind === "assignment-agent" && !a?.packet.inputs.includes(r.scope))
			return refuse("forbidden_scope", "Checkpoint Ground lies outside this coordinator's input scope.");
		if (c.type !== "saveCheckpointConcern" && r.status !== "pending")
			return refuse("stale_basis", "Request is resolved; request a successor.", r);
		if (c.type === "stageCheckpoint" && (!validManifest(c.manifest) || c.manifest.stage !== r.stage))
			return refuse(
				"invalid_content",
				"Manifest needs stable nodes, alternatives/evidence/defaults, decomposition comparison and verification strategy.",
			);
		if (
			r.required.candidates &&
			["stageCheckpoint", "requestCheckpointReview", "emitCheckpoint", "approveCheckpoint", "advanceDelegatedCheckpoint"].includes(c.type)
		) {
			const evidence = candidateEvidence(r, state.roleWork?.assignments ?? []);
			const cited =
				c.type === "stageCheckpoint"
					? c.manifest.nodes.flatMap((n) => n.evidence)
					: (r.manifestValue?.nodes.flatMap((n) => n.evidence) ?? []);
			if (!evidence || evidence.some((child) => !validCandidateAnswer(inputs[child.report!]?.text ?? "") || !cited.includes(child.report!)))
				return refuse(
					"missing_candidate_evidence",
					"Complete and cite every required independent candidate answer before synthesis/challenge/advancement.",
					r,
				);
		}
		if (c.type === "cancelCheckpoint") {
			if (c.expectedEmission !== r.emission) return refuse("stale_basis", "Cancellation basis changed.", r);
			r.status = "canceled";
			r.decision = ref;
			result.request = r.id;
		} else if (c.type === "saveCheckpointConcern") {
			if (!r.emissions.includes(c.base)) return refuse("stale_basis", "Save complete concerns against this exact emitted revision.", r);
			const concern: Concern = {
				id: `concern:${facts.sequence}:1`,
				request: r.id,
				stage: r.stage,
				base: c.base,
				revision: `checkpoint-edit:${facts.sequence}`,
				diff: `checkpoint-diff:${facts.sequence}`,
				changeRequest: r.status !== "pending",
				conflict: work.concerns.some((n) => n.base === c.base),
				kind: c.kind ?? "edit",
			};
			work.concerns.push(concern);
			for (const pending of work.requests.filter((q) => q.stage === r!.stage && (q.status === "pending" || q.id === r!.id)))
				pending.annotations++;
			documents.push(
				{ ref: concern.revision, text: c.text, markdown: true },
				{
					ref: concern.diff,
					text: JSON.stringify({
						schema: 1,
						base: c.base,
						edited: concern.revision,
						hunks: [{ id: concern.id, removed: inputs[c.base]!.text, added: c.text }],
						kind: concern.kind,
					}),
				},
			);
			Object.assign(result, {
				concern: concern.id,
				revision: concern.revision,
				diff: concern.diff,
				conflict: String(concern.conflict),
				changeRequest: String(concern.changeRequest),
			});
		} else if (c.type === "reworkCheckpoint") {
			if (!work.concerns.some((n) => n.stage === r!.stage))
				return refuse("concern_required", "Save edited concerns or a separate human reason before rework.", r);
			r.ready = false;
			result.request = r.id;
		} else if (c.type === "stageCheckpoint") {
			if (r.required.experiment)
				return refuse(
					"capability_unavailable",
					"Required protocol experiment capability is unavailable; no synthesis/challenge waiver.",
					r,
				);
			const concerns = work.concerns.filter((n) => n.stage === r!.stage);
			const responses = c.manifest.responses;
			if (
				!unique(responses.map((n) => n.concern)) ||
				responses.length !== concerns.length ||
				concerns.some((n) => !responses.some((v) => v.concern === n.id)) ||
				responses.some((n) => !c.manifest.nodes.some((v) => v.id === n.resulting))
			)
				return refuse("annotation_mapping_required", "Map every saved concern to a disposition, reason and resulting node.", r);
			r.emission = `checkpoint-emission:${facts.sequence}`;
			r.manifest = `checkpoint-manifest:${facts.sequence}`;
			r.emissions.push(r.emission);
			r.manifestValue = c.manifest;
			r.review = null;
			r.ready = false;
			r.reviewedAnnotations = null;
			r.policyBinding = binding.revision;
			r.coordinator = a!.id;
			documents.push({ ref: r.emission, text: c.text, markdown: true }, { ref: r.manifest, text: JSON.stringify(c.manifest) });
			Object.assign(result, { request: r.id, emission: r.emission, manifest: r.manifest });
		} else if (c.type === "requestCheckpointReview") {
			if (!r.emission || !r.manifest) return refuse("review_required", "Stage the exact bytes and manifest first.", r);
			const template = a!.packet.requests.find((p) => p.key === c.key)?.packet;
			if (
				!template ||
				template.role !== "challenger" ||
				template.execution !== "read-only" ||
				template.requests.length ||
				template.investigation
			)
				return refuse("forbidden_scope", "Choose an explicitly configured read-only challenger packet.");
			if (template.family === a!.packet.family && policy.revisions[binding.policy]?.reviewerDiversity !== "human-directed-same-family")
				return refuse(
					"capability_unavailable",
					"Challenger needs an explicitly configured different family or recorded human policy direction.",
				);
			const key = `${r.id}:${r.emission}:${r.annotations}`;
			if (state.roleWork?.assignments.some((a) => a.requestKey === key))
				return refuse("role_already_requested", "Exact review already has a fresh durable assignment.");
			const child: RoleAssignment = {
				id: facts.ids.assignment!,
				workflow: c.workflow,
				slice: a!.slice,
				generation: 1,
				attempt: facts.ids.attempt!,
				executorEpoch: null,
				packet: {
					...template,
					inputs: [
						...new Set([
							...template.inputs,
							r.scope,
							r.emission,
							r.manifest,
							...(r.manifestValue?.nodes.flatMap((n) => n.evidence) ?? []),
							...work.concerns.filter((n) => n.stage === r!.stage).flatMap((n) => [n.revision, n.diff]),
						]),
					],
					policyBinding: binding.revision,
				},
				packetRef: `packet:${facts.sequence}`,
				policyBinding: binding.revision,
				conversation: 0,
				task: 0,
				parent: a!.id,
				requestKey: key,
				delivery: false,
				status: "queued",
				executing: false,
				executionOrdinal: 0,
				blocker: null,
				report: null,
				checkpointReview: { request: r.id, emission: r.emission, manifest: r.manifest, annotations: r.annotations },
			};
			writes.push({
				type: "roles.replace",
				state: { assignments: [...structuredClone(state.roleWork!.assignments), child] },
				intents: [{ kind: "run-role", assignment: child.id }],
			});
			Object.assign(result, { assignment: child.id, attempt: child.attempt });
		} else if (c.type === "emitCheckpoint") {
			const reviewer = state.roleWork?.assignments.find(
				(a) => a.report === c.review && a.packet.role === "challenger" && a.status === "submitted" && a.checkpointReview?.request === r!.id,
			);
			let review: Record<string, unknown>;
			try {
				review = JSON.parse(inputs[c.review]?.text ?? "null");
			} catch {
				return refuse("invalid_content", "Challenger must submit a structured exact-revision report.");
			}
			if (
				!reviewer ||
				!object(review) ||
				review.schema !== 1 ||
				!object(review.checks) ||
				!["alternatives", "interactions", "scale", "usage", "incidentalChoices", "nearbyCopying"].every((k) =>
					nonempty((review.checks as Record<string, unknown>)[k]),
				) ||
				!Array.isArray(review.objections)
			)
				return refuse("review_required", "Required independent challenger checks are missing.", r);
			if (
				[review, reviewer.checkpointReview].some(
					(basis) => !basis || basis.emission !== r!.emission || basis.manifest !== r!.manifest || basis.annotations !== r!.annotations,
				) ||
				reviewer.policyBinding !== binding.revision
			)
				return refuse("stale_basis", "Challenge must judge the exact current emission, manifest and annotations.", r);
			const coordinator = state.roleWork?.assignments.find((a) => a.id === r!.coordinator);
			if (
				!coordinator ||
				(reviewer.packet.family === coordinator.packet.family &&
					policy.revisions[binding.policy]?.reviewerDiversity !== "human-directed-same-family")
			)
				return refuse("capability_unavailable", "Replacement challenge cannot waive configured reviewer diversity.");
			const objections = review.objections;
			if (
				!objections.every(
					(o) => object(o) && nonempty(o.id) && nonempty(o.reason) && r!.manifestValue?.nodes.some((n) => n.id === o.node),
				) ||
				!unique(objections.map((o) => o.id)) ||
				!unique(c.contested.map((o) => o.objection)) ||
				c.contested.length !== objections.length ||
				objections.some((o) => !c.contested.some((v) => v.objection === o.id)) ||
				c.contested.some(
					(o) =>
						!["acted-on", "considered", "dismissed"].includes(o.disposition) ||
						!nonempty(o.reason) ||
						!r!.manifestValue?.nodes.some((n) => n.id === o.resulting),
				)
			)
				return refuse("annotation_mapping_required", "Contested list must answer every stable objection with reason and resulting node.");
			r.review = c.review;
			r.ready = true;
			r.reviewedAnnotations = r.annotations;
			Object.assign(result, { request: r.id, emission: r.emission, manifest: r.manifest });
		} else if (c.type === "approveCheckpoint" || c.type === "advanceDelegatedCheckpoint") {
			const delegated = c.type === "advanceDelegatedCheckpoint";
			if (delegated && r.mode !== "delegated") return refuse("forbidden_scope", "This request captured human routing.", r);
			if (
				c.emission !== r.emission ||
				c.manifest !== r.manifest ||
				c.annotations !== r.annotations ||
				c.policyBinding !== r.policyBinding ||
				binding.revision !== r.policyBinding
			)
				return refuse("stale_basis", "Approval basis changed; read current concerns and exact emission.", r);
			if (!r.ready || !r.review) return refuse("review_required", "Only exact independently reviewed emissions can be approved.", r);
			if (
				r.stage === "modules" &&
				(work.requests.some((q) => q.stage === "seams" && q.status === "pending") ||
					work.requests.findLast((q) => q.stage === "seams" && q.status === "approved")?.approved !== r.seams)
			)
				return refuse("seams_required", "Revised seams block dependent Modules, not historical acceptance.", r);
			const notes = work.concerns.filter((n) => n.stage === r!.stage).map((n) => n.id);
			const needsNotes = r.reviewedAnnotations !== r.annotations;
			if (delegated && (needsNotes || c.nonbinding.length))
				return refuse(
					"annotation_mapping_required",
					"Delegation cannot declare human concerns nonbinding; rework and review every concern.",
					r,
				);
			if (
				!unique(c.nonbinding) ||
				(needsNotes
					? c.nonbinding.length !== notes.length || notes.some((n) => !c.nonbinding.includes(n))
					: c.nonbinding.some((n) => !notes.includes(n)))
			)
				return refuse(
					"annotation_mapping_required",
					"Approve original with every saved note explicitly nonbinding, or rework and review a complete annotation map.",
					r,
				);
			if (
				!r.manifestValue ||
				Object.keys(c.decisions).length !== r.manifestValue.nodes.length ||
				r.manifestValue.nodes.some((n) => !n.alternatives.includes(c.decisions[n.id] ?? ""))
			)
				return refuse("invalid_content", "Explicit decisions must select a listed alternative for every node.");
			if (delegated) {
				let review: unknown;
				try {
					review = JSON.parse(inputs[r.review]?.text ?? "null")?.delegation;
				} catch {
					review = null;
				}
				if (
					!object(review) ||
					review.agreedScopeRef !== r.scope ||
					!nonempty(review.reason) ||
					!texts(review.unresolvedProduct) ||
					!texts(review.scopeChanges) ||
					!texts(review.humanDecisions) ||
					review.unresolvedProduct.length !== 0 ||
					review.scopeChanges.length !== 0 ||
					review.humanDecisions.some((ref) => !inputs[ref]?.human) ||
					r.manifestValue.nodes.some(
						(n) =>
							n.classification === "product" &&
							(!n.humanDecision || !inputs[n.humanDecision]?.human || !(review.humanDecisions as string[]).includes(n.humanDecision)),
					)
				)
					return refuse(
						"human_decision_required",
						"Exact challenger must expose classification/scope and resolve product choices against retained human decisions; ask the human or re-emit and re-review.",
						r,
					);
			}
			r.status = "approved";
			r.approved = r.emission;
			r.nonbinding = c.nonbinding;
			r.decision = ref;
			Object.assign(result, { decision: ref, emission: r.approved, request: r.id });
		}
	}
	documents.push({
		ref,
		text: JSON.stringify({
			schema: 1,
			command: c,
			result,
			request: r?.id,
			mode: r?.mode ?? "human",
			actor: p,
			checkpointSettingsRevision: r?.checkpointSettingsRevision ?? "settings:initial",
			agreedScopeRef: r?.agreedScopeRef ?? r?.scope,
			review: r?.review,
			humanDecisions: r?.manifestValue?.nodes.flatMap((n) => (n.humanDecision ? [n.humanDecision] : [])),
		}),
	});
	writes.push(
		{ type: "checkpoints.replace", state: work, documents },
		{ type: "fact.record", fact: facts.ids.fact, command: c.type, refs: { workflow: c.workflow, checkpoint: r!.id, record: ref } },
	);
	return { outcome: "accepted", result, writes, facts: [facts.ids.fact] };
}
