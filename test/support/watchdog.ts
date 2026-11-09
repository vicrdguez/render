// Literal host/scripted Watchdog round material at the Ledger seam: checked preparation records, the Watchdog's own
// check receipt and bound verdicts. Fixture data for authority/binding/counting checks, never evidence a model judged.
import type { PolicyBasis, PolicyState } from "../../src/kernel/policy.ts";
import type { ImplementationPass, RoleAssignment } from "../../src/kernel/roles.ts";
import type { Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { accepted, type implementationLifecycle, selection } from "./implementation.ts";
import { admin, packet } from "./roles.ts";

type Lifecycle = Awaited<ReturnType<typeof implementationLifecycle>>;
export type Verdict = "pass" | "rework" | "needs-human";
export const W = "workflow:3";
/** Git's empty tree: literal X with no entries forms exactly this tree. */
export const EMPTY = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const V = "b".repeat(64);
const REF = `refs/render/proposals/${"0".repeat(64)}`;
const effects = mintContext({ kind: "host", scope: "effects" });

export const watchdogRequest = { key: "watchdog", packet: packet({ role: "watchdog", maxInputBytes: 1048576 }) };
/** An implementer packet that freezes both Audit reviewers and one Watchdog reviewer. */
export const watched = (contract: string) => ({
	requests: [
		{ key: "standards", packet: packet({ role: "audit-standards" }) },
		{ key: "contracts", packet: packet({ role: "audit-contracts" }) },
		watchdogRequest,
	],
	verification: selection(contract),
});
export function basis(t: Lifecycle): PolicyBasis {
	const p = (t.f.ledger.snapshot(admin) as Frame).policy as PolicyState;
	const b = p.bindings[W]!;
	return { binding: b.revision, revision: b.policy, minimumEvidenceRank: p.revisions[b.policy]!.minimumEvidenceRank };
}
export type Lineage = { target: string; X: string; base: string; source: string };
export function checkedRecord(t: Lifecycle, p: ImplementationPass, l: Lineage, over: Record<string, unknown> = {}) {
	return JSON.stringify({
		schema: 1,
		passRef: p.ref,
		handoff: p.handoff!.record,
		source: p.handoff!.source,
		attempt: (p.handoff!.preparations?.length ?? 0) + 1,
		target: { proposal: W, ref: REF, commit: l.target },
		outcome: "checked",
		reason: null,
		preparation: {
			kind: "clean",
			algorithm: "git-merge-tree-write-tree-z/v1",
			profile: "render-trusted-git/v1",
			git: "git version 2.50.0",
			identity: "f".repeat(64),
			base: l.base,
			source: l.source,
			target: l.target,
			result: l.X,
			tree: EMPTY,
			conflicts: [],
			exitCode: 0,
			stdout: "",
			stderr: "",
		},
		checks: {
			verifierRevision: V,
			scope: { assignment: "assignment:owner", generation: 1, attempt: "attempt:owner:preparation:1", executorEpoch: "executor:1" },
			catalog: { selection: {}, rows: [] },
			results: [],
			cleanup: { status: "complete", results: [] },
			verification: { status: "passed", inputCommit: l.X, inputTree: EMPTY, resultTree: EMPTY },
			failed: [],
		},
		policy: basis(t),
		...over,
	});
}
export type Receipt = {
	status?: string;
	resultTree?: string;
	role?: string;
	prepared?: string;
	tree?: string;
	digest?: string;
	exitCode?: number;
};
/** The Watchdog's own Linux catalog receipt on exact X, as the Engine retains it: literal X plus its scoped results. */
export function receipt(t: Lifecycle, w: RoleAssignment, over: Receipt = {}) {
	const X = over.prepared ?? w.watchdogReview!.prepared;
	const tree = over.tree ?? EMPTY;
	const digest = over.digest ?? V;
	// The round's own pass names the Contract its verifier selection is bound to.
	const contract =
		((t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[]).find((p) => p.ref === w.watchdogReview?.passRef)
			?.contract ?? t.contract;
	const rows = selection(contract).rows;
	return JSON.stringify({
		schema: 1,
		source: { repository: "owned", objectFormat: "sha1", commit: X, tree, root: `refs/render/sources/${X}`, entries: [] },
		evidence: {
			kind: "catalog-check",
			role: over.role ?? "watchdog",
			scope: { assignment: w.id, generation: w.generation, attempt: w.attempt, executorEpoch: t.f.ledger.status().executorEpoch },
			catalog: {
				selection: { ...selection(contract), commit: X, digest },
				text: "literal selected catalog",
				ranks: ["tests", "inspection"],
				sections: {},
				rows: rows.map((name) => ({
					name,
					channel: "Tests",
					kind: "executed",
					run: "true",
					expectations: "Exact behavior",
					rank: "tests",
					literal: name,
				})),
				cleanup: [],
			},
			results: rows.map((name) => ({
				name,
				status: over.exitCode ? "failed" : "completed",
				steps: [
					{
						argv: ["true"],
						exitCode: over.exitCode ?? 0,
						stdout: "",
						stderr: "",
						platform: { os: "linux", cpu: "owned" },
						image: "owned",
						timedOut: false,
						verifierRevision: digest,
					},
				],
			})),
			verification: { status: over.status ?? "needs_assessment", inputCommit: X, inputTree: tree, resultTree: over.resultTree ?? tree },
			cleanup: { status: "complete", results: [] },
		},
	});
}
export function verdictText(w: RoleAssignment, verdict: Verdict, over: Record<string, unknown> = {}) {
	const b = w.watchdogReview!;
	return JSON.stringify({
		schema: 1,
		verdict,
		passRef: b.passRef,
		handoff: b.handoff,
		source: b.source,
		prepared: b.prepared,
		target: b.target,
		findings: verdict === "pass" ? [] : [{ id: "W1", text: "Value must be B" }],
		...over,
	});
}
export const passing = { outcome: "pass", rank: "tests", reason: "Own independent X checks passed." };
export const nonPass = { outcome: "non-pass", rank: null, reason: "Rework required on X." };
/**
 * One complete scripted round on the owner's current handoff: checked X/T record, host launch on the same observed T,
 * its own retained checks, a bound verdict and quiescence.
 */
export async function watchdogRound(t: Lifecycle, owner: string, passRef: string, l: Lineage, verdict: Verdict) {
	const find = (id: string) => t.assignments().find((a) => a.id === id)!;
	const p = ((t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[]).find((x) => x.ref === passRef)!;
	const o = find(owner);
	const preparation = accepted(
		await t.f.command(
			{ type: "recordPreparation", assignment: o.id, generation: o.generation, attempt: o.attempt, text: checkedRecord(t, p, l) },
			effects,
		),
	).preparation as string;
	const id = accepted(
		await t.f.command(
			{ type: "requestWatchdogReview", assignment: o.id, generation: o.generation, attempt: o.attempt, preparation, target: l.target },
			effects,
		),
	).assignment as string;
	const actor = await t.start(id);
	accepted(
		await t.f.command(
			{ type: "recordReviewChecks", assignment: id, generation: 1, attempt: find(id).attempt, text: receipt(t, find(id)) },
			effects,
		),
	);
	const result = accepted(
		await t.f.command(
			{
				type: "submitRoleResult",
				text: verdictText(find(id), verdict),
				supports: [],
				verification: verdict === "pass" ? passing : nonPass,
			},
			actor,
		),
	);
	accepted(
		await t.f.command({
			type: "recordQuiescence",
			assignment: id,
			generation: 1,
			attempt: find(id).attempt,
			providerIdle: true,
			environment: "absent",
			effects: "reconciled",
		}),
	);
	return { id, preparation, report: result.report as string, reviews: result.reviews as number, actor };
}
