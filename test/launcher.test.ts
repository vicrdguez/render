// Piece 5 launcher: Engine's reconcile assigns the coordinator on a prompt and implementers on acceptance, with no
// human or fixture `assignTask`. The scripted provider drives the coordinator; implementers park at the provider.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import { initialEngineSettings } from "../src/kernel/engine-settings.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { launcher, WORKFLOW } from "./support/launcher.ts";
import { admin, claudeFixture } from "./support/roles.ts";
import { git } from "./support/source.ts";

const implementers = (t: Awaited<ReturnType<typeof launcher>>) => t.assignments().filter((a) => a.packet.role === "implementer");
const code = (results: unknown[], wanted: string) => results.some((r) => (r as { code?: string }).code === wanted);

test("L1: the first accepted message starts exactly one coordinator, and reconciles and a restart add none", async () => {
	const t = await launcher({ scripted: false });
	try {
		await setTimeout(300);
		assert.equal(t.coordinators().length, 0, "a workflow without a message has no coordinator");
		await t.prompt();
		await t.until(() => t.coordinators().length === 1, "coordinator launched");
		const [c] = t.coordinators() as [RoleAssignment];
		assert.equal(c.slice, WORKFLOW);
		assert.equal(c.delivery, false);
		assert.equal(c.parent, null);
		assert.deepEqual(
			c.packet.requests.map((r) => [r.key, r.packet.role, r.packet.execution]),
			[["fidelity", "challenger", "read-only"]],
		);
		const settings = initialEngineSettings();
		assert.equal(c.packet.settingsRevision, settings.revision, "the packet pins the current settings revision");
		assert.equal(c.packet.model, settings.value.roles.coordinator.model.id);
		assert.equal(c.packet.maxTurns, settings.value.roles.coordinator.maxTurns);
		await t.prompt("A second message");
		for (let i = 0; i < 3; i++) await Effect.runPromise(t.f.engine.reconcile());
		await t.f.reopen(new Engine({ ownedChecks: t.f.config, provider: t.f.provider.provider, ...claudeFixture }));
		await t.prompt("After restart");
		await setTimeout(1000);
		assert.equal(t.coordinators().length, 1, "no second coordinator after reconciles, messages or restart");
	} finally {
		await t.close();
	}
});

test("L5: default settings give the challenger a reviewer family other than the coordinator's", async () => {
	const t = await launcher({ scripted: false });
	try {
		await t.prompt();
		await t.until(() => t.coordinators().length === 1, "coordinator launched");
		const c = t.coordinators()[0]!;
		const fidelity = c.packet.requests[0]!.packet;
		assert.equal(c.packet.family, "claude");
		assert.equal(fidelity.family, "chatgpt");
		assert.notEqual(fidelity.family, c.packet.family);
	} finally {
		await t.close();
	}
});

test("L5: one family for writer and reviewer without human policy direction refuses the fidelity request", async () => {
	const t = await launcher({ sameFamilyDirection: false });
	try {
		await t.prompt();
		await t.confirmGround();
		await t.until(() => code(t.toolResults, "capability_unavailable"), "requestIntakeReview refused");
		assert.equal(t.assignments().filter((a) => a.packet.role === "challenger").length, 0, "no same-family challenger without direction");
	} finally {
		await t.close();
	}
});

test("L2: an unconfirmed classifier shape refuses checkpoint and intake work and asks the human to confirm Ground", async () => {
	let checkpoint: unknown;
	const t = await launcher({
		beforeStage: async (c) => {
			const actor = mintContext({
				kind: "assignment-agent",
				assignment: c.id,
				generation: c.generation,
				attempt: c.attempt,
				role: "coordinator",
			});
			checkpoint = await Effect.runPromise(
				t.f.ledger.command(
					{
						version: 1,
						authorityEpoch: t.f.ledger.status().authorityEpoch,
						commandId: "checkpoint-before-confirmation",
						workflow: WORKFLOW,
						command: {
							type: "requestCheckpoint",
							stage: "seams",
							scope: t.view().ground!.revision,
							required: { candidates: false, experiment: false },
						},
					},
					actor,
				),
			);
		},
	});
	try {
		await t.prompt();
		await t.until(() => t.view().nextHumanAction.type === "confirmGround", "Ground proposal offered");
		const action = t.view().nextHumanAction as { type: "confirmGround"; draft: string; expected: string | null; content: string };
		assert.equal(action.expected, null);
		const proposed = JSON.parse(action.content) as { shape: { value: string; origin: string; confirmed: boolean } };
		assert.deepEqual(proposed.shape, { value: "change", origin: "classifier", confirmed: true });
		// The human saves the proposal without confirming its classifier shape.
		const unconfirmed = JSON.stringify({ ...proposed, shape: { ...proposed.shape, confirmed: false } });
		const saved = await Effect.runPromise(
			t.f.ledger.command(
				{
					version: 1,
					authorityEpoch: t.f.ledger.status().authorityEpoch,
					commandId: "unconfirmed-ground",
					workflow: WORKFLOW,
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "ground",
						mediaType: "text/plain",
						content: Buffer.from(unconfirmed).toString("base64"),
					},
				},
				admin,
			),
		);
		assert.equal(saved.status, "accepted");
		await t.until(() => code(t.toolResults, "shape_confirmation_required"), "stageIntake refused");
		assert.equal((checkpoint as { code?: string }).code, "shape_confirmation_required");
		assert.equal(t.intakes().drafts.length, 0);
		assert.equal(t.view().nextHumanAction.type, "confirmGround");
	} finally {
		await t.close();
	}
});

test("L3: acceptance of two independent Slices assigns one complete implementer to each, with no start command", async () => {
	const t = await launcher({ slices: [{ id: "value" }, { id: "other" }] });
	try {
		await t.prompt();
		await t.confirmGround();
		await t.acceptIntake();
		await t.until(() => implementers(t).length === 2, "both implementers launched");
		const slices = t.intakes().slices;
		for (const s of slices) {
			const owners = implementers(t).filter((a) => a.slice === s.id);
			assert.equal(owners.length, 1, `${s.id} has one implementer`);
			const p = owners[0]!.packet;
			assert.equal(owners[0]!.delivery, true);
			assert.equal(p.execution, "linux-writer");
			assert.ok(p.inputs.includes(s.contract), "the packet binds the current Contract");
			assert.deepEqual(
				p.requests.map((r) => [r.key, r.packet.role]),
				[
					["standards", "audit-standards"],
					["contracts", "audit-contracts"],
					["watchdog", "watchdog"],
				],
			);
			assert.equal(p.verification?.contract, s.contract);
			assert.equal(p.verification?.commit, t.pinned, "the selection reads the commit the coordinator pinned");
			assert.equal(p.verification?.path, ".skl/verify.md");
			assert.deepEqual(p.verification?.behavioralRows, ["full-suite"]);
			assert.deepEqual([...(p.verification?.rows ?? [])].sort(), ["full-suite", "lint", "typecheck"]);
		}
		for (let i = 0; i < 3; i++) await Effect.runPromise(t.f.engine.reconcile());
		await setTimeout(500);
		assert.equal(implementers(t).length, 2, "reconciles add no second implementer");
	} finally {
		await t.close();
	}
});

test("L4: a Slice that needs another Slice's integration stays unassigned while that integration is unrecorded", async () => {
	const t = await launcher({ slices: [{ id: "value" }, { id: "next", requires: "value" }] });
	try {
		await t.prompt();
		await t.confirmGround();
		await t.acceptIntake();
		await t.until(() => implementers(t).length === 1, "prerequisite implementer launched");
		for (let i = 0; i < 3; i++) await Effect.runPromise(t.f.engine.reconcile());
		await setTimeout(1000);
		assert.deepEqual(
			implementers(t).map((a) => a.slice),
			["value"],
		);
	} finally {
		await t.close();
	}
});

test("L6: with four executing attempts a new implementer stays queued and its view waits for capacity", async () => {
	const slices = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
	const t = await launcher({ slices });
	try {
		await t.prompt();
		await t.confirmGround();
		await t.acceptIntake();
		await t.until(() => implementers(t).length === 5 && t.assignments().filter((a) => a.executing).length === 4, "four executing");
		await setTimeout(500);
		const queued = implementers(t).filter((a) => a.status === "queued" && !a.executing);
		assert.equal(queued.length, 1);
		assert.equal(t.view().owner.status, "awaiting_capacity");
	} finally {
		await t.close();
	}
});

test("X5: source tools read the pinned commit, never a later one, and refuse symlinks and paths outside it", async () => {
	let repo = "";
	let pinned = "";
	const t = await launcher({
		reads: ["link", "../outside", "value"],
		// The default branch moves on after the coordinator pinned its commit.
		firstTurn: async () => {
			const blob = git(repo, ["hash-object", "-w", "--stdin"], "Z\n").toString().trim();
			const tree = git(repo, ["mktree"], `100644 blob ${blob}\tvalue\n`).toString().trim();
			git(repo, ["update-ref", "refs/heads/fixture", git(repo, ["commit-tree", tree, "-p", pinned], "Later\n").toString().trim()]);
		},
	});
	repo = t.f.source.repo;
	pinned = t.pinned;
	try {
		await t.prompt();
		await t.until(() => t.toolResults.length >= 3, "three reads answered");
		const [link, outside, value] = t.toolResults as { status: string; text?: string; commit?: string }[];
		assert.equal(link!.status, "refused", "a symlink is not followed");
		assert.equal(outside!.status, "refused", "a path outside the tree is refused");
		assert.equal(value!.status, "accepted");
		assert.equal(value!.text, "A\n", "the read is the pinned commit's bytes");
		assert.equal(value!.commit, t.pinned);
	} finally {
		await t.close();
	}
});
