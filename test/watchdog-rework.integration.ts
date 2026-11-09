// WR19/WR20 and the Engine half of WR15: real Engine, SQLite, Effects Git and Docker Linux checks with a scripted
// provider. Verdicts are fixture data; these journeys establish launch, binding, counting and rework lifecycle,
// not review quality.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import {
	accepted,
	advanceTarget,
	captureValue,
	clearBarrier,
	effectsStore,
	fixture,
	holdAt,
	parked,
	proposalRef,
	releaseBarrier,
} from "./support/implementation-engine.ts";
import { admin, claudeFixture } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Checks = {
	source: { commit: string; tree: string; entries: { path: string; content: string }[] };
	evidence: {
		role: string;
		scope: { assignment: string };
		results: { name: string; status: string; steps: { platform: { os: string }; verifierRevision: string }[] }[];
		verification: { status: string; inputCommit: string; inputTree: string; resultTree: string };
	};
};
type Fixture = Awaited<ReturnType<typeof fixture>>;
const passes = (t: Fixture) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
const watchdogs = (t: Fixture) => t.assignments().filter((a) => a.packet.role === "watchdog");
async function read(t: Fixture, ref: string) {
	const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
	assert.ok("content" in value, `read ${ref}`);
	return value.content.toString();
}
async function checksOf(t: Fixture, w: RoleAssignment) {
	assert.ok(w.watchdogReview?.checks, `${w.id} retained its own checks`);
	return JSON.parse(await read(t, w.watchdogReview.checks)) as Checks;
}
const value = (c: Checks) => Buffer.from(c.source.entries.find((e) => e.path === "value")!.content, "base64").toString();
/** Recorded qualifying integration (canonical-integration): a passing current review integrates automatically. */
const qualified = (p?: ImplementationPass) => p?.handoff?.integrations?.at(-1)?.status === "qualified";
const completed = (t: Fixture) => watchdogs(t).filter((w) => w.status === "submitted").length;

test("WR19: checked X is reviewed by a fresh Watchdog that runs its own Linux checks; rework opens P2 whose fresh round passes", async () => {
	const t = await fixture({ watchdog: ["rework", "pass"] });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const settled = (p?: ImplementationPass) =>
			qualified(p) || /^(awaiting_|needs_human|watchdog_|preparation_|integration_)/.test(p?.handoff?.blocker ?? "");
		await t.wait(() => !!passes(t)[0]?.handoff || settled(passes(t)[0]), "P1 handed off");
		await t.wait(() => watchdogs(t).length === 1 || settled(passes(t)[0]), "P1 checked and its Watchdog launched");
		await t.wait(() => passes(t).length === 2 || settled(passes(t)[0]), "rework verdict opens P2");
		await t.wait(() => !!passes(t)[1]?.handoff || settled(passes(t)[0]), "P2 handed off");
		await t.wait(() => watchdogs(t).length === 2 || settled(passes(t)[1]), "P2 checked and a fresh Watchdog launched");
		await t.wait(() => settled(passes(t)[1]), "P2 reviewed");
		assert.ok(qualified(passes(t)[1]), `P2 integrates automatically: ${passes(t)[1]?.handoff?.blocker}`);
		const [p1, p2] = passes(t);
		assert.ok(p1?.handoff && p2?.handoff);
		const [w1, w2] = watchdogs(t);
		assert.ok(w1 && w2);
		assert.equal(watchdogs(t).length, 2, "one round per checked X");
		assert.deepEqual(
			watchdogs(t).map((w) => w.status),
			["submitted", "submitted"],
		);
		// Fresh non-fork identities: no conversation shared with each other, the writers or Audit reviewers.
		const others = t.assignments().filter((a) => a.packet.role !== "watchdog");
		assert.equal(new Set([w1.conversation, w2.conversation, ...others.map((a) => a.conversation)]).size, others.length + 2);
		assert.ok(watchdogs(t).every((w) => w.packet.execution === "read-only" && w.packet.requests.length === 0 && w.parent === null));
		// Round 1 judged exact X1 = B1 on T0 and ran its own checks in Linux on a scratch copy.
		const x1 = JSON.parse(await read(t, p1.handoff.preparations![0]!)) as {
			preparation: { result: string; tree: string };
			target: { commit: string };
		};
		assert.equal(w1.watchdogReview?.passRef, opening.passRef);
		assert.equal(w1.watchdogReview?.prepared, x1.preparation.result);
		assert.equal(w1.watchdogReview?.target, x1.target.commit);
		const c1 = await checksOf(t, w1);
		assert.equal(c1.evidence.role, "watchdog");
		assert.equal(c1.evidence.scope.assignment, w1.id, "its own scoped run, not the preparation checks");
		assert.equal(c1.source.commit, x1.preparation.result);
		assert.equal(value(c1), "B\n");
		assert.equal(c1.evidence.verification.status, "needs_assessment");
		assert.equal(c1.evidence.verification.resultTree, x1.preparation.tree, "reviewed source unchanged");
		assert.ok(c1.evidence.results.length > 0);
		assert.ok(c1.evidence.results.every((r) => r.steps.every((s) => s.platform.os === "linux")));
		// Rework opened P2 from X1 with no Audit reuse; P2 has its own fresh Audit on A2.
		assert.equal(p2.cause, "watchdog-rework");
		assert.equal(p2.predecessor, p1.ref);
		assert.equal(p2.opening?.base, x1.preparation.result);
		const observation = JSON.parse(await read(t, p2.opening!.observation));
		assert.equal(observation.review, w1.id);
		assert.equal(observation.report, w1.report);
		assert.ok(p2.audit && p1.audit && p2.audit.ref !== p1.audit.ref, "fresh Audit for the rework pass");
		assert.notEqual(p2.captureA, p1.captureA);
		// Round 2 is fresh, bound to P2's X2, and receives round 1's findings and P2's opening as prior context.
		assert.equal(w2.watchdogReview?.passRef, p2.ref);
		assert.deepEqual(w2.watchdogReview?.prior, [w1.report, p2.opening!.observation]);
		const c2 = await checksOf(t, w2);
		assert.equal(value(c2), "C\n");
		const verdict = JSON.parse(await read(t, w2.report!));
		assert.equal(verdict.verdict, "pass");
		assert.equal(completed(t), 2, "two completed reviews");
		const integration = passes(t)[1]!.handoff!.integrations!.at(-1)!;
		assert.equal(integration.preparation, w2.watchdogReview!.preparation, "the integrated X is the reviewed X");
		assert.equal(integration.target, w2.watchdogReview!.target);
		assert.equal(passes(t).length, 2, "a pass verdict opens no successor");
		// History: both rounds, their checks and verdicts survive export.
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const w of [w1, w2]) for (const ref of [w.report!, w.watchdogReview!.checks!, w.packetRef]) assert.ok(exported.content[ref], ref);
		assert.equal(captureValue(await read(t, p2.handoff.source)), "C\n");
	} finally {
		await t.close();
	}
});

test("WR20/WR15/CI19: no stale review launches after drift; a target moving before the admitted CAS re-prepares, reviews and integrates again", async () => {
	const t = await fixture({ watchdog: ["pass", "pass"] });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const P1 = opening.passRef as string;
		// After X1/T0 checks, park the host at its final pre-launch observation and let another Slice integrate.
		holdAt("before-target-observe", `preparation-observe:${P1}:1`);
		await parked("pre-launch reobservation");
		assert.equal(watchdogs(t).length, 0, "nothing launched before the reobservation");
		const store = effectsStore(t);
		const base = t.writer.verification!.commit;
		const T1 = advanceTarget(store, base, { target: "T1\n" }, base);
		// The passing review on X1/T1 is admitted automatically; park before its CAS and move the target again.
		releaseBarrier(["before-integration-cas", `integration:${P1}`]);
		await parked("admitted integration before its CAS");
		const blocker = () => passes(t)[0]?.handoff?.blocker ?? "";
		const [w1] = watchdogs(t);
		assert.equal(watchdogs(t).length, 1, "X1/T0 was never reviewed");
		assert.equal(w1!.watchdogReview?.target, T1, "the review binds the re-prepared current target");
		assert.equal(passes(t)[0]!.handoff!.preparations!.length, 2, "drift re-prepared under the same pass");
		assert.equal(git(store, ["show", `${w1!.watchdogReview!.prepared}:target`]).toString(), "T1\n");
		assert.deepEqual(
			passes(t)[0]!.handoff!.integrations!.map((o) => [o.status, o.target]),
			[["admitted", T1]],
			"no human grant or setting between the passing review and admission",
		);
		const T2 = advanceTarget(store, T1, { other: "T2\n" }, T1);
		releaseBarrier();
		await t.wait(
			() => qualified(passes(t)[0]) || /^(needs_human|watchdog_|preparation_|integration_)/.test(blocker()),
			"stale CAS re-prepared, reviewed again and integrated",
		);
		assert.ok(qualified(passes(t)[0]), blocker());
		const [, w2] = watchdogs(t);
		assert.equal(w2!.watchdogReview?.target, T2);
		assert.equal(w1!.status, "submitted", "the stale review remains visible");
		assert.equal(completed(t), 2, "both completed reviews count");
		const operations = passes(t)[0]!.handoff!.integrations!;
		assert.deepEqual(
			operations.map((o) => [o.status, o.target]),
			[
				["stale", T1],
				["qualified", T2],
			],
			"the refused CAS stays in history; no old verdict authorizes new bytes",
		);
		const R = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		assert.equal(R, operations[1]!.result);
		assert.equal(git(store, ["rev-list", "--parents", "-n", "1", R]).toString().trim(), `${R} ${T2}`, "R sits exactly on T2");
		assert.equal(
			git(store, ["rev-parse", `${R}^{tree}`])
				.toString()
				.trim(),
			git(store, ["rev-parse", `${w2!.watchdogReview!.prepared}^{tree}`])
				.toString()
				.trim(),
			"R's tree is exactly the reviewed X2's tree",
		);
		assert.equal(passes(t).length, 1, "drift opens no pass and no Audit");
		assert.equal(t.assignments().filter((a) => a.auditReview).length, 2);
	} finally {
		clearBarrier();
		await t.close();
	}
});

test("WR17: an interrupted Watchdog round resumes its own Assignment and retained checks after restart, counted once", async () => {
	const t = await fixture({ watchdog: ["pass"], hold: "watchdog" });
	try {
		accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => t.held(), "Watchdog judging after its own checks");
		const [w] = watchdogs(t);
		assert.ok(w?.watchdogReview?.checks, "checks retained before judgment");
		assert.equal(w.status, "running");
		t.gate.resolve();
		await t.f.reopen(
			new Engine({
				ownedChecks: t.f.config,
				provider: t.f.provider.provider,
				...claudeFixture,
			}),
		);
		assert.equal(watchdogs(t).filter((a) => a.status === "submitted").length, 0, "interruption is not a completed review");
		t.release();
		const blocker = () => passes(t)[0]?.handoff?.blocker ?? "";
		await t.wait(
			() => qualified(passes(t)[0]) || /^(awaiting_|needs_human|watchdog_|integration_)/.test(blocker()),
			"resumed review settles",
		);
		assert.ok(qualified(passes(t)[0]), blocker());
		assert.equal(completed(t), 1);
		const after = watchdogs(t);
		assert.equal(after.length, 1, "no new round for an interruption");
		assert.equal(after[0]!.id, w.id);
		assert.equal(after[0]!.attempt, w.attempt, "same review resumes");
		assert.equal(after[0]!.watchdogReview?.checks, w.watchdogReview.checks, "retained checks are not rerun");
		assert.equal(after[0]!.status, "submitted");
	} finally {
		await t.close();
	}
});

test("WR26/WR29: a human directs a Needs Human stop into P2, which applies only that direction; the next fresh round reads it and passes", async () => {
	const t = await fixture({ watchdog: ["needs-human", "pass"] });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const settled = (p?: ImplementationPass) =>
			qualified(p) || /^(awaiting_|needs_human|watchdog_|preparation_|integration_)/.test(p?.handoff?.blocker ?? "");
		await t.wait(() => settled(passes(t)[0]), "P1 reviewed");
		assert.match(passes(t)[0]!.handoff!.blocker!, /^needs_human: .*1 completed reviews, limit 2/);
		assert.equal(passes(t).length, 1, "Needs Human opens nothing by itself");
		const [w1] = watchdogs(t);
		const owner = t.assignments().find((a) => a.id === opening.assignment)!;
		accepted(
			await t.f.command(
				{
					type: "directRework",
					assignment: owner.id,
					generation: owner.generation,
					attempt: owner.attempt,
					review: w1!.id,
					text: "Value must become D; the Needs Human question is settled.",
				},
				admin,
			),
		);
		await t.wait(() => settled(passes(t)[1]) || /^preparation_/.test(passes(t)[0]!.handoff!.blocker ?? ""), "P2 reviewed");
		const [p1, p2] = passes(t);
		assert.ok(p2?.handoff, p1?.handoff?.blocker);
		assert.equal(p2.cause, "human-direction");
		assert.equal(p2.opening?.base, w1!.watchdogReview!.prepared, "P2 starts from the reviewed X");
		assert.ok(p2.audit && p1!.audit && p2.audit.ref !== p1!.audit.ref, "fresh Audit for the directed pass");
		assert.equal(captureValue(await read(t, p2.handoff.source)), "D\n", "P2 applied the human's direction");
		assert.ok(qualified(p2), p2.handoff.blocker);
		assert.equal(completed(t), 2);
		assert.equal(watchdogs(t).length, 2);
		// WR29: the next independent round reviews the fix against the human's actual resolution, read in its own scope.
		const [, w2] = watchdogs(t);
		const direction = p1!.handoff!.direction!.revision;
		assert.ok(w2!.watchdogReview!.prior.includes(direction), "the next Watchdog's prior context names the human direction");
		const prompt = t.prompts.find((p) => p.assignment === w2!.id && p.watchdogReview);
		assert.deepEqual(
			prompt?.watchdogReview?.prior.find((p) => p.ref === direction),
			{ ref: direction, text: "Value must become D; the Needs Human question is settled." },
			"the next Watchdog's rendered context holds the exact direction text",
		);
	} finally {
		await t.close();
	}
});

test("WR27: cancelling a Watchdog while its own check runtime runs stops that runtime before quiescence releases the slot", async () => {
	const t = await fixture({ watchdog: ["pass"] });
	const runtimes: string[] = [];
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		holdAt("before-review-check", `review-check:${opening.passRef}`);
		await parked("Watchdog check runtime");
		const [w] = watchdogs(t);
		assert.ok(w?.executing, "the round holds its executing slot while its checks run");
		const root = join(t.f.config.root, "sandboxes");
		for (const id of await readdir(root)) {
			const state = JSON.parse(await readFile(join(root, id, "state.json"), "utf8"));
			if (state.handle.scope.assignment === w.id) runtimes.push(state.handle.runtime);
		}
		assert.equal(runtimes.length, 1, "one owned check runtime for the round");
		const running = () => execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", runtimes[0]!], { encoding: "utf8" }).trim();
		assert.equal(running(), "true", "the check runtime is live at the barrier");
		accepted(await t.f.command({ type: "cancelWork", assignment: w.id, generation: w.generation, attempt: w.attempt }, admin));
		const after = () => t.assignments().find((a) => a.id === w.id)!;
		await t.wait(() => after().status === "canceled" || /unconfirmed|missing/.test(after().blocker ?? ""), "cancellation settles");
		assert.equal(after().status, "canceled", after().blocker ?? "");
		assert.equal(after().executing, false);
		assert.equal(running(), "false", "quiescence is recorded only after the check runtime stopped");
		assert.equal(after().watchdogReview?.checks, undefined, "a canceled round retains no checks");
	} finally {
		clearBarrier();
		await t.close();
		for (const runtime of runtimes)
			try {
				execFileSync("docker", ["rm", "-f", runtime], { stdio: "ignore" });
			} catch {}
	}
});
