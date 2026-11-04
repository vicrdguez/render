import assert from "node:assert/strict";
import { type ConversationId, createRegistry, defineExtension, defineTask } from "@earendil-works/pi-durable";
import { Engine } from "../../src/engine/runtime.ts";
import type { IntakeManifest, Intakes } from "../../src/kernel/intake.ts";
import type { RoleAssignment, RolePacket } from "../../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { Workflow } from "../../src/ledger/records.ts";
import { admin, allowSameFamily, packet, roleFixture } from "./roles.ts";

export function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}
/** Real transaction/task staging, with execution deliberately outside these Ledger seam tests. */
export class LedgerOnlyEngine extends Engine {
	override options(onReport: Parameters<Engine["options"]>[0]) {
		const options = super.options(onReport);
		const task = defineTask<{ assignment: string }, { phase: "done" }, null>({
			name: "test.implementation-task",
			version: 1,
			initial: () => ({ phase: "done" }),
			phases: {
				done: (_task, runtime, context) =>
					runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
			},
			abort: (_task, runtime, context) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
		});
		const registry = createRegistry();
		registry.install(defineExtension({ name: "test.implementation", tasks: [task] }));
		return {
			...options,
			registry,
			beforeResume: async () => {},
			afterResume: () => {},
			roleTasks: {
				stage: async (
					tx: Parameters<NonNullable<typeof options.roleTasks>["stage"]>[0],
					_intent: Parameters<NonNullable<typeof options.roleTasks>["stage"]>[1],
					a: RoleAssignment,
				) => {
					const workflow = await tx.doc(Workflow, a.workflow, null);
					if (!workflow.exists) throw new Error("fixture workflow missing");
					return tx.createTask(
						task,
						{ assignment: a.id },
						{ conversationId: workflow.conversation as ConversationId, ownership: { kind: "conversation" } },
					);
				},
				committed: () => {},
			},
		};
	}
}

/** Accepted obligations are produced by real intake/fidelity/human commands, never seeded SQL. */
export async function acceptedImplementation(engine?: Engine) {
	const f = await roleFixture(new LedgerOnlyEngine());
	await allowSameFamily(f.ledger);
	const assignments = () => (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
	const agent = (a: RoleAssignment) =>
		mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
	const start = async (id: string) => {
		const a = assignments().find((a) => a.id === id)!;
		accepted(
			await f.command({
				type: "stageTask",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				executorEpoch: f.ledger.status().executorEpoch,
			}),
		);
		return agent(a);
	};
	let n = 0;
	const save = async (document: string, text: string) =>
		accepted(
			await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: `implementation-fixture:${++n}`,
					workflow: "workflow:2",
					expected: { document: null },
					command: { type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
				},
				admin,
			),
		).revision as string;
	const source = await save("existing-seam", "Approved existing seam: exact literal bytes.");
	const catalog = await save(
		"verification",
		"## Ranks\n1. `tests`\n2. `inspection`\n## Launch\nowned\n## Doctor\nnode\n## Channels\ntests\n## Catalog\n| Name | Channel | Kind | Run | Expectations | Rank |\n|---|---|---|---|---|---|\n| read | Tests | executed | `node read.js` | exact bytes | tests |\n## Cleanup\nnone\n## Extend\nowned\n## Traps\nnone\n",
	);
	const ground = await save(
		"ground",
		JSON.stringify({
			schema: 1,
			shape: { value: "bug", origin: "human", confirmed: true },
			goal: "Correct read",
			constraints: [],
			clarifications: [],
			donePredicate: "Literal bytes",
			approvedSources: [source],
		}),
	);
	const manifest: IntakeManifest = {
		schema: 1,
		shape: "bug",
		ground,
		sources: [source],
		decisions: [],
		catalog,
		breakdown: null,
		slices: [
			{
				id: "read-fix",
				title: "Fix read",
				record: false,
				delegated: ["Names"],
				forbidden: ["New interface"],
				obligations: [
					{ id: "B1", kind: "behavior", text: "Return exact bytes", sources: [] },
					{ id: "A1", kind: "architecture", text: "Retain seam", sources: [{ ref: source, node: null }] },
				],
			},
		],
		checks: [{ id: "read", row: "read", kind: "executed", rank: "tests", new: false, run: "node read.js", expectations: "exact bytes" }],
		mapping: [
			{ slice: "read-fix", obligation: "B1", checks: ["read"] },
			{ slice: "read-fix", obligation: "A1", checks: ["read"] },
		],
		dependencies: [],
		responses: [],
		unresolved: [],
	};
	const coordinator = accepted(
		await f.command({
			type: "assignTask",
			slice: "design",
			delivery: false,
			packet: packet({ inputs: [ground, source, catalog], requests: [{ key: "fidelity", packet: packet({ role: "challenger" }) }] }),
		}),
	).assignment as string;
	const actor = await start(coordinator);
	const intake = accepted(
		await f.command({ type: "stageIntake", expected: null, text: "# Contract\r\nReturn exact saved bytes.\n", manifest }, actor),
	).intake as string;
	const review = accepted(await f.command({ type: "requestIntakeReview", intake, key: "fidelity" }, actor)).assignment as string;
	const reviewer = await start(review);
	const binding = assignments().find((a) => a.id === review)!.intakeReview!;
	const report = accepted(
		await f.command(
			{
				type: "submitRoleResult",
				text: JSON.stringify({
					schema: 1,
					...binding,
					checks: { omitted: "Compared", weakened: "Compared", strengthened: "Compared", contradictory: "Compared", invented: "Compared" },
					findings: [],
				}),
				supports: [],
			},
			reviewer,
		),
	).report;
	const state = () => ((f.ledger.snapshot(admin) as Frame).workflows as { intakes: Intakes }[])[0]!.intakes;
	const draft = state().drafts[0]!;
	accepted(
		await f.command(
			{ type: "acceptIntake", intake, review: report, annotations: draft.annotations, policyBinding: draft.policyBinding, decisions: [] },
			admin,
		),
	);
	for (const id of [coordinator, review]) {
		const a = assignments().find((a) => a.id === id)!;
		if (id === coordinator) accepted(await f.command({ type: "submitRoleResult", text: "Intake accepted.", supports: [] }, actor));
		accepted(
			await f.command({
				type: "recordQuiescence",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				providerIdle: true,
				environment: "absent",
				effects: "reconciled",
			}),
		);
	}
	const contract = state().slices[0]!.contract;
	if (engine) await f.reopen(engine);
	const writer = (overrides: Partial<RolePacket> = {}) =>
		packet({
			role: "implementer",
			execution: "linux-writer",
			inputs: [contract],
			requests: [
				{ key: "arbitrary-left", packet: packet({ role: "audit-standards" }) },
				{ key: "arbitrary-right", packet: packet({ role: "audit-contracts" }) },
			],
			...overrides,
		});
	return { f, contract, source, catalog, ground, writer, assignments, start, agent, close: () => f.close() };
}
