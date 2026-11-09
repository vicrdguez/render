// V1: deterministic pure-Kernel edge cases of Watchdog rounds on one handed-off pass. An independent oracle counts accepted
// verdict submissions and decides from the accepted rules (spec §6.4) whether automatic rework may open: never after
// Needs Human, only while completed reviews < limit, and a valid pass is never refused by the cap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, change, type KernelState, type Principal, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { CatalogEvidence } from "../src/kernel/verification.ts";
import { assessment, capture, selection } from "./support/implementation.ts";
import { decision } from "./support/kernel.ts";
import { packet } from "./support/roles.ts";

const host: Principal = { kind: "host", scope: "scheduling" };
const effects: Principal = { kind: "host", scope: "effects" };
const human: Principal = { kind: "human", human: "owner", route: "local-admin" };
const workflow = "workflow:watchdog";
const contract = "contract:accepted";
const S = "a".repeat(40);
const EMPTY = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const V = "b".repeat(64);
const review = (role: "audit-standards" | "audit-contracts" | "watchdog") =>
	packet({ role, family: "review", requiredFamily: "review", inputs: [contract] });
const writer = packet({
	role: "implementer",
	execution: "linux-writer",
	inputs: [contract],
	verification: selection(contract),
	requests: [
		{ key: "standards", packet: review("audit-standards") },
		{ key: "contracts", packet: review("audit-contracts") },
		{ key: "watchdog", packet: review("watchdog") },
	],
});
type Step = "pass" | "rework" | "needs-human" | "duplicate" | "adopt";
type Coverage = { opened: number; stopped: number; passAboveCap: number; limits: Set<number> };

function run(schedule: { limit: number; steps: Step[] }, coverage?: Coverage): string | undefined {
	try {
		let state: KernelState = {
			workflow: { id: workflow, messageCount: 0 },
			document: null,
			device: null,
			roleWork: { assignments: [] },
			policy: {
				defaultRevision: "policy:initial",
				revisions: {
					"policy:initial": { completedReviewLimit: schedule.limit, reviewerDiversity: "different-family", minimumEvidenceRank: null },
				},
				bindings: {},
			},
			intakes: {
				revision: "acceptance:1",
				drafts: [],
				concerns: [],
				dependencies: [],
				slices: [
					{
						id: "slice",
						contract,
						intake: "intake:1",
						acceptance: "acceptance:1",
						everAssigned: false,
						review: "review:fixture",
						status: "accepted",
						record: false,
						predecessors: [],
					},
				],
			},
		};
		let sequence = 0;
		let source: ReturnType<typeof capture> | undefined;
		const texts: Record<string, string> = {};
		let evidence: CatalogEvidence[] = [];
		function command(c: Record<string, unknown>, principal: Principal = host, expected = "accepted") {
			sequence++;
			const input = { ...c, workflow } as Command;
			const facts = {
				principal,
				sequence,
				executorEpoch: "executor:1",
				implementationSource: source,
				// Only the commands that read retained bytes receive them, keeping each schedule cheap.
				...(["requestWatchdogReview", "openSuccessorPass"].includes(String(c.type))
					? {
							checkpointInputs: Object.fromEntries(
								Object.entries(texts).map(([ref, text]) => [ref, { text, human: false, document: ref }]),
							),
						}
					: {}),
				...(c.type === "submitRoleResult" ? { verificationEvidence: evidence } : {}),
				ids: {
					fact: `fact:${sequence}`,
					assignment: `assignment:${sequence}`,
					attempt: `attempt:${sequence}`,
					revision: `revision:${sequence}`,
				},
			};
			const before = JSON.stringify([state, input, facts]);
			const d = decision(change(state, input, facts as unknown as VerifiedFacts));
			assert.equal(JSON.stringify([state, input, facts]), before, "Kernel mutated input");
			assert.equal(d.outcome, expected, `${String(c.type)}: ${JSON.stringify(d)}`);
			if (d.outcome === "refused") {
				assert.ok(!("writes" in d), "refusal cannot write");
				return { code: d.code } as Record<string, unknown>;
			}
			for (const write of d.writes) {
				if (write.type === "roles.replace") state = { ...state, roleWork: write.state };
				if (write.type === "intakes.replace") state = { ...state, intakes: write.state };
				if (write.type === "policy.replace") state = { ...state, policy: write.state };
			}
			return d.result as Record<string, unknown>;
		}
		const own = (id: string) => state.roleWork!.assignments.find((a) => a.id === id)!;
		const agent = (id: string): Principal => {
			const a = own(id);
			return { kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role };
		};
		const start = (id: string) => {
			const a = own(id);
			command({ type: "stageTask", assignment: a.id, generation: a.generation, attempt: a.attempt, executorEpoch: "executor:1" });
			return agent(id);
		};
		// One handed-off pass with its own paired Audit.
		const owner = command({ type: "assignTask", slice: "slice", delivery: true, packet: writer }).assignment as string;
		const actor = start(owner);
		const retain = (kind: "audit" | "final") => {
			source = capture(own(owner), "executor:1", contract);
			command(
				{
					type: "recordImplementationSource",
					assignment: owner,
					generation: 1,
					attempt: own(owner).attempt,
					kind,
					text: JSON.stringify(source),
				},
				effects,
			);
		};
		retain("audit");
		command({ type: "requestImplementationAudit" }, actor);
		for (const child of state.roleWork!.assignments.filter((a) => a.parent === owner)) {
			const reviewer = start(child.id);
			command(
				{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...child.auditReview, findings: [] }), supports: [] },
				reviewer,
			);
		}
		retain("final");
		command({ type: "submitImplementationHandoff", text: "done", dispositions: [], verification: assessment }, actor);
		command({
			type: "recordQuiescence",
			assignment: owner,
			generation: 1,
			attempt: own(owner).attempt,
			providerIdle: true,
			environment: "stopped",
			effects: "reconciled",
		});
		const pass = () => state.roleWork!.passes![0]!;
		const basis = () => {
			const binding = state.policy!.bindings[workflow] ?? { revision: `${workflow}:policy:initial`, policy: "policy:initial" };
			return {
				binding: binding.revision,
				revision: binding.policy,
				minimumEvidenceRank: state.policy!.revisions[binding.policy]!.minimumEvidenceRank,
			};
		};
		let limit = schedule.limit;
		let count = 0;
		let stopped = false;
		let round = 0;
		let last: { id: string; text: string; verification: unknown } | undefined;
		for (const step of schedule.steps) {
			if (step === "adopt") {
				const changed = command(
					{
						type: "changePolicy",
						expectedRevision: state.policy!.defaultRevision,
						policy: { completedReviewLimit: limit + 2, reviewerDiversity: "different-family", minimumEvidenceRank: null },
					},
					human,
				);
				command({ type: "adoptPolicy", revision: changed.policy, expectedBinding: basis().binding }, human);
				limit += 2;
				continue;
			}
			if (step === "duplicate") {
				if (last)
					command({ type: "submitRoleResult", text: last.text, supports: [], verification: last.verification }, agent(last.id), "refused");
				assert.equal(state.roleWork!.assignments.filter((a) => a.packet.role === "watchdog" && a.status === "submitted").length, count);
				continue;
			}
			// A drift round: a newly checked X/T under the same handed-off pass, then its own launched review.
			round++;
			const X = round.toString(16).padStart(40, "e");
			const T = round.toString(16).padStart(40, "c");
			const record = JSON.stringify({
				schema: 1,
				passRef: pass().ref,
				handoff: pass().handoff!.record,
				source: pass().handoff!.source,
				attempt: (pass().handoff!.preparations?.length ?? 0) + 1,
				target: { proposal: workflow, ref: "refs/render/proposals/x", commit: T },
				outcome: "checked",
				reason: null,
				preparation: {
					kind: "clean",
					algorithm: "git-merge-tree-write-tree-z/v1",
					profile: "render-trusted-git/v1",
					git: "git version 2.50.0",
					identity: "f".repeat(64),
					base: S,
					source: S,
					target: T,
					result: X,
					tree: EMPTY,
					conflicts: [],
					exitCode: 0,
					stdout: "",
					stderr: "",
				},
				checks: {
					verifierRevision: V,
					scope: { assignment: owner, generation: 1, attempt: "p", executorEpoch: "executor:1" },
					catalog: { selection: {}, rows: [] },
					results: [],
					cleanup: { status: "complete", results: [] },
					verification: { status: "passed", inputCommit: X, inputTree: EMPTY, resultTree: EMPTY },
					failed: [],
				},
				policy: basis(),
			});
			const o = own(owner);
			const preparation = command(
				{ type: "recordPreparation", assignment: owner, generation: o.generation, attempt: o.attempt, text: record },
				effects,
			).preparation as string;
			texts[preparation] = record;
			const id = command(
				{ type: "requestWatchdogReview", assignment: owner, generation: o.generation, attempt: o.attempt, preparation, target: T },
				effects,
			).assignment as string;
			const reviewer = start(id);
			const w = own(id);
			const selected = { ...selection(contract), commit: X, digest: V };
			const receipt: CatalogEvidence & { scope: unknown } = {
				kind: "catalog-check",
				role: "watchdog",
				scope: { assignment: id, generation: w.generation, attempt: w.attempt, executorEpoch: "executor:1" },
				catalog: {
					selection: selected,
					text: "catalog",
					ranks: ["tests", "inspection"],
					sections: {},
					rows: selected.rows.map((name) => ({
						name,
						channel: "Tests",
						kind: "executed",
						run: "true",
						expectations: "e",
						rank: "tests",
						literal: name,
					})),
					cleanup: [],
				},
				results: selected.rows.map((name) => ({
					name,
					status: "completed",
					steps: [
						{
							argv: ["true"],
							exitCode: 0,
							stdout: "",
							stderr: "",
							platform: { os: "linux", cpu: "owned" },
							image: "owned",
							timedOut: false,
							verifierRevision: V,
						},
					],
				})),
				verification: { status: "needs_assessment", inputCommit: X, inputTree: EMPTY, resultTree: EMPTY },
				cleanup: { status: "complete", results: [] },
			};
			const checks = JSON.stringify({
				schema: 1,
				source: { repository: "owned", objectFormat: "sha1", commit: X, tree: EMPTY, root: `refs/render/sources/${X}`, entries: [] },
				evidence: receipt,
			});
			command({ type: "recordReviewChecks", assignment: id, generation: w.generation, attempt: w.attempt, text: checks }, effects);
			evidence = [receipt];
			const b = own(id).watchdogReview!;
			const text = JSON.stringify({
				schema: 1,
				verdict: step,
				passRef: b.passRef,
				handoff: b.handoff,
				source: b.source,
				prepared: X,
				target: T,
			});
			const verification =
				step === "pass" ? { outcome: "pass", rank: "tests", reason: "own checks" } : { outcome: "non-pass", rank: null, reason: "rework" };
			const submitted = command({ type: "submitRoleResult", text, supports: [], verification }, reviewer);
			count++;
			assert.equal(submitted.reviews, count, "every completed round counts exactly once");
			texts[submitted.report as string] = text;
			last = { id, text, verification };
			command({
				type: "recordQuiescence",
				assignment: id,
				generation: 1,
				attempt: w.attempt,
				providerIdle: true,
				environment: "absent",
				effects: "reconciled",
			});
			if (step === "needs-human") stopped = true;
			if (step === "pass") {
				if (count > limit && coverage) coverage.passAboveCap++;
				continue;
			}
			// Independent oracle for the automatic return after a non-pass verdict on this handoff: any Needs Human on it
			// stops for good; otherwise only completed reviews below the current limit permit rework.
			const allowed = step === "rework" && !stopped && count < limit;
			const observation = JSON.stringify({
				schema: 1,
				cause: "watchdog-rework",
				repository: "owned",
				source: pass().handoff!.source,
				sourceCommit: S,
				baseCommit: S,
				targetCommit: T,
				preparedCommit: X,
				review: id,
				report: submitted.report,
			});
			const before = state.roleWork!.passes!.length;
			const opened = command(
				{ type: "openSuccessorPass", assignment: owner, generation: o.generation, attempt: o.attempt, text: observation },
				effects,
				allowed ? "accepted" : "refused",
			);
			if (!allowed) {
				assert.equal(opened.code, "human_direction_required");
				assert.equal(state.roleWork!.passes!.length, before);
				if (coverage) coverage.stopped++;
				continue;
			}
			assert.equal(state.roleWork!.passes!.length, before + 1);
			assert.equal(state.roleWork!.assignments.filter((a) => a.packet.role === "watchdog" && a.status === "submitted").length, count);
			if (coverage) coverage.opened++;
			return undefined;
		}
		return undefined;
	} catch (error) {
		return String(error);
	}
}

test("V1 Watchdog rounds: counts never reset, Needs Human stops, the cap stops rework but never a valid pass", () => {
	const scenarios: [description: string, limit: number, steps: Step[]][] = [
		["zero cap refuses immediate rework and its duplicate", 0, ["rework", "duplicate"]],
		["first rework reaches the cap of one", 1, ["rework"]],
		["first rework is immediately below the default cap", 2, ["rework"]],
		["first rework is below the cap of three", 3, ["rework"]],
		["immediate Needs Human at zero cap", 0, ["needs-human"]],
		["immediate Needs Human at cap one", 1, ["needs-human"]],
		["Needs Human alone stops below the default cap", 2, ["needs-human"]],
		["Needs Human below cap three refuses a duplicate but permits a pass", 3, ["needs-human", "duplicate", "pass"]],
		["duplicate before any submission leaves zero count and four passes exceed zero cap", 0, ["duplicate", "pass", "pass", "pass", "pass"]],
		["four passes succeed above cap one", 1, ["pass", "pass", "pass", "pass"]],
		["duplicate pass does not count and further passes exceed the default cap", 2, ["pass", "duplicate", "pass", "pass", "pass"]],
		["four passes succeed above cap three", 3, ["pass", "pass", "pass", "pass"]],
		["one pass puts rework immediately below cap three", 3, ["pass", "rework"]],
		["one pass puts rework at the default cap", 2, ["pass", "rework"]],
		["two passes put rework at cap three", 3, ["pass", "pass", "rework"]],
		["adoption raises zero cap enough to permit rework", 0, ["adopt", "rework"]],
		["both adoptions are needed to permit the third review's rework", 0, ["adopt", "adopt", "pass", "pass", "rework"]],
		["Needs Human still decides after adoption with room below the new cap", 3, ["needs-human", "adopt", "rework"]],
		["adoption permits late rework after two passes", 2, ["pass", "pass", "adopt", "rework"]],
		["adoption preserves the count so late rework reaches the new cap", 2, ["pass", "pass", "adopt", "pass", "rework"]],
	];
	const coverage: Coverage = { opened: 0, stopped: 0, passAboveCap: 0, limits: new Set() };
	for (const [description, limit, steps] of scenarios) {
		coverage.limits.add(limit);
		assert.equal(run({ limit, steps }, coverage), undefined, `${description}: limit ${limit}, steps ${steps.join(", ")}`);
	}
	assert.deepEqual(coverage.limits, new Set([0, 1, 2, 3]), "limits 0, default 2 and either side are exercised");
	assert.ok(coverage.opened > 0, "eligible rework opens a successor");
	assert.ok(coverage.stopped > 0, "Needs Human or the cap stops automatic rework");
	assert.ok(coverage.passAboveCap > 0, "valid passes succeed above the cap");
	console.log(
		JSON.stringify({ measure: "watchdog_schedule_paths", schedules: scenarios.length, ...coverage, limits: [...coverage.limits] }),
	);
});
