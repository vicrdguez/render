import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import type { WorkflowView } from "../src/kernel/kernel.ts";
import type { PolicyState } from "../src/kernel/policy.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { admin, packet, roleFixture, scheduler } from "./support/roles.ts";

for (const scenario of ["without Ground", "with Ground", "already blocked"] as const) {
	test(`policy-adoption: in-flight handover ${scenario} retains ownership until checked cancellation and replacement`, async () => {
		const gate = Promise.withResolvers<void>();
		const transcripts: string[] = [];
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		p.setResponses([
			async (transcript) => {
				transcripts.push(JSON.stringify(transcript));
				await gate.promise;
				return fauxAssistantMessage(fauxToolCall("read_artifact", { ref: "revision:3" }), { stopReason: "toolUse" });
			},
			(transcript) => {
				transcripts.push(JSON.stringify(transcript));
				return fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "NEW-POLICY-REPORT" }), { stopReason: "toolUse" });
			},
		]);
		const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } }));
		const snapshot = () => {
			const frame = f.ledger.snapshot(admin);
			assert.ok("assignments" in frame);
			return {
				assignments: frame.assignments as RoleAssignment[],
				workflows: frame.workflows as WorkflowView[],
				policy: frame.policy as PolicyState,
			};
		};
		const until = async (check: () => boolean) => {
			for (let n = 0; n < 500 && !check(); n++) await setTimeout(10);
			assert.ok(check(), "policy-interrupted work must reach the expected retained state");
		};
		try {
			if (scenario !== "without Ground") {
				const saved = await f.ledger.command(
					{
						version: 1,
						authorityEpoch: f.ledger.status().authorityEpoch,
						commandId: "handover-ground",
						workflow: "workflow:2",
						expected: { document: null },
						command: {
							type: "saveDocument",
							document: "ground",
							mediaType: "text/plain",
							content: Buffer.from("Retain delivery ownership.").toString("base64"),
						},
					},
					admin,
				);
				assert.equal(saved.status, "accepted");
			}
			assert.equal(
				(await f.command({ type: "assignTask", slice: "policy-interrupted", delivery: true, packet: packet() })).status,
				"accepted",
			);
			await until(() => transcripts.length === 1);
			const old = snapshot().assignments[0]!;
			if (scenario === "already blocked") {
				assert.equal(
					(
						await f.command({
							type: "recordBlocker",
							assignment: old.id,
							generation: old.generation,
							attempt: old.attempt,
							reason: "runtime_task_faulted_reconciliation_required",
						})
					).status,
					"accepted",
				);
			}
			const published = await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "in-flight-policy",
					command: { type: "changePolicy", expectedRevision: "policy:initial", policy },
				},
				admin,
			);
			assert.ok(published.status === "accepted");
			const adopted = await f.command(
				{ type: "adoptPolicy", revision: published.result.policy, expectedBinding: old.policyBinding },
				admin,
			);
			assert.ok(adopted.status === "accepted");
			const current = snapshot();
			const interrupted = current.assignments[0]!;
			assert.equal(interrupted.status, "blocked");
			assert.equal(interrupted.executing, true, "adoption must not release the in-flight execution slot");
			assert.equal(
				interrupted.blocker,
				scenario === "already blocked" ? "runtime_task_faulted_reconciliation_required" : "policy_refresh_required",
			);
			assert.equal(current.workflows[0]!.owner.status, "blocked");
			assert.equal(current.workflows[0]!.owner.assignments[0]!.id, old.id);
			assert.equal(current.workflows[0]!.blocker?.code, interrupted.blocker);
			assert.deepEqual(
				current.workflows[0]!.nextHumanAction,
				{
					type: "cancelWork",
					workflow: "workflow:2",
					assignment: old.id,
					generation: old.generation,
					attempt: old.attempt,
					reason:
						"Cancel this blocked assignment to fence its Attempt. Wait for confirmed quiescence before scheduling a fresh linked replacement.",
				},
				"blocked-work handover must name the checked human recovery action before Ground setup",
			);
			assert.equal(
				(await f.command({ type: "assignTask", slice: "policy-interrupted", delivery: true, packet: packet() })).status,
				"refused",
			);
			assert.equal(
				(await f.command({ type: "replaceTask", assignment: old.id, generation: old.generation, attempt: old.attempt, packet: packet() }))
					.status,
				"refused",
			);
			gate.resolve();
			await until(() => snapshot().assignments[0]!.runtimeTaskCaptured === true);
			assert.equal(transcripts.length, 1, "no follow-up request on the old policy basis may reach the provider");
			assert.equal(snapshot().assignments[0]!.report, null);
			assert.equal(snapshot().assignments[0]!.executing, false);
			assert.equal((await f.command({ ...snapshot().workflows[0]!.nextHumanAction }, admin)).status, "accepted");
			await until(() => snapshot().assignments[0]!.status === "canceled");
			const canceled = snapshot().assignments[0]!;
			assert.equal(
				(
					await f.command({
						type: "replaceTask",
						assignment: canceled.id,
						generation: canceled.generation,
						attempt: canceled.attempt,
						packet: packet(),
					})
				).status,
				"accepted",
			);
			await until(() => snapshot().assignments[1]?.runtimeTaskCaptured === true);
			const fresh = snapshot().assignments[1]!;
			assert.equal(fresh.status, "submitted");
			assert.equal(fresh.predecessor, old.id);
			assert.notEqual(fresh.conversation, old.conversation);
			assert.equal(fresh.policyBinding, adopted.result.binding);
			assert.equal(transcripts.length, 2);
			assert.ok(transcripts[1]!.includes(String(adopted.result.binding)));
			assert.ok(!transcripts[1]!.includes(String(old.policyBinding)), "replacement must not inherit the old policy transcript");
		} finally {
			gate.resolve();
			await f.close();
		}
	});
}

test("policy-adoption: completed Watchdog reports and counts survive adopt-away/back", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses([fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "COMPLETED-REVIEW-6" }), { stopReason: "toolUse" })]);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned", families: { "claude-sonnet-4-6": "claude" } }));
	const frame = () => f.ledger.snapshot(admin) as Record<string, any>;
	try {
		await f.command({ type: "assignTask", slice: "watchdog", delivery: false, packet: packet({ role: "watchdog" }) });
		for (let n = 0; n < 300 && !frame().assignments[0]?.runtimeTaskCaptured; n++) await setTimeout(10);
		const completed = frame().assignments[0];
		assert.equal(completed.status, "submitted");
		const initial = frame().policy.bindings["workflow:2"];
		const published = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "count-policy",
				command: {
					type: "changePolicy",
					expectedRevision: "policy:initial",
					policy: { completedReviewLimit: 0, reviewerDiversity: "different-family", minimumEvidenceRank: "tests" },
				},
			},
			admin,
		);
		assert.ok(published.status === "accepted");
		assert.equal(
			(await f.command({ type: "adoptPolicy", revision: published.result.policy, expectedBinding: initial.revision }, admin)).status,
			"accepted",
		);
		assert.equal(
			(
				await f.command(
					{ type: "adoptPolicy", revision: "policy:initial", expectedBinding: frame().policy.bindings["workflow:2"].revision },
					admin,
				)
			).status,
			"accepted",
		);
		assert.equal(
			frame().assignments.filter((a: RoleAssignment) => a.packet.role === "watchdog" && a.status === "submitted").length,
			1,
			"completed review count must never reset",
		);
		assert.deepEqual(frame().assignments[0], completed);
		await f.reopen();
		assert.equal(frame().assignments[0].report, completed.report);
	} finally {
		await f.close();
	}
});

for (const damage of ["missing", "corrupt", "schema"] as const) {
	test(`policy-adoption: ${damage} policy bytes are declared, not substituted`, async () => {
		const f = await roleFixture();
		try {
			const published = await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "damaged-policy-revision",
					command: {
						type: "changePolicy",
						expectedRevision: "policy:initial",
						policy: { completedReviewLimit: 4, reviewerDiversity: "different-family", minimumEvidenceRank: "tests" },
					},
				},
				admin,
			);
			assert.ok(published.status === "accepted");
			await f.harness.close(ctx);
			const db = new DatabaseSync(join(f.data, "render.db"));
			try {
				for (const row of db.prepare("SELECT id, record FROM entries").all() as { id: number; record: string }[]) {
					const entry = JSON.parse(row.record);
					if (entry.kind !== "render.policy") continue;
					if (damage === "missing") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
					else {
						if (damage === "schema") entry.data.schema = 999;
						else if (typeof entry.data.text === "string") entry.data.text = "Substituted policy";
						else entry.data.policy.completedReviewLimit = 999;
						db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(entry), row.id);
					}
				}
			} finally {
				db.close();
			}
			await f.reopen();
			const enrolled = await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "scoped-policy-reader",
					command: { type: "enrollDevice", label: "scoped", scope: { workflows: ["workflow:2"] } },
				},
				admin,
			);
			assert.ok(enrolled.status === "accepted" && enrolled.credential);
			const scoped = f.ledger.authenticate(`Bearer ${enrolled.credential.bearer}`);
			assert.ok(scoped);
			const forbidden = await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "scoped-create",
					command: { type: "createWorkflow", title: "Outside scope" },
				},
				scoped,
			);
			assert.ok(
				forbidden.status === "refused" && forbidden.code === "forbidden_scope",
				"global scope must be checked before policy-source diagnostics",
			);
			const initial = (f.ledger.snapshot(admin) as import("../src/ledger/ledger.ts").Frame)
				.policy as import("../src/kernel/policy.ts").PolicyState;
			const adopted = await f.command(
				{ type: "adoptPolicy", revision: published.result.policy, expectedBinding: initial.bindings["workflow:2"]!.revision },
				admin,
			);
			assert.ok(
				adopted.status === "refused" &&
					adopted.code === (damage === "missing" ? "missing_content" : damage === "schema" ? "unsupported_schema" : "content_corrupt"),
				"missing/corrupt policy meaning must not be reconstructed from the current-state cache",
			);
			const result = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			assert.ok("manifest" in result);
			assert.equal(result.manifest.complete, false, "damaged policy bytes must never be presented as complete history");
			assert.ok(
				result.manifest.missing.some(
					(m) => m.code === (damage === "missing" ? "missing_content" : damage === "schema" ? "unsupported_schema" : "content_corrupt"),
				),
			);
		} finally {
			await f.close();
		}
	});
}

test("policy-adoption: portable reader verifies actual policy payload bytes", async () => {
	const f = await roleFixture();
	try {
		const result = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in result && result.manifest.complete);
		assert.ok(result.content["policy-binding:2"], "portable policy bytes must be included");
		const path = join(f.data, "policy-export.json");
		await writeFile(path, JSON.stringify(result));
		const reader = spawnSync(process.execPath, ["src/client/read-export.ts", path], {
			cwd: new URL("../", import.meta.url),
			encoding: "utf8",
		});
		assert.equal(reader.status, 0, reader.stdout + reader.stderr);
		assert.ok(
			JSON.parse(reader.stdout).documents.some(
				(d: { ref: string; text: string }) => d.ref === "policy-binding:2" && JSON.parse(d.text).policy.completedReviewLimit === 2,
			),
		);
	} finally {
		await f.close();
	}
});

const policy = { completedReviewLimit: 4, reviewerDiversity: "different-family", minimumEvidenceRank: "tests" };

test("policy-adoption: future defaults, checked adoption away/back, old pending basis never revives", async () => {
	const f = await roleFixture();
	const frame = () => f.ledger.snapshot(admin) as Record<string, any>;
	try {
		const initial = frame().policy.bindings["workflow:2"];
		assert.equal(initial.policy, "policy:initial");
		assert.equal(frame().policy.revisions[initial.policy].completedReviewLimit, 2);
		const publish = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "policy-new",
				command: { type: "changePolicy", expectedRevision: "policy:initial", policy },
			},
			admin,
		);
		assert.ok(publish.status === "accepted");
		const next = String(publish.result.policy);
		assert.equal(frame().policy.bindings["workflow:2"].revision, initial.revision);
		const created = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "future",
				command: { type: "createWorkflow", title: "Future defaults" },
			},
			admin,
		);
		assert.ok(created.status === "accepted");
		assert.equal(frame().policy.bindings[String(created.result.workflow)].policy, next);
		const denied = await f.command({ type: "adoptPolicy", revision: next, expectedBinding: initial.revision }, scheduler);
		assert.ok(denied.status === "refused");
		const away = await f.command({ type: "adoptPolicy", revision: next, expectedBinding: initial.revision }, admin);
		assert.ok(away.status === "accepted");
		const after = frame().policy.bindings["workflow:2"];
		assert.notEqual(after.revision, initial.revision);
		const stale = await f.command({ type: "adoptPolicy", revision: "policy:initial", expectedBinding: initial.revision }, admin);
		assert.ok(stale.status === "refused" && stale.code === "stale_basis");
		const back = await f.command({ type: "adoptPolicy", revision: "policy:initial", expectedBinding: after.revision }, admin);
		assert.ok(back.status === "accepted");
		assert.equal(frame().policy.bindings["workflow:2"].policy, "policy:initial");
		assert.notEqual(frame().policy.bindings["workflow:2"].revision, initial.revision);
		await f.reopen();
		assert.equal(frame().policy.defaultRevision, next);
		assert.equal(frame().policy.bindings["workflow:2"].policy, "policy:initial");
		const exported = await f.ledger.artifact(admin, { export: {} });
		assert.ok("manifest" in exported && exported.manifest.complete);
		assert.ok(exported.jsonl.includes(next));
		assert.ok(exported.jsonl.includes("adoptPolicy"));
	} finally {
		await f.close();
	}
});

test("policy-adoption: refresh pending packets without deleting completed reports or review counts", async () => {
	const f = await roleFixture();
	const frame = () => f.ledger.snapshot(admin) as Record<string, any>;
	try {
		await f.command({ type: "assignTask", slice: "pending-policy", delivery: true, packet: packet() });
		const a = (frame().assignments as RoleAssignment[])[0]!;
		const binding = frame().policy.bindings["workflow:2"].revision;
		const publish = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "change-pending",
				command: { type: "changePolicy", expectedRevision: "policy:initial", policy },
			},
			admin,
		);
		assert.ok(publish.status === "accepted");
		const adopted = await f.command({ type: "adoptPolicy", revision: publish.result.policy, expectedBinding: binding }, admin);
		assert.ok(adopted.status === "accepted");
		const refreshed = (frame().assignments as RoleAssignment[])[0]!;
		assert.equal(refreshed.id, a.id);
		assert.equal(refreshed.conversation, a.conversation);
		assert.notEqual(refreshed.packetRef, a.packetRef);
		assert.notEqual(refreshed.policyBinding, a.policyBinding);
		const old = await f.ledger.artifact(admin, { read: a.packetRef });
		assert.ok("content" in old);
		assert.equal(old.content.toString(), JSON.stringify(a.packet));
		const current = await f.ledger.artifact(admin, { read: refreshed.packetRef });
		assert.ok("content" in current);
		assert.equal(current.content.toString(), JSON.stringify(refreshed.packet));
	} finally {
		await f.close();
	}
});
