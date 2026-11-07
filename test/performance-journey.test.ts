import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandReply } from "../src/ledger/ledger.ts";
import { accepted, LedgerOnlyEngine } from "./support/implementation.ts";
import { performanceFixture, ROWS, S } from "./support/performance.ts";
import { admin } from "./support/roles.ts";
import { V } from "./support/watchdog.ts";

type Fixture = Awaited<ReturnType<typeof performanceFixture>>;
function refused(reply: CommandReply, code: string, label: string) {
	assert.equal(reply.status, "refused", `${label}: ${JSON.stringify(reply)}`);
	assert.ok(reply.status === "refused");
	assert.equal(reply.code, code, `${label}: ${reply.reason}`);
	return reply;
}
async function read(f: Fixture, ref: string) {
	const value = await f.f.ledger.artifact(admin, { read: ref });
	assert.ok("content" in value, `read ${ref}`);
	return JSON.parse(value.content.toString());
}
/** A coordinator scoped to `ground` stages a compact performance intake built from it. */
async function stageFrom(f: Fixture, ground: string, over: Parameters<Fixture["manifest"]>[1] = {}, baseline = f.baseline) {
	const c = await f.coordinator([ground, f.source, f.catalog, baseline]);
	return { c, reply: await f.stage(c.actor, f.manifest(ground, { sources: [f.source, baseline], ...over })) };
}
const targetQuestion = [{ kind: "product" as const, question: "What p95 read latency is acceptable?" }];

test("PJ01 human performance Ground with a trusted baseline becomes one compact human-accepted Contract retaining the measured commitment", async () => {
	const f = await performanceFixture();
	try {
		const { contract } = await f.accepted();
		assert.equal(f.intakes().slices.length, 1, "one compact Slice, no Seams/Modules");
		const retained = await read(f, contract);
		assert.deepEqual(retained.performance, {
			scenario: "Read 10,000 saved documents",
			row: "bench",
			metric: "p95_ms",
			better: "lower",
			method: "bench prints p95 over five warm runs",
			controls: ["Same container image and CPU", "Same 10,000-document fixture"],
			limitations: ["One owned Linux host"],
			uncertainty: ["Run-to-run variance unmeasured"],
			target: 180,
			baseline: {
				receipt: f.baseline,
				repository: "owned",
				commit: S,
				verifier: V,
				platform: { os: "linux", cpu: "owned" },
				image: "owned",
				workload: ROWS.bench,
				value: 200,
				rows: ROWS,
			},
		});
	} finally {
		await f.close();
	}
});

test("PJ02 a classifier-proposed performance shape needs human confirmation; the human-supplied shape does not", async () => {
	const f = await performanceFixture();
	try {
		const proposed = await f.ground({}, { origin: "classifier", confirmed: false });
		refused((await stageFrom(f, proposed)).reply, "invalid_content", "unconfirmed classifier shape");
		const confirmed = await f.ground({}, { origin: "classifier", confirmed: true });
		accepted((await stageFrom(f, confirmed)).reply);
	} finally {
		await f.close();
	}
});

test("PJ03 a Ground without a target cannot stage an intake that hides the missing criterion", async () => {
	const f = await performanceFixture();
	try {
		const ground = await f.ground({ target: null });
		const reply = refused((await stageFrom(f, ground)).reply, "invalid_content", "missing target without unresolved question");
		assert.match(reply.reason, /target/, "the refusal names the missing target");
		assert.equal(f.intakes().drafts.length, 0, "nothing staged");
	} finally {
		await f.close();
	}
});

test("PJ04 a missing target stays an unresolved product question surfaced before acceptance", async () => {
	const f = await performanceFixture();
	try {
		const ground = await f.ground({ target: null });
		const { c, reply } = await stageFrom(f, ground, { unresolved: targetQuestion });
		const intake = accepted(reply).intake as string;
		const retained = await read(f, ground);
		assert.equal(retained.performance.baseline, f.baseline, "known measurement retained");
		assert.deepEqual(retained.performance.uncertainty, ["Run-to-run variance unmeasured"]);
		const view = f.f.ledger.snapshot(admin) as unknown as { workflows: { nextHumanAction: { type: string; intake?: string } }[] };
		assert.deepEqual(view.workflows[0]!.nextHumanAction.type, "reviewIntake");
		const report = await f.review(c.actor, intake);
		refused(await f.accept(intake, report), "decision_required", "unresolved target blocks acceptance");
		assert.equal(f.intakes().slices.length, 0, "no Contract exists");
	} finally {
		await f.close();
	}
});

test("PJ05 a missing baseline is an explicit prerequisite, not an invented comparison", async () => {
	const f = await performanceFixture();
	try {
		const ground = await f.ground({ baseline: null }, undefined, [f.source]);
		const c = await f.coordinator([ground, f.source, f.catalog]);
		refused(await f.stage(c.actor, f.manifest(ground, { sources: [f.source] })), "invalid_content", "missing baseline");
	} finally {
		await f.close();
	}
});

test("PJ06 the baseline must be a trusted successful measurement cited by the intake", async () => {
	const f = await performanceFixture();
	try {
		const forged = await f.save("baseline-claim", JSON.stringify(await read(f, f.baseline)));
		const human = await f.ground({ baseline: forged }, undefined, [f.source, forged]);
		refused((await stageFrom(f, human, {}, forged)).reply, "invalid_content", "human-saved receipt bytes");
		const failing = await f.measure({ failed: ["bench"] });
		const failed = await f.ground({ baseline: failing }, undefined, [f.source, failing]);
		refused((await stageFrom(f, failed, {}, failing)).reply, "invalid_content", "failed bench baseline");
		const uncited = await f.ground();
		const c = await f.coordinator([uncited, f.source, f.catalog, f.baseline]);
		refused(await f.stage(c.actor, f.manifest(uncited, { sources: [f.source] })), "invalid_content", "baseline outside intake sources");
	} finally {
		await f.close();
	}
});

test("PJ07 a performance intake stays one compact Slice and only the authenticated human accepts it", async () => {
	const f = await performanceFixture();
	try {
		const ground = await f.ground();
		const two = f.manifest(ground);
		two.slices.push({ ...two.slices[0]!, id: "read-more" });
		two.mapping.push(...two.mapping.map((m) => ({ ...m, slice: "read-more" })));
		refused((await stageFrom(f, ground, { slices: two.slices, mapping: two.mapping })).reply, "invalid_content", "two Slices");
		const { c, reply } = await stageFrom(f, ground);
		const intake = accepted(reply).intake as string;
		const report = await f.review(c.actor, intake);
		refused(await f.accept(intake, report, c.actor), "forbidden_principal", "agent acceptance");
		assert.equal(f.intakes().slices.length, 0, "a benchmark-backed intake does not authorize itself");
	} finally {
		await f.close();
	}
});

async function reviewing(run: Parameters<Fixture["round"]>[1]) {
	const f = await performanceFixture();
	const { contract } = await f.accepted();
	const owner = await f.handedOff(contract);
	return { f, contract, r: await f.round(owner, run) };
}

test("PJ08 the Watchdog's own comparable X measurement meeting the target passes and is retained as met", async () => {
	const { f, r } = await reviewing({ value: 150 });
	try {
		const result = accepted(await r.submit("pass"));
		assert.equal(result.performance, "met");
		assert.equal(result.performanceValue, 150);
	} finally {
		await f.close();
	}
});

for (const [id, label, run, outcome, fallback] of [
	["PJ09", "a different workload", { value: 90, literals: { bench: ROWS.bench!.replace("10,000", "100") } }, "mismatch", "rework"],
	["PJ10", "another CPU and image", { value: 90, cpu: "faster", image: "other" }, "mismatch", "rework"],
	[
		"PJ11",
		"a silently weakened full suite",
		{ value: 90, literals: { "full-suite": ROWS["full-suite"]!.replace("npm test", "true") } },
		"regressed",
		"needs-human",
	],
	["PJ12", "a comparable miss", { value: 190 }, "not-met", "rework"],
	["PJ13", "no own bench measurement of X", { omit: ["bench"] }, "mismatch", "rework"],
] as const)
	test(`${id} ${label} is reported as ${outcome} instead of passing the target`, async () => {
		const { f, r } = await reviewing(run);
		try {
			const reply = refused(await r.submit("pass"), "missing_content", `${label} cannot pass`);
			assert.equal(reply.refs?.performance, outcome);
			const result = accepted(await r.submit(fallback));
			assert.equal(result.performance, outcome, "the retained round reports the comparison");
		} finally {
			await f.close();
		}
	});

test("PJ14 the commitment and the comparison survive reopen and export", async () => {
	const { f, contract, r } = await reviewing({ value: 150 });
	try {
		const result = accepted(await r.submit("pass"));
		await f.f.reopen(new LedgerOnlyEngine());
		assert.equal((await read(f, contract)).performance.target, 180);
		const exported = await f.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete, "complete export");
		assert.ok(exported.content[contract], "export retains the Contract");
		const receipts = exported.jsonl
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line))
			.filter((record) => record.kind === "receipt" && record.result?.report === result.report);
		assert.equal(receipts.length, 1);
		assert.equal(receipts[0].result.performance, "met");
		assert.equal(receipts[0].result.performanceValue, 150);
	} finally {
		await f.close();
	}
});
