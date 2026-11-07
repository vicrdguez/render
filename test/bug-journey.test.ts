// Bug journey at the Ledger interface over real SQLite. Literal expected outcomes: docs/verification/bug-journey-failure-cases.md.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Intakes } from "../src/kernel/intake.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import {
	accepted,
	acceptedImplementation,
	capture,
	EXPECTED,
	implementationLifecycle,
	LedgerOnlyEngine,
	OBSERVED,
	reproductionCapture,
	selection,
	type Variant,
} from "./support/implementation.ts";
import { admin, roleFixture } from "./support/roles.ts";

const effects = mintContext({ kind: "host", scope: "effects" });
const X = "e".repeat(40);
const NOT_RUN = "Regression row read did not run (exit 127): a missing prerequisite is not red-on-the-bug proof.";
const SETUP = `Regression row read failed without showing the reported wrong behavior (${OBSERVED}): a setup failure is not red-on-the-bug proof.`;
const PASSED = "Regression row read passed: the reported wrong behavior was not reproduced.";
const BEFORE_AUDIT = "Bug correction needs red-on-the-bug reproduction before Audit: ";

function refused(reply: CommandReply, code: string, reason: string, label: string) {
	assert.deepEqual(reply.status === "refused" ? { code: reply.code, reason: reply.reason } : reply, { code, reason }, label);
}
const passes = (f: { ledger: { snapshot(c: typeof admin): unknown } }) =>
	(f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];

/** An accepted pass of the bug Slice before any capture. */
async function bugPass(variant: Variant = "bug") {
	const t = await acceptedImplementation(undefined, variant);
	const id = accepted(
		await t.f.command({
			type: "assignTask",
			slice: "read-fix",
			delivery: true,
			packet: t.writer({ verification: selection(t.contract) }),
		}),
	).assignment as string;
	const actor = await t.start(id);
	const owner = () => t.assignments().find((a) => a.id === id)!;
	const epoch = () => t.f.ledger.status().executorEpoch;
	const record = (kind: string, value: unknown) =>
		t.f.command(
			{ type: "recordImplementationSource", assignment: id, generation: 1, attempt: owner().attempt, kind, text: JSON.stringify(value) },
			effects,
		);
	const reproduce = (step: { exitCode: number; stdout?: string; stderr?: string }) =>
		record("reproduction", reproductionCapture(owner(), epoch(), t.contract, step));
	const captureA = () => record("audit", capture(owner(), epoch(), t.contract));
	return { ...t, id, actor, owner, reproduce, captureA };
}

test("BJ06 saving bug Ground implies no implementation commitment; Ground and the Contract keep the reproduction across reopen", async () => {
	const f = await roleFixture(new LedgerOnlyEngine());
	try {
		const text = JSON.stringify({
			schema: 1,
			shape: { value: "bug", origin: "human", confirmed: false },
			goal: "Correct read",
			constraints: ["Keep the read interface"],
			approvedSources: [],
			reproduction: { trigger: "node read.js Ab", observed: OBSERVED },
			expected: EXPECTED,
		});
		const saved = accepted(
			await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "bug-ground",
					workflow: "workflow:2",
					expected: { document: null },
					command: { type: "saveDocument", document: "ground", mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
				},
				admin,
			),
		).revision as string;
		const frame = () => f.ledger.snapshot(admin) as Frame;
		const workflow = () => (frame().workflows as { intakes: Intakes; commitment: { status: string } }[])[0]!;
		assert.equal(workflow().commitment.status, "none", "Ground is not implementation acceptance");
		assert.deepEqual(workflow().intakes.slices, []);
		assert.deepEqual(frame().assignments, []);
		await f.reopen(new LedgerOnlyEngine());
		const read = await f.ledger.artifact(admin, { read: saved });
		assert.ok("content" in read);
		assert.equal(read.content.toString(), text, "exact reproduction and expected correction survive reopen");
	} finally {
		await f.close();
	}
	const t = await acceptedImplementation(new LedgerOnlyEngine(), "bug");
	try {
		const contract = await t.f.ledger.artifact(admin, { read: t.contract });
		assert.ok("content" in contract);
		const manifest = await t.f.ledger.artifact(admin, { read: JSON.parse(contract.content.toString()).manifest });
		assert.ok("content" in manifest);
		assert.deepEqual(JSON.parse(manifest.content.toString()).reproduction, { obligation: "B1", observed: OBSERVED, expected: EXPECTED });
	} finally {
		await t.close();
	}
});

test("BJ07 a regression row failing with the reported wrong behavior is red-on-the-bug proof and unlocks Audit", async () => {
	const t = await bugPass();
	try {
		const red = accepted(await t.reproduce({ exitCode: 1, stdout: `not ok 1 - ${OBSERVED}\n` }));
		assert.equal(red.reproduction, "red");
		assert.deepEqual(passes(t.f)[0]!.reproduction, {
			source: red.source,
			red: true,
			reason: "Regression row read failed showing the reported wrong behavior.",
		});
		accepted(await t.captureA());
		accepted(await t.f.command({ type: "requestImplementationAudit" }, t.actor));
	} finally {
		await t.close();
	}
});

test("BJ08/BJ09/BJ10 a missing prerequisite, a setup failure or a passing row is reported, never claimed as correction", async () => {
	const t = await bugPass();
	try {
		for (const [step, reason] of [
			[{ exitCode: 127, stderr: "sh: node: not found\n" }, NOT_RUN],
			[{ exitCode: 1, stderr: "Error: Cannot find module 'left-pad'\n" }, SETUP],
			[{ exitCode: 0, stdout: "ok 1\n" }, PASSED],
		] as const) {
			const reply = accepted(await t.reproduce(step));
			assert.deepEqual({ reproduction: reply.reproduction, reason: reply.reason }, { reproduction: "not-reproduced", reason });
			refused(
				await t.captureA(),
				"missing_content",
				`${BEFORE_AUDIT}${reason}`,
				"the missing prerequisite blocks Audit, not a claimed correction",
			);
		}
		accepted(await t.reproduce({ exitCode: 1, stdout: `not ok 1 - ${OBSERVED}\n` }));
		accepted(await t.captureA());
	} finally {
		await t.close();
	}
});

test("BJ11/BJ12 reproduction is required before Audit A, only before it, and only for a bug Contract", async () => {
	const t = await bugPass();
	try {
		refused(
			await t.captureA(),
			"missing_content",
			`${BEFORE_AUDIT}record the regression check failing on the reported wrong behavior before product code.`,
			"a bug pass must not reach Audit without a reproduction",
		);
		accepted(await t.reproduce({ exitCode: 1, stdout: OBSERVED }));
		accepted(await t.captureA());
		refused(
			await t.reproduce({ exitCode: 1, stdout: OBSERVED }),
			"assignment_closed",
			"Reproduction precedes product code: record it before Audit source A.",
			"a reproduction after A is not pre-fix evidence",
		);
	} finally {
		await t.close();
	}
	const change = await bugPass("independent");
	try {
		refused(
			await change.reproduce({ exitCode: 1, stdout: OBSERVED }),
			"invalid_content",
			"Only a bug Contract records a reproduction.",
			"no reproduction marker exists outside a bug Contract",
		);
		accepted(await change.captureA());
	} finally {
		await change.close();
	}
});

async function reportFindings(t: Awaited<ReturnType<typeof implementationLifecycle>>, needsHuman: boolean) {
	for (const child of t.assignments().filter((a) => a.parent === t.id && a.auditReview)) {
		const principal = await t.start(child.id);
		const findings = child.packet.role === "audit-standards" ? [{ id: "F1", text: "Needs a new seam", needsHuman }] : [];
		accepted(
			await t.f.command(
				{ type: "submitRoleResult", text: JSON.stringify({ schema: 1, ...child.auditReview, findings }), supports: [] },
				principal,
			),
		);
		accepted(
			await t.f.command({
				type: "recordQuiescence",
				assignment: child.id,
				generation: child.generation,
				attempt: child.attempt,
				providerIdle: true,
				environment: "absent",
				effects: "reconciled",
			}),
		);
	}
}

test("BJ13 a bug pass keeps Audit and escalates a discovered seam instead of handing off", async () => {
	const t = await implementationLifecycle(undefined, () => ({}), "bug");
	try {
		refused(
			await t.f.command(t.handoff, t.actor),
			"missing_content",
			"Handoff requires current pass A, Audit and final B, with no prior handoff.",
			"the shortened path must not skip Audit",
		);
		await t.audit();
		await reportFindings(t, true);
		await t.retain("final");
		const report = passes(t.f)[0]!.audit!.results.standards!.report;
		refused(
			await t.f.command(
				{
					...t.handoff,
					dispositions: [{ report, finding: "F1", disposition: "needs-human", reason: "New seam", changes: [], rechecks: [] }],
				},
				t.actor,
			),
			"capability_unavailable",
			"Unresolved product/Contract questions require human resolution.",
			"a new seam discovered by a bug fix must escalate",
		);
	} finally {
		await t.close();
	}
});

test("BJ14 a returned bug pass needs its own fresh Audit; the retained reproduction is not reused as current proof", async () => {
	const t = await implementationLifecycle(undefined, () => ({}), "bug");
	try {
		await t.audit();
		await reportFindings(t, false);
		const B = (await t.retain("final")) as string;
		const report = passes(t.f)[0]!.audit!.results.standards!.report;
		accepted(
			await t.f.command(
				{
					...t.handoff,
					dispositions: [{ report, finding: "F1", disposition: "dismissed", reason: "Not applicable", changes: [], rechecks: [] }],
				},
				t.actor,
			),
		);
		const quiesce = async (a: RoleAssignment) =>
			accepted(
				await t.f.command({
					type: "recordQuiescence",
					assignment: a.id,
					generation: a.generation,
					attempt: a.attempt,
					providerIdle: true,
					environment: "stopped",
					effects: "reconciled",
				}),
			);
		await quiesce(t.owner());
		const S = "a".repeat(40);
		const opened = accepted(
			await t.f.command(
				{
					type: "openSuccessorPass",
					assignment: t.id,
					generation: 1,
					attempt: t.owner().attempt,
					text: JSON.stringify({
						schema: 1,
						cause: "prepared-check-failure",
						repository: "owned",
						source: B,
						sourceCommit: S,
						baseCommit: S,
						targetCommit: "c".repeat(40),
						preparedCommit: X,
						verifierRevision: "b".repeat(64),
						failed: [{ name: "read", exitCode: 1 }],
					}),
				},
				effects,
			),
		);
		const id = opened.assignment as string;
		const actor = await t.start(id);
		const a = () => t.assignments().find((x) => x.id === id)!;
		const retain = async (kind: "audit" | "final") =>
			accepted(
				await t.f.command(
					{
						type: "recordImplementationSource",
						assignment: id,
						generation: 1,
						attempt: a().attempt,
						kind,
						text: JSON.stringify(capture(a(), t.f.ledger.status().executorEpoch, t.contract, X)),
					},
					effects,
				),
			);
		await retain("audit");
		refused(
			await t.f.command(t.handoff, actor),
			"missing_content",
			"Handoff requires current pass A, Audit and final B, with no prior handoff.",
			"P1's Audit must not stand in for the successor's",
		);
		const audit = accepted(await t.f.command({ type: "requestImplementationAudit" }, actor));
		const [p1, p2] = passes(t.f);
		assert.notEqual(audit.audit, p1!.audit!.ref, "a fresh Audit");
		assert.equal(p2!.reproduction, undefined, "the retained P1 reproduction is history, not P2 evidence");
	} finally {
		await t.close();
	}
});

test("BJ15 the reproduction is retained in history/export and survives reopen", async () => {
	const t = await bugPass();
	try {
		const text = JSON.stringify(reproductionCapture(t.owner(), t.f.ledger.status().executorEpoch, t.contract, { exitCode: 127 }));
		const missing = accepted(
			await t.f.command(
				{ type: "recordImplementationSource", assignment: t.id, generation: 1, attempt: t.owner().attempt, kind: "reproduction", text },
				effects,
			),
		);
		const red = accepted(await t.reproduce({ exitCode: 1, stdout: OBSERVED }));
		const check = async () => {
			const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
			assert.ok("manifest" in exported && exported.manifest.complete);
			assert.equal(
				Buffer.from(exported.content[missing.source as string]!, "base64").toString(),
				text,
				"not-reproduced evidence is retained",
			);
			assert.ok(exported.content[red.source as string], "red evidence is retained");
			assert.equal(passes(t.f)[0]!.reproduction?.source, red.source);
			assert.equal(passes(t.f)[0]!.reproduction?.red, true);
		};
		await check();
		await t.f.reopen(new LedgerOnlyEngine());
		await check();
	} finally {
		await t.close();
	}
});
