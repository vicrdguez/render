import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { change, type KernelState, type VerifiedFacts } from "../src/kernel/kernel.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { assignments, finding, ground, investigationPacket, saveGround, sourceFiles, until } from "./support/investigation.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { git, gitSourceFixture } from "./support/source.ts";

function provider() {
	return fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
}
function own(a: RoleAssignment) {
	return mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
}
function code(reply: { status: string; code?: string }) {
	return reply.code ?? reply.status;
}
function sourceRef(a: RoleAssignment) {
	return a.investigationSource!;
}

// Literal Kernel oracles extend V1 without duplicating the existing 10,000-schedule driver.
test("G01/G02 Kernel distinguishes human shape from unconfirmed classification", () => {
	const state: KernelState = { workflow: { id: "workflow:2", messageCount: 0 }, document: null, device: null };
	for (const [origin, confirmed, expected] of [
		["human", false, "accepted"],
		["classifier", false, "shape_confirmation_required"],
		["classifier", true, "accepted"],
	] as const) {
		const facts = {
			principal: { kind: "host", scope: "scheduling" },
			sequence: 4,
			ids: { assignment: "assignment:4", attempt: "attempt:4", fact: "fact:4" },
			investigationGround: { ...ground, shape: { ...ground.shape, origin, confirmed } },
		} as VerifiedFacts;
		const before = structuredClone([state, facts]);
		const result = change(
			state,
			{ type: "assignTask", workflow: "workflow:2", slice: "workflow:2", delivery: false, packet: investigationPacket("revision:3") },
			facts,
		);
		assert.equal(
			result.outcome === "accepted" ? "accepted" : result.code,
			expected,
			"unconfirmed classifier shape must not become consent",
		);
		assert.deepEqual([state, facts], before, "Ground legality must remain pure");
	}
});

test("G04 malformed delivery packet remains an ordinary Kernel refusal", () => {
	const result = change(
		{ workflow: { id: "workflow:2", messageCount: 0 }, document: null, device: null },
		{ type: "assignTask", workflow: "workflow:2", slice: "workflow:2", delivery: true },
		{ principal: { kind: "host", scope: "scheduling" }, sequence: 4, ids: { fact: "fact:4" } },
	);
	assert.deepEqual(result, {
		outcome: "refused",
		code: "invalid_content",
		reason: "Assignment requires an explicit packet, Slice and ownership mode.",
	});
});

test("G02 classifier suggestion requires confirmation, human shape does not", async () => {
	const f = await roleFixture();
	try {
		const proposed = await saveGround(f.ledger, { ...ground, shape: { ...ground.shape, origin: "classifier" } });
		const refused = await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(proposed) });
		assert.equal(code(refused), "shape_confirmation_required", "unconfirmed classifier shape must not become consent");
		assert.equal(assignments(f.ledger).length, 0);
		const confirmed = await saveGround(
			f.ledger,
			{ ...ground, shape: { value: "investigation", origin: "classifier", confirmed: true } },
			proposed,
			"confirm",
		);
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(confirmed) })),
			"accepted",
		);
		const original = await f.ledger.artifact(admin, { read: proposed });
		assert.ok("content" in original);
		assert.equal(JSON.parse(original.content.toString()).shape.confirmed, false);
	} finally {
		await f.close();
	}
});

test("G03/G04 Ground cannot authorize delivery, writers or child roles", async () => {
	const f = await roleFixture();
	try {
		const ref = await saveGround(f.ledger);
		for (const [delivery, overrides] of [
			[true, {}],
			[false, { execution: "linux-writer" }],
			[false, { role: "implementer" }],
			[false, { requests: [{ key: "experiment", packet: packet({ role: "experiment-candidate" }) }] }],
		] as const) {
			const reply = await f.command({
				type: "assignTask",
				slice: "workflow:2",
				delivery,
				packet: investigationPacket(ref, undefined, overrides as Parameters<typeof packet>[0]),
			});
			assert.equal(code(reply), "forbidden_scope", "investigation must not create delivery work");
		}
		assert.equal(assignments(f.ledger).length, 0);
		for (const bad of ["revision:missing", "revision:3"]) {
			const result = await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(bad) });
			assert.ok(result.status === "refused", JSON.stringify(result));
		}
		const accepted = await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(ref) });
		assert.equal(code(accepted), "accepted", "explicit human shape requires no second vote");
		await until(() => assignments(f.ledger)[0]?.status === "blocked");
		const a = assignments(f.ledger)[0]!;
		assert.equal(a.delivery, false);
		assert.match(a.blocker!, /investigation_source_capability_unavailable/);
		assert.equal(
			code(await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin)),
			"accepted",
		);
		await until(() => assignments(f.ledger)[0]?.status === "canceled");
		const canceled = assignments(f.ledger)[0]!;
		const widened = await f.command({
			type: "replaceTask",
			assignment: canceled.id,
			generation: canceled.generation,
			attempt: canceled.attempt,
			packet: packet({ role: "implementer", execution: "linux-writer" }),
		});
		assert.equal(code(widened), "forbidden_scope", "replacement cannot turn investigation into implementation");
	} finally {
		await f.close();
	}
});

for (const escalation of [false, true])
	test(`G05/G06/G07/G10/G14 cited ${escalation ? "escalation" : "finding"} survives normal restart and fresh-client export`, async () => {
		const source = await gitSourceFixture(sourceFiles);
		const before = git(source.repo, ["show-ref"]).toString();
		const p = provider();
		let prompt: Record<string, unknown> | undefined;
		let resultText = "";
		p.setResponses([
			(transcript) => {
				const user = transcript.messages.filter((m) => m.role === "user").at(-1);
				assert.equal(typeof user?.content, "string");
				prompt = JSON.parse(user!.content as string);
				const inputs = prompt!.inputs as { ref: string; text: string }[];
				const sourceInput = inputs.find((i) => i.text.includes('"kind":"investigation-source"'))!;
				assert.ok(sourceInput, "provider must receive exact retained source before claiming inspection");
				const observed = JSON.parse(sourceInput.text);
				assert.equal(observed.commit, source.commit);
				assert.equal(
					observed.entries.find((e: { path: string }) => e.path === "boundary.ts").text,
					"export const accepts = (x: number) => x > 0;\r\n",
				);
				assert.equal(JSON.stringify(prompt).includes("FOREIGN-SOURCE-CANARY"), false, "source reads remain scoped");
				const groundInput = inputs.find((i) => i.text.includes(ground.donePredicate))!;
				assert.ok(groundInput);
				resultText = JSON.stringify(finding(sourceInput.ref, groundInput.ref, escalation));
				return fauxAssistantMessage(fauxToolCall("submit_role_result", { text: resultText, supports: [] }), { stopReason: "toolUse" });
			},
		]);
		const engine = new Engine({
			provider: p.provider,
			apiKey: "owned-fixture",
			families: { "claude-sonnet-4-6": "claude" },
			investigations: { root: join(source.root, "investigation"), repositories: { owned: source.repo } },
		});
		const f = await roleFixture(engine);
		try {
			const ref = await saveGround(f.ledger);
			const accepted = await f.command({
				type: "assignTask",
				slice: "workflow:2",
				delivery: false,
				packet: investigationPacket(ref, source.commit),
			});
			assert.equal(code(accepted), "accepted", JSON.stringify(accepted));
			await until(() => !!assignments(f.ledger)[0]?.report && !assignments(f.ledger)[0]?.executing);
			const a = assignments(f.ledger)[0]!;
			assert.equal(a.status, escalation ? "blocked" : "submitted");
			assert.equal(a.delivery, false);
			assert.equal(assignments(f.ledger).length, 1, "finding or escalation schedules no delivery roles");
			if (escalation) {
				assert.match(a.blocker!, /experiment_preregistration_required/);
				assert.match(a.blocker!, /Provide the experiment capability/);
				assert.equal(
					code(
						await f.command({
							type: "rebindAttempt",
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
							providerIdle: true,
							environment: "absent",
							effects: "reconciled",
							executorEpoch: f.ledger.status().executorEpoch,
						}),
					),
					"recovery_required",
				);
			}
			const report = await f.ledger.artifact(admin, { read: a.report! });
			assert.ok("content" in report);
			assert.equal(report.content.toString(), resultText);
			const exportBefore = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			assert.ok("manifest" in exportBefore && exportBefore.manifest.complete);
			for (const r of [ref, a.report!, sourceRef(a)]) assert.ok(exportBefore.content[r], `retain ${r} before settlement`);
			const records = exportBefore.jsonl
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			assert.equal(records.find((r) => r.ref === a.report)?.createdBy.principal, "assignment-agent");
			assert.equal(records.find((r) => r.ref === sourceRef(a))?.createdBy.principal, "host");
			assert.equal(records.find((r) => r.ref === ref)?.createdBy.principal, "human");
			await f.reopen();
			const retained = assignments(f.ledger)[0]!;
			assert.equal(retained.report, a.report);
			assert.equal(retained.blocker, a.blocker);
			for (const r of [ref, a.report!, sourceRef(a)]) {
				const value = await f.ledger.artifact(admin, { read: r });
				assert.ok("content" in value);
				assert.equal(value.content.toString("base64"), exportBefore.content[r]);
			}
			// These five values are available to a fresh client, with no original chat.
			assert.equal(JSON.parse(Buffer.from(exportBefore.content[ref]!, "base64").toString()).constraints[1], "No implementation commitment");
			assert.equal(retained.packet.role, "coordinator");
			assert.ok(retained.report);
			assert.equal(retained.status, escalation ? "blocked" : "submitted");
			assert.equal(
				JSON.parse(resultText).next?.question ?? null,
				escalation ? "Provide the experiment capability or choose a read-only conclusion." : null,
			);
			assert.equal(git(source.repo, ["show-ref"]).toString(), before, "investigation must leave consumer refs unchanged");
			assert.equal(git(source.repo, ["show", `${source.commit}:boundary.ts`]).toString(), sourceFiles["boundary.ts"].text);
		} finally {
			await f.close();
			await source.close();
		}
	});

test("G08 uncited, foreign and out-of-scope results cannot settle investigation", async () => {
	const source = await gitSourceFixture(sourceFiles);
	const p = provider();
	const gate = Promise.withResolvers<void>();
	p.setResponses([
		async () => {
			await gate.promise;
			return fauxAssistantMessage("Done");
		},
	]);
	const f = await roleFixture(
		new Engine({
			provider: p.provider,
			apiKey: "fixture",
			families: { "claude-sonnet-4-6": "claude" },
			investigations: { root: join(source.root, "investigation"), repositories: { owned: source.repo } },
		}),
	);
	try {
		const ref = await saveGround(f.ledger);
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(ref, source.commit) })),
			"accepted",
		);
		await until(() => assignments(f.ledger)[0]?.status === "running" && !!sourceRef(assignments(f.ledger)[0]!));
		const a = assignments(f.ledger)[0]!;
		for (const text of [
			"I inspected it; implement now.",
			JSON.stringify(finding("revision:foreign", ref)),
			JSON.stringify({
				...finding(sourceRef(a), ref),
				facts: [{ text: "Secret", citations: [{ ref: sourceRef(a), path: "private.txt" }] }],
			}),
		]) {
			const reply = await f.command({ type: "submitRoleResult", text, supports: [] }, own(a));
			assert.equal(code(reply), "invalid_content", "uncited or out-of-scope finding must not settle");
			assert.equal(assignments(f.ledger)[0]?.report, null);
		}
		const fabricatedRunner = await f.command(
			{
				type: "recordRunnerObservation",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				text: "Claimed finding without citations",
			},
			mintContext({ kind: "host", scope: "effects" }),
		);
		assert.equal(code(fabricatedRunner), "forbidden_scope", "host runner observation cannot substitute for coordinator finding");
		assert.equal(code(await f.command({ type: "requestRole", key: "implementation" }, own(a))), "forbidden_scope");
		assert.equal(
			code(
				await f.command(
					{
						type: "acceptIntake",
						intake: "not-an-intake",
						review: "not-a-review",
						annotations: 0,
						policyBinding: "not-a-binding",
						decisions: [],
					},
					own(a),
				),
			),
			"forbidden_principal",
		);
		const stale = mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation + 1,
			attempt: a.attempt,
			role: "coordinator",
		});
		assert.equal(
			code(await f.command({ type: "submitRoleResult", text: JSON.stringify(finding(sourceRef(a), ref)), supports: [] }, stale)),
			"unauthorized",
		);
	} finally {
		gate.resolve();
		await f.close();
		await source.close();
	}
});

test("G09 missing selected source blocks with exact path and retains ownership", async () => {
	const source = await gitSourceFixture(sourceFiles);
	const p = provider();
	const f = await roleFixture(
		new Engine({
			provider: p.provider,
			apiKey: "fixture",
			families: { "claude-sonnet-4-6": "claude" },
			investigations: { root: join(source.root, "investigation"), repositories: { owned: source.repo } },
		}),
	);
	try {
		const ref = await saveGround(f.ledger);
		const input = investigationPacket(ref, source.commit);
		assert.ok(input.investigation);
		input.investigation.paths.push("absent.ts");
		assert.equal(code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: input })), "accepted");
		await until(() => assignments(f.ledger)[0]?.status === "blocked");
		const a = assignments(f.ledger)[0]!;
		assert.match(a.blocker!, /absent.ts/);
		assert.equal(a.report, null);
		assert.equal(a.executing, false);
		assert.ok(a.task);
	} finally {
		await f.close();
		await source.close();
	}
});

for (const failure of ["missing_content", "content_corrupt"])
	test(`G11 ${failure} source is never substituted after restart`, async () => {
		const source = await gitSourceFixture(sourceFiles);
		const p = provider();
		p.setResponses([() => fauxAssistantMessage("No conclusion yet.")]);
		const f = await roleFixture(
			new Engine({
				provider: p.provider,
				apiKey: "fixture",
				families: { "claude-sonnet-4-6": "claude" },
				investigations: { root: join(source.root, "investigation"), repositories: { owned: source.repo } },
			}),
		);
		try {
			const ref = await saveGround(f.ledger);
			assert.equal(
				code(
					await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(ref, source.commit) }),
				),
				"accepted",
			);
			await until(() => assignments(f.ledger)[0]?.status === "blocked" && !assignments(f.ledger)[0]?.executing);
			const a = assignments(f.ledger)[0]!;
			assert.ok(sourceRef(a));
			await f.harness.close(ctx);
			const db = new DatabaseSync(join(f.data, "render.db"));
			try {
				const row = db.prepare("SELECT id, record FROM entries WHERE json_extract(record, '$.data.revision') = ?").get(sourceRef(a)) as {
					id: number;
					record: string;
				};
				assert.ok(row);
				if (failure === "missing_content") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
				else {
					const record = JSON.parse(row.record);
					record.data.text = "new plausible bytes";
					db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
				}
			} finally {
				db.close();
			}
			const engine = await f.reopen();
			await assert.rejects(
				engine.render(assignments(f.ledger)[0]!),
				new RegExp(sourceRef(a)),
				"restore exact source rather than refetching",
			);
			const bundle = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			assert.ok("manifest" in bundle);
			assert.equal(bundle.manifest.complete, false);
			assert.ok(bundle.manifest.missing.some((m) => m.ref === sourceRef(a) && m.code === failure));
		} finally {
			await f.close();
			await source.close();
		}
	});
