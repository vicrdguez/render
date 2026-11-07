// RB03/RB04, RB06–RB08, RB11 and RB12 at the Ledger/Kernel interface over real SQLite/Durable staging. Read-fix is a
// Record Slice with one ADR obligation; read-next consumes it by a Record edge. Preparation, verdicts and canonical-ref
// observations are literal host/scripted results: they establish authority, blocking and retention, not Git or a model.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Intakes } from "../src/kernel/intake.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import {
	accepted,
	acceptedImplementation,
	capture,
	damageImplementation,
	implementationLifecycle,
	LedgerOnlyEngine,
	selection,
} from "./support/implementation.ts";
import {
	admit,
	admitted,
	effects,
	handedOff,
	intent,
	type Lifecycle,
	lineage,
	observation,
	own,
	passedRound,
	passes,
	passOf,
	record,
	refused,
	S,
	stage,
	T0,
	W,
	X1,
} from "./support/integration.ts";
import { admin } from "./support/roles.ts";
import { watchdogRound, watched } from "./support/watchdog.ts";

const intakes = (t: Pick<Lifecycle, "f">) => ((t.f.ledger.snapshot(admin) as Frame).workflows as { intakes: Intakes }[])[0]!.intakes;
const assignNext = (t: Lifecycle) =>
	t.f.command({
		type: "assignTask",
		slice: "read-next",
		delivery: true,
		packet: t.writer({ inputs: [t.nextContract!], verification: selection(t.nextContract!) }),
	});
const basis = (t: Lifecycle) => [t.fidelity, t.source];
function carries(inputs: readonly string[], refs: string[], label: string) {
	for (const ref of refs) assert.ok(inputs.includes(ref), `${label} carries ${ref}`);
}
let saves = 0;
async function saveDocument(t: Pick<Lifecycle, "f">, document: string, text: string) {
	return accepted(
		await t.f.ledger.command(
			{
				version: 1,
				authorityEpoch: t.f.ledger.status().authorityEpoch,
				commandId: `record-document:${++saves}`,
				workflow: W,
				expected: { document: null },
				command: { type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
			},
			admin,
		),
	).revision as string;
}

test("RB03 a Record assignment without its fidelity basis refuses before consuming the Contract", async () => {
	const u = await acceptedImplementation(undefined, "record");
	try {
		refused(
			await u.f.command({
				type: "assignTask",
				slice: "read-fix",
				delivery: true,
				packet: u.writer({ inputs: [u.contract], ...watched(u.contract) }),
			}),
			"stale_basis",
			"Contract alone omits the fidelity basis",
		);
		assert.equal(
			u.assignments().some((a) => a.slice === "read-fix"),
			false,
			"no assignment",
		);
		assert.equal(intakes(u).slices[0]!.everAssigned, false, "Contract not consumed");
	} finally {
		await u.close();
	}
});

test("RB04 the Record assignment and both Audit axes carry the Contract and fidelity basis; the consumer stays blocked", async () => {
	const t = await implementationLifecycle(undefined, (contract) => watched(contract), "record");
	try {
		carries(t.owner().packet.inputs, [t.contract, ...basis(t)], "Record owner");
		await t.audit();
		for (const reviewer of t.assignments().filter((a) => a.parent === t.id))
			carries(reviewer.packet.inputs, [t.contract, ...basis(t)], reviewer.packet.role);
		refused(await assignNext(t), "dependency_blocked", "Record work begun, not qualified");
	} finally {
		await t.close();
	}
});

test("RB06/RB07/RB12 only recorded qualifying integration of the Record pass releases its consumer, and it survives reopen/export", async () => {
	const t = await handedOff("record");
	try {
		await saveDocument(t, "docs/adr/0001-retained-seam.md", "# ADR 1\nRetain the seam.\n");
		refused(await assignNext(t), "dependency_blocked", "document-only");
		refused(await assignNext(t), "dependency_blocked", "fidelity-only: intake fidelity, Audit and handoff");
		const r = await passedRound(t);
		carries(own(t, r.id).packet.inputs, [t.contract, ...basis(t)], "Watchdog");
		refused(await assignNext(t), "dependency_blocked", "Watchdog-only");
		const planned = accepted(await stage(t, t.id, intent(t, t.id, r))).operation as string;
		const direct = await record(t, t.id, planned, observation(planned, "integration-attempt:999"));
		assert.equal(direct.status, "refused", "an applied ref observation without an admitted attempt records nothing");
		refused(await assignNext(t), "dependency_blocked", "direct ref write");
		const attempt = accepted(await admit(t, t.id, planned)).integrationAttempt as string;
		const applied = accepted(await record(t, t.id, planned, observation(planned, attempt))).observation as string;
		await t.f.reopen(new LedgerOnlyEngine());
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: W } });
		assert.ok("manifest" in exported && exported.manifest.complete, "complete export");
		for (const ref of [t.contract, t.fidelity, applied]) assert.ok(ref in exported.content, `export retains ${ref}`);
		accepted(await assignNext(t));
	} finally {
		await t.close();
	}
});

test("RB08 a lost Record handoff reply recovers once; Watchdog rework opens a successor with its own Audit and keeps the count", async () => {
	const t = await handedOff("record");
	try {
		const p1 = passOf(t);
		const replay = accepted(await t.f.command(t.handoff, t.actor, "p1-handoff"));
		assert.equal(replay.handoff, p1.handoff!.record, "the original handoff receipt");
		assert.equal(passes(t).length, 1, "replay opens nothing");
		const rework = await watchdogRound(t, t.id, p1.ref, lineage(), "rework");
		const a = own(t, t.id);
		const opened = accepted(
			await t.f.command(
				{
					type: "openSuccessorPass",
					assignment: a.id,
					generation: a.generation,
					attempt: a.attempt,
					text: JSON.stringify({
						schema: 1,
						cause: "watchdog-rework",
						repository: "owned",
						source: p1.handoff!.source,
						sourceCommit: S,
						baseCommit: S,
						targetCommit: T0,
						preparedCommit: X1,
						review: rework.id,
						report: rework.report,
					}),
				},
				effects,
			),
		);
		const p2Owner = opened.assignment as string;
		carries(own(t, p2Owner).packet.inputs, [t.contract, ...basis(t)], "successor owner");
		const actor = await t.start(p2Owner);
		accepted(
			await t.f.command(
				{
					type: "recordImplementationSource",
					assignment: p2Owner,
					generation: 1,
					attempt: own(t, p2Owner).attempt,
					kind: "audit",
					text: JSON.stringify(capture(own(t, p2Owner), t.f.ledger.status().executorEpoch, t.contract, X1)),
				},
				effects,
			),
		);
		const audit = accepted(await t.f.command({ type: "requestImplementationAudit" }, actor, "p2-audit"));
		assert.notEqual(audit.audit, p1.audit!.ref, "P2's own Audit");
		assert.deepEqual(passes(t)[0]!.audit, p1.audit, "P1's Audit unchanged");
		assert.equal(t.assignments().filter((w) => w.packet.role === "watchdog" && w.status === "submitted").length, 1, "count kept");
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(passes(t).length, 2, "restart creates no pass");
	} finally {
		await t.close();
	}
});

for (const failure of ["content_corrupt", "missing_content"] as const)
	test(`RB11 ${failure} Record fidelity bytes block the assignment by exact ref; newer equal text does not substitute`, async () => {
		const t = await acceptedImplementation(undefined, "record");
		try {
			const text = await t.f.ledger.artifact(admin, { read: t.fidelity });
			assert.ok("content" in text);
			damageImplementation(t.f.data, t.fidelity, failure);
			await t.f.reopen(new LedgerOnlyEngine());
			await saveDocument(t, "fidelity-copy", text.content.toString());
			const reply = await t.f.command({ type: "assignTask", slice: "read-fix", delivery: true, packet: t.writer(watched(t.contract)) });
			// Role-input preflight classifies a deleted entry behind a retained location as corrupt.
			assert.equal(reply.status === "refused" && reply.code, "content_corrupt");
			assert.equal(reply.status === "refused" && reply.refs?.restore, t.fidelity, "names the exact ref");
			assert.equal(intakes(t).slices[0]!.everAssigned, false);
		} finally {
			await t.close();
		}
	});
