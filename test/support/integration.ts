// Literal host integration material at the Ledger seam: intents, attempts and canonical-ref observations as host
// Effects would submit them. Fixture data for authority/ordering/qualification checks, never evidence Git ran.
import assert from "node:assert/strict";
import type { ImplementationPass } from "../../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { accepted, assessment, capture, implementationLifecycle, type SecondSlice } from "./implementation.ts";
import { admin } from "./roles.ts";
import { basis, EMPTY, type Lineage, watchdogRound, watched } from "./watchdog.ts";

export type Lifecycle = Awaited<ReturnType<typeof implementationLifecycle>>;
export const effects = mintContext({ kind: "host", scope: "effects" });
export const W = "workflow:2";
export const REF = `refs/render/proposals/${"0".repeat(64)}`;
export const S = "a".repeat(40);
export const [T0, T1] = ["c", "2"].map((c) => c.repeat(40)) as [string, string];
export const [X1, X2] = ["e", "f"].map((c) => c.repeat(40)) as [string, string];
export const [R1, R2] = ["9", "8"].map((c) => c.repeat(40)) as [string, string];
export const MESSAGE = "Render proposal integration\n";

export const passes = (t: Lifecycle) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
export const passOf = (t: Lifecycle, slice = "read-fix") => passes(t).findLast((p) => p.slice === slice)!;
export const own = (t: Lifecycle, id: string) => t.assignments().find((a) => a.id === id)!;
export function refused(reply: CommandReply, code: string, label: string) {
	assert.equal(reply.status, "refused", `${label}: ${JSON.stringify(reply)}`);
	if (reply.status === "refused") assert.equal(reply.code, code, `${label}: ${reply.reason}`);
}
export async function quiesce(t: Lifecycle, id: string) {
	const a = own(t, id);
	accepted(
		await t.f.command({
			type: "recordQuiescence",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			providerIdle: true,
			environment: a.packet.execution === "linux-writer" ? "stopped" : "absent",
			effects: "reconciled",
		}),
	);
}
/** read-fix's P1 handed off with its own Audit and a frozen Watchdog reviewer. */
export async function handedOff(second?: SecondSlice) {
	const t = await implementationLifecycle(undefined, (contract) => watched(contract), second);
	await t.audit();
	await t.reports();
	await t.retain("final");
	accepted(await t.f.command(t.handoff, t.actor, "p1-handoff"));
	await quiesce(t, t.id);
	return t;
}
/** read-next's own pass through the same real commands: assignment, A, Audit, B and handoff. */
export async function handOffNext(t: Lifecycle) {
	const contract = t.nextContract!;
	const id = accepted(
		await t.f.command({
			type: "assignTask",
			slice: "read-next",
			delivery: true,
			packet: t.writer({ inputs: [contract], ...watched(contract) }),
		}),
	).assignment as string;
	const actor = await t.start(id);
	const retain = async (kind: "audit" | "final") =>
		accepted(
			await t.f.command(
				{
					type: "recordImplementationSource",
					assignment: id,
					generation: 1,
					attempt: own(t, id).attempt,
					kind,
					text: JSON.stringify(capture(own(t, id), t.f.ledger.status().executorEpoch, contract)),
				},
				effects,
			),
		);
	await retain("audit");
	accepted(await t.f.command({ type: "requestImplementationAudit" }, actor, "next-audit"));
	for (const child of t.assignments().filter((a) => a.parent === id)) {
		const principal = await t.start(child.id);
		accepted(
			await t.f.command(
				{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...child.auditReview, findings: [] }), supports: [] },
				principal,
			),
		);
		await quiesce(t, child.id);
	}
	await retain("final");
	accepted(
		await t.f.command(
			{ type: "submitImplementationHandoff", text: "Next handoff", dispositions: [], verification: assessment },
			actor,
			"next-handoff",
		),
	);
	await quiesce(t, id);
	return id;
}
export const lineage = (target = T0, X = X1): Lineage => ({ target, X, base: S, source: S });
/** One complete scripted passing Watchdog round on the owner's latest pass of `slice`. */
export const passedRound = (t: Lifecycle, owner = t.id, slice = "read-fix", l = lineage()) =>
	watchdogRound(t, owner, passOf(t, slice).ref, l, "pass");
type Round = { id: string; preparation: string; report: string };
/** The exact intent host Effects stages for a passing round: every field pinned, nothing restated by Kernel. */
export function intent(t: Lifecycle, owner: string, r: Round, over: Record<string, unknown> = {}, l = lineage(), R = R1) {
	const a = own(t, owner);
	const p = passes(t).find((x) => x.ref === a.passRef)!;
	return JSON.stringify({
		schema: 1,
		kind: "proposal-integration",
		proposal: W,
		ref: REF,
		slice: p.slice,
		contract: p.contract,
		passRef: p.ref,
		handoff: p.handoff!.record,
		source: p.handoff!.source,
		captureA: p.captureA,
		audit: p.audit!.record,
		reports: [p.audit!.results.standards!.report, p.audit!.results.contracts!.report],
		preparation: r.preparation,
		prepared: l.X,
		tree: EMPTY,
		target: l.target,
		review: r.id,
		report: r.report,
		result: { commit: R, tree: EMPTY, parent: l.target, message: MESSAGE },
		policy: basis(t),
		assignment: a.id,
		generation: a.generation,
		attempt: a.attempt,
		unresolved: [],
		...over,
	});
}
export function stage(t: Lifecycle, owner: string, text: string, context = effects, commandId?: string) {
	const a = own(t, owner);
	return t.f.command({ type: "stageOperation", assignment: a.id, generation: a.generation, attempt: a.attempt, text }, context, commandId);
}
export function admit(t: Lifecycle, owner: string, operation: string, context = effects, commandId?: string) {
	const a = own(t, owner);
	return t.f.command(
		{ type: "admitEffect", assignment: a.id, generation: a.generation, attempt: a.attempt, operation },
		context,
		commandId,
	);
}
export type Observed = { commit: string; tree: string; parents: string[] } | null;
export function observation(
	operation: string,
	attempt: string,
	over: { mode?: "dispatch" | "reconcile"; dispatch?: "applied" | "refused" | null; observed?: Observed; lock?: boolean } = {},
	l = lineage(),
	R = R1,
) {
	const mode = over.mode ?? "dispatch";
	return JSON.stringify({
		schema: 1,
		operation,
		attempt,
		mode,
		dispatch: over.dispatch !== undefined ? over.dispatch : mode === "dispatch" ? "applied" : null,
		ref: REF,
		observed: over.observed !== undefined ? over.observed : { commit: R, tree: EMPTY, parents: [l.target] },
		lock: over.lock ?? false,
	});
}
export function record(t: Lifecycle, owner: string, operation: string, text: string, context = effects, commandId?: string) {
	const a = own(t, owner);
	return t.f.command(
		{ type: "recordIntegration", assignment: a.id, generation: a.generation, attempt: a.attempt, operation, text },
		context,
		commandId,
	);
}
/** Stage and admit the passing round's exact intent; returns the operation and its one attempt. */
export async function admitted(t: Lifecycle, owner: string, r: Round, l = lineage(), R = R1) {
	const operation = accepted(await stage(t, owner, intent(t, owner, r, {}, l, R))).operation as string;
	const admission = accepted(await admit(t, owner, operation));
	return { operation, attempt: admission.integrationAttempt as string, executorEpoch: admission.executorEpoch as string };
}
