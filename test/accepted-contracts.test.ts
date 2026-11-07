import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckpointRequest } from "../src/kernel/checkpoints.ts";
import type { IntakeManifest } from "../src/kernel/intake.ts";
import { type Command, change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { packet, passOwner } from "./support/roles.ts";

const workflow = "workflow:1";
const human: VerifiedFacts["principal"] = { kind: "human", human: "owner", route: "local-admin" };
const host: VerifiedFacts["principal"] = { kind: "host", scope: "scheduling" };
const agent: VerifiedFacts["principal"] = {
	kind: "assignment-agent",
	assignment: "coordinator",
	generation: 1,
	attempt: "attempt:coordinator",
	role: "coordinator",
};
const catalog =
	"## Ranks\n1. `tests`\n2. `inspection`\n## Launch\nowned\n## Doctor\nnode\n## Channels\ntests\n## Catalog\n| Name | Channel | Kind | Run | Expectations | Rank |\n|---|---|---|---|---|---|\n| existing | Tests | executed | `node test.js` | existing behavior | tests |\n| discovery | Static | generated | `list` | discovery | - |\n| usability | Human | human | inspect | advisory | - |\n## Cleanup\nnone\n## Extend\nowned\n## Traps\nnone\n";
export function intakeManifest(): IntakeManifest {
	return {
		schema: 1,
		shape: "bug",
		ground: "ground:1",
		sources: ["source:1"],
		decisions: [],
		catalog: "catalog:1",
		breakdown: null,
		reproduction: { obligation: "B1", observed: 'read returned "ab"', expected: 'read returns "Ab"' },
		slices: [
			{
				id: "fix",
				title: "Fix the existing read seam",
				obligations: [
					{ id: "B1", kind: "behavior", text: "Return exact saved bytes", sources: [] },
					{ id: "A1", kind: "architecture", text: "Keep read interface", sources: [{ ref: "source:1", node: null }] },
				],
				delegated: ["Choose local names"],
				forbidden: ["Change read semantics"],
				record: false,
			},
		],
		checks: [
			{
				id: "new-read",
				row: "read-roundtrip",
				kind: "executed",
				rank: "tests",
				new: true,
				run: "node --test read.test.ts",
				expectations: "Returns literal saved bytes",
			},
		],
		mapping: [
			{ slice: "fix", obligation: "B1", checks: ["new-read"] },
			{ slice: "fix", obligation: "A1", checks: ["new-read"] },
		],
		dependencies: [],
		responses: [],
		unresolved: [],
	};
}
function role(id: string, roleName: "coordinator" | "challenger" = "coordinator"): RoleAssignment {
	return {
		id,
		workflow,
		slice: "design",
		generation: 1,
		attempt: `attempt:${id}`,
		executorEpoch: "executor",
		packet: packet({
			role: roleName,
			family: roleName === "challenger" ? "other" : "claude",
			inputs: ["ground:1", "source:1", "catalog:1"],
			requests: roleName === "coordinator" ? [{ key: "fidelity", packet: packet({ role: "challenger", family: "other" }) }] : [],
		}),
		packetRef: `packet:${id}`,
		conversation: 1,
		task: 1,
		parent: null,
		requestKey: null,
		delivery: false,
		status: "running",
		executing: true,
		executionOrdinal: 1,
		blocker: null,
		report: null,
	};
}
function fixture() {
	let state: KernelState = {
		workflow: { id: workflow, messageCount: 0 },
		document: null,
		device: null,
		roleWork: { assignments: [role("coordinator")] },
	};
	let sequence = 10;
	const inputs: NonNullable<VerifiedFacts["checkpointInputs"]> = {
		"ground:1": {
			human: true,
			document: "ground",
			text: JSON.stringify({
				schema: 1,
				shape: { value: "bug", origin: "human", confirmed: true },
				goal: "Fix read",
				constraints: [],
				clarifications: [],
				donePredicate: "Exact saved bytes",
				facts: [],
				approvedSources: ["source:1"],
				reproduction: { trigger: "node read.js Ab", observed: 'read returned "ab"' },
				expected: 'read returns "Ab"',
			}),
		},
		"source:1": { human: true, document: "existing-seam", text: "Approved read interface source at commit abc; no new seam." },
		"catalog:1": { human: true, document: "verification", text: catalog },
	};
	function command(c: Record<string, unknown>, principal = agent) {
		sequence++;
		const before = structuredClone(state);
		const d = change(state, { ...c, workflow } as Command, {
			principal,
			sequence,
			executorEpoch: "executor",
			ids: {
				fact: `fact:${sequence}`,
				assignment: `assignment:${sequence}`,
				attempt: `attempt:${sequence}`,
				revision: `revision:${sequence}`,
			},
			checkpointInputs: inputs,
		});
		assert.deepEqual(state, before, "intake transitions must not mutate inputs");
		if (d.outcome === "accepted") {
			for (const w of d.writes) {
				if (w.type === "intakes.replace") {
					state = { ...state, intakes: w.state };
					for (const doc of w.documents)
						inputs[doc.ref] = { human: principal.kind === "human", document: `intake/${doc.ref}`, text: doc.text };
				}
				if (w.type === "roles.replace") state = { ...state, roleWork: w.state };
			}
		}
		return d;
	}
	function accepted(c: Record<string, unknown>, principal = agent) {
		const d = command(c, principal);
		assert.equal(d.outcome, "accepted", JSON.stringify(d));
		if (d.outcome !== "accepted") throw new Error("unreachable");
		return d.result;
	}
	function stage(manifest = intakeManifest(), text = "Exact Contract\r\nReturn exact saved bytes.\n") {
		return accepted({ type: "stageIntake", expected: state.intakes?.drafts.at(-1)?.id ?? null, text, manifest }).intake as string;
	}
	function review(intake: string, overrides: Record<string, unknown> = {}) {
		const r = accepted({ type: "requestIntakeReview", intake, key: "fidelity" });
		const reviewer = state.roleWork!.assignments.find((a) => a.id === r.assignment)!;
		const report = `report:${sequence}`;
		state = {
			...state,
			roleWork: {
				...state.roleWork!,
				assignments: state.roleWork!.assignments.map((a) =>
					a.id === reviewer.id ? { ...a, status: "submitted", executing: false, report } : a,
				),
			},
		};
		inputs[report] = {
			human: false,
			document: "report",
			text: JSON.stringify({
				schema: 1,
				...reviewer.intakeReview,
				checks: {
					omitted: "No omission",
					weakened: "No weakening",
					strengthened: "No strengthening",
					contradictory: "No contradiction",
					invented: "No invention",
				},
				findings: [],
				...overrides,
			}),
		};
		return report;
	}
	function basis(intake: string, review: string) {
		const d = state.intakes!.drafts.find((d) => d.id === intake)!;
		return { intake, review, annotations: d.annotations, policyBinding: d.policyBinding, decisions: d.manifest.decisions };
	}
	return {
		command,
		accepted,
		stage,
		review,
		basis,
		inputs,
		get state() {
			return state;
		},
		set state(s: KernelState) {
			state = s;
		},
	};
}
function code(d: ReturnType<typeof change>) {
	return d.outcome === "refused" ? d.code : d.outcome;
}

test("I01/I12 compact intake names future executable evidence without requiring it to pass", () => {
	for (const shape of ["bug", "performance", "change"] as const) {
		const f = fixture();
		f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', JSON.stringify(shape));
		const m = intakeManifest();
		m.shape = shape;
		m.breakdown = shape === "change" ? "One bounded read seam, no new interface" : null;
		if (shape === "performance") {
			// Performance Ground retains its measured commitment; an unknown baseline/target stays an explicit question.
			const ground = JSON.parse(f.inputs["ground:1"]!.text);
			ground.performance = {
				...{ scenario: "Read", row: "read", metric: "ms", better: "lower", method: "Timed read" },
				...{ controls: ["Same host"], limitations: [], uncertainty: [], baseline: null, target: null },
			};
			f.inputs["ground:1"]!.text = JSON.stringify(ground);
			m.unresolved = [{ kind: "product", question: "What read latency is acceptable?" }];
		}
		assert.ok(f.stage(m));
	}
});

test("I02/I03 structural coverage rejects forged evidence, unknown references and unapproved architecture", () => {
	const mutations: [string, (m: IntakeManifest) => void][] = [
		["duplicate slice", (m) => m.slices.push(structuredClone(m.slices[0]!))],
		["omitted mapping", (m) => m.mapping.pop()],
		[
			"unknown obligation",
			(m) => {
				m.mapping[0]!.obligation = "B99";
			},
		],
		[
			"unknown check",
			(m) => {
				m.mapping[0]!.checks = ["missing"];
			},
		],
		[
			"unknown rank",
			(m) => {
				m.checks[0]!.rank = "live";
			},
		],
		[
			"unknown existing row",
			(m) => {
				m.checks[0]!.new = false;
			},
		],
		[
			"unapproved architecture",
			(m) => {
				m.slices[0]!.obligations[1]!.sources = [{ ref: "catalog:1", node: "invented" }];
			},
		],
		[
			"cycle",
			(m) => {
				m.dependencies = [{ slice: "fix", requires: "fix", kind: "integration" }];
			},
		],
		[
			"unknown dependency",
			(m) => {
				m.dependencies = [{ slice: "fix", requires: "ghost", kind: "record" }];
			},
		],
	];
	for (const [label, mutate] of mutations) {
		const f = fixture();
		const m = intakeManifest();
		mutate(m);
		assert.equal(code(f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m })), "invalid_content", label);
		assert.equal(f.state.intakes, undefined, label);
	}
});

for (const [kind, row, run, expectations] of [
	["generated", "discovery", "list", "discovery"],
	["human", "usability", "inspect", "advisory"],
] as const) {
	test(`I02 exact ${kind} catalog row cannot discharge behavior`, () => {
		const f = fixture();
		const m = intakeManifest();
		Object.assign(m.checks[0]!, { row, kind, rank: null, new: false, run, expectations });
		assert.deepEqual(
			f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
			{
				outcome: "refused",
				code: "invalid_content",
				reason: "Behavior requires executable/journey rows at the required project rank, not generated/human evidence.",
			},
			"non-executable exact catalog rows must not discharge behavior",
		);
		assert.equal(f.state.intakes, undefined);
		m.slices[0]!.obligations[0]!.kind = "manual";
		assert.ok(f.stage(m), "the same exact row can support non-behavioral obligations");
	});

	test(`I02 new ${kind} evidence cannot claim a proof rank`, () => {
		const f = fixture();
		const m = intakeManifest();
		m.slices[0]!.obligations[0]!.kind = "manual";
		m.checks[0]!.kind = kind;
		assert.deepEqual(
			f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
			{ outcome: "refused", code: "invalid_content", reason: "Human/generated rows cannot claim proof ranks." },
			"non-executable new evidence must not claim a proof rank",
		);
		assert.equal(f.state.intakes, undefined);
		m.checks[0]!.rank = null;
		assert.ok(f.stage(m), "removing the false rank makes non-behavioral evidence eligible");
	});
}

for (const field of ["goal", "donePredicate", "constraints", "facts"])
	test(`ES01 shortened intake refuses human Ground without ${field}`, () => {
		const f = fixture();
		const ground = JSON.parse(f.inputs["ground:1"]!.text);
		delete ground[field];
		f.inputs["ground:1"]!.text = JSON.stringify(ground);
		assert.deepEqual(
			f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: intakeManifest() }),
			{
				outcome: "refused",
				code: "invalid_content",
				reason: "Shortened intake requires human Ground with a goal, an independent done predicate, constraints and facts.",
			},
			`Ground without ${field} must not ground a commitment`,
		);
		assert.equal(f.state.intakes, undefined);
		ground[field] = field === "constraints" || field === "facts" ? [] : "Restored";
		f.inputs["ground:1"]!.text = JSON.stringify(ground);
		assert.ok(f.stage());
	});

test("I12 matching change Ground still requires a bounded breakdown", () => {
	const f = fixture();
	const m = intakeManifest();
	m.shape = "change";
	f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', '"change"');
	assert.deepEqual(
		f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
		{ outcome: "refused", code: "invalid_content", reason: "Change/design retains a bounded breakdown." },
		"matching change Ground must not waive the breakdown",
	);
	assert.equal(f.state.intakes, undefined);
	m.breakdown = "One bounded existing read seam";
	assert.ok(f.stage(m));
});

test("I03/I12 shortened intake sources require human Ground approval", () => {
	const f = fixture();
	const m = intakeManifest();
	// Keep architecture on the approved source; only the additional intake source lacks approval.
	m.sources.push("catalog:1");
	assert.deepEqual(
		f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
		{
			outcome: "refused",
			code: "invalid_content",
			reason: "Shortened intake requires applicable existing-seam sources explicitly approved in human Ground.",
		},
		"retained source bytes must not substitute for human Ground approval",
	);
	assert.equal(f.state.intakes, undefined);
	m.sources.pop();
	assert.ok(f.stage(m));
});

test("I03 node-less architecture cites an approved selected existing-seam source", () => {
	const f = fixture();
	const m = intakeManifest();
	m.slices[0]!.obligations[1]!.sources = [{ ref: "catalog:1", node: null }];
	assert.deepEqual(
		f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
		{
			outcome: "refused",
			code: "invalid_content",
			reason: "Architecture must cite actual approved nodes or approved existing-seam sources.",
		},
		"node-less architecture must not cite an unapproved source",
	);
	assert.equal(f.state.intakes, undefined);
	m.slices[0]!.obligations[1]!.sources = [{ ref: "source:1", node: null }];
	assert.ok(f.stage(m));
});

test("I04/I05/I06 only exact-basis human acceptance after fresh independent fidelity can commit", () => {
	const f = fixture();
	const intake = f.stage();
	assert.equal(code(f.command({ type: "acceptIntake", intake }, agent)), "forbidden_principal");
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(intake, "invented") }, human)), "review_required");
	const bad = f.review(intake, { findings: [{ kind: "strengthened", reason: "Invented availability obligation" }] });
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(intake, bad) }, human)), "fidelity_required");
	const next = f.stage();
	const report = f.review(next);
	const old = f.basis(next, report);
	f.accepted({ type: "saveIntakeConcern", intake: next, text: "Preserve empty input behavior" }, human);
	assert.equal(code(f.command({ type: "acceptIntake", ...old }, human)), "stale_basis", "edited intake cannot use stale fidelity");
	const fresh = f.review(next);
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(next, fresh) }, human)), "annotation_mapping_required");
	const m = intakeManifest();
	m.responses = [
		{ concern: f.state.intakes!.concerns[0]!.id, disposition: "considered", reason: "Empty input already covered", resulting: "fix/B1" },
	];
	const last = f.stage(m);
	const reviewed = f.review(last);
	const result = f.accepted({ type: "acceptIntake", ...f.basis(last, reviewed) }, human);
	assert.ok(result.acceptance);
	assert.equal(f.state.intakes!.slices[0]!.everAssigned, false);
	assert.equal(f.state.intakes!.slices[0]!.status, "accepted");
});

test("I08/I09 amendment before consumption succeeds; release never thaws a Contract", () => {
	const f = fixture();
	const intake = f.stage();
	f.accepted({ type: "acceptIntake", ...f.basis(intake, f.review(intake)) }, human);
	const original = f.state.intakes!.slices[0]!.contract;
	const amended = f.stage();
	f.accepted({ type: "amendContract", slice: "fix", expected: original, ...f.basis(amended, f.review(amended)) }, human);
	const contract = f.state.intakes!.slices[0]!.contract;
	assert.notEqual(contract, original);
	const assigned = f.accepted({ type: "assignTask", slice: "fix", delivery: true, packet: passOwner(contract) }, host);
	assert.equal(f.state.intakes!.slices[0]!.everAssigned, true);
	const a = f.state.roleWork!.assignments.find((a) => a.id === assigned.assignment)!;
	f.accepted({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, human);
	const replacement = f.stage();
	assert.equal(
		code(f.command({ type: "amendContract", slice: "fix", expected: contract, ...f.basis(replacement, f.review(replacement)) }, human)),
		"contract_frozen",
		"release must not thaw consumed Contract",
	);
	assert.equal(f.inputs[original]!.text.includes("Return exact saved bytes"), true);
});

test("I10/I11 required Record stays blocked and supersession requires explicit dependent dispositions", () => {
	const f = fixture();
	const m = intakeManifest();
	m.shape = "change";
	m.breakdown = "Record, consumer, independent";
	f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', '"change"');
	addRecord(m, "record");
	m.slices.push({ ...structuredClone(m.slices[0]!), id: "independent" });
	m.mapping.push(...structuredClone(m.mapping.filter((x) => x.slice === "fix")).map((x) => ({ ...x, slice: "independent" })));
	m.dependencies = [{ slice: "fix", requires: "record", kind: "record" }];
	const intake = f.stage(m);
	f.accepted({ type: "acceptIntake", ...f.basis(intake, f.review(intake)) }, human);
	const slices = f.state.intakes!.slices;
	assert.equal(
		code(
			f.command(
				{ type: "assignTask", slice: "fix", delivery: true, packet: packet({ inputs: [slices.find((s) => s.id === "fix")!.contract] }) },
				host,
			),
		),
		"dependency_blocked",
		"file or passing review cannot qualify Record",
	);
	assert.equal(
		code(
			f.command(
				{
					type: "assignTask",
					slice: "independent",
					delivery: true,
					packet: passOwner(slices.find((s) => s.id === "independent")!.contract),
				},
				host,
			),
		),
		"accepted",
	);
	const draft = f.stage(recordOnly("record-next"));
	const basis = f.basis(draft, f.review(draft));
	const command = {
		type: "supersedeContract",
		slice: "record",
		expected: slices.find((s) => s.id === "record")!.contract,
		...basis,
		dispositions: [],
	};
	assert.equal(code(f.command(command, human)), "dependent_disposition_required");
	f.accepted({ ...command, dispositions: [{ slice: "fix", replacement: "record-next" }] }, human);
	assert.equal(f.state.intakes!.slices.find((s) => s.id === "record")!.status, "superseded");
	assert.deepEqual(f.state.intakes!.dependencies, [{ slice: "fix", requires: "record-next", kind: "record" }]);
	for (const delivery of [true, false]) {
		assert.equal(
			code(
				f.command(
					{
						type: "assignTask",
						slice: "record",
						delivery,
						packet: packet({ inputs: [slices.find((s) => s.id === "record")!.contract] }),
					},
					host,
				),
			),
			"contract_superseded",
			"retired Contract must not become assignable even with its exact inputs",
		);
	}
	assert.equal(
		f.state.roleWork!.assignments.some((a) => a.slice === "record"),
		false,
	);
	assert.equal(
		code(
			f.command(
				{ type: "assignTask", slice: "fix", delivery: true, packet: packet({ inputs: [slices.find((s) => s.id === "fix")!.contract] }) },
				host,
			),
		),
		"dependency_blocked",
	);
});

test("I03 full design uses approved nodes and refuses Modules left behind by revised Seams", () => {
	const f = fixture();
	const m = intakeManifest();
	m.shape = "design";
	m.breakdown = "One bounded module";
	m.decisions = ["decision:seams", "decision:modules"];
	f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', '"design"');
	const checkpoints: CheckpointRequest[] = ["seams", "modules"].map((stage) => ({
		id: `checkpoint:${stage}`,
		stage: stage as "seams" | "modules",
		scope: "ground:1",
		mode: "human",
		policyBinding: "binding",
		required: { candidates: false, experiment: false },
		status: "approved",
		emission: `approved:${stage}`,
		manifest: `manifest:${stage}`,
		annotations: 0,
		reviewedAnnotations: 0,
		review: `review:${stage}`,
		approved: `approved:${stage}`,
		nonbinding: [],
		seams: stage === "modules" ? "approved:seams" : null,
		coordinator: "coordinator",
		ready: true,
		manifestValue: {
			schema: 1,
			stage: stage as "seams" | "modules",
			nodes: [
				{
					id: "N1",
					decision: "Keep read seam",
					rationale: "Local authority",
					alternatives: ["keep", "replace"],
					evidence: ["source:1"],
					classification: "judgment",
					default: "keep",
				},
			],
			decompositions: [],
			verificationStrategy: "Read tests",
			incidentalChoices: [],
			responses: [],
		},
		decision: `decision:${stage}`,
		emissions: [`approved:${stage}`],
	}));
	f.state = { ...f.state, checkpoints: { requests: checkpoints, concerns: [] } };
	for (const ref of [
		...m.decisions,
		"approved:seams",
		"approved:modules",
		"manifest:seams",
		"manifest:modules",
		"review:seams",
		"review:modules",
	])
		f.inputs[ref] = { human: true, document: "checkpoint", text: "Exact approved decision" };
	m.slices[0]!.obligations[1]!.sources = [{ ref: "approved:modules", node: "N1" }];
	const draft = f.stage(m);
	const review = f.review(draft);
	f.accepted({ type: "acceptIntake", ...f.basis(draft, review) }, human);
	f.state = {
		...f.state,
		checkpoints: {
			requests: [
				...checkpoints,
				{
					...checkpoints[0]!,
					id: "checkpoint:revised",
					approved: "approved:revised",
					emission: "approved:revised",
					decision: "decision:revised",
				},
			],
			concerns: [],
		},
	};
	m.decisions[0] = "decision:revised";
	f.inputs["decision:revised"] = { human: true, document: "checkpoint", text: "Revised Seams" };
	assert.equal(
		code(f.command({ type: "stageIntake", expected: draft, text: "Old Modules", manifest: m })),
		"invalid_content",
		"revised Seams cannot silently validate old Modules",
	);
});

test("I08 assigning an accepted Slice without the delivery bit still consumes and qualifies its Contract", () => {
	const f = fixture();
	const intake = f.stage();
	f.accepted({ type: "acceptIntake", ...f.basis(intake, f.review(intake)) }, human);
	const contract = f.state.intakes!.slices[0]!.contract;
	assert.equal(
		code(f.command({ type: "assignTask", slice: "fix", delivery: false, packet: packet({ role: "implementer", inputs: [] }) }, host)),
		"stale_basis",
		"delivery false cannot bypass an accepted Contract",
	);
	f.accepted({ type: "assignTask", slice: "fix", delivery: false, packet: passOwner(contract) }, host);
	assert.equal(f.state.intakes!.slices[0]!.everAssigned, true, "every accepted Slice assignment consumes its obligations");
});

test("F3 active non-delivery Slice assignments block dependency edits and supersession until release", () => {
	const f = fixture();
	const m = intakeManifest();
	m.shape = "change";
	m.breakdown = "Two existing-seam changes";
	f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', '"change"');
	m.slices.push({ ...structuredClone(m.slices[0]!), id: "other" });
	m.mapping.push(...structuredClone(m.mapping).map((x) => ({ ...x, slice: "other" })));
	const draft = f.stage(m);
	f.accepted({ type: "acceptIntake", ...f.basis(draft, f.review(draft)) }, human);
	const contract = f.state.intakes!.slices[0]!.contract;
	const assigned = f.accepted({ type: "assignTask", slice: "fix", delivery: false, packet: passOwner(contract) }, host);
	assert.equal(
		code(
			f.command(
				{
					type: "amendDependencies",
					expected: f.state.intakes!.revision,
					dependencies: [{ slice: "fix", requires: "other", kind: "integration" }],
					reason: "Change order",
				},
				human,
			),
		),
		"ownership_conflict",
		"non-delivery assignment still holds accepted Slice work",
	);
	const nextManifest = intakeManifest();
	nextManifest.shape = "change";
	nextManifest.breakdown = "Replacement";
	nextManifest.slices[0]!.id = "replacement";
	nextManifest.mapping.forEach((x) => {
		x.slice = "replacement";
	});
	const next = f.stage(nextManifest);
	const command = { type: "supersedeContract", slice: "fix", expected: contract, ...f.basis(next, f.review(next)), dispositions: [] };
	assert.equal(code(f.command(command, human)), "ownership_conflict", "supersession cannot race an active non-delivery assignment");
	const a = f.state.roleWork!.assignments.find((a) => a.id === assigned.assignment)!;
	f.accepted({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, human);
	assert.equal(code(f.command(command, human)), "ownership_conflict", "fencing alone cannot claim quiescence");
	const fenced = f.state.roleWork!.assignments.find((a) => a.id === assigned.assignment)!;
	f.accepted(
		{
			type: "recordQuiescence",
			assignment: fenced.id,
			generation: fenced.generation,
			attempt: fenced.attempt,
			providerIdle: true,
			environment: "absent",
			effects: "reconciled",
		},
		host,
	);
	f.accepted(command, human);
	assert.equal(f.state.intakes!.slices.find((s) => s.id === "fix")!.everAssigned, true);
	assert.equal(f.state.intakes!.slices.find((s) => s.id === "fix")!.status, "superseded");
});

test("I08 intake cannot retroactively authorize a previously assigned Slice identity", () => {
	const f = fixture();
	f.accepted({ type: "assignTask", slice: "fix", delivery: false, packet: packet() }, host);
	const intake = f.stage();
	assert.equal(
		code(f.command({ type: "acceptIntake", ...f.basis(intake, f.review(intake)) }, human)),
		"contract_frozen",
		"existing assignment cannot be erased by initial intake acceptance",
	);
});

test("I13 device scope and current coordinator authority precede intake mutation", () => {
	const f = fixture();
	const intake = f.stage();
	const review = f.review(intake);
	assert.equal(
		code(
			f.command(
				{ type: "acceptIntake", ...f.basis(intake, review) },
				{ kind: "human", human: "owner", route: "device", device: "other", workflows: [] },
			),
		),
		"forbidden_scope",
	);
	assert.equal(
		code(f.command({ type: "stageIntake", expected: intake, text: "Forged", manifest: intakeManifest() }, { ...agent, generation: 9 })),
		"stale_assignment",
	);
});

test("I06 unresolved decisions and unconfirmed Ground cannot be waived by a clean report", () => {
	const f = fixture();
	const m = intakeManifest();
	m.unresolved = [{ kind: "technical", question: "New write seam?" }];
	const draft = f.stage(m);
	const report = f.review(draft);
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(draft, report) }, human)), "decision_required");
	const unconfirmed = fixture();
	unconfirmed.inputs["ground:1"]!.text = unconfirmed.inputs["ground:1"]!.text.replace(
		'"human","confirmed":true',
		'"classifier","confirmed":false',
	);
	assert.equal(
		code(unconfirmed.command({ type: "stageIntake", expected: null, text: "Contract", manifest: intakeManifest() })),
		"invalid_content",
	);
});

test("I10 human dependency amendments require exact basis, eligible endpoints and an acyclic graph", () => {
	const f = fixture();
	const m = intakeManifest();
	m.shape = "change";
	m.breakdown = "Two bounded independent changes";
	f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', '"change"');
	m.slices.push({ ...structuredClone(m.slices[0]!), id: "other" });
	m.mapping.push(...structuredClone(m.mapping).map((x) => ({ ...x, slice: "other" })));
	const draft = f.stage(m);
	f.accepted({ type: "acceptIntake", ...f.basis(draft, f.review(draft)) }, human);
	const dependencies = [{ slice: "fix", requires: "other", kind: "integration" }];
	const c = { type: "amendDependencies", expected: f.state.intakes!.revision, dependencies, reason: "Human directs order" };
	assert.equal(code(f.command(c, agent)), "forbidden_principal");
	f.accepted(c, human);
	assert.equal(code(f.command(c, human)), "stale_basis");
	assert.equal(
		code(
			f.command(
				{
					...c,
					expected: f.state.intakes!.revision,
					dependencies: [...dependencies, { slice: "other", requires: "fix", kind: "integration" }],
				},
				human,
			),
		),
		"invalid_content",
	);
});

test("V1 both acceptance/assignment/amendment orderings preserve permanent consumption", () => {
	const base = fixture();
	const intake = base.stage();
	base.accepted({ type: "acceptIntake", ...base.basis(intake, base.review(intake)) }, human);
	const contract = base.state.intakes!.slices[0]!.contract;
	const next = base.stage();
	const basis = base.basis(next, base.review(next));
	for (const assignmentFirst of [false, true]) {
		const f = fixture();
		f.state = structuredClone(base.state);
		Object.assign(f.inputs, base.inputs);
		const commands: { principal: VerifiedFacts["principal"]; command: Record<string, unknown> }[] = [
			{ principal: human, command: { type: "amendContract", slice: "fix", expected: contract, ...basis } },
			{ principal: host, command: { type: "assignTask", slice: "fix", delivery: true, packet: passOwner(contract) } },
		];
		if (assignmentFirst) commands.reverse();
		const first = f.command(commands[0]!.command, commands[0]!.principal);
		const second = f.command(commands[1]!.command, commands[1]!.principal);
		assert.equal(code(first), "accepted");
		assert.equal(code(second), assignmentFirst ? "contract_frozen" : "stale_basis");
	}
});

/** A bounded Record Slice: one explicit ADR output citing the human-approved existing-seam source. */
function addRecord(m: IntakeManifest, id: string) {
	m.slices.push({
		id,
		title: `Record ${id}`,
		record: true,
		delegated: [],
		forbidden: [],
		obligations: [
			{
				id: "R1",
				kind: "record",
				output: "adr",
				text: "Record the retained read seam decision",
				sources: [{ ref: "source:1", node: null }],
			},
		],
	});
	m.mapping.push({ slice: id, obligation: "R1", checks: ["new-read"] });
}
/** A change intake holding only the named Record Slices. */
function recordOnly(...ids: string[]) {
	const m = intakeManifest();
	m.shape = "change";
	m.breakdown = `Record ${ids.join(", ")}`;
	m.slices = [];
	m.mapping = [];
	for (const id of ids) addRecord(m, id);
	return m;
}
function changeFixture() {
	const f = fixture();
	f.inputs["ground:1"]!.text = f.inputs["ground:1"]!.text.replace('"bug"', '"change"');
	return f;
}

test("RB01 a Record Slice holds only explicit, approved-basis ADR/principle/design obligations", () => {
	assert.ok(changeFixture().stage(recordOnly("record")), "the bounded Record Slice itself stages");
	const mutations: [string, (m: IntakeManifest) => void][] = [
		[
			"Record Slice with a behavior obligation",
			(m) => m.slices[0]!.obligations.push({ id: "B9", kind: "behavior", text: "Code", sources: [] }),
		],
		[
			"record obligation outside a Record Slice",
			(m) => {
				m.slices[0]!.record = false;
			},
		],
		[
			"unbounded output kind",
			(m) => {
				(m.slices[0]!.obligations[0] as { output: string }).output = "readme";
			},
		],
		[
			"no fidelity basis",
			(m) => {
				m.slices[0]!.obligations[0]!.sources = [];
			},
		],
		[
			"unapproved basis",
			(m) => {
				m.slices[0]!.obligations[0]!.sources = [{ ref: "catalog:1", node: null }];
			},
		],
	];
	for (const [label, mutate] of mutations) {
		const f = changeFixture();
		const m = recordOnly("record");
		m.mapping[0]!.checks = ["new-read"];
		if (label === "Record Slice with a behavior obligation") m.mapping.push({ slice: "record", obligation: "B9", checks: ["new-read"] });
		mutate(m);
		assert.equal(code(f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m })), "invalid_content", label);
		assert.equal(f.state.intakes?.drafts.length ?? 0, 0, `${label}: no draft`);
	}
});

test("RB02/RB05 human acceptance binds the Record outputs and their fidelity review; agents cannot accept or humans assign", () => {
	const f = changeFixture();
	const intake = f.stage(recordOnly("record"));
	const review = f.review(intake);
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(intake, review) }, agent)), "forbidden_principal");
	f.accepted({ type: "acceptIntake", ...f.basis(intake, review) }, human);
	const slice = f.state.intakes!.slices[0]!;
	assert.equal((slice as { review?: string }).review, review, "the accepted Slice names its fidelity review");
	const contract = JSON.parse(f.inputs[slice.contract]!.text);
	assert.equal(contract.review, review);
	assert.deepEqual(contract.obligations.obligations, [
		{ id: "R1", kind: "record", output: "adr", text: "Record the retained read seam decision", sources: [{ ref: "source:1", node: null }] },
	]);
	assert.equal(
		code(
			f.command(
				{
					type: "assignTask",
					slice: "record",
					delivery: true,
					packet: passOwner(slice.contract, { inputs: [slice.contract, review, "source:1"] }),
				},
				human,
			),
		),
		"forbidden_principal",
	);
});

test("RB09/RB10 retiring Record work keeps partial delivery visible and never silently clears its consumer", () => {
	const f = changeFixture();
	const m = recordOnly("record-a", "record-b");
	m.slices.unshift(structuredClone(intakeManifest().slices[0]!));
	m.mapping.unshift(...intakeManifest().mapping);
	m.dependencies = [
		{ slice: "fix", requires: "record-a", kind: "record" },
		{ slice: "fix", requires: "record-b", kind: "record" },
	];
	const intake = f.stage(m);
	f.accepted({ type: "acceptIntake", ...f.basis(intake, f.review(intake)) }, human);
	const contractOf = (id: string) => f.state.intakes!.slices.find((s) => s.id === id)!.contract;
	const a = contractOf("record-a");
	const qualifiedPass = {
		ref: `pass:${workflow}:record-a:1`,
		workflow,
		slice: "record-a",
		contract: a,
		handoff: { record: "implementation-handoff:1", source: "source:a", integrations: [{ status: "qualified" }] },
	};
	f.state = { ...f.state, roleWork: { ...f.state.roleWork!, passes: [qualifiedPass] as never } };
	const assignFix = () => {
		const d = f.command({ type: "assignTask", slice: "fix", delivery: true, packet: passOwner(contractOf("fix")) }, host);
		return d.outcome === "refused" ? `${d.code}: ${d.reason}` : d.outcome;
	};
	assert.match(assignFix(), /^dependency_blocked: Required record of record-b /, "only some Record obligations qualified");
	const retire = (slice: string, replacement: string, dispositions: { slice: string; replacement: string }[]) => {
		const draft = f.stage(recordOnly(replacement));
		return f.command(
			{ type: "supersedeContract", slice, expected: contractOf(slice), ...f.basis(draft, f.review(draft)), dispositions },
			human,
		);
	};
	assert.equal(code(retire("record-b", "record-b2", [])), "dependent_disposition_required");
	const accepted = retire("record-b", "record-b2", [{ slice: "fix", replacement: "record-b2" }]);
	assert.equal(code(accepted), "accepted");
	assert.equal(f.state.intakes!.slices.find((s) => s.id === "record-b")!.status, "superseded");
	assert.match(assignFix(), /^dependency_blocked: Required record of record-b2 /, "outstanding consumer stays blocked");
	const acceptance = accepted.outcome === "accepted" ? String(accepted.result.acceptance) : "";
	assert.deepEqual(JSON.parse(f.inputs[acceptance]!.text).command.dispositions, [{ slice: "fix", replacement: "record-b2" }]);
	assert.equal(code(retire("record-a", "record-a2", [{ slice: "fix", replacement: "record-a2" }])), "accepted");
	assert.equal(f.state.intakes!.slices.find((s) => s.id === "record-a")!.status, "superseded", "retired, not completed");
	assert.deepEqual(f.state.roleWork!.passes, [qualifiedPass], "the partial delivery stays retained");
	assert.match(assignFix(), /^dependency_blocked: Required record of record-a2 /, "a retired qualification does not clear the replacement");
});

const ground = (f: ReturnType<typeof fixture>) => JSON.parse(f.inputs["ground:1"]!.text) as Record<string, unknown>;
const setGround = (f: ReturnType<typeof fixture>, g: Record<string, unknown>) => {
	f.inputs["ground:1"]!.text = JSON.stringify(g);
};
const refusedWith = (reason: string) => ({ outcome: "refused", code: "invalid_content", reason });

test("BJ01/BJ02 a human-supplied bug shape needs no confirmation; a classifier proposal does", () => {
	const human = fixture();
	setGround(human, { ...ground(human), shape: { value: "bug", origin: "human", confirmed: false } });
	assert.ok(human.stage(), "a human-supplied bug shape must not need redundant confirmation");
	const classified = fixture();
	setGround(classified, { ...ground(classified), shape: { value: "bug", origin: "classifier", confirmed: false } });
	assert.deepEqual(
		classified.command({ type: "stageIntake", expected: null, text: "Contract", manifest: intakeManifest() }),
		refusedWith("Use exact human Ground with a confirmed matching task shape."),
		"an unconfirmed classifier bug shape must not become consent",
	);
});

test("BJ03 bug Ground retains the reproduction and an independent expected correction", () => {
	const gaps: [string, (g: Record<string, unknown>) => void][] = [
		["no reproduction", (g) => delete g.reproduction],
		["no trigger", (g) => (g.reproduction = { observed: 'read returned "ab"' })],
		["no observed", (g) => (g.reproduction = { trigger: "node read.js Ab" })],
		["no expected", (g) => delete g.expected],
	];
	for (const [label, mutate] of gaps) {
		const f = fixture();
		const g = ground(f);
		mutate(g);
		setGround(f, g);
		assert.deepEqual(
			f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: intakeManifest() }),
			refusedWith(
				"Bug intake needs human Ground with the reproduction trigger, observed wrong behavior and independent expected correction.",
			),
			`bug Ground with ${label} must not reach intake`,
		);
		assert.equal(f.state.intakes, undefined);
	}
});

test("BJ04 bug intake carries Ground's reproduction verbatim as one behavior obligation", () => {
	const mutations: [string, (m: IntakeManifest) => void][] = [
		["no reproduction", (m) => delete m.reproduction],
		["weakened observed", (m) => (m.reproduction!.observed = "read is wrong")],
		["invented expected", (m) => (m.reproduction!.expected = 'read returns "AB"')],
		["architecture obligation", (m) => (m.reproduction!.obligation = "A1")],
		["unknown obligation", (m) => (m.reproduction!.obligation = "B9")],
	];
	for (const [label, mutate] of mutations) {
		const f = fixture();
		const m = intakeManifest();
		mutate(m);
		assert.deepEqual(
			f.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
			refusedWith("Bug intake carries human Ground's observed wrong behavior and expected correction verbatim as one behavior obligation."),
			`bug intake with ${label} must not stand in for the reproduction`,
		);
	}
});

test("BJ05 compact bug intake: one Slice, no Seams/Modules, still fresh fidelity and human acceptance", () => {
	const two = fixture();
	const m = intakeManifest();
	m.slices.push({ ...structuredClone(m.slices[0]!), id: "fix-2" });
	m.mapping.push({ slice: "fix-2", obligation: "B1", checks: ["new-read"] }, { slice: "fix-2", obligation: "A1", checks: ["new-read"] });
	assert.deepEqual(
		two.command({ type: "stageIntake", expected: null, text: "Contract", manifest: m }),
		refusedWith("Compact bug/performance intake has one bounded Slice."),
	);
	const f = fixture();
	const intake = f.stage();
	assert.deepEqual(f.state.intakes!.drafts[0]!.manifest.decisions, [], "no Seams/Modules decision is required");
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(intake, "report:none") }, human)), "review_required");
	const report = f.review(intake);
	assert.equal(code(f.command({ type: "acceptIntake", ...f.basis(intake, report) }, agent)), "forbidden_principal");
	f.accepted({ type: "acceptIntake", ...f.basis(intake, report) }, human);
	assert.equal(f.state.intakes!.slices[0]!.status, "accepted");
});
