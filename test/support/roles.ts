import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Harness, Registry } from "@earendil-works/pi-durable";
import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import type { EngineSettings, EngineSettingsRevision } from "../../src/kernel/engine-settings.ts";
import type { PolicyState } from "../../src/kernel/policy.ts";
import type { RolePacket } from "../../src/kernel/roles.ts";
import type { VerificationSelection } from "../../src/kernel/verification.ts";
import type { Ledger } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { openLedger } from "../../src/ledger/startup.ts";

export function packet(overrides: Partial<RolePacket> = {}): RolePacket {
	return {
		role: "coordinator",
		inputs: [],
		principles: "revision:4",
		instructions: "revision:4",
		policy: "revision:4",
		profile: "revision:4",
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
export const selection = (contract: string): VerificationSelection => ({
	repository: "owned",
	commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	path: ".render/verify.md",
	digest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	contract,
	rows: ["full-suite", "typecheck", "lint", "read"],
	behavioralRows: ["read"],
	receipts: [],
});
/** An implementer an accepted pass can retain: a Linux writer with a usable selection and the one reviewer each Audit axis needs. */
export function passOwner(contract: string, overrides: Partial<RolePacket> = {}): RolePacket {
	return packet({
		role: "implementer",
		execution: "linux-writer",
		verification: selection(contract),
		inputs: [contract],
		requests: [
			{ key: "standards", packet: packet({ role: "audit-standards" }) },
			{ key: "contracts", packet: packet({ role: "audit-contracts" }) },
		],
		...overrides,
	});
}
/** The fixture project's id: the first command after startup adds it. */
export const PROJECT = "project:2";
/** A project for workflows; Git-backed fixtures name a real remote. */
export function addProject(overrides: { remote?: string; defaultBranch?: string; checkImage?: string; name?: string } = {}) {
	return {
		type: "addProject",
		name: "Fixture",
		remote: "file:///render-fixture/absent.git",
		defaultBranch: "main",
		checkImage: "render-check:fixture",
		...overrides,
	};
}
export const admin = mintContext({ kind: "human", human: "human:owner", route: "local-admin" });
export const scheduler = mintContext({ kind: "host", scope: "scheduling" });
export const recovery = mintContext({ kind: "host", scope: "recovery" });
/** Explicit fixture human direction, not a provider/host family fallback. */
export async function allowSameFamily(ledger: Ledger) {
	const frame = ledger.snapshot(admin);
	if (!("policy" in frame)) throw new Error("Missing policy snapshot");
	const policy = frame.policy as PolicyState;
	const changed = await Effect.runPromise(
		ledger.command(
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
		),
	);
	if (changed.status !== "accepted") throw new Error(JSON.stringify(changed));
	const adopted = await Effect.runPromise(
		ledger.command(
			{
				version: 1,
				authorityEpoch: ledger.status().authorityEpoch,
				commandId: "fixture-family-adoption",
				workflow: "workflow:3",
				command: { type: "adoptPolicy", revision: changed.result.policy, expectedBinding: policy.bindings["workflow:3"]!.revision },
			},
			admin,
		),
	);
	if (adopted.status !== "accepted") throw new Error(JSON.stringify(adopted));
}

/** Applies `edit` to the current Engine settings revision as the local admin. */
export async function editEngineSettings(ledger: Ledger, edit: (settings: EngineSettings) => EngineSettings) {
	const current = (ledger.snapshot(admin) as { settings: EngineSettingsRevision }).settings;
	const changed = await Effect.runPromise(
		ledger.command(
			{
				version: 1,
				authorityEpoch: ledger.status().authorityEpoch,
				commandId: `fixture-engine-settings:${current.revision}`,
				command: { type: "changeEngineSettings", expectedRevision: current.revision, settings: edit(current.value) },
			},
			admin,
		),
	);
	if (changed.status !== "accepted") throw new Error(JSON.stringify(changed));
}

export async function roleFixture(engine = new Engine(), project: Parameters<typeof addProject>[0] = {}) {
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
	let opened = await Effect.runPromise(openLedger({ data, runtime, onFatal: () => {} }));
	let n = 0;
	const command = (c: Record<string, unknown>, context = scheduler, id = `role:${++n}`) =>
		Effect.runPromise(
			opened.ledger.command(
				{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: id, workflow: "workflow:3", command: c },
				context,
			),
		);
	const added = await Effect.runPromise(
		opened.ledger.command({ version: 1, authorityEpoch: opened.authorityEpoch, commandId: "project", command: addProject(project) }, admin),
	);
	if (added.status !== "accepted" || added.result.project !== PROJECT) throw new Error(JSON.stringify(added));
	const created = await Effect.runPromise(
		opened.ledger.command(
			{
				version: 1,
				authorityEpoch: opened.authorityEpoch,
				commandId: "create",
				command: { type: "createWorkflow", title: "Roles", project: PROJECT },
			},
			admin,
		),
	);
	if (created.status !== "accepted" || created.result.workflow !== "workflow:3") throw new Error(JSON.stringify(created));
	const input = await Effect.runPromise(
		opened.ledger.command(
			{
				version: 1,
				authorityEpoch: opened.authorityEpoch,
				commandId: "input",
				workflow: "workflow:3",
				expected: { document: null },
				command: {
					type: "saveDocument",
					document: "principles",
					mediaType: "text/plain",
					content: Buffer.from("Keep exact constraints.\n").toString("base64"),
				},
			},
			admin,
		),
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
		get principals() {
			return opened.principals;
		},
		engine,
		async reopen(next = new Engine()) {
			await Effect.runPromise(opened.close());
			opened = await Effect.runPromise(openLedger({ data, runtime: (report) => next.options(report), onFatal: () => {} }));
			return next;
		},
		async close() {
			await Effect.runPromise(opened.close());
			await rm(data, { recursive: true, force: true });
		},
	};
}
/** The default Claude family authenticated by a fixture API key in a pi login file, never the operator's. */
export const claudeFixture = { piAuth: fileURLToPath(new URL("fixture-auth.json", import.meta.url)) } as const;
