// CI18/CI16 as a real journey: Engine, SQLite, Effects Git and Docker Linux checks with a scripted provider. Verdicts
// are fixture data; this establishes autonomous admission, exact CAS/readback and dependency clearance, not review
// quality. CI19 (target moving before the CAS) is the WR20/WR15/CI19 journey in watchdog-rework.integration.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import {
	accepted,
	clearBarrier,
	effectsStore,
	fixture,
	holdAt,
	parked,
	proposalRef,
	releaseBarrier,
} from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
const passes = (t: Fixture) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
const viewBlocker = (t: Fixture) => ((t.f.ledger.snapshot(admin) as Frame).workflows as { blocker: { code: string } | null }[])[0]!.blocker;
async function read(t: Fixture, ref: string) {
	const value = await t.f.ledger.artifact(admin, { read: ref });
	assert.ok("content" in value, `read ${ref}`);
	return value.content.toString();
}

test("CI18/CI16 a passing current review integrates with no human step: exact R on T, readback, one qualification, then the dependent", async () => {
	const t = await fixture({ watchdog: ["pass"], dependent: true });
	try {
		const store = effectsStore(t);
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const P1 = opening.passRef as string;
		// From here on the test issues no human command: preparation, review, admission and CAS are automatic.
		holdAt("before-integration-cas", `integration:${P1}`);
		await parked("admitted integration before its CAS");
		const T = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		assert.equal(T, t.writer.verification!.commit, "the canonical ref is still the bound base T");
		const next = { ...t.writer, inputs: [t.nextContract!], verification: { ...t.writer.verification!, contract: t.nextContract! } };
		const early = await t.f.command({ type: "assignTask", slice: "next", delivery: true, packet: next });
		assert.equal(early.status === "refused" && early.code, "dependency_blocked", "a passing review and an admission clear nothing");
		assert.equal(viewBlocker(t)?.code, "dependency_blocked");
		releaseBarrier();
		const pass = () => passes(t)[0]!;
		await t.wait(
			() =>
				pass().handoff?.integrations?.at(-1)?.status === "qualified" ||
				/^(needs_human|watchdog_|preparation_|integration_)/.test(pass().handoff?.blocker ?? ""),
			"integration settles",
		);
		const [operation, ...others] = pass().handoff!.integrations!;
		assert.equal(others.length, 0);
		assert.equal(operation!.status, "qualified", pass().handoff?.blocker);
		assert.equal(operation!.attempts.length, 1, "one admission, one dispatch");
		assert.equal(operation!.attempts[0]!.outcome, "applied");
		assert.equal(operation!.attempts[0]!.executorEpoch, t.f.ledger.status().executorEpoch);
		assert.equal(operation!.qualification, operation!.attempts[0]!.observations.at(-1));
		const review = t.assignments().find((a) => a.packet.role === "watchdog")!.watchdogReview!;
		const R = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		assert.equal(R, operation!.result, "the canonical ref reads back exactly R");
		assert.equal(git(store, ["rev-list", "--parents", "-n", "1", R]).toString().trim(), `${R} ${T}`, "R's only parent is T");
		assert.equal(
			git(store, ["rev-parse", `${R}^{tree}`])
				.toString()
				.trim(),
			review.tree,
			"R's tree is exactly reviewed X's tree",
		);
		assert.equal(
			git(store, ["rev-parse", `refs/render/sources/${R}`])
				.toString()
				.trim(),
			R,
			"R is rooted",
		);
		const intent = JSON.parse(await read(t, operation!.operation));
		assert.deepEqual(
			[intent.prepared, intent.target, intent.review, intent.result.commit, intent.passRef],
			[review.prepared, T, t.assignments().find((a) => a.packet.role === "watchdog")!.id, R, P1],
		);
		const observation = JSON.parse(await read(t, operation!.qualification!));
		assert.deepEqual(observation.observed, { commit: R, tree: review.tree, parents: [T] });
		assert.equal(observation.mode, "dispatch");
		assert.equal(pass().handoff!.blocker, undefined, "nothing left blocked");
		assert.notEqual(viewBlocker(t)?.code, "dependency_blocked", "qualification clears the same-proposal edge");
		// CI16: this host has no Forge capability; nothing waited on publication.
		accepted(await t.f.command({ type: "assignTask", slice: "next", delivery: true, packet: next }));
	} finally {
		clearBarrier();
		await t.close();
	}
});
