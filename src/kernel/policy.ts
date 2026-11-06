// Ordinary execution policy is separate from per-request checkpoint settings.
import type { Decision, KernelState, VerifiedFacts } from "./kernel.ts";

export type ExecutionPolicy = {
	completedReviewLimit: number;
	reviewerDiversity: "different-family" | "human-directed-same-family";
	/** An evidence requirement, never permission to omit mandatory checks. */
	minimumEvidenceRank: string | null;
};
export type PolicyBinding = { revision: string; policy: string };
export type PolicyState = {
	defaultRevision: string;
	revisions: Record<string, ExecutionPolicy>;
	bindings: Record<string, PolicyBinding>;
};
export type PolicyCommand =
	| { type: "changePolicy"; expectedRevision: string; policy: ExecutionPolicy }
	| { type: "adoptPolicy"; workflow: string; revision: string; expectedBinding: string };
export function initialPolicy(): PolicyState {
	return {
		defaultRevision: "policy:initial",
		revisions: {
			"policy:initial": { completedReviewLimit: 2, reviewerDiversity: "different-family", minimumEvidenceRank: null },
		},
		bindings: {},
	};
}
export function bindingFor(state: PolicyState, workflow: string): PolicyBinding {
	// Stores predating D004 keep their original policy, never whatever defaults were published later.
	return state.bindings[workflow] ?? { revision: `${workflow}:policy:initial`, policy: "policy:initial" };
}
/** What a preparation qualified X against: the workflow's binding, its immutable revision and that revision's minimum rank. */
export type PolicyBasis = { binding: string; revision: string; minimumEvidenceRank: string | null };
/** The workflow's current basis; undefined when its bound revision is absent from state. */
export function policyBasis(state: PolicyState, workflow: string): PolicyBasis | undefined {
	const binding = bindingFor(state, workflow);
	const revision = state.revisions[binding.policy];
	return revision && { binding: binding.revision, revision: binding.policy, minimumEvidenceRank: revision.minimumEvidenceRank };
}
export function changePolicy(state: KernelState, c: PolicyCommand, facts: VerifiedFacts): Decision {
	const policy = structuredClone(state.policy ?? initialPolicy());
	const p = facts.principal;
	if (p.kind !== "human") return { outcome: "refused", code: "forbidden_principal", reason: "Policy changes require human direction." };
	if (c.type === "changePolicy") {
		if (p.route === "device" && p.workflows !== "all")
			return { outcome: "refused", code: "forbidden_scope", reason: "Project defaults require project-wide scope." };
		if (c.expectedRevision !== policy.defaultRevision)
			return { outcome: "refused", code: "stale_basis", reason: "Policy defaults changed; read the current revision." };
		policy.defaultRevision = `policy:${facts.sequence}`;
		policy.revisions[policy.defaultRevision] = c.policy;
		return {
			outcome: "accepted",
			result: { policy: policy.defaultRevision },
			writes: [
				{ type: "policy.replace", state: policy },
				{ type: "fact.record", fact: facts.ids.fact, command: c.type, refs: { policy: policy.defaultRevision } },
			],
			facts: [facts.ids.fact],
		};
	}
	if (!state.workflow || state.workflow.id !== c.workflow)
		return { outcome: "refused", code: "not_found", reason: "Policy adoption requires an existing workflow." };
	if (p.route === "device" && p.workflows !== "all" && !p.workflows.includes(c.workflow))
		return { outcome: "refused", code: "forbidden_scope", reason: "Workflow is outside this device scope." };
	if (bindingFor(policy, c.workflow).revision !== c.expectedBinding)
		return { outcome: "refused", code: "stale_basis", reason: "Workflow policy binding changed; read the current binding." };
	if (!Object.hasOwn(policy.revisions, c.revision))
		return { outcome: "refused", code: "not_found", reason: "Selected immutable policy revision is unavailable." };
	const revision = `policy-binding:${facts.sequence}`;
	policy.bindings[c.workflow] = { revision, policy: c.revision };
	const work = structuredClone(state.roleWork ?? { assignments: [] });
	for (const a of work.assignments) {
		if (a.workflow !== c.workflow || a.status === "submitted" || a.status === "canceled" || a.status === "canceling") continue;
		a.policyBinding = revision;
		a.packet = { ...a.packet, policyBinding: revision };
		a.packetRef = `packet:${facts.sequence}:${a.id}`;
		if (a.executing) {
			a.status = "blocked";
			a.blocker ??= "policy_refresh_required";
		}
	}
	return {
		outcome: "accepted",
		result: { binding: revision, policy: c.revision },
		writes: [
			{ type: "policy.replace", state: policy },
			{ type: "roles.replace", state: work, intents: [] },
			{ type: "fact.record", fact: facts.ids.fact, command: c.type, refs: { workflow: c.workflow, binding: revision, policy: c.revision } },
		],
		facts: [facts.ids.fact],
	};
}
