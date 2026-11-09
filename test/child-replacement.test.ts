import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { WorkflowView } from "../src/kernel/kernel.ts";
import type { PolicyState } from "../src/kernel/policy.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, allowSameFamily, claudeFixture, packet, roleFixture } from "./support/roles.ts";

for (const scenario of ["policy adoption", "policy adoption across restart", "repeated unsubmitted child"] as const) {
	test(`child replacement: ${scenario} resumes the waiting owner with only the linked result`, async () => {
		const oldGate = Promise.withResolvers<void>();
		const freshGate = Promise.withResolvers<void>();
		const transcripts: string[] = [];
		let parentCalls = 0;
		let childCalls = 0;
		let resultRef = "";
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		p.setResponses(
			Array.from({ length: 12 }, () => async (transcript) => {
				const text = JSON.stringify(transcript);
				if (text.includes("Required output: Waiting owner")) {
					transcripts.push(text);
					if (parentCalls++ === 0) return fauxAssistantMessage(fauxToolCall("request_role", { key: "review" }), { stopReason: "toolUse" });
					if (parentCalls === 2) return fauxAssistantMessage(fauxToolCall("read_artifact", { ref: resultRef }), { stopReason: "toolUse" });
					return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "OWNER-COMPLETE" }), {
						stopReason: "toolUse",
					});
				}
				childCalls++;
				if (text.includes("Required output: Interrupted child")) {
					await oldGate.promise;
					return scenario === "repeated unsubmitted child"
						? fauxAssistantMessage("No result submitted.")
						: fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "CANCELED-ATTEMPT-CANARY" }), {
								stopReason: "toolUse",
							});
				}
				if (text.includes("Required output: Unsubmitted replacement")) return fauxAssistantMessage("Still no result.");
				await freshGate.promise;
				return fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "LINKED-CHILD-RESULT" }), {
					stopReason: "toolUse",
				});
			}),
		);
		const engine = () => new Engine({ provider: p.provider, ...claudeFixture });
		const f = await roleFixture(engine());
		const snapshot = () => {
			const frame = f.ledger.snapshot(admin);
			assert.ok("assignments" in frame);
			return {
				assignments: frame.assignments as RoleAssignment[],
				workflow: (frame.workflows as WorkflowView[])[0]!,
				policy: frame.policy as PolicyState,
			};
		};
		const until = async (check: () => boolean, message: string) => {
			for (let n = 0; n < 500 && !check(); n++) await setTimeout(10);
			assert.ok(check(), message);
		};
		const identity = (a: RoleAssignment) => ({ assignment: a.id, generation: a.generation, attempt: a.attempt });
		const assertWaiting = () => {
			const s = snapshot();
			assert.equal(s.assignments[0]!.blocker, "awaiting_role_results");
			assert.equal(s.assignments[0]!.executing, false);
			assert.equal(s.workflow.owner.assignments[0]!.id, s.assignments[0]!.id);
			assert.equal(parentCalls, 1, "a canceled child without a submitted replacement cannot satisfy the wait");
		};
		try {
			await allowSameFamily(f.ledger);
			assert.equal(
				(
					await f.command({
						type: "assignTask",
						slice: "child-recovery",
						delivery: true,
						packet: packet({
							expectedOutput: "Waiting owner",
							maxTurns: 5,
							requests: [{ key: "review", packet: packet({ role: "challenger", expectedOutput: "Interrupted child" }) }],
						}),
					})
				).status,
				"accepted",
			);
			await until(
				() => childCalls === 1 && snapshot().assignments[0]?.blocker === "awaiting_role_results" && !snapshot().assignments[0]?.executing,
				"parent must wait for its executing child",
			);
			assertWaiting();
			assert.equal(snapshot().workflow.nextHumanAction.type, "saveGround", "awaiting parents must not be offered cancellation");
			const parent = snapshot().assignments[0]!;
			const original = snapshot().assignments[1]!;
			if (scenario !== "repeated unsubmitted child") {
				const state = snapshot().policy;
				const changed = await Effect.runPromise(
					f.ledger.command(
						{
							version: 1,
							authorityEpoch: f.ledger.status().authorityEpoch,
							commandId: "child-policy",
							command: {
								type: "changePolicy",
								expectedRevision: state.defaultRevision,
								policy: { completedReviewLimit: 3, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
							},
						},
						admin,
					),
				);
				assert.ok(changed.status === "accepted");
				assert.equal(
					(await f.command({ type: "adoptPolicy", revision: changed.result.policy, expectedBinding: original.policyBinding }, admin))
						.status,
					"accepted",
				);
				assert.equal(snapshot().assignments[1]!.executing, true);
				assert.equal(snapshot().assignments[1]!.blocker, "policy_refresh_required");
			}
			oldGate.resolve();
			await until(() => snapshot().assignments[1]?.runtimeTaskCaptured === true, "old child settles without an authoritative result");
			const cancelFromHandover = async (child: RoleAssignment) => {
				assertWaiting();
				const action = snapshot().workflow.nextHumanAction;
				assert.equal(action.type, "cancelWork");
				assert.ok(action.type === "cancelWork");
				assert.equal(action.assignment, child.id, "handover must select the blocked child, never its awaiting parent");
				assert.equal(action.generation, child.generation);
				assert.equal(action.attempt, child.attempt);
				const { workflow: _workflow, reason: _reason, ...command } = action;
				assert.equal((await f.command(command, admin)).status, "accepted");
				await until(
					() => snapshot().assignments.find((a) => a.id === child.id)?.status === "canceled",
					"checked child cancellation must quiesce",
				);
			};
			await cancelFromHandover(snapshot().assignments[1]!);
			const stale = mintContext({ kind: "assignment-agent", ...identity(original), role: "challenger" });
			assert.equal((await f.command({ type: "submitRoleResult", supports: [], text: "CANCELED-ATTEMPT-CANARY" }, stale)).status, "refused");
			assert.equal(snapshot().assignments[1]!.report, null);
			assertWaiting();
			const rebind = () =>
				f.command({
					type: "rebindAttempt",
					...identity(snapshot().assignments[0]!),
					providerIdle: true,
					environment: "absent",
					effects: "reconciled",
					executorEpoch: f.ledger.status().executorEpoch,
				});
			assert.equal((await rebind()).status, "refused", "a canceled leaf still represents an unsatisfied obligation");
			let predecessor = snapshot().assignments[1]!;
			if (scenario === "repeated unsubmitted child") {
				assert.equal(
					(
						await f.command({
							type: "replaceTask",
							...identity(predecessor),
							packet: packet({ role: "challenger", expectedOutput: "Unsubmitted replacement" }),
						})
					).status,
					"accepted",
				);
				await until(() => snapshot().assignments[2]?.runtimeTaskCaptured === true, "intermediate replacement must block");
				await cancelFromHandover(snapshot().assignments[2]!);
				predecessor = snapshot().assignments[2]!;
				assert.equal((await rebind()).status, "refused");
			}
			if (scenario === "policy adoption across restart") {
				await f.reopen(engine());
				assertWaiting();
				assert.equal(snapshot().workflow.nextHumanAction.type, "saveGround");
			}
			const replacement = await f.command({
				type: "replaceTask",
				...identity(predecessor),
				packet: packet({ role: "challenger", expectedOutput: "Fresh child" }),
			});
			assert.ok(replacement.status === "accepted");
			await until(() => snapshot().assignments.at(-1)?.executing === true, "fresh child must execute");
			const fresh = snapshot().assignments.at(-1)!;
			assert.equal(fresh.parent, original.parent);
			assert.equal(fresh.requestKey, "review");
			assert.equal(fresh.predecessor, predecessor.id);
			assert.notEqual(fresh.conversation, original.conversation);
			assert.equal(fresh.policyBinding, snapshot().policy.bindings["workflow:3"]!.revision);
			assert.equal((await rebind()).status, "refused", "an executing replacement is not yet a result");
			assertWaiting();
			// Observe the committed report before the next provider request reads it.
			const observer = Effect.runSync(
				f.ledger.observe(admin, {
					send: () => {
						resultRef = snapshot().assignments.at(-1)?.report ?? "";
					},
					end: () => {},
				}),
			);
			assert.ok("snapshot" in observer);
			try {
				freshGate.resolve();
				await until(() => snapshot().assignments.at(-1)?.status === "submitted", "linked replacement must submit");
				await until(
					() => snapshot().assignments[0]?.status === "submitted",
					"waiting delivery owner must continue with the linked replacement result",
				);
			} finally {
				observer.stop();
			}
			const completed = snapshot();
			assert.equal(completed.assignments[0]!.conversation, parent.conversation);
			assert.equal(completed.assignments[0]!.attempt, parent.attempt);
			assert.equal(completed.assignments[0]!.generation, parent.generation);
			assert.equal(completed.assignments[1]!.status, "canceled");
			assert.equal(completed.assignments[1]!.report, null);
			assert.ok(transcripts.at(-1)!.includes("LINKED-CHILD-RESULT"), "parent must actually read the replacement's retained report");
			assert.ok(!transcripts.slice(1).join("\n").includes("CANCELED-ATTEMPT-CANARY"));
			assert.equal(completed.workflow.owner.status, "none");
		} finally {
			oldGate.resolve();
			freshGate.resolve();
			await f.close();
		}
	});
}
