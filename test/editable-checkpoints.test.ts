import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import type { Checkpoints } from "../src/kernel/checkpoints.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { deviceServer } from "../src/ledger/http.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { until } from "./support/investigation.ts";
import { admin, allowSameFamily, packet, roleFixture, scheduler } from "./support/roles.ts";

const markdown = "# Seams\n\nBoundary A owns authority; Boundary B owns execution.\n";
function manifest(stage = "seams", responses: unknown[] = []) {
	return {
		schema: 1,
		stage,
		nodes: [
			{
				id: "N1",
				decision: "Authority boundary",
				rationale: "Keep legality local",
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
				dependencies: ["execution"],
				verificationSeams: ["run"],
				depth: "one interface",
				locality: "coupled",
				deletion: "removes legality boundary",
			},
			{
				id: "separate",
				modules: ["Authority", "Runner"],
				dependencies: ["authority", "execution"],
				verificationSeams: ["change", "execute"],
				depth: "hide persistence",
				locality: "separate reasons",
				deletion: "spreads legality into callers",
			},
		],
		verificationStrategy: "Pure legality schedules and real SQLite race tests.",
		incidentalChoices: ["The question did not choose the worker count."],
		responses,
	};
}
function result(reply: Awaited<ReturnType<Awaited<ReturnType<typeof roleFixture>>["command"]>>) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}
function code(reply: { status: string; code?: string }) {
	return reply.code ?? reply.status;
}
function assignments(f: Awaited<ReturnType<typeof roleFixture>>) {
	return (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
}
async function deviceClients(f: Awaited<ReturnType<typeof roleFixture>>) {
	const server = deviceServer(f.ledger);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	let n = 0;
	const clients = await Promise.all(
		["A", "B"].map(async (label) => {
			const enrolled = await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: `device:${label}`,
					command: { type: "enrollDevice", label, scope: { workflows: ["workflow:2"] } },
				},
				admin,
			);
			assert.ok(enrolled.status === "accepted" && enrolled.credential);
			const bearer = enrolled.credential.bearer;
			return async (command: Record<string, unknown>): Promise<CommandReply> => {
				const response = await fetch(`http://127.0.0.1:${address.port}/v1/commands`, {
					method: "POST",
					headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
					body: JSON.stringify({
						version: 1,
						authorityEpoch: f.ledger.status().authorityEpoch,
						commandId: `client:${label}:${++n}`,
						workflow: "workflow:2",
						command,
					}),
				});
				return (await response.json()) as CommandReply;
			};
		}),
	);
	return {
		a: clients[0]!,
		b: clients[1]!,
		close: async () => {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		},
	};
}

async function fixture(sameFamily = true) {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
	const gate = Promise.withResolvers<void>();
	const prompts: Record<string, unknown>[] = [];
	p.setResponses(
		Array.from({ length: 20 }, () => async (transcript: { messages: { role: string; content: unknown }[] }) => {
			const prompt = JSON.parse(transcript.messages.filter((m) => m.role === "user").at(-1)!.content as string);
			prompts.push(prompt);
			if (prompt.packet.role === "coordinator") {
				await gate.promise;
				return fauxAssistantMessage("paused");
			}
			const review = prompt.checkpointReview;
			assert.ok(review, "challenger receives exact checkpoint instructions");
			return fauxAssistantMessage(
				fauxToolCall("submit_role_result", {
					text: JSON.stringify({
						schema: 1,
						emission: review.emission,
						manifest: review.manifest,
						annotations: review.annotations,
						checks: {
							alternatives: "checked",
							interactions: "checked",
							scale: "checked",
							usage: "checked",
							incidentalChoices: "checked",
							nearbyCopying: "checked",
						},
						objections: [{ id: "O1", node: "N1", reason: "Why not combine?" }],
					}),
					supports: [],
				}),
				{ stopReason: "toolUse" },
			);
		}),
	);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } }));
	if (sameFamily) await allowSameFamily(f.ledger);
	const ground = await f.ledger.command(
		{
			version: 1,
			authorityEpoch: f.ledger.status().authorityEpoch,
			commandId: "ground",
			workflow: "workflow:2",
			expected: { document: null },
			command: {
				type: "saveDocument",
				document: "ground",
				mediaType: "text/markdown",
				content: Buffer.from("Human goal: design a service; keep two boundaries.").toString("base64"),
			},
		},
		admin,
	);
	const scope = result(ground).revision;
	result(
		await f.command({
			type: "assignTask",
			slice: "design",
			delivery: false,
			packet: packet({ inputs: [scope as string], maxTurns: 20, requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }),
		}),
	);
	await until(() => assignments(f)[0]?.status === "running");
	const a = assignments(f)[0]!;
	const actor = mintContext({
		kind: "assignment-agent",
		assignment: a.id,
		generation: a.generation,
		attempt: a.attempt,
		role: "coordinator",
	});
	let clients: Awaited<ReturnType<typeof deviceClients>> | undefined;
	const cmd = (c: Record<string, unknown>) => f.command(c, actor);
	const request = async (stage = "seams", extra = {}) =>
		result(await cmd({ type: "requestCheckpoint", stage, scope, required: { candidates: false, experiment: false }, ...extra }))
			.request as string;
	const draft = async (request: string, responses: unknown[] = [], stage = "seams", extra = {}) =>
		result(await cmd({ type: "stageCheckpoint", request, text: markdown, manifest: manifest(stage, responses), ...extra }));
	const review = async (request: string) => {
		const r = result(await cmd({ type: "requestCheckpointReview", request, key: "challenge" }));
		await until(
			() =>
				assignments(f).find((a) => a.id === r.assignment)?.status === "submitted" &&
				!assignments(f).find((a) => a.id === r.assignment)?.executing,
		);
		return assignments(f).find((a) => a.id === r.assignment)!.report!;
	};
	const emit = async (request: string) => {
		const report = await review(request);
		return result(
			await cmd({
				type: "emitCheckpoint",
				request,
				review: report,
				contested: [{ objection: "O1", disposition: "considered", reason: "Separate authority localizes legality", resulting: "N1" }],
			}),
		);
	};
	const pending = () => ((f.ledger.snapshot(admin) as Frame).workflows as { checkpoints: Checkpoints }[])[0]!.checkpoints;
	const basis = (request: string) => {
		const r = pending().requests.find((r) => r.id === request)!;
		return {
			request,
			emission: r.emission,
			manifest: r.manifest,
			annotations: r.annotations,
			policyBinding: r.policyBinding,
			decisions: { N1: "separate" },
		};
	};
	const save = async (request: string, text = "---\nworkflow: attacker\napproved: true\n---\nPlease combine these modules.\n") =>
		result(await f.command({ type: "saveCheckpointConcern", request, base: basis(request).emission, text }, admin));
	return {
		f,
		cmd,
		request,
		draft,
		review,
		emit,
		pending,
		basis,
		save,
		prompts,
		scope,
		async devices() {
			clients ??= await deviceClients(f);
			return clients;
		},
		async reopen() {
			await clients?.close();
			clients = undefined;
			gate.resolve();
			await f.reopen();
		},
		async close() {
			await clients?.close();
			gate.resolve();
			await f.close();
		},
	};
}

test("C17 Engine tools complete a fresh challenge and resume the workflow-owned coordinator", async () => {
	const provider = fauxProvider({
		provider: "anthropic",
		api: "anthropic-messages",
		models: [{ id: "claude-sonnet-4-6", reasoning: true }],
	});
	const reviewGate = Promise.withResolvers<void>();
	provider.setResponses(
		Array.from({ length: 12 }, () => async (transcript) => {
			const latest = transcript.messages.filter((m) => m.role === "system").at(-1)!;
			const section = latest.sections!["role-packet"]!;
			const prompt = JSON.parse(section.slice(section.indexOf("\n") + 1, section.lastIndexOf("\n")));
			if (prompt.packet.role === "challenger") {
				await reviewGate.promise;
				return fauxAssistantMessage(
					fauxToolCall("submit_role_result", {
						text: JSON.stringify({
							schema: 1,
							...prompt.checkpointReview,
							checks: {
								alternatives: "different decompositions compared",
								interactions: "ownership boundary",
								scale: "bounded work",
								usage: "human notes survive",
								incidentalChoices: "worker count not chosen",
								nearbyCopying: "not justified by examples",
							},
							objections: [],
						}),
						supports: [],
					}),
					{ stopReason: "toolUse" },
				);
			}
			const request = prompt.checkpoints.requests[0];
			const report = prompt.results[0]?.report;
			const command = !request
				? { type: "requestCheckpoint", stage: "seams", scope: prompt.packet.inputs[0], required: { candidates: false, experiment: false } }
				: !request.emission
					? { type: "stageCheckpoint", request: request.id, text: markdown, manifest: manifest() }
					: !report
						? { type: "requestCheckpointReview", request: request.id, key: "challenge" }
						: !request.ready
							? { type: "emitCheckpoint", request: request.id, review: report, contested: [] }
							: null;
			return fauxAssistantMessage(
				command
					? fauxToolCall("checkpoint", { command: JSON.stringify(command) })
					: fauxToolCall("submit_role_result", {
							text: "Exact technical checkpoint ready for human review; no Contract accepted.",
							supports: [],
						}),
				{ stopReason: "toolUse" },
			);
		}),
	);
	const f = await roleFixture(new Engine({ provider: provider.provider, apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" } }));
	try {
		await allowSameFamily(f.ledger);
		const ground = result(
			await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "tool-ground",
					workflow: "workflow:2",
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "ground",
						mediaType: "text/markdown",
						content: Buffer.from("Design a service with explicit ownership.").toString("base64"),
					},
				},
				admin,
			),
		).revision as string;
		result(
			await f.command({
				type: "assignTask",
				slice: "design",
				delivery: false,
				packet: packet({ inputs: [ground], maxTurns: 12, requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }),
			}),
		);
		await until(() => assignments(f)[0]?.blocker === "awaiting_role_results");
		reviewGate.resolve();
		await until(() => assignments(f)[0]?.status === "submitted");
		const requests = ((f.ledger.snapshot(admin) as Frame).workflows as { checkpoints: Checkpoints }[])[0]!.checkpoints.requests;
		assert.equal(requests.length, 1);
		assert.equal(requests[0]!.ready, true);
		assert.equal(requests[0]!.status, "pending");
		assert.equal(assignments(f).length, 2);
		assert.notEqual(assignments(f)[0]!.conversation, assignments(f)[1]!.conversation);
	} finally {
		reviewGate.resolve();
		await f.close();
	}
});

test("C01/C14 single pending identity, checked cancellation and successor", async () => {
	const t = await fixture();
	try {
		const request = await t.request();
		assert.equal(
			code(await t.cmd({ type: "requestCheckpoint", stage: "seams", scope: t.scope, required: { candidates: false, experiment: false } })),
			"checkpoint_pending",
		);
		for (const principal of [admin, scheduler])
			assert.equal(
				code(
					await t.f.command(
						{ type: "requestCheckpoint", stage: "seams", scope: "revision:3", required: { candidates: false, experiment: false } },
						principal,
					),
				),
				"forbidden_principal",
			);
		assert.equal(t.pending().requests.length, 1);
		assert.equal(
			code(await t.f.command({ type: "cancelCheckpoint", request, expectedEmission: "wrong", reason: "replace" }, admin)),
			"stale_basis",
		);
		result(await t.f.command({ type: "cancelCheckpoint", request, expectedEmission: null, reason: "Replace this question" }, admin));
		assert.notEqual(await t.request(), request);
		assert.equal(t.pending().requests[0]!.status, "canceled");
	} finally {
		await t.close();
	}
});

test("C03/C04 structural failures and required missing capabilities block before synthesis", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		for (const malformed of [
			{ ...manifest(), nodes: [] },
			{ ...manifest(), verificationStrategy: "" },
			{ ...manifest(), decompositions: [] },
		])
			assert.equal(code(await t.cmd({ type: "stageCheckpoint", request: r, text: markdown, manifest: malformed })), "invalid_content");
		result(await t.f.command({ type: "cancelCheckpoint", request: r, expectedEmission: null, reason: "Need candidates" }, admin));
		const required = await t.request("seams", { required: { candidates: true, experiment: false } });
		assert.equal(
			code(await t.cmd({ type: "stageCheckpoint", request: required, text: markdown, manifest: manifest() })),
			"capability_unavailable",
		);
		assert.equal(t.pending().requests.at(-1)!.emission, null);
	} finally {
		await t.close();
	}
});

test("C05 exact review and configured family; stale review cannot authorize revised bytes", async () => {
	const t = await fixture(false);
	try {
		const r = await t.request();
		await t.draft(r);
		assert.equal(code(await t.cmd({ type: "requestCheckpointReview", request: r, key: "challenge" })), "capability_unavailable");
		assert.equal(code(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [] }, admin)), "review_required");
	} finally {
		await t.close();
	}
	const t2 = await fixture();
	try {
		const r = await t2.request();
		await t2.draft(r);
		const old = await t2.review(r);
		await t2.draft(r, [], "seams", { text: `${markdown}\nNew scale decision.` });
		assert.equal(
			code(
				await t2.cmd({
					type: "emitCheckpoint",
					request: r,
					review: old,
					contested: [{ objection: "O1", disposition: "considered", reason: "reason", resulting: "N1" }],
				}),
			),
			"stale_basis",
			"stale challenge must not authorize changed emission",
		);
		await t2.emit(r);
		const challengers = assignments(t2.f).filter((a) => a.packet.role === "challenger");
		assert.notEqual(challengers[0]!.conversation, challengers[1]!.conversation);
		assert.equal(t2.prompts.filter((p) => (p.packet as { role: string }).role === "challenger").length, 2);
	} finally {
		await t2.close();
	}
});

test("C02/C06/C07/C09 saves preserve complete edits and race basis; notes approve only original", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		const d = await t.draft(r);
		await t.emit(r);
		const old = t.basis(r);
		const devices = await t.devices();
		const [one, two] = (
			await Promise.all([
				devices.a({
					type: "saveCheckpointConcern",
					request: r,
					base: old.emission,
					text: "---\nworkflow: attacker\napproved: true\n---\nPlease combine these modules.\n",
				}),
				devices.b({ type: "saveCheckpointConcern", request: r, base: old.emission, text: "A second client's complete edit\r\n" }),
			])
		).map(result);
		assert.ok(one && two);
		assert.notEqual(one.concern, two.concern);
		assert.deepEqual([one.conflict, two.conflict].sort(), ["false", "true"]);
		assert.equal(t.pending().concerns.length, 2, "every acknowledged concern must survive");
		assert.equal(code(await devices.a({ type: "approveCheckpoint", ...old, nonbinding: [] })), "stale_basis");
		assert.equal(
			code(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), emission: one.revision, nonbinding: [] }, admin)),
			"stale_basis",
			"edited draft must never be approvable",
		);
		assert.equal(
			code(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [] }, admin)),
			"annotation_mapping_required",
		);
		const approval = result(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [one.concern, two.concern] }, admin));
		assert.equal(approval.emission, d.emission, "approve with notes accepts original emission only");
		const original = await t.f.ledger.artifact(admin, { read: d.emission as string });
		assert.ok("content" in original);
		assert.equal(original.content.toString(), markdown);
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [d.emission, d.manifest, one.revision, two.revision, approval.decision])
			assert.ok(exported.content[ref as string], `retained ${ref}`);
		const reattachStarted = performance.now();
		await t.reopen();
		assert.ok(performance.now() - reattachStarted < 5000, "checkpoint reattachment must finish within 5 seconds");
		assert.equal(t.pending().concerns.length, 2, "every acknowledged concern must survive");
		assert.equal(t.pending().requests[0]!.approved, d.emission);
		assert.deepEqual(t.pending().requests[0]!.nonbinding, [one.concern, two.concern]);
		const edit = await t.f.ledger.artifact(admin, { read: two.revision as string });
		assert.ok("content" in edit);
		assert.equal(edit.content.toString(), "A second client's complete edit\r\n");
	} finally {
		await t.close();
	}
});

test("C08 approval-first retains later edit as change request without changing acceptance", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		const d = await t.draft(r);
		await t.emit(r);
		const devices = await t.devices();
		result(await devices.a({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [] }));
		const saved = result(await devices.b({ type: "saveCheckpointConcern", request: r, base: d.emission, text: "" }));
		const empty = await t.f.ledger.artifact(admin, { read: saved.revision as string });
		assert.ok("content" in empty);
		assert.equal(empty.content.length, 0, "complete empty edit bytes are valid concerns");
		assert.equal(saved.changeRequest, "true");
		assert.equal(t.pending().requests[0]!.approved, d.emission);
		assert.equal(t.pending().concerns[0]!.changeRequest, true);
	} finally {
		await t.close();
	}
});

test("C07/C08 two authenticated device clients race approval and a complete edit through HTTP", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		const d = await t.draft(r);
		await t.emit(r);
		const basis = t.basis(r);
		const devices = await t.devices();
		const [approval, edit] = await Promise.all([
			devices.a({ type: "approveCheckpoint", ...basis, nonbinding: [] }),
			devices.b({ type: "saveCheckpointConcern", request: r, base: d.emission, text: "Concurrent device concern" }),
		]);
		const saved = result(edit);
		if (approval.status === "accepted") {
			assert.equal(saved.changeRequest, "true");
			assert.equal(t.pending().requests[0]!.approved, d.emission);
		} else {
			assert.equal(approval.code, "stale_basis");
			assert.equal(saved.changeRequest, "false");
			assert.equal(t.pending().requests[0]!.approved, null);
		}
		assert.equal(t.pending().concerns.length, 1);
	} finally {
		await t.close();
	}
});

test("C10 rework requires saved concern and complete reasoned mapping before new challenge", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		await t.draft(r);
		await t.emit(r);
		assert.equal(code(await t.cmd({ type: "reworkCheckpoint", request: r })), "concern_required");
		const concern = await t.save(r);
		result(await t.cmd({ type: "reworkCheckpoint", request: r }));
		assert.equal(
			code(await t.cmd({ type: "stageCheckpoint", request: r, text: markdown, manifest: manifest() })),
			"annotation_mapping_required",
		);
		await t.draft(r, [{ concern: concern.concern, disposition: "acted-on", reason: "Clarified ownership", resulting: "N1" }]);
		await t.emit(r);
		const older = t.pending().concerns[0]!.base;
		result(
			await t.f.command(
				{ type: "saveCheckpointConcern", request: r, base: older, text: "Concurrent editor still on the earlier emission" },
				admin,
			),
		);
		assert.equal(t.pending().concerns.length, 2, "late saves against retained earlier emissions survive rework");
		const notes = t.pending().concerns.map((n) => n.id);
		assert.equal(t.pending().requests.length, 1);
		assert.equal(t.pending().requests[0]!.mode, "human");
		result(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), nonbinding: notes }, admin));
	} finally {
		await t.close();
	}
});

test("C11 unrelated save does not stale approval", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		await t.draft(r);
		await t.emit(r);
		const basis = t.basis(r);
		result(
			await t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: "unrelated",
					workflow: "workflow:2",
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "unrelated",
						mediaType: "text/plain",
						content: Buffer.from("new unrelated evidence").toString("base64"),
					},
				},
				admin,
			),
		);
		result(await t.f.command({ type: "approveCheckpoint", ...basis, nonbinding: [] }, admin));
	} finally {
		await t.close();
	}
});

test("C11 policy adoption stales pending approval; C12 missing exact manifest evidence refuses", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		const bad = manifest();
		bad.nodes[0]!.evidence = ["revision:missing"];
		assert.equal(code(await t.cmd({ type: "stageCheckpoint", request: r, text: markdown, manifest: bad })), "missing_content");
		await t.draft(r);
		await t.emit(r);
		const basis = t.basis(r);
		const policy = (t.f.ledger.snapshot(admin) as Frame).policy as { defaultRevision: string };
		const changed = result(
			await t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: "policy-change",
					command: {
						type: "changePolicy",
						expectedRevision: policy.defaultRevision,
						policy: { completedReviewLimit: 3, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
					},
				},
				admin,
			),
		);
		result(await t.f.command({ type: "adoptPolicy", revision: changed.policy, expectedBinding: basis.policyBinding }, admin));
		assert.equal(code(await t.f.command({ type: "approveCheckpoint", ...basis, nonbinding: [] }, admin)), "stale_basis");
	} finally {
		await t.close();
	}
});

test("C16 machine principal cannot approve or submit human concerns; scoped reads refuse", async () => {
	const t = await fixture();
	try {
		const r = await t.request();
		const d = await t.draft(r);
		await t.emit(r);
		assert.equal(code(await t.cmd({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [] })), "forbidden_principal");
		assert.equal(
			code(await t.cmd({ type: "saveCheckpointConcern", request: r, base: d.emission, text: "Fake human note" })),
			"forbidden_principal",
		);
		const enrolled = await t.f.ledger.command(
			{
				version: 1,
				authorityEpoch: t.f.ledger.status().authorityEpoch,
				commandId: "limited",
				command: { type: "enrollDevice", label: "no workflows", scope: { workflows: [] } },
			},
			admin,
		);
		assert.equal(enrolled.status, "accepted");
		if (enrolled.status !== "accepted") throw new Error("enrollment");
		const limited = mintContext({
			kind: "human",
			human: "human:owner",
			route: "device",
			device: enrolled.result.device as string,
			workflows: [],
		});
		assert.equal(code(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [] }, limited)), "forbidden_scope");
		const read = await t.f.ledger.artifact(limited, { read: d.emission as string });
		assert.ok("status" in read);
		assert.equal(read.code, "unauthorized");
	} finally {
		await t.close();
	}
});

test("C13 Modules refine approved Seams; revised Seams blocks old dependent execution, preserves history", async () => {
	const t = await fixture();
	try {
		assert.equal(
			code(
				await t.cmd({
					type: "requestCheckpoint",
					stage: "modules",
					scope: t.scope,
					required: { candidates: false, experiment: false },
				}),
			),
			"seams_required",
		);
		const r = await t.request();
		const d = await t.draft(r);
		await t.emit(r);
		result(await t.f.command({ type: "approveCheckpoint", ...t.basis(r), nonbinding: [] }, admin));
		const modules = await t.request("modules");
		await t.draft(modules, [], "modules");
		await t.emit(modules);
		await t.request();
		assert.equal(code(await t.f.command({ type: "approveCheckpoint", ...t.basis(modules), nonbinding: [] }, admin)), "seams_required");
		assert.equal(t.pending().requests[0]!.approved, d.emission);
		const dependent = await t.f.command({
			type: "assignTask",
			slice: "dependent",
			delivery: true,
			packet: packet({ role: "implementer", inputs: [d.emission as string] }),
		});
		assert.equal(code(dependent), "seams_required");
	} finally {
		await t.close();
	}
});
