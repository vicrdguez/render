import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { Checkpoints, Manifest } from "../src/kernel/checkpoints.ts";
import { change, type KernelState } from "../src/kernel/kernel.ts";
import type { RoleAssignment, RolePacket } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { until } from "./support/investigation.ts";
import { decision } from "./support/kernel.ts";
import { admin, allowSameFamily, packet, roleFixture } from "./support/roles.ts";

function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}
const code = (r: CommandReply) => (r.status === "accepted" ? "accepted" : r.code);
const actor = (a: RoleAssignment) =>
	mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
const answer = (name: string) =>
	JSON.stringify({
		schema: 1,
		answer: name,
		assumptions: ["One writer"],
		consequences: ["Separate legality from execution"],
		incidentalChoices: ["Worker count remains undecided"],
	});
const manifest: Manifest = {
	schema: 1,
	stage: "seams",
	nodes: [
		{
			id: "N1",
			decision: "Separate authority",
			rationale: "Local legality",
			alternatives: ["combined", "separate"],
			evidence: ["revision:3"],
			classification: "judgment",
			default: "separate",
		},
	],
	decompositions: [
		{
			id: "combined",
			modules: ["Runner"],
			dependencies: ["storage"],
			verificationSeams: ["run"],
			depth: "one interface",
			locality: "coupled",
			deletion: "loses boundary",
		},
		{
			id: "separate",
			modules: ["Authority", "Runner"],
			dependencies: ["storage"],
			verificationSeams: ["change", "run"],
			depth: "hide storage",
			locality: "distinct reasons",
			deletion: "spreads legality",
		},
	],
	verificationStrategy: "Pure legality and real storage",
	incidentalChoices: ["Worker count"],
	responses: [],
};
async function fixture(direction = true, change?: (packets: RolePacket[]) => void) {
	const provider = fauxProvider({
		provider: "anthropic",
		api: "anthropic-messages",
		models: [{ id: "claude-sonnet-4-6", reasoning: true }],
	});
	const gate = Promise.withResolvers<void>();
	const prompts: string[] = [];
	provider.setResponses(
		Array.from({ length: 30 }, () => async (context, options) => {
			prompts.push(JSON.stringify(context.messages));
			const canceled = Promise.withResolvers<void>();
			const abort = () => canceled.resolve();
			options?.signal?.addEventListener("abort", abort, { once: true });
			if (options?.signal?.aborted) abort();
			try {
				await Promise.race([gate.promise, canceled.promise]);
			} finally {
				options?.signal?.removeEventListener("abort", abort);
			}
			return fauxAssistantMessage("stopped");
		}),
	);
	const engine = new Engine({ provider: provider.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } });
	const f = await roleFixture(engine);
	if (direction) await allowSameFamily(f.ledger);
	let seq = 0;
	async function save(document: string, text: string) {
		return accepted(
			await Effect.runPromise(
				f.ledger.command(
					{
						version: 1,
						authorityEpoch: f.ledger.status().authorityEpoch,
						commandId: `doc:${++seq}`,
						workflow: "workflow:2",
						expected: { document: null },
						command: { type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
					},
					admin,
				),
			),
		).revision as string;
	}
	const ground = await save("ground", "Choose the authority interface. Constraint: retain exact history.");
	const left = await save("left", "Optimize for a compact interface. LEFT-INPUT");
	const right = await save("right", "Optimize for independent verification. RIGHT-INPUT");
	const favored = await save("favored", "COORDINATOR-FAVORED-ANSWER");
	const packets = [left, right].map((instructions) => packet({ role: "candidate", inputs: [ground], instructions, maxTurns: 20 }));
	change?.(packets);
	const assignments = () => (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
	accepted(
		await f.command({
			type: "assignTask",
			slice: "design",
			delivery: false,
			packet: packet({
				inputs: [ground, favored],
				maxTurns: 20,
				requests: [
					...packets.map((packet, i) => ({ key: `candidate-${i}`, packet })),
					{ key: "challenge", packet: packet({ role: "challenger" }) },
				],
			}),
		}),
	);
	await until(() => assignments()[0]?.status === "running");
	const parent = assignments()[0]!;
	const cmd = (c: Record<string, unknown>, a = parent) => f.command(c, actor(a));
	const request = () =>
		cmd({ type: "requestCheckpoint", stage: "seams", scope: ground, required: { candidates: true, experiment: false } });
	const start = async (request: string, i: number) => {
		const id = accepted(await cmd({ type: "requestRole", key: `candidate-${i}`, request })).assignment;
		await until(() => assignments().find((a) => a.id === id)?.status === "running");
		return assignments().find((a) => a.id === id)!;
	};
	return {
		f,
		engine,
		ground,
		left,
		right,
		favored,
		packets,
		parent,
		assignments,
		prompts,
		release: () => gate.resolve(),
		cmd,
		request,
		start,
		stage: (request: string, reports: string[] = []) =>
			cmd({
				type: "stageCheckpoint",
				request,
				text: "# Synthesized seams\nSeparate authority and execution.",
				manifest: { ...manifest, nodes: [{ ...manifest.nodes[0], evidence: [ground, ...reports] }] },
			}),
		close: async () => {
			gate.resolve();
			await f.close();
		},
	};
}

for (const mode of ["human", "delegated"] as const) {
	test(`D1/D3 ${mode} routing retains required alternatives before synthesis, challenge and advancement`, async () => {
		const x = await fixture();
		try {
			if (mode === "delegated") {
				accepted(
					await Effect.runPromise(
						x.f.ledger.command(
							{
								version: 1,
								authorityEpoch: x.f.ledger.status().authorityEpoch,
								commandId: "delegate",
								command: {
									type: "changeCheckpointSettings",
									expectedRevision: "settings:initial",
									modes: { seams: "delegated", modules: "human", proposal: "human" },
								},
							},
							admin,
						),
					),
				);
			}
			const request = accepted(await x.request()).request as string;
			assert.equal(code(await x.stage(request)), "missing_candidate_evidence", "required alternatives must precede synthesis");
			const a = await x.start(request, 0);
			assert.equal(code(await x.cmd({ type: "submitRoleResult", text: "I choose the winner", supports: [] }, a)), "invalid_content");
			const ar = accepted(await x.cmd({ type: "submitRoleResult", text: answer("Compact interface"), supports: [] }, a)).report as string;
			assert.equal(code(await x.stage(request, [ar])), "missing_candidate_evidence", "one answer cannot discharge competing alternatives");
			const b = await x.start(request, 1);
			const br = accepted(await x.cmd({ type: "submitRoleResult", text: answer("Independent boundaries"), supports: [] }, b))
				.report as string;
			assert.equal(code(await x.stage(request, [ar])), "missing_candidate_evidence", "synthesis must cite every required competing answer");
			const staged = accepted(await x.stage(request, [ar, br]));
			assert.equal(
				code(await x.cmd({ type: "emitCheckpoint", request, review: ar, contested: [] })),
				"review_required",
				"candidates do not replace exact challenge",
			);
			const reviewerId = accepted(await x.cmd({ type: "requestCheckpointReview", request, key: "challenge" })).assignment;
			await until(() => x.assignments().find((a) => a.id === reviewerId)?.status === "running");
			const reviewer = x.assignments().find((a) => a.id === reviewerId)!;
			const rendered = JSON.parse(await Effect.runPromise(x.engine.render(reviewer)));
			assert.ok(rendered.inputs.some((v: { text: string }) => v.text === answer("Compact interface")));
			const review = accepted(
				await x.cmd(
					{
						type: "submitRoleResult",
						supports: [],
						text: JSON.stringify({
							schema: 1,
							emission: staged.emission,
							manifest: staged.manifest,
							annotations: 0,
							checks: {
								alternatives: "checked",
								interactions: "checked",
								scale: "checked",
								usage: "checked",
								incidentalChoices: "checked",
								nearbyCopying: "checked",
							},
							objections: [],
							delegation: {
								agreedScopeRef: x.ground,
								reason: "Technical boundaries within Ground",
								unresolvedProduct: [],
								scopeChanges: [],
								humanDecisions: [],
							},
						}),
					},
					reviewer,
				),
			).report;
			accepted(await x.cmd({ type: "emitCheckpoint", request, review, contested: [] }));
			if (mode === "delegated") {
				const frame = x.f.ledger.snapshot(admin) as Frame;
				const checkpoints = (frame.workflows as { checkpoints: Checkpoints }[])[0]!.checkpoints;
				const captured = checkpoints.requests.find((r) => r.id === request)!;
				const command = {
					type: "advanceDelegatedCheckpoint" as const,
					workflow: "workflow:2",
					request,
					emission: captured.emission!,
					manifest: captured.manifest!,
					annotations: captured.annotations,
					policyBinding: captured.policyBinding,
					decisions: { N1: "separate" },
					nonbinding: [],
				};
				const reviewBytes = await Effect.runPromise(x.f.ledger.artifact(admin, { read: review as string }));
				assert.ok("content" in reviewBytes);
				for (const status of ["submitted", "blocked", "canceled"] as const) {
					const assignments = structuredClone(x.assignments());
					assignments.find((v) => v.id === a.id)!.status = status;
					const d = decision(
						change(
							{
								workflow: { id: "workflow:2", messageCount: 0 },
								document: null,
								device: null,
								checkpoints,
								roleWork: { assignments },
								policy: frame.policy as KernelState["policy"],
							},
							command,
							{
								principal: {
									kind: "assignment-agent",
									assignment: x.parent.id,
									generation: 1,
									attempt: x.parent.attempt,
									role: "coordinator",
								},
								executorEpoch: x.parent.executorEpoch!,
								sequence: 1000,
								ids: { fact: "fact:1000" },
								checkpointInputs: {
									[ar]: { text: answer("Compact interface"), human: false, document: "role-report/A" },
									[br]: { text: answer("Independent boundaries"), human: false, document: "role-report/B" },
									[review as string]: { text: reviewBytes.content.toString(), human: false, document: "role-report/review" },
								},
							},
						),
					);
					assert.equal(
						d.outcome === "refused" ? d.code : d.outcome,
						status === "submitted" ? "accepted" : "missing_candidate_evidence",
						"delegated advancement must retain required candidate completion checks",
					);
				}
				const { workflow: _workflow, ...ledgerCommand } = command;
				assert.equal(code(await x.cmd(ledgerCommand, a)), "forbidden_scope", "candidates cannot accept a winner via delegation");
				accepted(await x.cmd(ledgerCommand));
			}
			accepted(await x.cmd({ type: "submitRoleResult", text: "Comparison complete", supports: [] }));
			x.release();
			await until(() => x.assignments().every((a) => !a.executing));
			await x.f.reopen();
			for (const [ref, expected] of [
				[ar, answer("Compact interface")],
				[br, answer("Independent boundaries")],
			]) {
				const value = await Effect.runPromise(x.f.ledger.artifact(admin, { read: ref! }));
				assert.ok("content" in value);
				assert.equal(value.content.toString(), expected);
			}
			const exported = await Effect.runPromise(x.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
			assert.ok("manifest" in exported && exported.manifest.complete);
			assert.ok(exported.jsonl.includes(ar) && exported.jsonl.includes(br) && exported.jsonl.includes(request));
		} finally {
			await x.close();
		}
	});
}

test("D1/D2 candidates receive own inputs and cannot name foreign artifacts or gain checkpoint authority", async () => {
	const x = await fixture();
	try {
		const request = accepted(await x.request()).request as string;
		const a = await x.start(request, 0);
		const b = await x.start(request, 1);
		assert.notEqual(a.conversation, b.conversation);
		assert.notEqual(a.conversation, x.parent.conversation);
		for (const [own, ownText, foreignText] of [
			[a, "LEFT-INPUT", "RIGHT-INPUT"],
			[b, "RIGHT-INPUT", "LEFT-INPUT"],
		] as const) {
			const rendered = await Effect.runPromise(x.engine.render(own));
			assert.ok(rendered.includes(ownText));
			assert.ok(!rendered.includes(foreignText) && !rendered.includes("COORDINATOR-FAVORED-ANSWER"));
			const positive = await Effect.runPromise(x.f.ledger.artifact(actor(own), { read: own.packet.instructions }));
			assert.ok("content" in positive);
			for (const ref of [x.favored, own.id === a.id ? x.right : x.left, x.parent.packetRef, own.id === a.id ? b.packetRef : a.packetRef]) {
				const foreign = await Effect.runPromise(x.f.ledger.artifact(actor(own), { read: ref }));
				assert.ok(!("content" in foreign), "foreign artifact must remain unreadable even with its exact handle");
			}
			assert.equal(
				code(
					await x.cmd(
						{ type: "requestCheckpoint", stage: "seams", scope: x.ground, required: { candidates: false, experiment: false } },
						own,
					),
				),
				"forbidden_scope",
			);
		}
		const ar = accepted(await x.cmd({ type: "submitRoleResult", text: answer("LEFT-ANSWER-CANARY"), supports: [] }, a)).report as string;
		assert.ok(
			!("content" in (await Effect.runPromise(x.f.ledger.artifact(actor(b), { read: ar })))),
			"foreign artifact must remain unreadable even with its exact handle",
		);
		assert.ok("content" in (await Effect.runPromise(x.f.ledger.artifact(actor(a), { read: ar }))));
		assert.ok("content" in (await Effect.runPromise(x.f.ledger.artifact(actor(x.parent), { read: ar }))));
		const inherited = await x.f.command({
			type: "assignTask",
			slice: "contaminated",
			delivery: false,
			packet: packet({ role: "candidate", inputs: [ar] }),
		});
		assert.equal(code(inherited), "forbidden_scope");
		await until(() => x.prompts.some((p) => p.includes(b.id)));
		const transcript = x.prompts.find((p) => p.includes(b.id));
		assert.ok(transcript && !transcript.includes("LEFT-INPUT") && !transcript.includes("COORDINATOR-FAVORED-ANSWER"));
	} finally {
		await x.close();
	}
});

for (const variation of ["identical", "different-inputs", "one"] as const) {
	test(`D1 required comparison refuses ${variation} candidate conditions`, async () => {
		const x = await fixture(true, (packets) => {
			if (variation === "identical") packets[1] = structuredClone(packets[0]!);
			else if (variation === "one") packets.pop();
			else packets[1]!.inputs = [];
		});
		try {
			assert.equal(code(await x.request()), "invalid_content");
		} finally {
			await x.close();
		}
	});
}

test("D1 required family cannot be replaced by an unrecorded same-family fallback", async () => {
	const x = await fixture(false);
	try {
		const request = accepted(await x.request()).request as string;
		assert.equal(code(await x.cmd({ type: "requestRole", key: "candidate-0", request })), "capability_unavailable");
		assert.equal(code(await x.stage(request)), "missing_candidate_evidence");
		assert.equal(x.assignments().length, 1);
	} finally {
		await x.close();
	}
});

test("D3 exhaustive candidate status and request matrix requires both submitted candidates for synthesis", async () => {
	const x = await fixture();
	try {
		const request = accepted(await x.request()).request as string;
		await x.start(request, 0);
		await x.start(request, 1);
		const frame = x.f.ledger.snapshot(admin) as Frame;
		const checkpoints = (frame.workflows as { checkpoints: Checkpoints }[])[0]!.checkpoints;
		const statuses = ["submitted", "blocked", "canceled", "running"] as const;
		for (const firstStatus of statuses) {
			for (const secondStatus of statuses) {
				for (const foreignRequest of [false, true]) {
					const assignments = structuredClone(x.assignments());
					assignments[1]!.status = firstStatus;
					assignments[2]!.status = secondStatus;
					for (const [n, a] of assignments.slice(1).entries()) {
						a.report = `answer:${n}`;
					}
					if (foreignRequest) assignments[1]!.checkpointCandidate!.request = "checkpoint:foreign";
					const state: KernelState = {
						workflow: { id: "workflow:2", messageCount: 0 },
						document: null,
						device: null,
						roleWork: { assignments },
						checkpoints,
					};
					const d = decision(
						change(
							state,
							{
								type: "stageCheckpoint",
								workflow: "workflow:2",
								request,
								text: "Synthesis",
								manifest: {
									...manifest,
									stage: "seams",
									nodes: [{ ...manifest.nodes[0]!, classification: "judgment", evidence: ["answer:0", "answer:1"] }],
								},
							},
							{
								principal: {
									kind: "assignment-agent",
									assignment: x.parent.id,
									generation: 1,
									attempt: x.parent.attempt,
									role: "coordinator",
								},
								executorEpoch: x.parent.executorEpoch!,
								sequence: 1000,
								ids: { fact: "fact:1000" },
								checkpointInputs: {
									[x.ground]: { text: "Ground", human: true, document: "ground" },
									"answer:0": { text: answer("A"), human: false, document: "role-report/A" },
									"answer:1": { text: answer("B"), human: false, document: "role-report/B" },
								},
							},
						),
					);
					assert.equal(
						d.outcome === "refused" ? d.code : d.outcome,
						!foreignRequest && firstStatus === "submitted" && secondStatus === "submitted" ? "accepted" : "missing_candidate_evidence",
						`firstStatus=${firstStatus}, secondStatus=${secondStatus}, foreignRequest=${foreignRequest}`,
					);
				}
			}
		}
	} finally {
		await x.close();
	}
});

test("D3 coordinator replacement preserves completed checkpoint-bound alternatives through challenge", async () => {
	const x = await fixture();
	try {
		const request = accepted(await x.request()).request as string;
		const reports: string[] = [];
		for (let i = 0; i < 2; i++) {
			const child = await x.start(request, i);
			reports.push(accepted(await x.cmd({ type: "submitRoleResult", text: answer(`Answer ${i}`), supports: [] }, child)).report as string);
		}
		accepted(
			await x.f.command({ type: "cancelWork", assignment: x.parent.id, generation: x.parent.generation, attempt: x.parent.attempt }, admin),
		);
		await until(() => x.assignments()[0]?.status === "canceled");
		const old = x.assignments()[0]!;
		const { policyBinding: _binding, ...replacementPacket } = old.packet;
		const id = accepted(
			await x.f.command({
				type: "replaceTask",
				assignment: old.id,
				generation: old.generation,
				attempt: old.attempt,
				packet: { ...replacementPacket, inputs: [...replacementPacket.inputs, ...reports] },
			}),
		).assignment;
		await until(() => x.assignments().find((a) => a.id === id)?.status === "running");
		const replacement = x.assignments().find((a) => a.id === id)!;
		assert.notEqual(replacement.conversation, old.conversation);
		accepted(
			await x.cmd(
				{
					type: "stageCheckpoint",
					request,
					text: "# Replacement synthesis",
					manifest: { ...manifest, nodes: [{ ...manifest.nodes[0], evidence: [x.ground, ...reports] }] },
				},
				replacement,
			),
		);
		const review = await x.cmd({ type: "requestCheckpointReview", request, key: "challenge" }, replacement);
		assert.equal(code(review), "accepted", "replacement coordinator must retain completed checkpoint evidence through exact challenge");
	} finally {
		await x.close();
	}
});

test("D1/D3 candidate assignment retains accepted Contract scope and permanent consumption", () => {
	const state: KernelState = {
		workflow: { id: "workflow:2", messageCount: 0 },
		document: null,
		device: null,
		roleWork: { assignments: [] },
		intakes: {
			revision: "intake-record:1",
			drafts: [],
			concerns: [],
			dependencies: [],
			slices: [
				{
					id: "comparison",
					contract: "contract:1",
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
	const assign = (inputs: string[]) =>
		decision(
			change(
				state,
				{
					type: "assignTask",
					workflow: "workflow:2",
					slice: "comparison",
					delivery: false,
					packet: packet({ role: "candidate", inputs }),
				},
				{
					principal: { kind: "host", scope: "scheduling" },
					sequence: 10,
					ids: { fact: "fact:10", assignment: "candidate:10", attempt: "attempt:10" },
				},
			),
		);
	const missing = assign([]);
	assert.equal(
		missing.outcome === "refused" ? missing.code : missing.outcome,
		"stale_basis",
		"candidate assignment cannot bypass the accepted Contract with delivery false",
	);
	const valid = assign(["contract:1"]);
	assert.ok(valid.outcome === "accepted");
	const consumption = valid.writes.find((w) => w.type === "intakes.replace");
	assert.ok(consumption?.type === "intakes.replace");
	assert.equal(consumption.state.slices[0]!.everAssigned, true, "candidate assignment permanently consumes its accepted Contract");
	assert.deepEqual(JSON.parse(consumption.documents[0]!.text), {
		schema: 1,
		event: "consumed",
		slice: "comparison",
		contract: "contract:1",
		assignment: "candidate:10",
		everAssigned: true,
	});
	assert.equal(state.intakes!.slices[0]!.everAssigned, false, "Kernel keeps the input state immutable");
	state.intakes!.slices[0]!.status = "superseded";
	const retired = assign(["contract:1"]);
	assert.equal(retired.outcome === "refused" ? retired.code : retired.outcome, "contract_superseded");
});

test("D3 replacement stays bound to required question and gets a fresh context", async () => {
	const x = await fixture();
	try {
		const request = accepted(await x.request()).request as string;
		const a = await x.start(request, 0);
		assert.equal(code(await x.cmd({ type: "requestRole", key: "candidate-0", request })), "role_already_requested");
		accepted(await x.f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin));
		await until(() => x.assignments().find((v) => v.id === a.id)?.status === "canceled");
		const old = x.assignments().find((v) => v.id === a.id)!;
		const replace = (packet: RolePacket) =>
			x.f.command({ type: "replaceTask", assignment: old.id, generation: old.generation, attempt: old.attempt, packet });
		assert.equal(code(await replace(packet())), "forbidden_scope");
		assert.equal(code(await replace({ ...x.packets[0]!, inputs: [] })), "forbidden_scope");
		const id = accepted(await replace(x.packets[0]!)).assignment;
		await until(() => x.assignments().find((v) => v.id === id)?.status === "running");
		const fresh = x.assignments().find((v) => v.id === id)!;
		assert.notEqual(fresh.conversation, old.conversation);
		assert.equal(fresh.predecessor, old.id);
		const ar = accepted(await x.cmd({ type: "submitRoleResult", text: answer("replacement"), supports: [] }, fresh)).report as string;
		const b = await x.start(request, 1);
		const br = accepted(await x.cmd({ type: "submitRoleResult", text: answer("second"), supports: [] }, b)).report as string;
		accepted(await x.stage(request, [ar, br]));
	} finally {
		await x.close();
	}
});
