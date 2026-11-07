// V1 (CI21): seeded pure-Kernel schedules of autonomous proposal integration. Two handed-off Slices of one proposal
// (`a`, `c`) with passing Watchdog rounds, plus `b` depending on `a` by an integration edge and `d` depending on the
// Record Slice `c` by a Record edge. Random interleavings of stage, admission, cancellation, executor restarts,
// canonical-ref observations, re-preparation, saved Record documents and dependent assignment are checked against an
// independent oracle written from the Contract rules (integration B1–B5, record-baseline B2), not from Kernel code.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, change, type KernelState, type Principal, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { CatalogEvidence } from "../src/kernel/verification.ts";
import { assessment, capture, selection } from "./support/implementation.ts";
import { seeded } from "./support/random.ts";
import { packet } from "./support/roles.ts";

const host: Principal = { kind: "host", scope: "scheduling" };
const effects: Principal = { kind: "host", scope: "effects" };
const human: Principal = { kind: "human", human: "owner", route: "local-admin" };
const workflow = "workflow:integration";
const REF = "refs/render/proposals/x";
const S = "a".repeat(40);
const EMPTY = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const V = "b".repeat(64);
const contracts = { a: "contract:a", b: "contract:b", c: "contract:c", d: "contract:d" } as const;
/** Record Slice `c`'s fidelity basis: its acceptance review and the approved source its one ADR output cites. */
const recordBasis = ["review:fixture", "source:c"];
type Slice = "a" | "c";
const review = (role: "audit-standards" | "audit-contracts" | "watchdog", contract: string) =>
	packet({ role, family: "review", requiredFamily: "review", inputs: [contract] });
const writer = (contract: string) =>
	packet({
		role: "implementer",
		execution: "linux-writer",
		inputs: contract === contracts.c ? [contract, ...recordBasis] : [contract],
		verification: selection(contract),
		requests: [
			{ key: "standards", packet: review("audit-standards", contract) },
			{ key: "contracts", packet: review("audit-contracts", contract) },
			{ key: "watchdog", packet: review("watchdog", contract) },
		],
	});
const STEPS = [
	"stage",
	"admit",
	"cancel",
	"applied",
	"refused",
	"reconcileT",
	"reconcileOther",
	"lock",
	"restart",
	"reprepare",
	"dependent",
	"document",
	"recordDependent",
] as const;
type Step = (typeof STEPS)[number];
function generate(seed: number): { slice: Slice; step: Step }[] {
	const random = seeded(seed);
	return Array.from({ length: 14 }, () => ({
		slice: random() < 0.65 ? "a" : "c",
		step: STEPS[Math.floor(random() * STEPS.length)] as Step,
	}));
}
type Coverage = Record<string, number>;
function freeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) freeze(child);
	}
	return value;
}
const accepted = (slice: { id: string; contract: string }) => ({
	...slice,
	intake: "intake:1",
	acceptance: "acceptance:1",
	everAssigned: false,
	review: "review:fixture",
	status: "accepted" as const,
	record: slice.id === "c",
	predecessors: [],
});

type Round = { review: string; preparation: string; report: string; X: string; T: string };
type Base = {
	state: KernelState;
	sequence: number;
	sources: Partial<Record<Slice, ReturnType<typeof capture>>>;
	texts: Record<string, string>;
	evidence: CatalogEvidence[];
	owners: Record<Slice, string>;
	rounds: number;
	round: Record<Slice, Round>;
};
/** The two handed-off passes and their first passing rounds are identical in every schedule: built once, then cloned. */
let base: Base | undefined;
function run(schedule: { slice: Slice; step: Step }[], coverage: Coverage): string | undefined {
	try {
		let state: KernelState = {
			workflow: { id: workflow, messageCount: 0 },
			document: null,
			device: null,
			roleWork: { assignments: [] },
			policy: {
				defaultRevision: "policy:initial",
				revisions: { "policy:initial": { completedReviewLimit: 2, reviewerDiversity: "different-family", minimumEvidenceRank: null } },
				bindings: {},
			},
			intakes: {
				revision: "acceptance:1",
				drafts: [
					{
						id: "intake:1",
						manifest: {
							slices: [
								{
									id: "c",
									obligations: [{ id: "R1", kind: "record", output: "adr", text: "Record", sources: [{ ref: "source:c", node: null }] }],
								},
							],
						},
					} as never,
				],
				concerns: [],
				dependencies: [
					{ slice: "b", requires: "a", kind: "integration" },
					{ slice: "d", requires: "c", kind: "record" },
				],
				slices: (["a", "b", "c", "d"] as const).map((id) => accepted({ id, contract: contracts[id] })),
			},
		};
		let sequence = 0;
		let epoch = 1;
		let sources: Partial<Record<Slice, ReturnType<typeof capture>>> = {};
		let current: Slice = "a";
		let texts: Record<string, string> = {};
		let evidence: CatalogEvidence[] = [];
		function command(c: Record<string, unknown>, principal: Principal, expected?: "accepted" | "refused") {
			sequence++;
			const input = { ...c, workflow } as Command;
			const facts = {
				principal,
				sequence,
				executorEpoch: `executor:${epoch}`,
				implementationSource: sources[current],
				// Only the commands that read retained bytes receive them, keeping each schedule cheap.
				...(["stageOperation", "admitEffect", "recordIntegration", "requestWatchdogReview"].includes(String(c.type))
					? {
							checkpointInputs: Object.fromEntries(
								Object.entries(texts).map(([ref, text]) => [ref, { text, human: false, document: ref }]),
							),
						}
					: {}),
				...(c.type === "submitRoleResult" ? { verificationEvidence: evidence } : {}),
				...(c.type === "saveDocument" ? { content: { digest: "d".repeat(64), byteLength: 9, validUtf8: true } } : {}),
				ids: {
					fact: `fact:${sequence}`,
					assignment: `assignment:${sequence}`,
					attempt: `attempt:${sequence}`,
					revision: `revision:${sequence}`,
				},
			};
			// Deeply frozen inputs: any Kernel write to state, command or facts throws instead of passing silently.
			let decision: ReturnType<typeof change>;
			try {
				decision = change(freeze(state), freeze(input), freeze(facts) as unknown as VerifiedFacts);
			} catch (error) {
				if (error instanceof TypeError && /read only|not extensible|frozen/.test(error.message))
					assert.fail(`Kernel mutated input: ${error}`);
				throw error;
			}
			if (expected) assert.equal(decision.outcome, expected, `${String(c.type)}: ${JSON.stringify(decision)}`);
			if (decision.outcome === "refused") {
				assert.ok(!("writes" in decision), "refusal cannot write");
				return { refused: decision.code } as Record<string, unknown>;
			}
			for (const write of decision.writes) {
				if (write.type === "roles.replace") state = { ...state, roleWork: write.state };
				if (write.type === "intakes.replace") state = { ...state, intakes: write.state };
			}
			return decision.result as Record<string, unknown>;
		}
		const own = (id: string) => state.roleWork!.assignments.find((a) => a.id === id)!;
		const agent = (id: string): Principal => {
			const a = own(id);
			return { kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role };
		};
		const start = (id: string) => {
			const a = own(id);
			command(
				{ type: "stageTask", assignment: a.id, generation: a.generation, attempt: a.attempt, executorEpoch: `executor:${epoch}` },
				host,
				"accepted",
			);
			return agent(id);
		};
		const basis = () => {
			const binding = state.policy!.bindings[workflow] ?? { revision: `${workflow}:policy:initial`, policy: "policy:initial" };
			return { binding: binding.revision, revision: binding.policy, minimumEvidenceRank: null };
		};
		let owners = {} as Record<Slice, string>;
		const pass = (slice: Slice) => state.roleWork!.passes!.findLast((p) => p.slice === slice)!;
		function handOff(slice: Slice) {
			current = slice;
			const contract = contracts[slice];
			const owner = command({ type: "assignTask", slice, delivery: true, packet: writer(contract) }, host, "accepted").assignment as string;
			owners[slice] = owner;
			const actor = start(owner);
			const retain = (kind: "audit" | "final") => {
				sources[slice] = capture(own(owner), `executor:${epoch}`, contract);
				const text = JSON.stringify(sources[slice]);
				const o = own(owner);
				command(
					{ type: "recordImplementationSource", assignment: owner, generation: 1, attempt: o.attempt, kind, text },
					effects,
					"accepted",
				);
			};
			retain("audit");
			command({ type: "requestImplementationAudit" }, actor, "accepted");
			for (const child of state.roleWork!.assignments.filter((a) => a.parent === owner)) {
				command(
					{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...child.auditReview, findings: [] }), supports: [] },
					start(child.id),
					"accepted",
				);
				command(
					{
						type: "recordQuiescence",
						assignment: child.id,
						generation: 1,
						attempt: child.attempt,
						providerIdle: true,
						environment: "absent",
						effects: "reconciled",
					},
					host,
					"accepted",
				);
			}
			retain("final");
			command({ type: "submitImplementationHandoff", text: "done", dispositions: [], verification: assessment }, actor, "accepted");
			command(
				{
					type: "recordQuiescence",
					assignment: owner,
					generation: 1,
					attempt: own(owner).attempt,
					providerIdle: true,
					environment: "stopped",
					effects: "reconciled",
				},
				host,
				"accepted",
			);
		}
		let rounds = 0;
		/** A newly checked X/T on the slice's handoff and its passing launched round. */
		function passingRound(slice: Slice): Round | undefined {
			current = slice;
			rounds++;
			const X = rounds.toString(16).padStart(40, "e");
			const T = rounds.toString(16).padStart(40, "c");
			const p = pass(slice);
			const record = JSON.stringify({
				schema: 1,
				passRef: p.ref,
				handoff: p.handoff!.record,
				source: p.handoff!.source,
				attempt: (p.handoff!.preparations?.length ?? 0) + 1,
				target: { proposal: workflow, ref: REF, commit: T },
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
					scope: { assignment: owners[slice], generation: 1, attempt: "p", executorEpoch: "executor:1" },
					catalog: { selection: {}, rows: [] },
					results: [],
					cleanup: { status: "complete", results: [] },
					verification: { status: "passed", inputCommit: X, inputTree: EMPTY, resultTree: EMPTY },
					failed: [],
				},
				policy: basis(),
			});
			const o = own(owners[slice]);
			const prepared = command(
				{ type: "recordPreparation", assignment: o.id, generation: o.generation, attempt: o.attempt, text: record },
				effects,
			);
			if (prepared.refused) return undefined;
			const preparation = prepared.preparation as string;
			texts[preparation] = record;
			const id = command(
				{ type: "requestWatchdogReview", assignment: o.id, generation: o.generation, attempt: o.attempt, preparation, target: T },
				effects,
				"accepted",
			).assignment as string;
			const reviewer = start(id);
			const w = own(id);
			const selected = { ...selection(contracts[slice]), commit: X, digest: V };
			const receipt: CatalogEvidence & { scope: unknown } = {
				kind: "catalog-check",
				role: "watchdog",
				scope: { assignment: id, generation: w.generation, attempt: w.attempt, executorEpoch: `executor:${epoch}` },
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
			command(
				{ type: "recordReviewChecks", assignment: id, generation: w.generation, attempt: w.attempt, text: checks },
				effects,
				"accepted",
			);
			evidence = [receipt];
			const text = JSON.stringify({
				schema: 1,
				verdict: "pass",
				passRef: p.ref,
				handoff: p.handoff!.record,
				source: p.handoff!.source,
				prepared: X,
				target: T,
			});
			const report = command(
				{ type: "submitRoleResult", text, supports: [], verification: { outcome: "pass", rank: "tests", reason: "own checks" } },
				reviewer,
				"accepted",
			).report as string;
			texts[report] = text;
			command(
				{
					type: "recordQuiescence",
					assignment: id,
					generation: 1,
					attempt: w.attempt,
					providerIdle: true,
					environment: "absent",
					effects: "reconciled",
				},
				host,
				"accepted",
			);
			return { review: id, preparation, report, X, T };
		}
		const assignRecordConsumer = (expected: "accepted" | "refused") =>
			command({ type: "assignTask", slice: "d", delivery: true, packet: writer(contracts.d) }, host, expected);
		if (!base) {
			handOff("a");
			handOff("c");
			assert.equal(assignRecordConsumer("refused").refused, "dependency_blocked", "fidelity-only: Record Audit and handoff");
			const round = { a: passingRound("a")!, c: passingRound("c")! };
			assert.equal(assignRecordConsumer("refused").refused, "dependency_blocked", "Watchdog-only: Record review passed");
			base = freeze(structuredClone({ state, sequence, sources, texts, evidence, owners, rounds, round }));
		}
		({ state, sequence, sources, evidence, owners, rounds } = base);
		texts = { ...base.texts };
		// Oracle state, maintained only from accepted commands and the Contract rules.
		type Op = { operation: string; preparation: string; status: string; attempts: { id: string; epoch: number; resolved: boolean }[] };
		const o = {
			round: { ...base.round },
			ops: { a: [] as Op[], c: [] as Op[] } as Record<Slice, Op[]>,
			canceled: { a: false, c: false } as Record<Slice, boolean>,
			qualified: { a: 0, c: 0 } as Record<Slice, number>,
			staleFor: { a: new Set<string>(), c: new Set<string>() } as Record<Slice, Set<string>>,
			dependentAssigned: false,
			recordDependentAssigned: false,
			documents: 0,
		};
		const latest = (slice: Slice) => o.ops[slice].at(-1);
		const unresolved = (slice: Slice) => ["admitted", "divergent"].includes(latest(slice)?.status ?? "");
		const other = (slice: Slice): Slice => (slice === "a" ? "c" : "a");
		for (const { slice, step } of schedule) {
			current = slice;
			const owner = own(owners[slice]);
			const op = latest(slice);
			const r = o.round[slice];
			if (step === "restart") {
				epoch++;
				continue;
			}
			if (step === "stage") {
				const intent = JSON.stringify({
					schema: 1,
					kind: "proposal-integration",
					proposal: workflow,
					ref: REF,
					slice,
					contract: contracts[slice],
					passRef: pass(slice).ref,
					handoff: pass(slice).handoff!.record,
					source: pass(slice).handoff!.source,
					captureA: pass(slice).captureA,
					audit: pass(slice).audit!.record,
					reports: [pass(slice).audit!.results.standards!.report, pass(slice).audit!.results.contracts!.report],
					preparation: r.preparation,
					prepared: r.X,
					tree: EMPTY,
					target: r.T,
					review: r.review,
					report: r.report,
					result: { commit: r.X.replace(/^e/, "9"), tree: EMPTY, parent: r.T, message: "Render proposal integration\n" },
					policy: basis(),
					assignment: owner.id,
					generation: owner.generation,
					attempt: owner.attempt,
					unresolved: [],
				});
				const allowed =
					!o.canceled[slice] &&
					!o.qualified[slice] &&
					!unresolved(other(slice)) &&
					!o.staleFor[slice].has(r.preparation) &&
					!o.ops[slice].some((x) => x.status !== "stale" && x.preparation === r.preparation);
				const result = command(
					{ type: "stageOperation", assignment: owner.id, generation: owner.generation, attempt: owner.attempt, text: intent },
					effects,
					allowed ? "accepted" : "refused",
				);
				if (allowed) {
					texts[result.operation as string] = intent;
					o.ops[slice].push({ operation: result.operation as string, preparation: r.preparation, status: "planned", attempts: [] });
					coverage.staged = (coverage.staged ?? 0) + 1;
				}
				continue;
			}
			if (step === "admit") {
				if (!op) continue;
				// Admission rechecks current eligibility: the operation must still name the handoff's latest checked X.
				const allowed =
					!o.canceled[slice] &&
					["planned", "unapplied"].includes(op.status) &&
					op.preparation === r.preparation &&
					!unresolved(other(slice));
				const result = command(
					{ type: "admitEffect", assignment: owner.id, generation: owner.generation, attempt: owner.attempt, operation: op.operation },
					effects,
					allowed ? "accepted" : "refused",
				);
				if (allowed) {
					assert.equal(result.executorEpoch, `executor:${epoch}`, "admission binds the current epoch");
					op.status = "admitted";
					op.attempts.push({ id: result.integrationAttempt as string, epoch, resolved: false });
					coverage.admitted = (coverage.admitted ?? 0) + 1;
				} else if (o.canceled[slice] && ["planned", "unapplied"].includes(op.status))
					coverage.canceledFirst = (coverage.canceledFirst ?? 0) + 1;
				continue;
			}
			if (step === "cancel") {
				const allowed = !o.canceled[slice] && !o.qualified[slice];
				command(
					{ type: "cancelWork", assignment: owner.id, generation: owner.generation, attempt: owner.attempt },
					human,
					allowed ? "accepted" : "refused",
				);
				if (allowed) o.canceled[slice] = true;
				continue;
			}
			if (step === "reprepare") {
				if (o.canceled[slice] || o.qualified[slice] || unresolved(slice) || op?.status === "planned") continue;
				const next = passingRound(slice);
				if (next) o.round[slice] = next;
				continue;
			}
			if (step === "document") {
				command(
					{ type: "saveDocument", document: `docs/adr/${++o.documents}.md`, mediaType: "text/markdown", expected: null },
					human,
					"accepted",
				);
				continue;
			}
			if (step === "recordDependent") {
				if (o.recordDependentAssigned) continue;
				current = "c";
				// Only recorded qualification of the Record Slice releases its consumer: no document, review or intent does.
				const allowed = o.qualified.c === 1;
				const result = assignRecordConsumer(allowed ? "accepted" : "refused");
				if (allowed) {
					o.recordDependentAssigned = true;
					coverage.recordDependent = (coverage.recordDependent ?? 0) + 1;
				} else {
					assert.equal(result.refused, "dependency_blocked", "Record consumer blocked before qualification");
					if (o.documents) coverage.recordBlockedAfterDocument = (coverage.recordBlockedAfterDocument ?? 0) + 1;
					if (latest("c")) coverage.recordBlockedAfterIntent = (coverage.recordBlockedAfterIntent ?? 0) + 1;
				}
				continue;
			}
			if (step === "dependent") {
				if (o.dependentAssigned) continue;
				current = "a";
				const allowed = o.qualified.a === 1;
				command({ type: "assignTask", slice: "b", delivery: true, packet: writer(contracts.b) }, host, allowed ? "accepted" : "refused");
				if (allowed) {
					o.dependentAssigned = true;
					coverage.dependent = (coverage.dependent ?? 0) + 1;
				}
				continue;
			}
			// Canonical-ref observations of the latest attempt.
			const attempt = op?.attempts.at(-1);
			const R = r.X.replace(/^e/, "9");
			const intentText = op ? texts[op.operation]! : "";
			const pinned = op ? (JSON.parse(intentText) as { target: string; result: { commit: string } }) : undefined;
			const mode = step === "applied" || step === "refused" ? "dispatch" : "reconcile";
			const observed =
				step === "applied"
					? { commit: pinned?.result.commit ?? R, tree: EMPTY, parents: [pinned?.target ?? r.T] }
					: step === "reconcileT"
						? { commit: pinned?.target ?? r.T, tree: EMPTY, parents: [S] }
						: { commit: "7".repeat(40), tree: EMPTY, parents: [pinned?.target ?? r.T] };
			const open = !!op && ["admitted", "divergent"].includes(op.status) && !!attempt && !attempt.resolved;
			const sameEpoch = attempt?.epoch === epoch;
			// Expected outcome from the Contract's three explicit outcomes; dispatch facts only from the dispatching epoch.
			let expected: string | undefined;
			if (open && mode === "dispatch" && !sameEpoch) expected = undefined;
			else if (open && step === "lock") expected = "divergent";
			else if (open && step === "applied") expected = "applied";
			else if (open && step === "refused") expected = "stale";
			else if (open && step === "reconcileT") expected = "unapplied";
			else if (open && step === "reconcileOther") expected = "divergent";
			const text = JSON.stringify({
				schema: 1,
				operation: op?.operation ?? "none",
				attempt: attempt?.id ?? "none",
				mode,
				dispatch: step === "applied" ? "applied" : step === "refused" ? "refused" : null,
				ref: REF,
				observed,
				lock: step === "lock",
			});
			const result = command(
				{
					type: "recordIntegration",
					assignment: owner.id,
					generation: owner.generation,
					attempt: owner.attempt,
					operation: op?.operation ?? "none",
					text,
				},
				effects,
				expected ? "accepted" : "refused",
			);
			if (!expected) continue;
			assert.equal(result.outcome, expected, `${step} outcome`);
			coverage[expected] = (coverage[expected] ?? 0) + 1;
			if (expected === "divergent") op!.status = "divergent";
			else {
				attempt!.resolved = true;
				op!.status = expected === "applied" ? "qualified" : expected;
				if (expected === "applied") o.qualified[slice]++;
				if (expected === "stale") o.staleFor[slice].add(r.preparation);
			}
		}
		// Invariants over the final Kernel state.
		for (const slice of ["a", "c"] as const) {
			const integrations = (pass(slice).handoff as { integrations?: { status: string }[] }).integrations ?? [];
			const qualified = integrations.filter((i) => i.status === "qualified").length;
			assert.ok(qualified <= 1, "at most one qualification per handoff");
			assert.equal(qualified, o.qualified[slice], "qualification only from an applied observation of an admitted attempt");
		}
		return undefined;
	} catch (error) {
		return String(error);
	}
}

test("V1 seeded integration schedules: no grant, one qualification, cancellation and serialization order, integration and Record dependents only after qualification", () => {
	const base = Number(process.env.RENDER_V1_SEED ?? 0x1c4a);
	const count = Number(process.env.RENDER_V1_SCHEDULES ?? 10_000);
	const coverage: Coverage = {};
	for (let n = 0; n < count; n++) {
		const seed = base + n;
		const failure = run(generate(seed), coverage);
		if (failure) assert.fail(`seed ${seed}: ${failure}\nreplay: RENDER_V1_SEED=${seed} RENDER_V1_SCHEDULES=1`);
	}
	if (count >= 1000)
		for (const path of [
			"staged",
			"admitted",
			"canceledFirst",
			"applied",
			"stale",
			"unapplied",
			"divergent",
			"dependent",
			"recordDependent",
			"recordBlockedAfterDocument",
			"recordBlockedAfterIntent",
		])
			assert.ok((coverage[path] ?? 0) > 0, `schedules exercise ${path}`);
	console.log(JSON.stringify({ measure: "integration_schedule_paths", schedules: count, ...coverage }));
});
