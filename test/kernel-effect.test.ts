import assert from "node:assert/strict";
import { test } from "node:test";
import * as kernel from "../src/kernel/kernel.ts";

const project = {
	id: "project:1",
	revision: 1,
	name: "P",
	remote: "file:///p.git",
	defaultBranch: "main",
	checkImage: "render-check:p",
	principles: "AGENTS.md",
	createdAtSequence: 0,
};
const state: kernel.KernelState = { workflow: null, document: null, device: null, projects: { [project.id]: project } };
const human: kernel.Principal = { kind: "human", route: "local-admin", human: "owner" };
const facts = { principal: human, sequence: 1, ids: { workflow: "workflow:1", fact: "fact:1" } };
const create = { type: "createWorkflow", title: "First", project: project.id } as const;

test("Kernel Effect yields the accepted writes without mutating its input", async () => {
	const Effect = await import("effect/Effect");
	const before = structuredClone(state);
	const decision = Effect.runSync(kernel.change(state, create, facts));
	assert.equal(decision.outcome, "accepted");
	assert.deepEqual(decision.result, { workflow: "workflow:1", project: project.id });
	assert.deepEqual(decision.writes[0], { type: "workflow.create", workflow: "workflow:1", title: "First", project: project.id });
	assert.deepEqual(decision.facts, ["fact:1"]);
	assert.deepEqual(state, before);
});

test("Kernel Effect exposes authorization refusal as its typed failure before asking for identities", async () => {
	const Effect = await import("effect/Effect");
	const outcome = Effect.runSync(
		Effect.match(kernel.change(state, create, { ...facts, principal: { kind: "host", scope: "scheduling" }, ids: { fact: "fact:1" } }), {
			onFailure: (refusal) => refusal,
			onSuccess: () => assert.fail("an unauthorized host must not create a workflow"),
		}),
	);
	assert.equal(outcome.outcome, "refused");
	assert.equal(outcome.code, "forbidden_principal");
	assert.match(outcome.reason, /createWorkflow belongs to the human-decision family/);
});

test("Ledger finishes an admitted SQLite command when its Effect caller is interrupted", { timeout: 10000 }, async () => {
	const Effect = await import("effect/Effect");
	const Fiber = await import("effect/Fiber");
	const { admin, roleFixture } = await import("./support/roles.ts");
	const f = await roleFixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const finished = Promise.withResolvers<void>();
	const commit = f.harness.commit.bind(f.harness);
	try {
		f.harness.commit = (body, context) => {
			const pending = commit(async (tx) => {
				const result = await body(tx);
				entered.resolve();
				await release.promise;
				return result;
			}, context);
			void pending.then(() => finished.resolve(), finished.reject);
			return pending;
		};
		const raw = {
			version: 1,
			authorityEpoch: f.ledger.status().authorityEpoch,
			commandId: "interrupt-admitted-save",
			workflow: "workflow:3",
			expected: { document: null },
			command: {
				type: "saveDocument",
				document: "interrupted",
				mediaType: "text/plain",
				content: Buffer.from("Exact saved bytes\n").toString("base64"),
			},
		};
		const fiber = Effect.runFork(f.ledger.command(raw, admin));
		await entered.promise;
		const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
		release.resolve();
		await interrupted;
		await finished.promise;
		f.harness.commit = commit;
		assert.equal(f.ledger.status().hostMode, "active", "caller interruption is not a storage failure");
		const receipt = await Effect.runPromise(f.ledger.receipt(admin, raw.commandId));
		assert.equal(receipt.status, "accepted");
		if (receipt.status !== "accepted") throw new Error("save receipt missing");
		assert.equal(f.ledger.status().sequence, receipt.sequence, "the committed command must reach the read model despite interruption");
		const artifact = await Effect.runPromise(f.ledger.artifact(admin, { read: String(receipt.result.revision) }));
		assert.ok("content" in artifact);
		assert.equal(artifact.content.toString(), "Exact saved bytes\n");
		const duplicate = await Effect.runPromise(f.ledger.command(raw, admin));
		assert.equal(duplicate.status, "accepted");
		if (duplicate.status === "accepted") assert.equal(duplicate.duplicate, true);
		assert.equal(f.ledger.status().sequence, receipt.sequence, "replaying the interrupted caller cannot commit twice");
	} finally {
		release.resolve();
		f.harness.commit = commit;
		await f.close();
	}
});
