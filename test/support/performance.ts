// Literal performance-journey material at the Ledger seam: human Ground, trusted catalog receipts with measured
// stdout and a scripted Watchdog round. Fixture data for authority/comparison checks, never evidence a model judged.
import type { IntakeManifest, Intakes } from "../../src/kernel/intake.ts";
import type { ImplementationPass, RoleAssignment } from "../../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { accepted, assessment, capture, LedgerOnlyEngine } from "./implementation.ts";
import { admin, allowSameFamily, packet, roleFixture, selection } from "./roles.ts";
import { checkedRecord, EMPTY, V, verdictText, watched } from "./watchdog.ts";

const effects = mintContext({ kind: "host", scope: "effects" });
export const S = "a".repeat(40);
export const T0 = "c".repeat(40);
export const X1 = "e".repeat(40);
const literal = (name: string, run: string, expectations: string) =>
	`| ${name} | Tests | executed | \`${run}\` | ${expectations} | tests |`;
export const ROWS: Record<string, string> = {
	"full-suite": literal("full-suite", "npm test", "all tests"),
	typecheck: literal("typecheck", "tsc", "clean"),
	lint: literal("lint", "biome check", "clean"),
	read: literal("read", "node read.js", "exact bytes"),
	bench: literal("bench", "node bench.js", "p95 of five warm reads of 10,000 documents"),
};
export type Run = {
	role?: string;
	commit?: string;
	contract?: string;
	value?: number;
	literals?: Record<string, string>;
	omit?: readonly string[];
	failed?: readonly string[];
	cpu?: string;
	image?: string;
	scope?: Record<string, unknown>;
};
/** A catalog-check receipt as the Engine retains it: exact rows, actual commands and the bench row's measured stdout. */
export function evidence(o: Run = {}) {
	const commit = o.commit ?? S;
	const names = Object.keys(ROWS).filter((n) => !o.omit?.includes(n));
	const rows = names.map((name) => {
		const line = o.literals?.[name] ?? ROWS[name]!;
		const run = /`([^`]+)`/.exec(line)![1]!;
		return { name, channel: "Tests", kind: "executed", run, expectations: line.split("|")[5]!.trim(), rank: "tests", literal: line };
	});
	return {
		kind: "catalog-check",
		role: o.role ?? "coordinator",
		...(o.scope ? { scope: o.scope } : {}),
		catalog: {
			selection: { ...selection(o.contract ?? "none"), commit, digest: V, rows: names, behavioralRows: ["read"] },
			text: "literal selected catalog",
			ranks: ["tests", "inspection"],
			sections: {},
			rows,
			cleanup: [],
		},
		results: rows.map((row) => ({
			name: row.name,
			status: o.failed?.includes(row.name) ? "failed" : "completed",
			steps: [
				{
					argv: ["sh", "-c", row.run],
					exitCode: o.failed?.includes(row.name) ? 1 : 0,
					stdout: row.name === "bench" ? `warming\n${JSON.stringify({ p95_ms: o.value ?? 200, runs: 5 })}\n` : "",
					stderr: "",
					platform: { os: "linux", cpu: o.cpu ?? "owned" },
					image: o.image ?? "owned",
					timedOut: false,
					verifierRevision: V,
				},
			],
		})),
		verification: { status: "needs_assessment", inputCommit: commit, inputTree: EMPTY, resultTree: EMPTY },
		cleanup: { status: "complete", results: [] },
	};
}
export type Performance = {
	scenario: string;
	row: string;
	metric: string;
	better: "lower" | "higher";
	method: string;
	controls: string[];
	limitations: string[];
	uncertainty: string[];
	baseline: string | null;
	target: number | null;
};

export async function performanceFixture() {
	const f = await roleFixture(new LedgerOnlyEngine());
	await allowSameFamily(f.ledger);
	const assignments = () => (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
	const own = (id: string) => assignments().find((a) => a.id === id)!;
	const agent = (a: RoleAssignment) =>
		mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
	const start = async (id: string) => {
		const a = own(id);
		accepted(
			await f.command({
				type: "stageTask",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				executorEpoch: f.ledger.status().executorEpoch,
			}),
		);
		return agent(own(id));
	};
	const quiesce = async (id: string) => {
		const a = own(id);
		accepted(
			await f.command({
				type: "recordQuiescence",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				providerIdle: true,
				environment: "absent",
				effects: "reconciled",
			}),
		);
	};
	const current: Record<string, string | null> = {};
	let n = 0;
	const save = async (document: string, text: string) => {
		const revision = accepted(
			await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: `performance-fixture:${++n}`,
					workflow: "workflow:2",
					expected: { document: current[document] ?? null },
					command: { type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
				},
				admin,
			),
		).revision as string;
		current[document] = revision;
		return revision;
	};
	const source = await save("existing-seam", "Approved existing seam: the read path.");
	const catalog = await save(
		"verification",
		`## Ranks\n1. \`tests\`\n2. \`inspection\`\n## Launch\nowned\n## Doctor\nnode\n## Channels\ntests\n## Catalog\n| Name | Channel | Kind | Run | Expectations | Rank |\n|---|---|---|---|---|---|\n${Object.values(ROWS).join("\n")}\n## Cleanup\nnone\n## Extend\nowned\n## Traps\nnone\n`,
	);
	/** A host-recorded catalog run on actual source S: the baseline measurement Ground can cite. */
	const measure = async (run: Run = {}) => {
		const id = accepted(await f.command({ type: "assignTask", slice: `baseline-${++n}`, delivery: false, packet: packet() }))
			.assignment as string;
		await start(id);
		const a = own(id);
		return accepted(
			await f.command(
				{
					type: "recordRunnerObservation",
					assignment: id,
					generation: a.generation,
					attempt: a.attempt,
					text: JSON.stringify(evidence({ ...run, scope: { assignment: id, generation: 1, attempt: a.attempt } })),
				},
				effects,
			),
		).report as string;
	};
	const baseline = await measure();
	const performance = (over: Partial<Performance> = {}): Performance => ({
		scenario: "Read 10,000 saved documents",
		row: "bench",
		metric: "p95_ms",
		better: "lower",
		method: "bench prints p95 over five warm runs",
		controls: ["Same container image and CPU", "Same 10,000-document fixture"],
		limitations: ["One owned Linux host"],
		uncertainty: ["Run-to-run variance unmeasured"],
		baseline,
		target: 180,
		...over,
	});
	const ground = (over: Partial<Performance> = {}, shape = { origin: "human", confirmed: true }, sources = [source, baseline]) =>
		save(
			"ground",
			JSON.stringify({
				schema: 1,
				shape: { value: "performance", ...shape },
				goal: "Reading saved documents is faster",
				constraints: [],
				clarifications: [],
				donePredicate: "Measured p95 meets the human target with unchanged behavior",
				approvedSources: sources,
				performance: performance(over),
			}),
		);
	const manifest = (groundRef: string, over: Partial<IntakeManifest> = {}): IntakeManifest => ({
		schema: 1,
		shape: "performance",
		ground: groundRef,
		sources: [source, baseline],
		decisions: [],
		catalog,
		breakdown: null,
		slices: [
			{
				id: "read-fast",
				title: "Make read faster",
				record: false,
				delegated: ["Internal data structures"],
				forbidden: ["New interface", "Changed read semantics"],
				obligations: [
					{ id: "B1", kind: "behavior", text: "p95 read meets the target with identical bytes", sources: [] },
					{ id: "A1", kind: "architecture", text: "Retain the read seam", sources: [{ ref: source, node: null }] },
				],
			},
		],
		checks: [
			{
				id: "bench",
				row: "bench",
				kind: "executed",
				rank: "tests",
				new: false,
				run: "node bench.js",
				expectations: "p95 of five warm reads of 10,000 documents",
			},
			{ id: "read", row: "read", kind: "executed", rank: "tests", new: false, run: "node read.js", expectations: "exact bytes" },
		],
		mapping: [
			{ slice: "read-fast", obligation: "B1", checks: ["bench", "read"] },
			{ slice: "read-fast", obligation: "A1", checks: ["read"] },
		],
		dependencies: [],
		responses: [],
		unresolved: [],
		...over,
	});
	const coordinator = async (inputs: string[]) => {
		const id = accepted(
			await f.command({
				type: "assignTask",
				slice: "design",
				delivery: false,
				packet: packet({ inputs, requests: [{ key: "fidelity", packet: packet({ role: "challenger" }) }] }),
			}),
		).assignment as string;
		return { id, actor: await start(id) };
	};
	let staged = 0;
	const stage = (actor: ReturnType<typeof agent>, m: IntakeManifest, expected: string | null = null) =>
		f.command(
			{ type: "stageIntake", expected, text: "# Contract\nMake read faster without changing bytes.\n", manifest: m },
			actor,
			`stage:${++staged}`,
		);
	const intakes = () => ((f.ledger.snapshot(admin) as Frame).workflows as { intakes: Intakes }[])[0]!.intakes;
	const review = async (actor: ReturnType<typeof agent>, intake: string) => {
		const id = accepted(await f.command({ type: "requestIntakeReview", intake, key: "fidelity" }, actor)).assignment as string;
		const reviewer = await start(id);
		return accepted(
			await f.command(
				{
					type: "submitRoleResult",
					text: JSON.stringify({
						schema: 1,
						...own(id).intakeReview,
						checks: {
							omitted: "Compared",
							weakened: "Compared",
							strengthened: "Compared",
							contradictory: "Compared",
							invented: "Compared",
						},
						findings: [],
					}),
					supports: [],
				},
				reviewer,
			),
		).report as string;
	};
	const accept = (intake: string, report: string, context = admin) => {
		const draft = intakes().drafts.find((d) => d.id === intake)!;
		return f.command(
			{ type: "acceptIntake", intake, review: report, annotations: draft.annotations, policyBinding: draft.policyBinding, decisions: [] },
			context,
		);
	};
	/** Real intake → fidelity → human acceptance of the compact performance Contract. */
	const accepted_ = async () => {
		const g = await ground();
		const c = await coordinator([g, source, catalog, baseline]);
		const intake = accepted(await stage(c.actor, manifest(g))).intake as string;
		const report = await review(c.actor, intake);
		accepted(await accept(intake, report));
		accepted(await f.command({ type: "submitRoleResult", text: "Intake accepted.", supports: [] }, c.actor));
		await quiesce(c.id);
		for (const a of assignments().filter((a) => a.intakeReview)) await quiesce(a.id);
		return { ground: g, intake, contract: intakes().slices[0]!.contract };
	};
	/** P1 of the accepted Slice handed off with its own Audit; the implementer's B evidence has no bench measurement. */
	const handedOff = async (contract: string) => {
		const id = accepted(
			await f.command({
				type: "assignTask",
				slice: "read-fast",
				delivery: true,
				packet: packet({ role: "implementer", execution: "linux-writer", inputs: [contract], ...watched(contract) }),
			}),
		).assignment as string;
		const actor = await start(id);
		const retain = async (kind: "audit" | "final") =>
			accepted(
				await f.command(
					{
						type: "recordImplementationSource",
						assignment: id,
						generation: 1,
						attempt: own(id).attempt,
						kind,
						text: JSON.stringify(capture(own(id), f.ledger.status().executorEpoch, contract)),
					},
					effects,
				),
			);
		await retain("audit");
		accepted(await f.command({ type: "requestImplementationAudit" }, actor, "perf-audit"));
		for (const child of assignments().filter((a) => a.parent === id)) {
			const principal = await start(child.id);
			accepted(
				await f.command(
					{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...child.auditReview, findings: [] }), supports: [] },
					principal,
				),
			);
			await quiesce(child.id);
		}
		await retain("final");
		accepted(
			await f.command(
				{ type: "submitImplementationHandoff", text: "Faster read handoff", dispositions: [], verification: assessment },
				actor,
				"perf-handoff",
			),
		);
		await quiesce(id);
		return id;
	};
	const t = { f, contract: "" } as unknown as Parameters<typeof checkedRecord>[0];
	/** Host launch of the Watchdog round on checked X1/T0 and its own retained receipt on X1. */
	const round = async (owner: string, run: Run) => {
		const o = own(owner);
		const p = ((f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[]).find((x) => x.ref === o.passRef)!;
		const preparation = accepted(
			await f.command(
				{
					type: "recordPreparation",
					assignment: o.id,
					generation: o.generation,
					attempt: o.attempt,
					text: checkedRecord(t, p, { target: T0, X: X1, base: S, source: S }),
				},
				effects,
			),
		).preparation as string;
		const id = accepted(
			await f.command(
				{ type: "requestWatchdogReview", assignment: o.id, generation: o.generation, attempt: o.attempt, preparation, target: T0 },
				effects,
			),
		).assignment as string;
		const actor = await start(id);
		const w = own(id);
		const receipt = evidence({
			...run,
			role: "watchdog",
			commit: X1,
			contract: p.contract,
			scope: { assignment: id, generation: w.generation, attempt: w.attempt, executorEpoch: f.ledger.status().executorEpoch },
		});
		accepted(
			await f.command(
				{
					type: "recordReviewChecks",
					assignment: id,
					generation: 1,
					attempt: w.attempt,
					text: JSON.stringify({
						schema: 1,
						source: { repository: "owned", objectFormat: "sha1", commit: X1, tree: EMPTY, root: `refs/render/sources/${X1}`, entries: [] },
						evidence: receipt,
					}),
				},
				effects,
			),
		);
		const submit = (verdict: "pass" | "rework" | "needs-human"): Promise<CommandReply> =>
			f.command(
				{
					type: "submitRoleResult",
					text: verdictText(own(id), verdict),
					supports: [],
					verification:
						verdict === "pass"
							? { outcome: "pass", rank: "tests", reason: "Own X checks and measurement." }
							: { outcome: "non-pass", rank: null, reason: "Performance comparison does not pass." },
				},
				actor,
			);
		return { id, submit };
	};
	return {
		f,
		source,
		catalog,
		baseline,
		measure,
		save,
		ground,
		performance,
		manifest,
		coordinator,
		stage,
		review,
		accept,
		intakes,
		agent,
		own,
		accepted: accepted_,
		handedOff,
		round,
		close: () => f.close(),
	};
}
