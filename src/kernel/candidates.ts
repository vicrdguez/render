// Bounded design comparison, not a scheduler. Inputs/results remain ordinary retained role artifacts.
import type { CheckpointRequest } from "./checkpoints.ts";
import { currentChildren, type RoleAssignment, type RolePacket } from "./roles.ts";

/** Common exact question/constraints live in Ground and shared inputs; conditions are explicit packet choices. */
export function candidatePlan(packet: RolePacket, scope: string): string[] | undefined {
	const requests = packet.requests.filter((r) => r.packet.role === "candidate");
	if (requests.length < 2) return;
	const common = JSON.stringify([...new Set(requests[0]!.packet.inputs)].sort());
	const conditions = new Set<string>();
	for (const { packet: p } of requests) {
		if (p.execution !== "read-only" || p.requests.length || p.investigation || p.verification || !p.inputs.includes(scope)) return;
		if (JSON.stringify([...new Set(p.inputs)].sort()) !== common) return;
		const condition = JSON.stringify([
			p.instructions,
			p.profile,
			p.model,
			p.family,
			p.requiredFamily,
			p.thinking,
			p.maxInputBytes,
			p.maxOutputTokens,
			p.maxTurns,
			p.expectedOutput,
		]);
		if (conditions.has(condition)) return;
		conditions.add(condition);
	}
	return requests.map((r) => r.key);
}

export function candidateEvidence(request: CheckpointRequest, assignments: readonly RoleAssignment[]): RoleAssignment[] | undefined {
	if (!request.candidateKeys || request.candidateKeys.length < 2) return;
	const children = currentChildren(assignments, request.coordinator);
	const required: RoleAssignment[] = [];
	for (const key of request.candidateKeys) {
		const child = children.find((a) => a.checkpointCandidate?.request === request.id && a.checkpointCandidate.key === key);
		if (!child || child.packet.role !== "candidate" || child.status !== "submitted" || !child.report) return;
		required.push(child);
	}
	return required;
}

export function validCandidateAnswer(text: string): boolean {
	try {
		const v = JSON.parse(text);
		const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
		return (
			v?.schema === 1 &&
			nonempty(v.answer) &&
			["assumptions", "consequences", "incidentalChoices"].every((key) => Array.isArray(v[key]) && v[key].every(nonempty))
		);
	} catch {
		return false;
	}
}
