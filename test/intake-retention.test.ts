import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { IntakeManifest, Intakes } from "../src/kernel/intake.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { deviceServer } from "../src/ledger/http.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { finding, investigationPacket, saveGround, sourceFiles, until } from "./support/investigation.ts";
import { admin, allowSameFamily, claudeFixture, packet, passOwner, roleFixture } from "./support/roles.ts";
import { git, gitSourceFixture } from "./support/source.ts";

function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}
function code(reply: CommandReply) {
	return reply.status === "refused" ? reply.code : reply.status;
}
async function fixture(shape: "bug" | "design" = "bug", investigations?: { root: string; repositories: Record<string, string> }) {
	const gate = Promise.withResolvers<void>();
	const provider = fauxProvider({
		provider: "anthropic",
		api: "anthropic-messages",
		models: [{ id: "claude-sonnet-4-6", reasoning: true }],
	});
	const reviews: Record<string, unknown>[] = [];
	provider.setResponses(
		Array.from({ length: 30 }, () => async (transcript: { messages: { role: string; content: unknown }[] }) => {
			const prompt = JSON.parse(transcript.messages.filter((m) => m.role === "user").at(-1)!.content as string);
			if (prompt.packet.investigation) {
				const source = prompt.inputs.find((i: { text: string }) => i.text.includes('"kind":"investigation-source"'));
				return fauxAssistantMessage(
					fauxToolCall("submit_role_result", {
						text: JSON.stringify(finding(source.ref, prompt.packet.investigation.ground)),
						supports: [],
					}),
					{ stopReason: "toolUse" },
				);
			}
			if (prompt.packet.role === "coordinator") {
				await gate.promise;
				return fauxAssistantMessage("paused");
			}
			if (prompt.checkpointReview) {
				return fauxAssistantMessage(
					fauxToolCall("submit_role_result", {
						text: JSON.stringify({
							schema: 1,
							...prompt.checkpointReview,
							checks: {
								alternatives: "Compared",
								interactions: "Compared",
								scale: "Compared",
								usage: "Compared",
								incidentalChoices: "Compared",
								nearbyCopying: "Compared",
							},
							objections: [],
						}),
						supports: [],
					}),
					{ stopReason: "toolUse" },
				);
			}
			assert.ok(prompt.intakeReview, "fresh reviewer receives exact intake basis");
			reviews.push(prompt);
			return fauxAssistantMessage(
				fauxToolCall("submit_role_result", {
					text: JSON.stringify({
						schema: 1,
						...prompt.intakeReview,
						checks: {
							omitted: "Compared source",
							weakened: "No weakened obligations",
							strengthened: "No added commitments",
							contradictory: "No contradictions",
							invented: "No invention",
						},
						findings: [],
					}),
					supports: [],
				}),
				{ stopReason: "toolUse" },
			);
		}),
	);
	const f = await roleFixture(
		new Engine({
			provider: provider.provider,
			...claudeFixture,
			...(investigations ? { investigations } : {}),
		}),
	);
	await allowSameFamily(f.ledger);
	let n = 0;
	const save = async (document: string, text: string) =>
		accepted(
			await Effect.runPromise(
				f.ledger.command(
					{
						version: 1,
						authorityEpoch: f.ledger.status().authorityEpoch,
						commandId: `save:${++n}`,
						workflow: "workflow:2",
						expected: { document: null },
						command: { type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
					},
					admin,
				),
			),
		).revision as string;
	const source = await save("existing-seam", "Approved existing read interface: return saved bytes without normalization.");
	const catalog = await save(
		"verification",
		"## Ranks\n1. `tests`\n2. `inspection`\n## Launch\nowned\n## Doctor\nnode\n## Channels\ntests\n## Catalog\n| Name | Channel | Kind | Run | Expectations | Rank |\n|---|---|---|---|---|---|\n| read | Tests | executed | `node read.js` | exact bytes | tests |\n## Cleanup\nnone\n## Extend\nowned\n## Traps\nnone\n",
	);
	const ground = await save(
		"ground",
		JSON.stringify({
			schema: 1,
			shape: { value: shape, origin: "human", confirmed: true },
			goal: "Correct read",
			constraints: [],
			clarifications: [],
			donePredicate: "Literal bytes",
			facts: [],
			approvedSources: [source],
			...(shape === "bug"
				? { reproduction: { trigger: "node read.js", observed: "read returned partial bytes" }, expected: "read returns exact bytes" }
				: {}),
		}),
	);
	const manifest: IntakeManifest = {
		schema: 1,
		shape,
		ground,
		sources: [source],
		decisions: [],
		catalog,
		breakdown: shape === "design" ? "One bounded read module" : null,
		...(shape === "bug"
			? { reproduction: { obligation: "B1", observed: "read returned partial bytes", expected: "read returns exact bytes" } }
			: {}),
		slices: [
			{
				id: "read-fix",
				title: "Fix read",
				record: false,
				delegated: ["Names"],
				forbidden: ["New interface"],
				obligations: [
					{ id: "B1", kind: "behavior", text: "Return exact bytes", sources: [] },
					{ id: "A1", kind: "architecture", text: "Retain read interface", sources: [{ ref: source, node: null }] },
				],
			},
		],
		checks: [{ id: "read", row: "read", kind: "executed", rank: "tests", new: false, run: "node read.js", expectations: "exact bytes" }],
		mapping: [
			{ slice: "read-fix", obligation: "B1", checks: ["read"] },
			{ slice: "read-fix", obligation: "A1", checks: ["read"] },
		],
		dependencies: [],
		responses: [],
		unresolved: [],
	};
	const aId = accepted(
		await f.command({
			type: "assignTask",
			slice: "design",
			delivery: false,
			packet: packet({
				inputs: [ground, source, catalog],
				requests: [{ key: "fidelity", packet: packet({ role: "challenger" }) }],
				maxTurns: 20,
			}),
		}),
	).assignment;
	const assignments = () => (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
	await until(() => assignments().find((a) => a.id === aId)?.status === "running");
	const a = assignments().find((a) => a.id === aId)!;
	const actor = mintContext({
		kind: "assignment-agent",
		assignment: a.id,
		generation: a.generation,
		attempt: a.attempt,
		role: "coordinator",
	});
	const state = () => ((f.ledger.snapshot(admin) as Frame).workflows as { intakes: Intakes }[])[0]!.intakes;
	const command = (c: Record<string, unknown>) => f.command(c, actor);
	const stage = async (m = manifest) =>
		accepted(
			await command({
				type: "stageIntake",
				expected: state().drafts.at(-1)?.id ?? null,
				text: "# Contract\r\nReturn exact saved bytes.\n",
				manifest: m,
			}),
		).intake as string;
	const review = async (intake: string) => {
		const r = accepted(await command({ type: "requestIntakeReview", intake, key: "fidelity" }));
		await until(
			() =>
				assignments().find((a) => a.id === r.assignment)?.status === "submitted" &&
				!assignments().find((a) => a.id === r.assignment)?.executing,
		);
		return assignments().find((a) => a.id === r.assignment)!.report!;
	};
	const basis = (intake: string, review: string) => {
		const d = state().drafts.find((d) => d.id === intake)!;
		return { intake, review, annotations: d.annotations, policyBinding: d.policyBinding, decisions: d.manifest.decisions };
	};
	return {
		f,
		actor,
		source,
		catalog,
		ground,
		manifest,
		state,
		command,
		stage,
		review,
		basis,
		reviews,
		async reopen() {
			gate.resolve();
			await f.reopen();
		},
		async close() {
			gate.resolve();
			await f.close();
		},
	};
}

test("I07/I14 V8 real Engine fidelity and exact human intake survive ordinary reopen and complete export", async () => {
	const t = await fixture();
	try {
		const draft = await t.stage();
		const review = await t.review(draft);
		assert.equal(code(await t.command({ type: "acceptIntake", ...t.basis(draft, review) })), "forbidden_principal");
		const result = accepted(await t.f.command({ type: "acceptIntake", ...t.basis(draft, review) }, admin));
		const contract = t.state().slices[0]!.contract;
		assert.equal(t.reviews.length, 1);
		assert.match(JSON.stringify(t.reviews[0]), /omitted.*weakened.*strengthened.*contradictory.*invented/);
		const original = await Effect.runPromise(t.f.ledger.artifact(admin, { read: draft }));
		assert.ok("content" in original);
		assert.equal(original.content.toString(), "# Contract\r\nReturn exact saved bytes.\n");
		const exportBefore = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
		assert.ok("manifest" in exportBefore && exportBefore.manifest.complete);
		for (const ref of [draft, t.state().drafts[0]!.manifestRef, review, contract, result.acceptance])
			assert.ok(exportBefore.content[ref as string], `export retains ${ref}`);
		const start = performance.now();
		await t.reopen();
		assert.ok(performance.now() - start < 5000, "intake reattachment <=5s");
		assert.equal(t.state().slices[0]!.contract, contract);
		const restored = await Effect.runPromise(t.f.ledger.artifact(admin, { read: draft }));
		assert.ok("content" in restored);
		assert.equal(restored.content.toString(), "# Contract\r\nReturn exact saved bytes.\n");
		const frame = t.f.ledger.snapshot(admin) as Frame;
		assert.equal((frame.workflows as { commitment: { acceptedIntake: string } }[])[0]!.commitment.acceptedIntake, result.acceptance);
	} finally {
		await t.close();
	}
});

test("implementation pass opening is atomic with ownership, scoped, exported and stable after ordinary reopen", async () => {
	const t = await fixture();
	try {
		const draft = await t.stage();
		const review = await t.review(draft);
		accepted(await t.f.command({ type: "acceptIntake", ...t.basis(draft, review) }, admin));
		const contract = t.state().slices[0]!.contract;
		const command = {
			type: "assignTask",
			slice: "read-fix",
			delivery: true,
			packet: passOwner(contract, { execution: "linux-writer" }),
		};
		const first = await t.f.command(command, undefined, "initial-implementation");
		const opening = accepted(first);
		assert.equal(opening.passOrdinal, 1);
		assert.equal(opening.passRef, "pass:workflow:2:read-fix:1");
		const record = await Effect.runPromise(t.f.ledger.artifact(admin, { read: opening.passRecord as string }));
		assert.ok("content" in record, "opening record must commit alongside its assignment");
		const body = JSON.parse(record.content.toString());
		assert.equal(body.schema, 1);
		assert.equal(body.contract, contract);
		assert.equal(body.cause, "initial-implementation");
		assert.equal(body.predecessor, null);
		assert.equal(body.assignment, opening.assignment);
		assert.equal(body.packet, opening.packet);
		const assignments = () => (t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
		const owner = assignments().find((a) => a.id === opening.assignment)!;
		const principal = mintContext({
			kind: "assignment-agent",
			assignment: owner.id,
			generation: owner.generation,
			attempt: owner.attempt,
			role: "implementer",
		});
		assert.ok("content" in (await Effect.runPromise(t.f.ledger.artifact(principal, { read: opening.passRecord as string }))));
		assert.ok(
			"code" in (await Effect.runPromise(t.f.ledger.artifact(t.actor, { read: opening.passRecord as string }))),
			"unrelated coordinator has no pass-private read grant",
		);
		await until(() => assignments().find((a) => a.id === opening.assignment)?.status === "blocked");
		assert.equal(
			assignments().find((a) => a.id === opening.assignment)?.blocker,
			"implementation_source_or_verifier_capability_unavailable",
		);
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.equal(Buffer.from(exported.content[opening.passRecord as string]!, "base64").toString(), record.content.toString());
		await t.reopen();
		const replay = await t.f.command(command, undefined, "initial-implementation");
		assert.equal(replay.status, "accepted");
		if (first.status !== "accepted" || replay.status !== "accepted") throw new Error("unreachable");
		assert.equal(replay.duplicate, true);
		assert.equal(replay.receipt, first.receipt);
		assert.deepEqual(replay.result, first.result);
		assert.equal(assignments().filter((a) => a.slice === "read-fix").length, 1);
		const restored = await Effect.runPromise(t.f.ledger.artifact(admin, { read: opening.passRecord as string }));
		assert.ok("content" in restored);
		assert.equal(restored.content.toString(), record.content.toString());
		assert.ok("content" in (await Effect.runPromise(t.f.ledger.artifact(principal, { read: opening.passRecord as string }))));
	} finally {
		await t.close();
	}
});

test("F4 one coordinator continues approved Seams and Modules into exact fresh intake fidelity and advisory history", async () => {
	const source = await gitSourceFixture(sourceFiles);
	const t = await fixture("design", { root: join(source.root, "investigation"), repositories: { owned: source.repo } });
	try {
		const decisions: string[] = [],
			manifests: string[] = [];
		let emission = "";
		for (const stage of ["seams", "modules"] as const) {
			const request = accepted(
				await t.command({ type: "requestCheckpoint", stage, scope: t.ground, required: { candidates: false, experiment: false } }),
			).request;
			const manifest = {
				schema: 1,
				stage,
				nodes: [
					{
						id: "N1",
						decision: "Keep the read seam",
						rationale: "Preserve authority",
						alternatives: ["keep", "replace"],
						evidence: [t.source],
						classification: "judgment",
						default: "keep",
					},
				],
				decompositions: ["keep", "replace"].map((id) => ({
					id,
					modules: ["Reader"],
					dependencies: ["Storage"],
					verificationSeams: ["read"],
					depth: "Hide persistence",
					locality: "Read concerns",
					deletion: "Spreads reads",
				})),
				verificationStrategy: "Literal read tests",
				incidentalChoices: [],
				responses: [],
			};
			accepted(await t.command({ type: "stageCheckpoint", request, text: "# Approved read seam", manifest }));
			const r = accepted(await t.command({ type: "requestCheckpointReview", request, key: "fidelity" }));
			const assignments = () => (t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
			await until(
				() =>
					assignments().find((a) => a.id === r.assignment)?.status === "submitted" &&
					!assignments().find((a) => a.id === r.assignment)?.executing,
			);
			accepted(
				await t.command({
					type: "emitCheckpoint",
					request,
					review: assignments().find((a) => a.id === r.assignment)!.report,
					contested: [],
				}),
			);
			const q = (
				(t.f.ledger.snapshot(admin) as Frame).workflows as {
					checkpoints: { requests: { id: string; emission: string; manifest: string; annotations: number; policyBinding: string }[] };
				}[]
			)[0]!.checkpoints.requests.find((q) => q.id === request)!;
			const approval = accepted(
				await t.f.command(
					{
						type: "approveCheckpoint",
						request,
						emission: q.emission,
						manifest: q.manifest,
						annotations: q.annotations,
						policyBinding: q.policyBinding,
						decisions: { N1: "keep" },
						nonbinding: [],
					},
					admin,
				),
			);
			decisions.push(approval.decision as string);
			manifests.push(q.manifest);
			emission = q.emission;
		}
		const m = structuredClone(t.manifest);
		m.decisions = decisions;
		m.slices[0]!.obligations[1]!.sources = [{ ref: emission, node: "N1" }];
		const draft = await t.stage(m);
		const review = await t.review(draft);
		const reviewer = ((t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[]).find((a) => a.report === review)!;
		for (const ref of manifests)
			assert.ok(reviewer.packet.inputs.includes(ref), "fidelity must receive each exact approved typed manifest");
		accepted(await t.f.command({ type: "acceptIntake", ...t.basis(draft, review) }, admin));
		assert.equal(t.state().slices[0]!.status, "accepted");
		const ground = await saveGround(t.f.ledger, undefined, t.ground, "local-investigation-ground");
		const tree = git(source.repo, ["rev-parse", `${source.commit}^{tree}`])
			.toString()
			.trim();
		const nextCommit = git(source.repo, ["commit-tree", tree, "-p", source.commit], "Second retained exact source\n").toString().trim();
		const prompts: { artifact: string; text: string; source: string }[] = [];
		for (const commit of [source.commit, nextCommit]) {
			const assigned = accepted(
				await t.f.command({ type: "assignTask", slice: `local-${commit}`, delivery: false, packet: investigationPacket(ground, commit) }),
			);
			const assignments = () => (t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
			await until(
				() =>
					assignments().find((a) => a.id === assigned.assignment)?.status === "submitted" &&
					!assignments().find((a) => a.id === assigned.assignment)?.executing,
			);
			const observation = assignments().find((a) => a.id === assigned.assignment)!.investigationSource!;
			const response = await t.f.command(
				{ type: "requestLocalVerificationPrompt", source: observation, expectedSequence: t.f.ledger.status().sequence },
				admin,
			);
			assert.equal(response.status, "accepted", "accepted design prose must not be treated as an artifact reference");
			const artifact = String(accepted(response).textArtifact);
			const read = await Effect.runPromise(t.f.ledger.artifact(admin, { read: artifact }));
			assert.ok("content" in read);
			const text = read.content.toString();
			for (const literal of [
				commit,
				t.state().slices[0]!.contract,
				draft,
				...decisions,
				"One bounded read module",
				"Return exact saved bytes.",
				"Keep the read seam",
			])
				assert.ok(text.includes(literal), `prompt must retain exact accepted input ${literal}`);
			prompts.push({ artifact, text, source: observation });
		}
		assert.notEqual(prompts[0]!.artifact, prompts[1]!.artifact);
		assert.notEqual(prompts[0]!.source, prompts[1]!.source);
		assert.ok(!prompts[0]!.text.includes(nextCommit), "old prompt must never be rewritten to the new source");
		await t.reopen();
		const older = accepted(
			await t.f.command(
				{ type: "requestLocalVerificationPrompt", source: prompts[0]!.source, expectedSequence: t.f.ledger.status().sequence },
				admin,
			),
		);
		assert.notEqual(older.textArtifact, prompts[0]!.artifact, "fresh request may explicitly select older retained source");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const p of prompts) assert.equal(Buffer.from(exported.content[p.artifact]!, "base64").toString(), p.text);
	} finally {
		await t.close();
		await source.close();
	}
});

test("F5 a coordinator cannot read or propagate a concern outside its Ground input scope", async () => {
	const t = await fixture();
	try {
		await t.stage();
		const otherGround = accepted(
			await Effect.runPromise(
				t.f.ledger.command(
					{
						version: 1,
						authorityEpoch: t.f.ledger.status().authorityEpoch,
						commandId: "other-ground",
						workflow: "workflow:2",
						expected: { document: t.ground },
						command: {
							type: "saveDocument",
							document: "ground",
							mediaType: "text/plain",
							content: Buffer.from(
								JSON.stringify({
									schema: 1,
									goal: "Other scope",
									constraints: [],
									facts: [],
									donePredicate: "Other literal bytes",
									shape: { value: "bug", origin: "human", confirmed: true },
									approvedSources: [t.source],
									reproduction: { trigger: "node read.js", observed: "read returned partial bytes" },
									expected: "read returns exact bytes",
								}),
							).toString("base64"),
						},
					},
					admin,
				),
			),
		).revision as string;
		const aId = accepted(
			await t.f.command({
				type: "assignTask",
				slice: "other-design",
				delivery: false,
				packet: packet({
					inputs: [otherGround, t.source, t.catalog],
					requests: [{ key: "fidelity", packet: packet({ role: "challenger" }) }],
					maxTurns: 20,
				}),
			}),
		).assignment;
		const assignments = () => (t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
		await until(() => assignments().find((a) => a.id === aId)?.status === "running");
		const a = assignments().find((a) => a.id === aId)!;
		const actor = mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: "coordinator",
		});
		const m = structuredClone(t.manifest);
		m.ground = otherGround;
		const other = accepted(
			await t.f.command({ type: "stageIntake", expected: t.state().drafts.at(-1)!.id, text: "Other private scope", manifest: m }, actor),
		).intake as string;
		const saved = accepted(await t.f.command({ type: "saveIntakeConcern", intake: other, text: "PRIVATE OTHER GROUND CONCERN" }, admin));
		const read = await Effect.runPromise(t.f.ledger.artifact(t.actor, { read: saved.revision as string }));
		assert.ok("status" in read && read.status === "refused", "coordinator must not read another Ground concern");
		assert.equal(
			code(await t.command({ type: "stageIntake", expected: other, text: "Own scope", manifest: t.manifest })),
			"forbidden_scope",
			"unscoped concerns cannot be propagated into fresh fidelity",
		);
	} finally {
		await t.close();
	}
});

test("I05 V4 two authenticated clients race intake acceptance and complete saved concern", async () => {
	const t = await fixture();
	const server = deviceServer(t.f.ledger);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const addr = server.address();
		assert.ok(addr && typeof addr !== "string");
		const clients = await Promise.all(
			["a", "b"].map(async (label) => {
				const reply = await Effect.runPromise(
					t.f.ledger.command(
						{
							version: 1,
							authorityEpoch: t.f.ledger.status().authorityEpoch,
							commandId: `enroll:${label}`,
							command: { type: "enrollDevice", label, scope: { workflows: ["workflow:2"] } },
						},
						admin,
					),
				);
				assert.ok(reply.status === "accepted" && reply.credential);
				const bearer = reply.credential.bearer;
				return async (command: Record<string, unknown>): Promise<CommandReply> =>
					(
						await fetch(`http://127.0.0.1:${addr.port}/v1/commands`, {
							method: "POST",
							headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
							body: JSON.stringify({
								version: 1,
								authorityEpoch: t.f.ledger.status().authorityEpoch,
								commandId: `client:${label}`,
								workflow: "workflow:2",
								command,
							}),
						})
					).json() as Promise<CommandReply>;
			}),
		);
		const draft = await t.stage();
		const review = await t.review(draft);
		const [accept, save] = await Promise.all([
			clients[0]!({ type: "acceptIntake", ...t.basis(draft, review) }),
			clients[1]!({ type: "saveIntakeConcern", intake: draft, text: "Complete edited Contract\r\n" }),
		]);
		const saved = accepted(save);
		assert.equal(t.state().concerns.length, 1);
		if (accept.status === "accepted") {
			assert.equal(saved.changeRequest, "true");
			assert.equal(t.state().slices.length, 1);
		} else {
			assert.equal(accept.code, "stale_basis");
			assert.equal(saved.changeRequest, "false");
			assert.equal(t.state().slices.length, 0);
		}
		const edit = await Effect.runPromise(t.f.ledger.artifact(admin, { read: saved.revision as string }));
		assert.ok("content" in edit);
		assert.equal(edit.content.toString(), "Complete edited Contract\r\n");
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await t.close();
	}
});

for (const failure of ["missing_content", "content_corrupt", "unsupported_schema"]) {
	test(`I13 exact intake ${failure} blocks acceptance after restart without replacing bytes`, async () => {
		const t = await fixture();
		try {
			const draft = await t.stage();
			const review = await t.review(draft);
			const basis = t.basis(draft, review);
			const ref = t.state().drafts[0]!.manifestRef;
			damage(t.f.data, ref, failure);
			await t.reopen();
			const reply = await t.f.command({ type: "acceptIntake", ...basis }, admin);
			assert.equal(code(reply), failure);
			assert.equal(t.state().slices.length, 0);
			const read = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
			assert.ok("code" in read);
			assert.equal(read.code, failure);
			const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
			assert.ok("manifest" in exported);
			assert.equal(exported.manifest.complete, false);
			assert.equal(ref in exported.content, false);
		} finally {
			await t.close();
		}
	});
}
for (const failure of ["missing_content", "content_corrupt", "unsupported_schema"]) {
	test(`implementation pass ${failure} prevents replacement from reconstructing its immutable opening`, async () => {
		const t = await fixture();
		try {
			const draft = await t.stage();
			accepted(await t.f.command({ type: "acceptIntake", ...t.basis(draft, await t.review(draft)) }, admin));
			const writer = passOwner(t.state().slices[0]!.contract, { execution: "linux-writer" });
			const first = accepted(await t.f.command({ type: "assignTask", slice: "read-fix", delivery: true, packet: writer }));
			const assignments = () => (t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
			await until(() => assignments().find((a) => a.id === first.assignment)?.status === "blocked");
			const owner = assignments().find((a) => a.id === first.assignment)!;
			const canceled = accepted(
				await t.f.command({ type: "cancelWork", assignment: owner.id, generation: owner.generation, attempt: owner.attempt }, admin),
			);
			await until(() => assignments().find((a) => a.id === first.assignment)?.status === "canceled");
			damage(t.f.data, first.passRecord as string, failure);
			await t.reopen();
			const reply = await t.f.command({
				type: "replaceTask",
				assignment: owner.id,
				generation: canceled.generation,
				attempt: owner.attempt,
				packet: writer,
			});
			assert.equal(code(reply), failure, "replacement must not reconstruct missing or corrupt opening evidence from current state");
			const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
			assert.ok("manifest" in exported);
			assert.equal(exported.manifest.complete, false);
			assert.equal((first.passRecord as string) in exported.content, false);
		} finally {
			await t.close();
		}
	});
}

function damage(data: string, ref: string, failure: string) {
	// Deliberate fault injection into this owned temporary store only. Observations use Ledger.
	const db = new DatabaseSync(join(data, "render.db"));
	try {
		const row = (db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]).find((row) => {
			const record = JSON.parse(row.record);
			return record.kind === "render.revision" && record.data.revision === ref;
		});
		assert.ok(row, "fault target exists");
		if (failure === "missing_content") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
		else {
			const record = JSON.parse(row.record);
			if (failure === "content_corrupt") record.data.text = "Different bytes";
			else record.data.schema = 99;
			db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
		}
	} finally {
		db.close();
	}
}

test("I13 dependency amendment cannot operate on missing accepted obligations", async () => {
	const t = await fixture();
	try {
		const draft = await t.stage();
		accepted(await t.f.command({ type: "acceptIntake", ...t.basis(draft, await t.review(draft)) }, admin));
		const expected = t.state().revision;
		damage(t.f.data, t.state().slices[0]!.contract, "missing_content");
		await t.reopen();
		assert.equal(
			code(await t.f.command({ type: "amendDependencies", expected, dependencies: [], reason: "Keep independent" }, admin)),
			"missing_content",
			"dependency changes require exact accepted obligation bytes",
		);
	} finally {
		await t.close();
	}
});

test("I08/I09 V2 actual SQLite serializes first assignment against amendment and persists permanent freeze", async () => {
	for (const assignmentFirst of [false, true]) {
		const t = await fixture();
		try {
			const draft = await t.stage();
			accepted(await t.f.command({ type: "acceptIntake", ...t.basis(draft, await t.review(draft)) }, admin));
			const old = t.state().slices[0]!.contract;
			const next = await t.stage();
			const basis = t.basis(next, await t.review(next));
			const amend = () => t.f.command({ type: "amendContract", slice: "read-fix", expected: old, ...basis }, admin);
			const assign = () => t.f.command({ type: "assignTask", slice: "read-fix", delivery: true, packet: passOwner(old) });
			const first = await (assignmentFirst ? assign() : amend());
			accepted(first);
			assert.equal(code(await (assignmentFirst ? amend() : assign())), assignmentFirst ? "contract_frozen" : "stale_basis");
			if (assignmentFirst) {
				const a = ((t.f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[]).find((a) => a.id === accepted(first).assignment)!;
				accepted(await t.f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin));
				await t.reopen();
				assert.equal(t.state().slices[0]!.everAssigned, true);
				assert.equal(code(await amend()), "contract_frozen", "reopen and release never thaw accepted obligations");
			}
		} finally {
			await t.close();
		}
	}
});
