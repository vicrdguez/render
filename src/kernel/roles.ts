// Pure role ownership and execution legality, reached only through Kernel.change.

import type { Decision, DomainWrite, KernelState, Principal, VerifiedFacts } from "./kernel.ts";
import { bindingFor, initialPolicy } from "./policy.ts";

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
export type RoleAssignment = {
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
};
export type RoleWorkState = { assignments: RoleAssignment[] };
export type RoleIntent = { kind: "run-role" | "notify-role"; assignment: string };
export type RoleCommand =
	| { type: "assignTask"; workflow: string; slice: string; delivery: boolean; packet: RolePacket }
	| { type: "replaceTask"; workflow: string; assignment: string; generation: number; attempt: string; packet: RolePacket }
	| { type: "recordRuntimeHistory"; workflow: string; assignment: string; generation: number; attempt: string; key: string }
	| { type: "requestRole"; workflow: string; key: string }
	| { type: "submitRoleResult"; workflow: string; text: string }
	| { type: "requestOwnStop"; workflow: string }
	| { type: "recordRecoveryState"; workflow: string; assignment: string; generation: number; attempt: string; text: string }
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
	"assignTask",
	"replaceTask",
	"recordRuntimeHistory",
	"requestRole",
	"submitRoleResult",
	"requestOwnStop",
	"cancelWork",
	"fenceAttempt",
	"stageTask",
	"recordBlocker",
	"recordQuiescence",
	"recordRecoveryState",
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
	return [...new Set([...p.inputs, p.principles, p.instructions, p.policy, p.profile])];
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
	function create(packet: RolePacket, slice: string, delivery: boolean, parent: string | null, key: string | null) {
		const id = facts.ids.assignment;
		const attempt = facts.ids.attempt;
		if (!id || !attempt) throw new Error("Ledger omitted role identities");
		const created: RoleAssignment = {
			id,
			workflow: c.workflow,
			slice,
			generation: 1,
			attempt,
			executorEpoch: null,
			packet: { ...packet, policyBinding: bindingFor(state.policy ?? initialPolicy(), c.workflow).revision },
			policyBinding: bindingFor(state.policy ?? initialPolicy(), c.workflow).revision,
			predecessor: c.type === "replaceTask" ? c.assignment : null,
			packetRef: `packet:${facts.sequence}`,
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
	}
	if (c.type === "assignTask") {
		if (!c.packet || !c.slice || typeof c.delivery !== "boolean")
			return refusal("invalid_content", "Assignment requires an explicit packet, Slice and ownership mode.");
		if (hasOwner(work, c.packet, c.slice, c.delivery))
			return refusal("ownership_conflict", "Slice already has a delivery owner or workspace writer.");
		create(c.packet, c.slice, c.delivery, null, null);
	} else if (c.type === "replaceTask") {
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
	} else if (c.type === "requestRole") {
		if (!a) return refusal("stale_assignment", "No current assignment.");
		const request = a.packet.requests.find((r) => r.key === c.key);
		if (!request || !mayRequest(a.packet.role, request.packet.role))
			return refusal("forbidden_scope", "Request is not a predefined role within this packet.");
		const policy = state.policy ?? initialPolicy();
		if (
			request.packet.family === a.packet.family &&
			policy.revisions[bindingFor(policy, a.workflow).policy]?.reviewerDiversity !== "human-directed-same-family"
		)
			return refusal("capability_unavailable", "Same-family independent work needs recorded human policy direction; no family fallback.");
		if (work.assignments.some((child) => child.parent === a.id && child.requestKey === c.key))
			return refusal("role_already_requested", "This bounded role request already has durable work.");
		create(request.packet, a.slice, false, a.id, c.key);
	} else if (c.type === "recordRecoveryState") {
		if (!a || a.workflow !== c.workflow || (c.generation >= a.generation && c.attempt === a.attempt))
			return refusal("invalid_content", "Only evidence from a fenced prior identity is quarantined.");
		result = { assignment: a.id, quarantined: facts.ids.revision ?? null };
	} else if (c.type === "submitRoleResult") {
		if (!a) return refusal("stale_assignment", "No current assignment.");
		if (!c.text || Buffer.byteLength(c.text) > 1024 * 1024)
			return refusal("invalid_content", "Report must contain at most 1 MiB of complete UTF-8 text.");
		a.status = "submitted";
		a.report = facts.ids.revision ?? null;
		result = { assignment: a.id, report: a.report };
		if (a.parent) intents.push({ kind: "notify-role", assignment: a.id });
	} else {
		if (!a || a.workflow !== c.workflow) return refusal("not_found", "Assignment is outside this workflow.");
		if ("generation" in c && (a.generation !== c.generation || a.attempt !== c.attempt))
			return refusal("stale_assignment", "Generation or Attempt is no longer current.");
		result = { assignment: a.id };
		switch (c.type) {
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
					if (a.packet.execution !== "read-only" || c.executorEpoch !== facts.executorEpoch)
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
			refs: { workflow: c.workflow, ...Object.fromEntries(Object.entries(result).filter(([, v]) => typeof v === "string")) } as Record<
				string,
				string
			>,
		},
	];
	return { outcome: "accepted", result, writes, facts: [facts.ids.fact] };
}
function hasOwner(work: RoleWorkState, packet: RolePacket, slice: string, delivery: boolean): boolean {
	return work.assignments.some(
		(a) =>
			a.slice === slice &&
			((delivery && a.delivery && a.status !== "submitted" && a.status !== "canceled") ||
				(packet.execution === "linux-writer" &&
					a.packet.execution === "linux-writer" &&
					(a.executing || (a.status !== "submitted" && a.status !== "canceled")))),
	);
}
function mayRequest(parent: Role, child: Role): boolean {
	return parent === "coordinator"
		? ["challenger", "candidate", "experiment-candidate", "experiment-parent"].includes(child)
		: parent === "implementer" && ["audit-standards", "audit-contracts"].includes(child);
}
