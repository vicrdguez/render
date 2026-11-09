// ES02, ES04 and ES05 at the Ledger interface over real SQLite/Durable staging. Coordinator, fidelity and Watchdog
// reports and integration observations are scripted literals: they establish authority, blocking and retained
// handover answers, not model judgment or that Git ran. See docs/verification/existing-seam-change-failure-cases.md.

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import type { AuthenticatedContext } from "../src/ledger/principals.ts";
import {
	accepted,
	acceptedImplementation,
	damageImplementation,
	implementationLifecycle,
	LedgerOnlyEngine,
} from "./support/implementation.ts";
import { admit, admitted, handedOff, intent, observation, passedRound, passOf, record, refused, stage, W } from "./support/integration.ts";
import { admin, packet, selection } from "./support/roles.ts";

type View = {
	commitment: { status: string; acceptedIntake: string | null };
	intakes: { slices: { id: string; contract: string; status: string; everAssigned: boolean; record: boolean }[]; dependencies: unknown[] };
	checkpoints: { requests: { id: string; stage: string; status: string }[] };
	owner: { status: string; assignments: RoleAssignment[] };
	evidence: { items: string[] };
	blocker: { code: string; reason: string; capabilities: string[] } | null;
	nextHumanAction: { type: string; [key: string]: unknown };
	integrated?: string[];
};
const view = (frame: unknown) => ((frame as Frame).workflows as View[])[0]!;
const slices = (v: View) =>
	v.intakes.slices.map(({ id, contract, status, everAssigned, record }) => ({ id, contract, status, everAssigned, record }));

async function enroll(t: { f: Awaited<ReturnType<typeof acceptedImplementation>>["f"] }, label: string, workflows: string[]) {
	const enrolled = await Effect.runPromise(
		t.f.ledger.command(
			{
				version: 1,
				authorityEpoch: t.f.ledger.status().authorityEpoch,
				commandId: `device:${label}`,
				command: { type: "enrollDevice", label, scope: { workflows } },
			},
			admin,
		),
	);
	assert.ok(enrolled.status === "accepted" && enrolled.credential, JSON.stringify(enrolled));
	return `Bearer ${enrolled.credential.bearer}`;
}

test("ES02 a change Ground grounds two bounded Contracts and an explicit Record edge without a Seams/Modules round", async () => {
	const t = await acceptedImplementation(undefined, "record");
	try {
		const v = view(t.f.ledger.snapshot(admin));
		assert.equal(v.commitment.status, "accepted");
		assert.deepEqual(slices(v), [
			{ id: "read-fix", contract: t.contract, status: "accepted", everAssigned: false, record: true },
			{ id: "read-next", contract: t.nextContract, status: "accepted", everAssigned: false, record: false },
		]);
		assert.deepEqual(v.intakes.dependencies, [{ slice: "read-next", requires: "read-fix", kind: "record" }]);
		assert.deepEqual(v.checkpoints.requests, [], "no Seams/Modules checkpoint was requested");
	} finally {
		await t.close();
	}
});

test("ES04 a discovered seam change blocks change-shape work with visible facts and decision, preserving acceptance", async () => {
	const t = await implementationLifecycle(undefined, undefined, "independent");
	try {
		const facts = "read-fix found that the accepted read seam must return a stream, not bytes.";
		const ground = {
			schema: 1,
			shape: { value: "design", origin: "human", confirmed: true },
			goal: "Revise the read seam",
			constraints: ["Keep accepted read-fix history"],
			facts: [facts],
			clarifications: [],
			donePredicate: "An approved revised read seam",
			approvedSources: [t.source],
		};
		const save = (context: AuthenticatedContext, commandId: string) =>
			Effect.runPromise(
				t.f.ledger.command(
					{
						version: 1,
						authorityEpoch: t.f.ledger.status().authorityEpoch,
						commandId,
						workflow: W,
						expected: { document: t.ground },
						command: {
							type: "saveDocument",
							document: "ground",
							mediaType: "text/plain",
							content: Buffer.from(JSON.stringify(ground)).toString("base64"),
						},
					},
					context,
				),
			);
		refused(await save(t.actor, "agent-ground"), "forbidden_principal", "implementer cannot save human Ground");
		const revised = accepted(await save(admin, "revised-ground")).revision as string;
		const basis = { intake: "intake:1", review: "report:1", annotations: 0, policyBinding: "policy-binding:1", decisions: [] };
		for (const command of [
			{ type: "amendContract", slice: "read-fix", expected: t.contract, ...basis },
			{ type: "supersedeContract", slice: "read-fix", expected: t.contract, dispositions: [], ...basis },
		])
			refused(await t.f.command(command, t.actor), "forbidden_principal", `implementer ${command.type}`);
		refused(
			await t.f.command(
				{ type: "requestCheckpoint", stage: "seams", scope: revised, required: { candidates: false, experiment: false } },
				t.actor,
			),
			"forbidden_scope",
			"an implementer cannot request a design checkpoint",
		);
		const coordinator = accepted(
			await t.f.command({ type: "assignTask", slice: "redesign", delivery: false, packet: packet({ inputs: [revised, t.source] }) }),
		).assignment as string;
		const actor = await t.start(coordinator);
		refused(
			await t.f.command({ type: "amendContract", slice: "read-fix", expected: t.contract, ...basis }, actor),
			"forbidden_principal",
			"coordinator cannot amend",
		);
		const request = accepted(
			await t.f.command(
				{ type: "requestCheckpoint", stage: "seams", scope: revised, required: { candidates: false, experiment: false } },
				actor,
			),
		).request as string;
		const check = (label: string) => {
			const v = view(t.f.ledger.snapshot(admin));
			const owner = t.owner();
			assert.equal(owner.status, "blocked", `${label}: running change-shape owner stops`);
			assert.equal(owner.blocker, "seams_decision_required", `${label}: owner names the required decision`);
			assert.equal(v.blocker?.code, "seams_decision_required", `${label}: view blocker`);
			assert.deepEqual(v.nextHumanAction, { type: "reviewCheckpoint", request, emission: null, annotations: 0 }, label);
			assert.deepEqual(
				slices(v),
				[
					{ id: "read-fix", contract: t.contract, status: "accepted", everAssigned: true, record: false },
					{ id: "read-next", contract: t.nextContract, status: "accepted", everAssigned: false, record: false },
				],
				`${label}: historical acceptance retained`,
			);
		};
		check("live");
		const next = () =>
			t.f.command({
				type: "assignTask",
				slice: "read-next",
				delivery: true,
				packet: t.writer({ inputs: [t.nextContract!], verification: selection(t.nextContract!) }),
			});
		refused(await next(), "seams_required", "change label is not a waiver for unrelated accepted work");
		await t.f.reopen(new LedgerOnlyEngine());
		check("after reopen");
		refused(await next(), "seams_required", "after reopen");
		const retained = await Effect.runPromise(t.f.ledger.artifact(admin, { read: revised }));
		assert.ok("content" in retained);
		assert.deepEqual(JSON.parse(retained.content.toString()).facts, [facts], "discovered facts are retained human Ground");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [revised, t.contract, t.nextContract!]) assert.ok(exported.content[ref], `export retains ${ref}`);
		accepted(await t.f.command({ type: "cancelCheckpoint", request, expectedEmission: null, reason: "Seam stays." }, admin));
		accepted(await next());
	} finally {
		await t.close();
	}
});

test("ES05 a fresh device reconstructs the five handover answers with partial delivery after the original clients go away", async () => {
	const t = await handedOff("record");
	try {
		const bearer = await enroll(t, "fresh", [W]);
		const elsewhere = await enroll(t, "elsewhere", []);
		const before = view(t.f.ledger.snapshot(admin));
		assert.deepEqual(before.blocker, {
			code: "dependency_blocked",
			reason: "Required record of read-fix blocks read-next until recorded qualifying integration.",
			capabilities: ["qualifying-integration"],
		});
		assert.deepEqual(before.integrated, [], "nothing qualified yet");
		const round = await passedRound(t);
		const { operation, attempt } = await admitted(t, t.id, round);
		accepted(await record(t, t.id, operation, observation(operation, attempt)));
		await t.f.reopen(new LedgerOnlyEngine());
		const fresh = t.f.ledger.authenticate(bearer) as AuthenticatedContext;
		assert.ok(fresh, "enrollment survives reopen");
		const frame = t.f.ledger.snapshot(fresh) as Frame;
		const v = view(frame);
		const acceptance = before.commitment.acceptedIntake;
		assert.ok(acceptance);
		assert.deepEqual(v.commitment, { status: "accepted", acceptedIntake: acceptance }, "commitment");
		assert.deepEqual(slices(v), [
			{ id: "read-fix", contract: t.contract, status: "accepted", everAssigned: true, record: true },
			{ id: "read-next", contract: t.nextContract, status: "accepted", everAssigned: false, record: false },
		]);
		assert.deepEqual(v.integrated, ["read-fix"], "partial delivery: read-fix qualified, read-next not");
		assert.deepEqual(v.owner, { status: "none", assignments: [] }, "no active owner");
		const pass = (frame.implementationPasses as ReturnType<typeof passOf>[]).find((p) => p.slice === "read-fix")!;
		assert.equal(pass.ref, passOf(t).ref, "pass");
		assert.ok(pass.handoff?.source, "exact handed-off source");
		assert.ok(pass.handoff?.integrations?.[0]?.qualification, "recorded qualification");
		assert.ok(v.evidence.items.includes(round.report), "Watchdog report is evidence");
		assert.equal(v.blocker, null, "no blocker exists once read-fix qualified");
		assert.equal(v.nextHumanAction.type, "none", "next human action");
		const contract = await Effect.runPromise(t.f.ledger.artifact(fresh, { read: t.contract }));
		assert.ok("content" in contract && contract.content.toString().includes("Fix read"), "exact Contract bytes");
		assert.deepEqual((t.f.ledger.snapshot(t.f.ledger.authenticate(elsewhere)!) as Frame).workflows, [], "scoped elsewhere");

		damageImplementation(t.f.data, t.nextContract!, "content_corrupt");
		await t.f.reopen(new LedgerOnlyEngine());
		const read = await Effect.runPromise(t.f.ledger.artifact(t.f.ledger.authenticate(bearer)!, { read: t.nextContract! }));
		assert.ok("code" in read && read.code === "content_corrupt", "corrupt Contract refuses rather than substitutes");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && !exported.manifest.complete && !(t.nextContract! in exported.content));
	} finally {
		await t.close();
	}
});

test("ES06 a pending Seams revision refuses new integration staging and admission for affected work; admitted operations still reconcile", async () => {
	const t = await handedOff();
	try {
		const ground = accepted(
			await Effect.runPromise(
				t.f.ledger.command(
					{
						version: 1,
						authorityEpoch: t.f.ledger.status().authorityEpoch,
						commandId: "revised-ground",
						workflow: W,
						expected: { document: t.ground },
						command: {
							type: "saveDocument",
							document: "ground",
							mediaType: "text/plain",
							content: Buffer.from(
								JSON.stringify({
									schema: 1,
									shape: { value: "design", origin: "human", confirmed: true },
									goal: "Revise the read seam",
									constraints: [],
									facts: ["The accepted read seam must change."],
									donePredicate: "An approved revised read seam",
								}),
							).toString("base64"),
						},
					},
					admin,
				),
			),
		).revision as string;
		const coordinator = accepted(
			await t.f.command({ type: "assignTask", slice: "redesign", delivery: false, packet: packet({ inputs: [ground, t.source] }) }),
		).assignment as string;
		const actor = await t.start(coordinator);
		const revise = async () =>
			accepted(
				await t.f.command(
					{ type: "requestCheckpoint", stage: "seams", scope: ground, required: { candidates: false, experiment: false } },
					actor,
				),
			).request as string;
		const settle = async (request: string) =>
			accepted(await t.f.command({ type: "cancelCheckpoint", request, expectedEmission: null, reason: "Seam stays." }, admin));
		const text = intent(t, t.id, await passedRound(t));
		let request = await revise();
		refused(await stage(t, t.id, text), "seams_required", "staging affected integration while the Seams decision is pending");
		await settle(request);
		const operation = accepted(await stage(t, t.id, text)).operation as string;
		request = await revise();
		refused(await admit(t, t.id, operation), "seams_required", "admitting affected integration while the Seams decision is pending");
		await settle(request);
		const attempt = accepted(await admit(t, t.id, operation)).integrationAttempt as string;
		await revise();
		accepted(await record(t, t.id, operation, observation(operation, attempt)));
		assert.deepEqual(view(t.f.ledger.snapshot(admin)).integrated, ["read-fix"], "an admitted effect is still reconciled");
	} finally {
		await t.close();
	}
});
