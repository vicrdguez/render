import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Harness, Registry } from "@earendil-works/pi-durable";
import { Engine } from "../../src/engine/runtime.ts";
import type { PolicyState } from "../../src/kernel/policy.ts";
import type { RolePacket } from "../../src/kernel/roles.ts";
import type { Ledger } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { openLedger } from "../../src/ledger/startup.ts";

export function packet(overrides: Partial<RolePacket> = {}): RolePacket {
	return {
		role: "coordinator",
		inputs: [],
		principles: "revision:3",
		instructions: "revision:3",
		policy: "revision:3",
		profile: "revision:3",
		execution: "read-only",
		provider: "anthropic",
		model: "claude-sonnet-4-6",
		family: "claude",
		requiredFamily: "claude",
		thinking: "low",
		maxInputBytes: 32768,
		maxOutputTokens: 1024,
		maxTurns: 3,
		expectedOutput: "Own bounded report",
		submission: "submit_role_result",
		requests: [],
		...overrides,
	};
}
/** An implementer an accepted pass can retain: it names the one reviewer each Audit axis needs. */
export function passOwner(contract: string, overrides: Partial<RolePacket> = {}): RolePacket {
	return packet({
		role: "implementer",
		inputs: [contract],
		requests: [
			{ key: "standards", packet: packet({ role: "audit-standards" }) },
			{ key: "contracts", packet: packet({ role: "audit-contracts" }) },
		],
		...overrides,
	});
}
export const admin = mintContext({ kind: "human", human: "human:owner", route: "local-admin" });
export const scheduler = mintContext({ kind: "host", scope: "scheduling" });
export const recovery = mintContext({ kind: "host", scope: "recovery" });
/** Explicit fixture human direction, not a provider/host family fallback. */
export async function allowSameFamily(ledger: Ledger) {
	const frame = ledger.snapshot(admin);
	if (!("policy" in frame)) throw new Error("Missing policy snapshot");
	const policy = frame.policy as PolicyState;
	const changed = await ledger.command(
		{
			version: 1,
			authorityEpoch: ledger.status().authorityEpoch,
			commandId: "fixture-family-direction",
			command: {
				type: "changePolicy",
				expectedRevision: policy.defaultRevision,
				policy: { completedReviewLimit: 2, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
			},
		},
		admin,
	);
	if (changed.status !== "accepted") throw new Error(JSON.stringify(changed));
	const adopted = await ledger.command(
		{
			version: 1,
			authorityEpoch: ledger.status().authorityEpoch,
			commandId: "fixture-family-adoption",
			workflow: "workflow:2",
			command: { type: "adoptPolicy", revision: changed.result.policy, expectedBinding: policy.bindings["workflow:2"]!.revision },
		},
		admin,
	);
	if (adopted.status !== "accepted") throw new Error(JSON.stringify(adopted));
}

export async function roleFixture(engine = new Engine()) {
	const data = await mkdtemp(join(tmpdir(), "render-role-"));
	let harness!: Harness;
	let registry!: Registry;
	const runtime = (report: Parameters<Engine["options"]>[0]) => {
		const options = engine.options(report);
		registry = options.registry as Registry;
		return {
			...options,
			bindLedger: (ledger: Parameters<NonNullable<typeof options.bindLedger>>[0], h: Harness) => {
				harness = h;
				options.bindLedger?.(ledger, h);
			},
		};
	};
	let opened = await openLedger({ data, runtime, onFatal: () => {} });
	let n = 0;
	const command = (c: Record<string, unknown>, context = scheduler, id = `role:${++n}`) =>
		opened.ledger.command(
			{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: id, workflow: "workflow:2", command: c },
			context,
		);
	const created = await opened.ledger.command(
		{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: "create", command: { type: "createWorkflow", title: "Roles" } },
		admin,
	);
	if (created.status !== "accepted" || created.result.workflow !== "workflow:2") throw new Error(JSON.stringify(created));
	const input = await opened.ledger.command(
		{
			version: 1,
			authorityEpoch: opened.authorityEpoch,
			commandId: "input",
			workflow: "workflow:2",
			expected: { document: null },
			command: {
				type: "saveDocument",
				document: "principles",
				mediaType: "text/plain",
				content: Buffer.from("Keep exact constraints.\n").toString("base64"),
			},
		},
		admin,
	);
	if (input.status !== "accepted") throw new Error(JSON.stringify(input));
	return {
		data,
		command,
		get harness() {
			return harness;
		},
		get registry() {
			return registry;
		},
		get ledger() {
			return opened.ledger;
		},
		engine,
		async reopen(next = new Engine()) {
			await opened.close();
			opened = await openLedger({ data, runtime: (report) => next.options(report), onFatal: () => {} });
			return next;
		},
		async close() {
			await opened.close();
			await rm(data, { recursive: true, force: true });
		},
	};
}
