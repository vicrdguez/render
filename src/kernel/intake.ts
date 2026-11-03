// Bounded Contract intake. Ledger supplies exact scoped bytes; this module performs no I/O.
import { catalogDefinition } from "./catalog.ts";
import type { CheckpointInput } from "./checkpoints.ts";
import type { Decision, DomainWrite, KernelState, VerifiedFacts } from "./kernel.ts";
import { bindingFor, initialPolicy } from "./policy.ts";
import { type RoleAssignment, type RolePacket, sameAgent } from "./roles.ts";

export const INTAKE_COMMANDS = [
	"stageIntake",
	"requestIntakeReview",
	"saveIntakeConcern",
	"acceptIntake",
	"amendContract",
	"supersedeContract",
	"amendDependencies",
];
export type Dependency = { slice: string; requires: string; kind: "integration" | "record" };
export type IntakeManifest = {
	schema: 1;
	shape: "design" | "bug" | "performance" | "change";
	ground: string;
	sources: string[];
	decisions: string[];
	catalog: string;
	breakdown: string | null;
	slices: {
		id: string;
		title: string;
		record: boolean;
		delegated: string[];
		forbidden: string[];
		obligations: {
			id: string;
			kind: "behavior" | "architecture" | "manual";
			text: string;
			sources: { ref: string; node: string | null }[];
		}[];
	}[];
	checks: {
		id: string;
		row: string;
		kind: "executed" | "journey" | "generated" | "human" | "inspection";
		rank: string | null;
		new: boolean;
		run: string;
		expectations: string;
	}[];
	mapping: { slice: string; obligation: string; checks: string[] }[];
	dependencies: Dependency[];
	responses: { concern: string; disposition: "acted-on" | "considered" | "dismissed"; reason: string; resulting: string }[];
	unresolved: { kind: "technical" | "product"; question: string }[];
};
export type IntakeDraft = {
	id: string;
	manifestRef: string;
	manifest: IntakeManifest;
	annotations: number;
	policyBinding: string;
	coordinator: string;
	acceptance: string | null;
};
export type IntakeReview = { intake: string; manifest: string; annotations: number };
export type AcceptedSlice = {
	id: string;
	contract: string;
	intake: string;
	acceptance: string;
	everAssigned: boolean;
	status: "accepted" | "superseded";
	record: boolean;
	predecessors: string[];
};
export type Intakes = {
	revision: string | null;
	drafts: IntakeDraft[];
	concerns: { id: string; intake: string; revision: string; changeRequest: boolean }[];
	slices: AcceptedSlice[];
	dependencies: Dependency[];
};
export const emptyIntakes = (): Intakes => ({ revision: null, drafts: [], concerns: [], slices: [], dependencies: [] });
type AcceptanceBasis = { intake: string; review: string; annotations: number; policyBinding: string; decisions: string[] };
export type IntakeCommand = { workflow: string } & (
	| { type: "stageIntake"; expected: string | null; text: string; manifest: IntakeManifest }
	| { type: "requestIntakeReview"; intake: string; key: string }
	| { type: "saveIntakeConcern"; intake: string; text: string }
	| ({ type: "acceptIntake" } & AcceptanceBasis)
	| ({ type: "amendContract"; slice: string; expected: string } & AcceptanceBasis)
	| ({
			type: "supersedeContract";
			slice: string;
			expected: string;
			dispositions: { slice: string; replacement: string }[];
	  } & AcceptanceBasis)
	| { type: "amendDependencies"; expected: string; dependencies: Dependency[]; reason: string }
);
export type IntakeWrite = { type: "intakes.replace"; state: Intakes; documents: { ref: string; text: string; markdown?: boolean }[] };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const unique = (v: string[]) => new Set(v).size === v.length;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
function parse(value: string | undefined): unknown {
	try {
		return JSON.parse(value ?? "null");
	} catch {
		return null;
	}
}
export function validDependencies(v: unknown): v is Dependency[] {
	return (
		Array.isArray(v) &&
		v.every((e) => object(e) && id(e.slice) && id(e.requires) && ["integration", "record"].includes(String(e.kind))) &&
		unique(v.map((e) => `${e.slice}/${e.requires}`))
	);
}
export function validIntakeShape(v: unknown): v is IntakeManifest {
	if (
		!object(v) ||
		v.schema !== 1 ||
		!["design", "bug", "performance", "change"].includes(String(v.shape)) ||
		!text(v.ground) ||
		!text(v.catalog) ||
		!texts(v.sources) ||
		!unique(v.sources) ||
		!texts(v.decisions) ||
		!unique(v.decisions) ||
		!(v.breakdown === null || text(v.breakdown)) ||
		!Array.isArray(v.slices) ||
		!v.slices.length ||
		!Array.isArray(v.checks) ||
		!Array.isArray(v.mapping) ||
		!validDependencies(v.dependencies) ||
		!Array.isArray(v.responses) ||
		!Array.isArray(v.unresolved)
	)
		return false;
	if (
		!v.slices.every(
			(s) =>
				object(s) &&
				id(s.id) &&
				text(s.title) &&
				typeof s.record === "boolean" &&
				texts(s.delegated) &&
				texts(s.forbidden) &&
				Array.isArray(s.obligations) &&
				s.obligations.length &&
				s.obligations.every(
					(o) =>
						object(o) &&
						id(o.id) &&
						["behavior", "architecture", "manual"].includes(String(o.kind)) &&
						text(o.text) &&
						Array.isArray(o.sources) &&
						o.sources.every((r) => object(r) && text(r.ref) && (r.node === null || id(r.node))),
				) &&
				unique(s.obligations.map((o) => o.id)),
		)
	)
		return false;
	return (
		unique(v.slices.map((s) => s.id)) &&
		v.checks.every(
			(c) =>
				object(c) &&
				id(c.id) &&
				text(c.row) &&
				["executed", "journey", "generated", "human", "inspection"].includes(String(c.kind)) &&
				(c.rank === null || text(c.rank)) &&
				typeof c.new === "boolean" &&
				text(c.run) &&
				text(c.expectations),
		) &&
		unique(v.checks.map((c) => c.id)) &&
		unique(v.checks.map((c) => c.row)) &&
		v.mapping.every((m) => object(m) && id(m.slice) && id(m.obligation) && texts(m.checks) && m.checks.length && unique(m.checks)) &&
		unique(v.mapping.map((m) => `${m.slice}/${m.obligation}`)) &&
		v.responses.every(
			(r) =>
				object(r) &&
				text(r.concern) &&
				["acted-on", "considered", "dismissed"].includes(String(r.disposition)) &&
				text(r.reason) &&
				text(r.resulting),
		) &&
		unique(v.responses.map((r) => r.concern)) &&
		v.unresolved.every((r) => object(r) && ["technical", "product"].includes(String(r.kind)) && text(r.question))
	);
}
function manifestRefs(m: IntakeManifest): string[] {
	return [
		m.ground,
		m.catalog,
		...m.sources,
		...m.decisions,
		...m.slices.flatMap((s) => s.obligations.flatMap((o) => o.sources.map((r) => r.ref))),
	];
}
export function intakeRefs(work: Intakes, c: IntakeCommand): string[] {
	const d = "intake" in c ? work.drafts.find((d) => d.id === c.intake) : undefined;
	const refs =
		c.type === "stageIntake" && validIntakeShape(c.manifest)
			? manifestRefs(c.manifest)
			: d
				? [d.id, d.manifestRef, ...manifestRefs(d.manifest)]
				: [];
	if ("review" in c) refs.push(c.review);
	if (c.type === "amendDependencies") {
		if (work.revision) refs.push(work.revision);
		refs.push(...work.slices.filter((s) => s.status === "accepted").flatMap((s) => [s.contract, s.acceptance]));
	}
	refs.push(...work.concerns.map((n) => n.revision));
	if ("slice" in c) {
		const s = work.slices.find((s) => s.id === c.slice);
		if (s) refs.push(s.contract, s.acceptance);
	}
	return [...new Set(refs)];
}
function graphValid(slices: readonly { id: string; record: boolean; status?: string }[], dependencies: Dependency[]): boolean {
	if (!validDependencies(dependencies)) return false;
	if (
		dependencies.some(
			(e) =>
				e.slice === e.requires ||
				!slices.some((s) => s.id === e.slice && s.status !== "superseded") ||
				!slices.some((s) => s.id === e.requires && s.status !== "superseded" && (e.kind !== "record" || s.record)),
		)
	)
		return false;
	const visiting = new Set<string>(),
		done = new Set<string>();
	function visit(id: string): boolean {
		if (visiting.has(id)) return false;
		if (done.has(id)) return true;
		visiting.add(id);
		if (dependencies.filter((e) => e.slice === id).some((e) => !visit(e.requires))) return false;
		visiting.delete(id);
		done.add(id);
		return true;
	}
	return slices.every((s) => visit(s.id));
}
function currentDecisions(state: KernelState, m: IntakeManifest): boolean {
	return m.decisions.every((ref) => {
		const r = state.checkpoints?.requests.find((r) => r.decision === ref && r.status === "approved");
		return (
			r &&
			!state.checkpoints!.requests.some((q) => q.stage === r.stage && q.status === "pending") &&
			state.checkpoints!.requests.findLast((q) => q.stage === r.stage && q.status === "approved")?.id === r.id &&
			(r.stage !== "modules" ||
				(r.seams === state.checkpoints!.requests.findLast((q) => q.stage === "seams" && q.status === "approved")?.approved &&
					!state.checkpoints!.requests.some((q) => q.stage === "seams" && q.status === "pending")))
		);
	});
}
function lint(state: KernelState, m: IntakeManifest, inputs: Record<string, CheckpointInput>): string | undefined {
	const ground = inputs[m.ground],
		g = parse(ground?.text);
	if (
		!ground?.human ||
		ground.document !== "ground" ||
		!object(g) ||
		!object(g.shape) ||
		g.shape.value !== m.shape ||
		!["human", "classifier"].includes(String(g.shape.origin)) ||
		(g.shape.origin === "classifier" && g.shape.confirmed !== true)
	)
		return "Use exact human Ground with a confirmed matching task shape.";
	if ((m.shape === "change" || m.shape === "design") && !m.breakdown) return "Change/design retains a bounded breakdown.";
	if (["bug", "performance"].includes(m.shape) && m.slices.length !== 1) return "Compact bug/performance intake has one bounded Slice.";
	if (!currentDecisions(state, m)) return "Required decisions must be current approved checkpoint records.";
	if (
		m.shape === "design" &&
		!["seams", "modules"].every((stage) =>
			state.checkpoints?.requests.some((r) => r.stage === stage && r.status === "approved" && m.decisions.includes(r.decision ?? "")),
		)
	)
		return "Design requires approved Seams and Modules, not invented decision refs.";
	const approvedSources = object(g) && texts(g.approvedSources) ? g.approvedSources : [];
	if (m.shape !== "design" && (!m.sources.length || m.sources.some((ref) => !approvedSources.includes(ref))))
		return "Shortened intake requires applicable existing-seam sources explicitly approved in human Ground.";
	if (manifestRefs(m).some((ref) => !inputs[ref])) return "Every required source must resolve to exact retained bytes.";
	let catalog: ReturnType<typeof catalogDefinition>;
	try {
		catalog = catalogDefinition(inputs[m.catalog]!.text);
	} catch {
		return "Select an intact valid project catalog and rank ladder.";
	}
	for (const check of m.checks) {
		if (check.kind === "human" || check.kind === "generated") {
			if (check.rank !== null) return "Human/generated rows cannot claim proof ranks.";
		} else if (!catalog.ranks.includes(check.rank ?? "")) return "Unknown project rank.";
		if (!check.new && check.kind !== "inspection") {
			const row = catalog.rows.find((r) => r.name === check.row);
			if (
				!row ||
				row.kind !== check.kind ||
				row.rank !== check.rank ||
				row.run.replace(/^`([^`]+)`(?:\s.*)?$/, "$1") !== check.run ||
				row.expectations !== check.expectations
			)
				return "Existing evidence must match its exact selected catalog row.";
		} else if (check.new && catalog.rows.some((r) => r.name === check.row))
			return "A new check must name a new deliverable, not relabel existing evidence.";
	}
	const minimum = (state.policy ?? initialPolicy()).revisions[bindingFor(state.policy ?? initialPolicy(), state.workflow!.id).policy]!
		.minimumEvidenceRank;
	const min = minimum === null ? catalog.ranks.length - 1 : catalog.ranks.indexOf(minimum);
	if (min < 0) return "Configured minimum rank is absent from this project ladder.";
	for (const s of m.slices)
		for (const o of s.obligations) {
			const mapping = m.mapping.find((x) => x.slice === s.id && x.obligation === o.id);
			if (!mapping || mapping.checks.some((ref) => !m.checks.some((c) => c.id === ref)))
				return "Every obligation needs valid many-to-many evidence mapping.";
			if (
				o.kind === "behavior" &&
				mapping.checks.some((ref) => {
					const c = m.checks.find((c) => c.id === ref)!;
					return !["executed", "journey"].includes(c.kind) || catalog.ranks.indexOf(c.rank ?? "") > min;
				})
			)
				return "Behavior requires executable/journey rows at the required project rank, not generated/human evidence.";
			if (
				o.kind === "architecture" &&
				(!o.sources.length ||
					o.sources.some((source) => {
						if (source.node === null)
							return m.shape === "design" || !m.sources.includes(source.ref) || !approvedSources.includes(source.ref);
						return !state.checkpoints?.requests.some(
							(r) =>
								m.decisions.includes(r.decision ?? "") &&
								r.status === "approved" &&
								r.approved === source.ref &&
								r.manifestValue?.nodes.some((n) => n.id === source.node),
						);
					}))
			)
				return "Architecture must cite actual approved nodes or approved existing-seam sources.";
		}
	if (m.mapping.some((x) => !m.slices.some((s) => s.id === x.slice && s.obligations.some((o) => o.id === x.obligation))))
		return "Mapping cites an unknown obligation.";
	const slices = [...(state.intakes?.slices ?? []).filter((s) => !m.slices.some((n) => n.id === s.id)), ...m.slices];
	if (!graphValid(slices, m.dependencies) || m.dependencies.some((e) => !m.slices.some((s) => s.id === e.slice)))
		return "Dependencies must name eligible Slices, required Record and an acyclic graph.";
	return undefined;
}
function refused(code: string, reason: string): Decision {
	return { outcome: "refused", code, reason } as Decision;
}
function claimed(state: KernelState, slice: string): boolean {
	return !!state.roleWork?.assignments.some(
		(a) =>
			a.workflow === state.workflow?.id &&
			a.slice === slice &&
			a.delivery &&
			(a.executing || !["submitted", "canceled"].includes(a.status)),
	);
}
export function intakeAssignmentGap(state: KernelState, slice: string, packet: RolePacket): Decision | undefined {
	const s = state.intakes?.slices.find((s) => s.id === slice);
	if (!s) return state.intakes?.slices.length ? refused("not_found", "Delivery must name an accepted Slice in this workflow.") : undefined;
	if (s.status !== "accepted") return refused("contract_superseded", "Superseded work is not completed or assignable.");
	if (!packet.inputs.includes(s.contract)) return refused("stale_basis", "Assignment must bind the current immutable Contract revision.");
	const dependency = state.intakes!.dependencies.find((e) => e.slice === slice);
	// No qualifying integration producer exists in this staged host. Never infer one from files, reports or a pass.
	if (dependency)
		return refused(
			"dependency_blocked",
			`Required ${dependency.kind} of ${dependency.requires} has no recorded qualifying integration; delivery capability is unavailable.`,
		);
	return undefined;
}
export function consumeIntake(state: KernelState, slice: string, assignment: string, sequence: number): IntakeWrite | undefined {
	if (!state.intakes?.slices.some((s) => s.id === slice)) return;
	const work = structuredClone(state.intakes),
		s = work.slices.find((s) => s.id === slice)!;
	s.everAssigned = true;
	work.revision = `intake-record:${sequence}`;
	return {
		type: "intakes.replace",
		state: work,
		documents: [
			{
				ref: work.revision,
				text: JSON.stringify({ schema: 1, event: "consumed", slice, contract: s.contract, assignment, everAssigned: true }),
			},
		],
	};
}
export function changeIntake(state: KernelState, c: IntakeCommand, facts: VerifiedFacts): Decision {
	if (!state.workflow || state.workflow.id !== c.workflow) return refused("not_found", "Intake needs an existing workflow.");
	const p = facts.principal;
	if (p.kind === "human" && p.route === "device" && p.workflows !== "all" && !p.workflows.includes(c.workflow))
		return refused("forbidden_scope", "Workflow outside device scope.");
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
		return refused("stale_assignment", "Only the current scoped executing coordinator can stage/review intake.");
	const work = structuredClone(state.intakes ?? emptyIntakes());
	const policy = state.policy ?? initialPolicy(),
		binding = bindingFor(policy, c.workflow);
	const inputs = facts.checkpointInputs ?? {};
	const documents: IntakeWrite["documents"] = [],
		writes: DomainWrite[] = [];
	const result: Record<string, string | number | null> = {};
	const record = `intake-record:${facts.sequence}`;
	const d = "intake" in c ? work.drafts.find((d) => d.id === c.intake) : undefined;
	if (p.kind === "assignment-agent" && d && !a!.packet.inputs.includes(d.manifest.ground))
		return refused("forbidden_scope", "Ground outside coordinator inputs.");
	if (c.type === "stageIntake") {
		if (c.expected !== (work.drafts.at(-1)?.id ?? null))
			return refused("stale_basis", "Read the latest draft before staging its successor.");
		if (!validIntakeShape(c.manifest) || !text(c.text))
			return refused("invalid_content", "Intake needs bounded Slices, obligations, choices, coverage and provenance.");
		if (!a!.packet.inputs.includes(c.manifest.ground)) return refused("forbidden_scope", "Ground outside coordinator inputs.");
		const gap = lint(state, c.manifest, inputs);
		if (gap) return refused("invalid_content", gap);
		if (!mappedConcerns(work, c.manifest))
			return refused("annotation_mapping_required", "Map every saved concern to a reason and resulting obligation.");
		const id = `intake:${facts.sequence}`,
			manifestRef = `intake-manifest:${facts.sequence}`;
		work.drafts.push({
			id,
			manifestRef,
			manifest: structuredClone(c.manifest),
			annotations: work.concerns.length,
			policyBinding: binding.revision,
			coordinator: a!.id,
			acceptance: null,
		});
		documents.push({ ref: id, text: c.text, markdown: true }, { ref: manifestRef, text: JSON.stringify(c.manifest) });
		Object.assign(result, { intake: id, manifest: manifestRef });
	} else if (c.type === "amendDependencies") {
		if (c.expected !== work.revision) return refused("stale_basis", "Dependency basis changed.");
		if (!text(c.reason) || !graphValid(work.slices, c.dependencies))
			return refused("invalid_content", "Human dependency amendments require a reason and an acyclic eligible graph.");
		const affected = new Set(
			[...work.dependencies, ...c.dependencies]
				.filter(
					(e) =>
						!work.dependencies.some((old) => JSON.stringify(old) === JSON.stringify(e)) ||
						!c.dependencies.some((next) => JSON.stringify(next) === JSON.stringify(e)),
				)
				.map((e) => e.slice),
		);
		if ([...affected].some((id) => claimed(state, id))) return refused("ownership_conflict", "Cannot alter dependencies of claimed work.");
		work.dependencies = structuredClone(c.dependencies);
	} else {
		if (!d) return refused("not_found", "No such immutable intake.");
		if (c.type === "saveIntakeConcern") {
			const concern = {
				id: `intake-concern:${facts.sequence}`,
				intake: d.id,
				revision: `intake-edit:${facts.sequence}`,
				changeRequest: d.acceptance !== null,
			};
			work.concerns.push(concern);
			for (const draft of work.drafts.filter((d) => !d.acceptance)) draft.annotations = work.concerns.length;
			documents.push({ ref: concern.revision, text: c.text, markdown: true });
			Object.assign(result, { concern: concern.id, revision: concern.revision, changeRequest: String(concern.changeRequest) });
		} else if (c.type === "requestIntakeReview") {
			if (d.acceptance || work.drafts.at(-1)?.id !== d.id) return refused("stale_basis", "Review the latest unaccepted intake.");
			const template = a!.packet.requests.find((r) => r.key === c.key)?.packet;
			if (
				!template ||
				template.role !== "challenger" ||
				template.execution !== "read-only" ||
				template.requests.length ||
				template.investigation
			)
				return refused("forbidden_scope", "Choose an explicit read-only independent fidelity challenger.");
			if (template.family === a!.packet.family && policy.revisions[binding.policy]?.reviewerDiversity !== "human-directed-same-family")
				return refused("capability_unavailable", "Fidelity requires configured independent family or explicit human policy direction.");
			if (d.policyBinding !== binding.revision) return refused("stale_basis", "Restage intake on current policy before review.");
			const key = `${d.id}:${d.annotations}`;
			if (state.roleWork?.assignments.some((a) => a.requestKey === key))
				return refused("role_already_requested", "This exact review already has durable work; continue or replace it.");
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
						...new Set([...template.inputs, d.id, d.manifestRef, ...manifestRefs(d.manifest), ...work.concerns.map((n) => n.revision)]),
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
				intakeReview: { intake: d.id, manifest: d.manifestRef, annotations: d.annotations },
			};
			writes.push({
				type: "roles.replace",
				state: { assignments: [...structuredClone(state.roleWork!.assignments), child] },
				intents: [{ kind: "run-role", assignment: child.id }],
			});
			Object.assign(result, { assignment: child.id, attempt: child.attempt });
		} else {
			if (
				d.acceptance ||
				work.drafts.at(-1)?.id !== d.id ||
				c.annotations !== d.annotations ||
				c.policyBinding !== d.policyBinding ||
				binding.revision !== d.policyBinding ||
				JSON.stringify(c.decisions) !== JSON.stringify(d.manifest.decisions) ||
				!currentDecisions(state, d.manifest)
			)
				return refused(
					"stale_basis",
					"Acceptance requires the displayed latest immutable intake, current decisions, annotations and policy.",
				);
			const target = "slice" in c ? work.slices.find((s) => s.id === c.slice) : undefined;
			if (c.type !== "acceptIntake" && (!target || target.status !== "accepted" || target.contract !== c.expected))
				return refused("stale_basis", "Name the current accepted Contract revision.");
			if (c.type === "amendContract" && target!.everAssigned)
				return refused("contract_frozen", "Ever-assigned obligations are permanently frozen, including after release; supersede instead.");
			const reviewer = state.roleWork?.assignments.find(
				(a) => a.report === c.review && a.status === "submitted" && a.packet.role === "challenger" && a.intakeReview?.intake === d.id,
			);
			const review = parse(inputs[c.review]?.text);
			if (
				!reviewer ||
				!object(review) ||
				review.schema !== 1 ||
				!object(review.checks) ||
				!["omitted", "weakened", "strengthened", "contradictory", "invented"].every((k) =>
					text((review.checks as Record<string, unknown>)[k]),
				) ||
				!Array.isArray(review.findings)
			)
				return refused("review_required", "Require a fresh independent fidelity report, not self-certification.");
			if (
				[review, reviewer.intakeReview].some(
					(b) => !b || b.intake !== d.id || b.manifest !== d.manifestRef || b.annotations !== d.annotations,
				) ||
				reviewer.policyBinding !== binding.revision
			)
				return refused("stale_basis", "Fidelity must cover exact intake and saved annotations.");
			const coordinator = state.roleWork?.assignments.find((a) => a.id === d.coordinator);
			if (
				!coordinator ||
				(reviewer.packet.family === coordinator.packet.family &&
					policy.revisions[binding.policy]?.reviewerDiversity !== "human-directed-same-family")
			)
				return refused("capability_unavailable", "Replacement fidelity must retain independent configured review.");
			if (review.findings.length)
				return refused(
					"fidelity_required",
					"Resolve fidelity findings; transcription repairs restage, technical/product decisions require their decision path.",
				);
			if (d.manifest.unresolved.length)
				return refused("decision_required", "Unresolved technical/product choices require human direction or revised approved decisions.");
			if (!mappedConcerns(work, d.manifest))
				return refused("annotation_mapping_required", "Every saved concern requires a reviewed disposition before acceptance.");
			const gap = lint(state, d.manifest, inputs);
			if (gap) return refused("invalid_content", gap);
			if (c.type === "amendContract" && (d.manifest.slices.length !== 1 || d.manifest.slices[0]!.id !== c.slice))
				return refused("invalid_content", "Amendment replaces exactly the named unconsumed Slice.");
			if (c.type !== "amendContract" && d.manifest.slices.some((s) => work.slices.some((old) => old.id === s.id)))
				return refused("invalid_content", "New/replacement Slices need unused identities; history is not overwritten.");
			if (
				c.type !== "amendContract" &&
				d.manifest.slices.some((s) => state.roleWork?.assignments.some((a) => a.workflow === c.workflow && a.slice === s.id))
			)
				return refused(
					"contract_frozen",
					"A previously assigned identity cannot receive a retroactive initial Contract; choose a new Slice identity.",
				);
			if (c.type === "supersedeContract") {
				if (claimed(state, c.slice)) return refused("ownership_conflict", "Fence and release work before supersession.");
				const dependents = work.dependencies.filter((e) => e.requires === c.slice);
				if (
					!unique(c.dispositions.map((d) => d.slice)) ||
					c.dispositions.length !== dependents.length ||
					dependents.some(
						(e) =>
							!c.dispositions.some(
								(d) =>
									d.slice === e.slice &&
									d.replacement !== c.slice &&
									(work.slices.some((s) => s.id === d.replacement && s.status === "accepted") || dManifestHas(d.replacement)),
							),
					)
				)
					return refused(
						"dependent_disposition_required",
						"Explicitly redirect every dependent to an eligible replacement; no silent abandonment.",
					);
				if (dependents.some((e) => claimed(state, e.slice))) return refused("ownership_conflict", "Cannot redirect a claimed dependent.");
				for (const e of dependents) e.requires = c.dispositions.find((d) => d.slice === e.slice)!.replacement;
				target!.status = "superseded";
				work.dependencies = work.dependencies.filter((e) => e.slice !== c.slice);
			}
			function dManifestHas(id: string) {
				return d!.manifest.slices.some((s) => s.id === id);
			}
			const replaced = new Set(d.manifest.slices.map((s) => s.id));
			work.dependencies = [...work.dependencies.filter((e) => !replaced.has(e.slice)), ...structuredClone(d.manifest.dependencies)];
			for (const [index, slice] of d.manifest.slices.entries()) {
				const contract = `contract:${facts.sequence}:${index}`;
				const prior = work.slices.find((s) => s.id === slice.id);
				const accepted: AcceptedSlice = {
					id: slice.id,
					contract,
					intake: d.id,
					acceptance: record,
					everAssigned: false,
					status: "accepted",
					record: slice.record,
					predecessors: prior ? [prior.contract] : target ? [target.contract] : [],
				};
				if (prior) work.slices[work.slices.indexOf(prior)] = accepted;
				else work.slices.push(accepted);
				documents.push({
					ref: contract,
					text: JSON.stringify({
						schema: 1,
						...accepted,
						text: inputs[d.id]!.text,
						obligations: slice,
						manifest: d.manifestRef,
						review: c.review,
						decisions: c.decisions,
						annotations: c.annotations,
					}),
				});
			}
			if (!graphValid(work.slices, work.dependencies))
				return refused("invalid_content", "Replacement/dependency dispositions introduce an invalid or cyclic graph.");
			d.acceptance = record;
			result.acceptance = record;
		}
	}
	work.revision = record;
	documents.push({ ref: record, text: JSON.stringify({ schema: 1, command: c, result }) });
	writes.push(
		{ type: "intakes.replace", state: work, documents },
		{
			type: "fact.record",
			fact: facts.ids.fact,
			command: c.type,
			refs: { workflow: c.workflow, record, ...Object.fromEntries(documents.map((d, i) => [`document${i}`, d.ref])) },
		},
	);
	return { outcome: "accepted", result, writes, facts: [facts.ids.fact] };
}
function mappedConcerns(work: Intakes, m: IntakeManifest): boolean {
	return (
		m.responses.length === work.concerns.length &&
		work.concerns.every((n) => m.responses.some((r) => r.concern === n.id)) &&
		m.responses.every((r) => m.slices.some((s) => s.obligations.some((o) => `${s.id}/${o.id}` === r.resulting)))
	);
}
