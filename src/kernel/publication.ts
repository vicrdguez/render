// Pure proposal publication legality (spec §§9.1–9.3): guarded source publication, one draft proposal PR and its
// host-owned summary. Kernel derives every payload from current state; Effects only reports what the forge did.
// Local integration never reads this state: forge outcomes cannot block it.

import * as Effect from "effect/Effect";
import type { Intakes } from "./intake.ts";
import { integrated, qualifiedSlices } from "./integration.ts";
import type { Decision, DomainWrite, KernelState, Refusal, VerifiedFacts } from "./kernel.ts";
import type { RoleWorkState } from "./roles.ts";

export type ForgeKind = "publish-source" | "create-proposal" | "update-summary" | "mark-ready";
export type Capabilities = {
	draftProposalPR: boolean;
	markProposalReady: boolean;
	guardedSourceUpdate: boolean;
	createIdempotency: boolean;
	stableObjectIdentity: boolean;
	mergeObservation: boolean;
	observationCompleteness: boolean;
};
const CAPABILITIES = [
	"draftProposalPR",
	"markProposalReady",
	"guardedSourceUpdate",
	"createIdempotency",
	"stableObjectIdentity",
	"mergeObservation",
	"observationCompleteness",
] as const;
/** One PR the forge listed on the proposal branch. `id` is an opaque tagged value; Kernel compares, never parses. */
export type ProposalItem = {
	id: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	head: string | null;
	marker: string | null;
	/** Opened by the configured Render identity. */
	actor: boolean;
	/** The forge's merge of this PR: into the configured main branch or not, and the resulting commit. */
	merge: { main: boolean; commit: string } | null;
};
/** The observed human main merge of the associated PR: `source` is the head actually merged. Recorded once. */
export type MainMerge = { pr: string; source: string; commit: string; observation: string };
export type ForgeObservation = {
	schema: 1;
	operation: string | null;
	attempt: string | null;
	mode: "dispatch" | "reconcile";
	outcome: "applied" | "rejected" | "unknown" | null;
	reason: string | null;
	created: string | null;
	/** The authorized source ref's observed head; `null` here means not observed, `{commit:null}` absent. */
	head: { commit: string | null } | null;
	proposals: { complete: boolean; items: ProposalItem[] } | null;
	capabilities: Capabilities | null;
	observedAt: string;
};
export type ForgeAttempt = { id: string; executorEpoch: string; sequence: number; outcome?: "applied" | "rejected" | "unknown" };
export type ForgeOperation = {
	operation: string;
	kind: ForgeKind;
	/** `satisfied`: the desired ready state was observed on the op's basis, without claiming this attempt caused it. */
	status: "planned" | "admitted" | "applied" | "rejected" | "unknown" | "unapplied" | "superseded" | "satisfied";
	/** Canonical R and observed published head when staged: the summary/publication basis. */
	canonical: string;
	published: string | null;
	expected?: string | null;
	marker?: string;
	/** Mark-ready only: the associated PR it promotes. */
	pr?: string;
	/** Update-summary only: the readiness gaps the summary states. */
	gaps?: string[];
	/**
	 * Create: a complete pre-create listing found no open PR on the branch. Mark-ready: the latest listing showed the PR
	 * open and draft on the op's canonical head.
	 */
	checked?: boolean;
	/** Create only: a human authorized one more attempt despite uncertainty. */
	reissue?: boolean;
	/** Create only: the latest complete listing's verified candidates. */
	candidates?: ProposalItem[];
	attempts: ForgeAttempt[];
	observations: string[];
};
export type Association = { pr: string; by: "created" | "reused" | "reconciled" | "resolved"; draft: boolean; state: string };
export type Publication = {
	operations: ForgeOperation[];
	remote?: { head: string | null; observation: string };
	/** A published head outside canonical lineage: never overwritten, never imported. */
	divergence?: string | null;
	association?: Association | null;
	duplicates?: string[];
	risk?: { attempts: string[]; resolved: { statement: string; attempts: string[] } | null } | null;
	unsupported?: string[];
	main?: MainMerge | null;
	/** Why the latest observation of a merged associated PR could not verify its main mapping. */
	mainUnknown?: string | null;
};
export type PublicationCommand =
	| { type: "stageForgeOperation"; workflow: string; kind: ForgeKind }
	| { type: "admitForgeOperation"; workflow: string; operation: string }
	| { type: "recordForgeObservation"; workflow: string; text: string }
	| { type: "authorizeForgeReissue"; workflow: string; operation: string }
	| { type: "resolveForgeRisk"; workflow: string; operation: string; pr: string; text: string };
export type PublicationWrite = {
	type: "publication.replace";
	state: Publication;
	documents: { ref: string; document: string; text: string }[];
};
export const PUBLICATION_COMMANDS = [
	"stageForgeOperation",
	"admitForgeOperation",
	"recordForgeObservation",
	"authorizeForgeReissue",
	"resolveForgeRisk",
];
export const FORGE_KINDS: readonly ForgeKind[] = ["publish-source", "create-proposal", "update-summary", "mark-ready"];
export const emptyPublication = (): Publication => ({ operations: [] });
const refusal = (code: Refusal["code"], reason: string): Refusal => ({ outcome: "refused", code, reason });

/** The canonical head and every commit the canonical ref has held, from recorded qualifications only. */
export function canonical(roles: RoleWorkState | undefined, workflow: string): { head: string | null; lineage: Set<string> } {
	const qualified = (roles?.passes ?? [])
		.filter((p) => p.workflow === workflow)
		.flatMap((p) => p.handoff?.integrations ?? [])
		.filter((i) => i.status === "qualified")
		.sort((a, b) => a.attempts.at(-1)!.sequence - b.attempts.at(-1)!.sequence);
	return { head: qualified.at(-1)?.result ?? null, lineage: new Set(qualified.flatMap((i) => [i.target, i.result])) };
}
const riskOpen = (p: Publication) => !!p.risk && !p.risk.resolved;

/**
 * Why the proposal is not eligible for ready promotion (spec §9.3 R2-A008); empty means eligible. Every accepted Slice,
 * Record work included, needs recorded qualifying integration of its current Contract, and the canonical head must be
 * published to the one associated open PR without divergence or duplicate risk. An observed ready flag never counts.
 */
export function readinessGaps(p: Publication, roles: RoleWorkState | undefined, intakes: Intakes | undefined, workflow: string): string[] {
	const slices = (intakes?.slices ?? []).filter((s) => s.status === "accepted");
	const done = qualifiedSlices(roles?.passes ?? [], workflow, slices);
	const gaps = slices.filter((s) => !done.includes(s.id)).map((s) => `${s.id}: ${s.record ? "Record " : ""}not yet integrated`);
	const head = canonical(roles, workflow).head;
	if (!head) return [...gaps, "no qualifying integration"];
	if (p.divergence) gaps.push(`divergence: published ${p.divergence} is outside canonical lineage`);
	else if ((p.remote?.head ?? null) !== head) gaps.push(`awaiting publication: ${head}`);
	if (riskOpen(p) || p.duplicates?.length) gaps.push("unresolved duplicate PR risk");
	else if (!p.association) gaps.push("no associated proposal PR");
	else if (p.association.state !== "open") gaps.push(`associated PR ${p.association.pr} is ${p.association.state}`);
	return gaps;
}

/** The host-owned summary section: current local facts only; details stay in Render. */
export function proposalSummary(
	title: string,
	roles: RoleWorkState | undefined,
	intakes: Intakes | undefined,
	workflow: string,
	published: string | null,
	gaps: string[],
): string {
	const passes = (roles?.passes ?? []).filter((p) => p.workflow === workflow);
	const slices = (intakes?.slices ?? []).filter((s) => s.status === "accepted");
	const done = slices.filter((s) => passes.some((p) => p.slice === s.id && p.contract === s.contract && integrated(p)));
	const evidence = done.map((s) => {
		const i = passes.flatMap((p) => (p.slice === s.id ? (p.handoff?.integrations ?? []) : [])).find((x) => x.status === "qualified")!;
		const report = roles?.assignments.find((a) => a.id === i.review)?.report;
		return `${s.id}: Watchdog ${i.review} report ${report} on prepared ${i.tree} at ${i.result}`;
	});
	const remaining = slices.filter((s) => !done.includes(s)).map((s) => `${s.id}: not yet integrated`);
	return [
		"<!-- render:summary:start -->",
		"## Render proposal summary",
		"",
		`- Intended outcome: ${title}`,
		`- Integrated scope: ${done.map((s) => s.id).join(", ") || "none"}`,
		`- Canonical source: ${canonical(roles, workflow).head ?? "none"}`,
		`- Published head: ${published ?? "not yet published"}`,
		`- Evidence: ${evidence.join("; ") || "none"}`,
		`- Remaining blocking work: ${remaining.join("; ") || "none"}`,
		`- Ready promotion: ${gaps.length ? `not eligible: ${gaps.join("; ")}` : "eligible; the forge ready state is observed separately"}`,
		"- Advisory human checks: local verification prompts are advisory and gate neither readiness nor merge.",
		"- Main merge: the human only.",
		"",
		"Details stay in Render. This host-owned section may lag Render's current state.",
		"<!-- render:summary:end -->",
	].join("\n");
}

export function forgeObservation(value: string): ForgeObservation | undefined {
	const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
	const closed = (v: Record<string, unknown>, keys: readonly string[]) =>
		Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
	const text = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 512;
	const nullable = (v: unknown) => v === null || text(v);
	try {
		const v: unknown = JSON.parse(value);
		const keys = [
			"schema",
			"operation",
			"attempt",
			"mode",
			"outcome",
			"reason",
			"created",
			"head",
			"proposals",
			"capabilities",
			"observedAt",
		];
		if (!object(v) || v.schema !== 1 || !closed(v, keys)) return;
		if (![v.operation, v.attempt, v.reason, v.created].every(nullable) || !text(v.observedAt)) return;
		if (Number.isNaN(Date.parse(String(v.observedAt)))) return;
		if (v.mode === "dispatch") {
			if (!["applied", "rejected", "unknown"].includes(String(v.outcome)) || v.operation === null || v.attempt === null) return;
		} else if (v.mode !== "reconcile" || v.outcome !== null) return;
		if (v.head !== null && (!object(v.head) || !closed(v.head, ["commit"]) || !nullable(v.head.commit))) return;
		const p = v.proposals;
		if (p !== null) {
			if (!object(p) || !closed(p, ["complete", "items"]) || typeof p.complete !== "boolean" || !Array.isArray(p.items)) return;
			const items = p.items as unknown[];
			if (items.length > 10000) return;
			for (const i of items)
				if (
					!object(i) ||
					!closed(i, ["id", "state", "draft", "head", "marker", "actor", "merge"]) ||
					(i.merge !== null &&
						(!object(i.merge) || !closed(i.merge, ["main", "commit"]) || typeof i.merge.main !== "boolean" || !text(i.merge.commit))) ||
					!text(i.id) ||
					!["open", "closed", "merged"].includes(String(i.state)) ||
					typeof i.draft !== "boolean" ||
					!nullable(i.head) ||
					!nullable(i.marker) ||
					typeof i.actor !== "boolean"
				)
					return;
		}
		const c = v.capabilities;
		if (c !== null && (!object(c) || !closed(c, CAPABILITIES) || !CAPABILITIES.every((k) => typeof c[k] === "boolean"))) return;
		return v as ForgeObservation;
	} catch {
		return;
	}
}

/** Host Effects and human publication commands over the proposal's publication state. */
export const changePublication = Effect.fnUntraced(function* (
	state: KernelState,
	command: PublicationCommand,
	facts: VerifiedFacts,
): Effect.fn.Return<Extract<Decision, { outcome: "accepted" }>, Refusal> {
	if (state.workflow === null) return yield* Effect.fail(refusal("not_found", `${command.workflow} does not exist.`));
	const p = structuredClone(state.publication ?? emptyPublication());
	const workflow = command.workflow;
	const title = state.workflow.title ?? workflow;
	const revision = facts.ids.revision!;
	const { head, lineage } = canonical(state.roleWork, workflow);
	const gaps = () => readinessGaps(p, state.roleWork, state.intakes, workflow);
	const documents: PublicationWrite["documents"] = [];
	const done = (result: Record<string, string | number | null>) => ({
		outcome: "accepted" as const,
		result,
		writes: [
			{ type: "publication.replace", state: p, documents } satisfies PublicationWrite,
			{ type: "fact.record", fact: facts.ids.fact, command: command.type, refs: { workflow, ...(documents.length ? { revision } : {}) } },
		] as DomainWrite[],
		facts: [facts.ids.fact],
	});
	const find = (operation: string) => p.operations.find((o) => o.operation === operation);
	switch (command.type) {
		case "stageForgeOperation": {
			if (p.main) return yield* Effect.fail(refusal("stale_basis", "The human merged this proposal to main; it publishes nothing more."));
			if (!head)
				return yield* Effect.fail(refusal("stale_basis", "Nothing publishes before the proposal's first recorded qualifying integration."));
			const published = p.remote?.head ?? null;
			let intent: Record<string, unknown>;
			const op: ForgeOperation = {
				operation: revision,
				kind: command.kind,
				status: "planned",
				canonical: head,
				published,
				attempts: [],
				observations: [],
			};
			if (command.kind === "publish-source") {
				if (p.unsupported?.includes("guardedSourceUpdate"))
					return yield* Effect.fail(refusal("capability_unavailable", "The forge offers no guarded source update; publish manually."));
				if (p.divergence)
					return yield* Effect.fail(refusal("stale_basis", `The published head ${p.divergence} diverged from canonical lineage.`));
				if (!p.remote) return yield* Effect.fail(refusal("stale_basis", "Observe the published head before publishing."));
				if (p.operations.some((o) => o.kind === "publish-source" && ["planned", "admitted", "unknown"].includes(o.status)))
					return yield* Effect.fail(refusal("ownership_conflict", "Another source publication is unresolved."));
				if (published === head) return yield* Effect.fail(refusal("stale_basis", "The canonical head is already published."));
				op.expected = published;
				intent = { schema: 1, kind: command.kind, proposal: workflow, canonical: head, expected: published };
			} else if (command.kind === "create-proposal") {
				if (p.operations.some((o) => o.kind === "create-proposal"))
					return yield* Effect.fail(refusal("role_already_requested", "The proposal has its one logical draft PR create."));
				if (p.unsupported?.includes("draftProposalPR"))
					return yield* Effect.fail(
						refusal("capability_unavailable", "The forge cannot create a draft proposal PR; no non-draft substitute."),
					);
				if (!published || !lineage.has(published) || p.divergence)
					return yield* Effect.fail(refusal("stale_basis", "Publish a valid canonical head before creating the draft PR."));
				op.marker = `render-proposal:${workflow}:${revision}`;
				const summary = proposalSummary(title, state.roleWork, state.intakes, workflow, published, gaps());
				intent = {
					schema: 1,
					kind: command.kind,
					proposal: workflow,
					marker: op.marker,
					title: `Render: ${title}`,
					head: published,
					body: `<!-- render:proposal-pr ${op.marker} -->\n${summary}`,
				};
			} else if (command.kind === "mark-ready") {
				if (p.unsupported?.includes("markProposalReady"))
					return yield* Effect.fail(
						refusal("capability_unavailable", "The forge offers no ready promotion; a ready state set on the forge is still observed."),
					);
				const current = gaps();
				if (current.length) return yield* Effect.fail(refusal("stale_basis", `Not eligible for ready promotion: ${current.join("; ")}`));
				const same = p.operations.filter((o) => o.kind === "mark-ready" && o.canonical === head);
				if (same.some((o) => ["planned", "admitted", "unknown"].includes(o.status)))
					return yield* Effect.fail(refusal("ownership_conflict", "A ready promotion on this basis is unresolved."));
				if (same.some((o) => ["applied", "satisfied"].includes(o.status)))
					return yield* Effect.fail(refusal("stale_basis", "Ready promotion on this basis is already applied or observed."));
				op.pr = p.association!.pr;
				intent = { schema: 1, kind: command.kind, proposal: workflow, pr: op.pr, canonical: head, published };
			} else {
				if (!p.association || riskOpen(p))
					return yield* Effect.fail(
						refusal("stale_basis", "Summary updates need a verified association without unresolved duplicate risk."),
					);
				if (p.operations.some((o) => o.kind === "update-summary" && o.status === "admitted"))
					return yield* Effect.fail(refusal("ownership_conflict", "A summary update is in flight."));
				for (const o of p.operations) if (o.kind === "update-summary" && o.status === "planned") o.status = "superseded";
				op.gaps = gaps();
				const summary = proposalSummary(title, state.roleWork, state.intakes, workflow, published, op.gaps);
				intent = { schema: 1, kind: command.kind, proposal: workflow, pr: p.association.pr, canonical: head, published, summary };
			}
			p.operations.push(op);
			documents.push({ ref: revision, document: `forge-intent/${facts.sequence}`, text: JSON.stringify(intent) });
			return done({ operation: revision, kind: command.kind });
		}
		case "admitForgeOperation": {
			const op = find(command.operation);
			if (!op) return yield* Effect.fail(refusal("stale_basis", "Name a staged forge operation."));
			if (p.main) return yield* Effect.fail(refusal("stale_basis", "The human merged this proposal to main; it publishes nothing more."));
			if (!facts.executorEpoch)
				return yield* Effect.fail(refusal("capability_unavailable", "No current executor epoch can consume a permit."));
			const reissue = op.kind === "create-proposal" && op.reissue;
			if (op.status !== "planned" && !reissue)
				return yield* Effect.fail(
					refusal("stale_basis", `A ${op.status} forge operation takes no new admission; unknown outcomes reconcile, never resend.`),
				);
			if (op.kind === "create-proposal" && !reissue && (!op.checked || p.duplicates?.length))
				return yield* Effect.fail(
					refusal("stale_basis", "Admit the create only after a complete listing finds no open PR on the proposal branch."),
				);
			if (op.kind === "publish-source" && p.divergence) return yield* Effect.fail(refusal("stale_basis", "The published head diverged."));
			if (op.kind === "update-summary" && (!p.association || riskOpen(p)))
				return yield* Effect.fail(refusal("stale_basis", "Summary updates need a verified association without unresolved duplicate risk."));
			if (op.kind === "mark-ready") {
				const current = gaps();
				if (current.length || op.canonical !== head || op.pr !== p.association?.pr)
					return yield* Effect.fail(
						refusal("stale_basis", `The promotion basis is no longer current: ${current.join("; ") || "canonical or PR changed"}`),
					);
				if (!op.checked)
					return yield* Effect.fail(
						refusal("stale_basis", "Reobserve the associated PR open and draft on the exact published head before admitting."),
					);
			}
			const id = `forge-attempt:${facts.sequence}`;
			op.attempts.push({ id, executorEpoch: facts.executorEpoch, sequence: facts.sequence });
			op.status = "admitted";
			op.reissue = false;
			if (riskOpen(p) && op.kind === "create-proposal") p.risk!.attempts.push(id);
			return done({ operation: op.operation, forgeAttempt: id, executorEpoch: facts.executorEpoch });
		}
		case "recordForgeObservation": {
			const o = forgeObservation(command.text);
			if (!o) return yield* Effect.fail(refusal("invalid_content", "Record a complete closed forge observation."));
			const op = o.operation === null ? undefined : find(o.operation);
			if (o.operation !== null && !op)
				return yield* Effect.fail(refusal("stale_basis", "The observation names no staged forge operation."));
			if (o.mode === "dispatch") {
				const attempt = op!.attempts.at(-1);
				if (!attempt || attempt.id !== o.attempt)
					return yield* Effect.fail(refusal("stale_basis", "Only the latest admitted attempt reports a dispatch."));
				// Only the executor that consumed the permit knows what its request did; any other executor reconciles.
				if (attempt.executorEpoch !== facts.executorEpoch)
					return yield* Effect.fail(
						refusal("stale_executor", "Another executor epoch cannot report this attempt's dispatch; reconcile it."),
					);
				if (attempt.outcome || op!.status !== "admitted") return yield* Effect.fail(refusal("stale_basis", "A dispatch is reported once."));
				attempt.outcome = o.outcome!;
			}
			if (o.capabilities)
				p.unsupported = (["draftProposalPR", "guardedSourceUpdate", "markProposalReady"] as const).filter((k) => !o.capabilities![k]);
			if (o.head) {
				p.remote = { head: o.head.commit, observation: revision };
				p.divergence = o.head.commit && !lineage.has(o.head.commit) ? o.head.commit : null;
			}
			if (op) {
				op.observations.push(revision);
				observeOperation(p, op, o);
			}
			if (p.duplicates?.length && op?.status !== "unknown" && o.proposals?.complete)
				p.duplicates = p.duplicates.filter((id) => o.proposals!.items.some((i) => i.id === id && i.state === "open"));
			if (p.association && o.proposals) {
				const current = o.proposals.items.find((i) => i.id === p.association!.pr);
				if (current) p.association = { ...p.association, draft: current.draft, state: current.state };
				if (current?.state === "merged" && !p.main) {
					// A merged label is not main integration: only a complete listing with a main merge and its head maps it.
					const gap = !o.proposals.complete
						? "The listing that shows the merge is incomplete."
						: !current.merge || !current.head
							? "The forge reports a merge without a verifiable merged head and merge commit."
							: !current.merge.main
								? "The PR was merged outside the main branch."
								: null;
					p.mainUnknown = gap;
					if (!gap) p.main = { pr: current.id, source: current.head!, commit: current.merge!.commit, observation: revision };
				}
			}
			documents.push({ ref: revision, document: `forge-observation/${facts.sequence}`, text: command.text });
			return done({ observation: revision, operation: op?.operation ?? null, status: op?.status ?? null });
		}
		case "authorizeForgeReissue": {
			const op = find(command.operation);
			if (!op || op.kind !== "create-proposal" || op.status !== "unknown" || op.reissue)
				return yield* Effect.fail(refusal("stale_basis", "Only an unknown draft PR create can be explicitly reissued."));
			op.reissue = true;
			p.risk = riskOpen(p) ? p.risk! : { attempts: op.attempts.map((a) => a.id), resolved: null };
			return done({ operation: op.operation, attempts: op.attempts.length });
		}
		case "resolveForgeRisk": {
			const op = find(command.operation);
			if (!op || op.kind !== "create-proposal" || (!riskOpen(p) && !p.duplicates?.length))
				return yield* Effect.fail(refusal("stale_basis", "There is no duplicate risk or duplicate PR to resolve."));
			const chosen = op.candidates?.find((c) => c.id === command.pr);
			if (!chosen)
				return yield* Effect.fail(refusal("stale_basis", "Associate only a verified candidate from the latest complete listing."));
			p.association = { pr: chosen.id, by: "resolved", draft: chosen.draft, state: chosen.state };
			p.duplicates = op.candidates!.filter((c) => c.id !== chosen.id).map((c) => c.id);
			if (p.risk) p.risk.resolved = { statement: revision, attempts: op.attempts.map((a) => a.id) };
			op.status = "applied";
			op.reissue = false;
			documents.push({ ref: revision, document: `forge-resolution/${facts.sequence}`, text: command.text });
			return done({ operation: op.operation, association: chosen.id, statement: revision });
		}
	}
});

/** What one observation means for its operation (spec §9.2 operation rules); negative listing is never absence. */
function observeOperation(p: Publication, op: ForgeOperation, o: ForgeObservation): void {
	const settled = !["planned", "admitted", "unknown"].includes(op.status);
	if (op.kind === "publish-source") {
		if (o.mode === "dispatch") {
			op.status = o.outcome!;
			if (o.outcome === "applied" && !o.head) p.remote = { head: op.canonical, observation: op.observations.at(-1)! };
		} else if (!settled && op.status !== "planned") {
			const seen = o.head?.commit;
			if (o.head === null) op.status = "unknown";
			else op.status = seen === op.canonical ? "applied" : seen === op.expected ? "unapplied" : "rejected";
		}
		return;
	}
	if (op.kind === "update-summary") {
		if (o.mode === "dispatch") op.status = o.outcome!;
		else if (op.status === "admitted") op.status = "unknown";
		return;
	}
	if (op.kind === "mark-ready") {
		if (o.mode === "dispatch") {
			op.status = o.outcome!;
			return;
		}
		if (op.status === "admitted") op.status = "unknown";
		const seen = o.proposals?.items.find((i) => i.id === op.pr);
		const exact = seen?.state === "open" && seen.head === op.canonical;
		if (op.status === "planned") op.checked = exact && seen.draft;
		if ((op.status === "planned" || op.status === "unknown") && exact && !seen.draft) op.status = "satisfied";
		// Marking ready sets a state and creates nothing: a complete listing still draft on the exact head shows it
		// unapplied, and a fresh promotion then needs its own stage, eligibility and pre-admission observation.
		else if (op.status === "unknown" && exact && o.proposals!.complete) op.status = "unapplied";
		return;
	}
	if (o.mode === "dispatch") {
		if (o.outcome === "rejected") {
			op.status = "rejected";
			if (o.reason === "draft-unsupported") p.unsupported = [...new Set([...(p.unsupported ?? []), "draftProposalPR"])];
		} else if (o.outcome === "applied" && o.created && !riskOpen(p)) {
			p.association = { pr: o.created, by: "created", draft: true, state: "open" };
			op.status = "applied";
		} else op.status = "unknown";
		return;
	}
	if (op.status === "admitted") op.status = "unknown";
	if (!o.proposals?.complete || settled) return;
	if (op.status === "planned") {
		const open = o.proposals.items.filter((i) => i.state === "open");
		op.checked = open.length === 0;
		p.duplicates = open.length > 1 ? open.map((i) => i.id) : [];
		op.candidates = open;
		if (open.length === 1) {
			p.association = { pr: open[0]!.id, by: "reused", draft: open[0]!.draft, state: open[0]!.state };
			op.status = "applied";
		}
		return;
	}
	// A marker is correlation, not a signature: candidates must also be the configured actor's.
	const verified = o.proposals.items.filter((i) => i.marker === op.marker && i.actor);
	op.candidates = verified;
	p.duplicates = verified.length > 1 ? verified.map((i) => i.id) : [];
	if (verified.length === 1 && !riskOpen(p)) {
		p.association = { pr: verified[0]!.id, by: "reconciled", draft: verified[0]!.draft, state: verified[0]!.state };
		op.status = "applied";
	}
}

/**
 * Which qualified Slices the observed merged source contains: those integrated at or before it in canonical lineage.
 * An older merged head leaves later Slices uncovered; a head outside canonical lineage covers none.
 */
export function mainCoverage(
	p: Publication | undefined,
	roles: RoleWorkState | undefined,
	intakes: Intakes | undefined,
	workflow: string,
): { covered: string[]; uncovered: string[] } {
	const slices = intakes?.slices ?? [];
	const qualified = qualifiedSlices(roles?.passes ?? [], workflow, slices);
	const lineage = (roles?.passes ?? [])
		.filter((x) => x.workflow === workflow)
		.flatMap((x) => (x.handoff?.integrations ?? []).filter((i) => i.status === "qualified").map((i) => ({ pass: x, i })))
		.sort((a, b) => a.i.attempts.at(-1)!.sequence - b.i.attempts.at(-1)!.sequence);
	const merged = lineage.slice(0, lineage.findIndex(({ i }) => i.result === p?.main?.source) + 1);
	const covered = qualified.filter((s) =>
		merged.some(({ pass }) => pass.slice === s && pass.contract === slices.find((c) => c.id === s)!.contract),
	);
	return { covered, uncovered: qualified.filter((s) => !covered.includes(s)) };
}

export type PublicationView = {
	status: "awaiting-integration" | "blocked" | "uncertain" | "lagging" | "published";
	canonical: string | null;
	published: string | null;
	divergence: { head: string; canonical: string } | null;
	association: Association | null;
	duplicates: string[];
	risk: Publication["risk"];
	unsupported: string[];
	operations: ForgeOperation[];
	/** The observed human main merge beside current canonical source, and the Slices its source does not contain. */
	main: (MainMerge & { canonical: string | null; uncovered: string[] }) | null;
	mainUnknown: string | null;
	/** Actions this publication state holds back; local design, review and integration are never among them. */
	blocked: string[];
	choices: string[];
	readiness: Readiness;
	/** The associated PR's latest summary no longer states the current heads or readiness gaps. */
	summaryStale: boolean;
};
/**
 * Eligibility, the latest promotion and the observed forge state, kept apart (spec §9.3). `package` maps each integrated
 * Slice to the exact records behind it for the human's own main merge; Render never requests a merge.
 */
export type Readiness = {
	eligible: boolean;
	gaps: string[];
	promotion: { operation: string; status: ForgeOperation["status"]; canonical: string; pr: string } | null;
	observed: "draft" | "ready" | "closed" | "merged" | null;
	package: {
		slice: string;
		record: boolean;
		contract: string;
		pass: string;
		captureA: string | null;
		audit: string | null;
		handoff: string;
		source: string;
		preparation: string;
		prepared: string;
		watchdog: string;
		report: string | null;
		integration: string;
		result: string;
	}[];
	advisory: string;
	uncertain: string[];
};
export function publicationView(
	p: Publication | undefined,
	roles: RoleWorkState | undefined,
	workflow: string,
	intakes: Intakes | undefined,
): PublicationView {
	const s = p ?? emptyPublication();
	const head = canonical(roles, workflow).head;
	const gaps = readinessGaps(s, roles, intakes, workflow);
	const published = s.remote?.head ?? null;
	const association = s.association ?? null;
	const duplicates = s.duplicates ?? [];
	const open = riskOpen(s);
	const status = !head
		? "awaiting-integration"
		: s.divergence || open || duplicates.length
			? "blocked"
			: s.operations.some((o) => o.status === "unknown" || o.status === "admitted")
				? "uncertain"
				: published !== head
					? "lagging"
					: "published";
	const blocked = [
		...(s.divergence ? ["publish-source"] : []),
		...(!association || open ? ["update-summary"] : []),
		...(head && gaps.length ? ["ready-promotion"] : []),
	];
	const unknownCreate = s.operations.some((o) => o.kind === "create-proposal" && o.status === "unknown");
	const choices = [
		...(unknownCreate || s.divergence ? ["inspect", "recheck"] : []),
		...(unknownCreate && !s.operations.some((o) => o.reissue) ? ["authorizeForgeReissue"] : []),
		...(open || duplicates.length ? ["resolveForgeRisk"] : []),
		...(s.mainUnknown && !s.main && !(unknownCreate || s.divergence) ? ["recheck"] : []),
	];
	return {
		status,
		canonical: head,
		published,
		divergence: s.divergence && head ? { head: s.divergence, canonical: head } : null,
		association,
		duplicates,
		risk: s.risk ?? null,
		unsupported: s.unsupported ?? [],
		operations: s.operations,
		main: s.main ? { ...s.main, canonical: head, uncovered: mainCoverage(s, roles, intakes, workflow).uncovered } : null,
		mainUnknown: s.main ? null : (s.mainUnknown ?? null),
		blocked,
		choices,
		readiness: readiness(s, roles, intakes, workflow, gaps),
		// After the observed merge or under divergence no summary update follows, so reconciles must not reschedule reads.
		summaryStale: !!association && !open && !s.main && !s.divergence && summaryStale(s, head, published, gaps),
	};
}
function summaryStale(s: Publication, head: string | null, published: string | null, gaps: string[]): boolean {
	const summary = s.operations.findLast((o) => o.kind === "update-summary" && o.status !== "superseded");
	return !summary || summary.canonical !== head || summary.published !== published || summary.gaps?.join("\n") !== gaps.join("\n");
}
function readiness(
	s: Publication,
	roles: RoleWorkState | undefined,
	intakes: Intakes | undefined,
	workflow: string,
	gaps: string[],
): Readiness {
	const promotion = s.operations.findLast((o) => o.kind === "mark-ready");
	const a = s.association;
	const passes = (roles?.passes ?? []).filter((p) => p.workflow === workflow && integrated(p));
	const slices = (intakes?.slices ?? []).filter((x) => x.status === "accepted");
	return {
		eligible: gaps.length === 0,
		gaps,
		promotion: promotion
			? { operation: promotion.operation, status: promotion.status, canonical: promotion.canonical, pr: promotion.pr! }
			: null,
		observed: !a ? null : a.state === "open" ? (a.draft ? "draft" : "ready") : (a.state as "closed" | "merged"),
		package: slices.flatMap((x) => {
			const p = passes.find((p) => p.slice === x.id && p.contract === x.contract);
			const i = p?.handoff?.integrations?.find((i) => i.status === "qualified");
			if (!p || !i) return [];
			return [
				{
					slice: x.id,
					record: x.record,
					contract: x.contract,
					pass: p.ref,
					captureA: p.captureA ?? null,
					audit: p.audit?.record ?? null,
					handoff: p.handoff!.record,
					source: p.handoff!.source,
					preparation: i.preparation,
					prepared: i.tree,
					watchdog: i.review,
					report: roles?.assignments.find((r) => r.id === i.review)?.report ?? null,
					integration: i.operation,
					result: i.result,
				},
			];
		}),
		advisory: "Local verification prompts are advisory and gate neither readiness nor merge; the human alone merges main.",
		uncertain: s.operations.filter((o) => o.status === "unknown" || o.status === "admitted").map((o) => o.operation),
	};
}
