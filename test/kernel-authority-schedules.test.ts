// V1: pure Kernel schedules. The oracle is the literal command-family × principal matrix below plus a
// simple test-owned model of documents and devices, not Kernel code.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Decision, KernelState, Principal, VerifiedFacts } from "../src/kernel/kernel.ts";
import { change, view } from "../src/kernel/kernel.ts";
import { seeded } from "./support/random.ts";

const SCHEDULES = Number(process.env.RENDER_V1_SCHEDULES ?? 10_000);
const STEPS = 24;

const HUMAN = "human:owner";
const deviceAll: Principal = { kind: "human", human: HUMAN, route: "device", device: "device:1", workflows: "all" };
const deviceScoped: Principal = {
	kind: "human",
	human: HUMAN,
	route: "device",
	device: "device:2",
	workflows: ["workflow:1"],
};
const localAdmin: Principal = { kind: "human", human: HUMAN, route: "local-admin" };
const agent: Principal = { kind: "assignment-agent", assignment: "assignment:1", generation: 1, attempt: "attempt:1", role: "coordinator" };
const hostScheduling: Principal = { kind: "host", scope: "scheduling" };
const hostEffects: Principal = { kind: "host", scope: "effects" };
const hostRecovery: Principal = { kind: "host", scope: "recovery" };
const PRINCIPALS = [deviceAll, deviceScoped, localAdmin, agent, hostScheduling, hostEffects, hostRecovery];

type PrincipalClass = "human" | "local-admin" | "agent" | "host-scheduling" | "host-effects" | "host-recovery";
function classOf(p: Principal): PrincipalClass[] {
	if (p.kind === "human") return p.route === "local-admin" ? ["human", "local-admin"] : ["human"];
	if (p.kind === "assignment-agent") return ["agent"];
	return [`host-${p.scope}` as PrincipalClass];
}

// Literal matrix from spec §4 and docs/protocol.md. "available" commands can be accepted in this Slice;
// the rest must refuse with capability_unavailable once the principal is admitted.
const MATRIX: Record<string, { admits: PrincipalClass[]; available: boolean }> = {
	createWorkflow: { admits: ["human"], available: true },
	saveDocument: { admits: ["human"], available: true },
	postCoordinatorMessage: { admits: ["human"], available: true },
	enrollDevice: { admits: ["local-admin"], available: true },
	revokeDevice: { admits: ["local-admin"], available: true },
	recordStartup: { admits: ["host-recovery"], available: true },
	approveCheckpoint: { admits: ["human"], available: true },
	saveCheckpointConcern: { admits: ["human"], available: true },
	cancelCheckpoint: { admits: ["human"], available: true },
	requestCheckpoint: { admits: ["agent"], available: true },
	stageCheckpoint: { admits: ["agent"], available: true },
	requestCheckpointReview: { admits: ["agent"], available: true },
	acceptIntake: { admits: ["human"], available: true },
	amendContract: { admits: ["human"], available: true },
	supersedeContract: { admits: ["human"], available: true },
	amendDependencies: { admits: ["human"], available: true },
	saveIntakeConcern: { admits: ["human"], available: true },
	stageIntake: { admits: ["agent"], available: true },
	requestIntakeReview: { admits: ["agent"], available: true },
	changePolicy: { admits: ["human"], available: true },
	adoptPolicy: { admits: ["human"], available: true },
	replaceTask: { admits: ["host-scheduling", "host-recovery"], available: true },
	recordRuntimeHistory: { admits: ["host-scheduling", "host-recovery"], available: true },
	changeCheckpointSettings: { admits: ["human"], available: true },
	importCheckpointSettings: { admits: ["local-admin"], available: true },
	cancelWork: { admits: ["human"], available: true },
	requestLocalVerificationPrompt: { admits: ["human"], available: true },
	saveDraft: { admits: ["agent"], available: false },
	emitCheckpoint: { admits: ["agent"], available: true },
	reworkCheckpoint: { admits: ["agent"], available: true },
	requestRole: { admits: ["agent"], available: true },
	requestOwnStop: { admits: ["agent"], available: true },
	submitRoleResult: { admits: ["agent"], available: true },
	advanceDelegatedCheckpoint: { admits: ["agent"], available: true },
	assignTask: { admits: ["host-scheduling", "host-recovery"], available: true },
	stageTask: { admits: ["host-scheduling", "host-recovery"], available: true },
	fenceAttempt: { admits: ["host-scheduling", "host-recovery"], available: true },
	rebindAttempt: { admits: ["host-scheduling", "host-recovery"], available: true },
	recordBlocker: { admits: ["host-scheduling", "host-recovery"], available: true },
	recordQuiescence: { admits: ["host-scheduling", "host-recovery"], available: true },
	quarantineWorkspace: { admits: ["host-scheduling", "host-recovery"], available: false },
	cleanupWorkspace: { admits: ["host-scheduling", "host-recovery"], available: false },
	stageOperation: { admits: ["host-effects"], available: true },
	admitEffect: { admits: ["host-effects"], available: true },
	recordIntegration: { admits: ["host-effects"], available: true },
	recordSourceObservation: { admits: ["host-effects"], available: true },
	openSuccessorPass: { admits: ["host-effects"], available: true },
	recordRunnerObservation: { admits: ["host-effects"], available: true },
	recordRunnerDiagnostic: { admits: ["host-effects"], available: true },
	stageForgeOperation: { admits: ["host-effects"], available: true },
	admitForgeOperation: { admits: ["host-effects"], available: true },
	recordForgeObservation: { admits: ["host-effects"], available: true },
	authorizeForgeReissue: { admits: ["human"], available: true },
	resolveForgeRisk: { admits: ["human"], available: true },
	recordRecoveryState: { admits: ["host-recovery"], available: true },
};
const UNKNOWN = ["dropTables", "runSql", "setPrincipal", "approve", ""];

// Test-owned model of what accepted commands established.
type Model = {
	workflows: Map<string, { documents: Map<string, { current: string; revisions: string[]; corrupt: boolean }>; messages: number }>;
	devices: Map<string, { revoked: boolean }>;
	sequence: number;
};

type Step = { principal: number; command: Record<string, unknown>; corruptBasis: boolean; invalidUtf8: boolean };

function generate(seed: number): Step[] {
	const r = seeded(seed);
	const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
	const types = [...Object.keys(MATRIX), ...UNKNOWN];
	// Ledger mints workflow:<sequence>, so two opening local-admin creations make workflow:1 and workflow:2 exist.
	const opening = {
		principal: PRINCIPALS.indexOf(localAdmin),
		command: { type: "createWorkflow" },
		corruptBasis: false,
		invalidUtf8: false,
	};
	const steps: Step[] = [opening, opening];
	for (let i = 0; i < STEPS; i++) {
		const roll = r();
		const type =
			roll < 0.2
				? "saveDocument"
				: roll < 0.3
					? "createWorkflow"
					: roll < 0.38
						? "postCoordinatorMessage"
						: roll < 0.46
							? "enrollDevice"
							: roll < 0.52
								? "revokeDevice"
								: pick(types);
		const workflow = pick(["workflow:1", "workflow:2", "workflow:9"]);
		const document = pick(["ground", "notes"]);
		const expected = pick(["current", "previous", "null", "bogus"]);
		steps.push({
			principal: Math.floor(r() * PRINCIPALS.length),
			command: { type, workflow, document, expected, device: pick(["device:1", "device:2", "device:7"]) },
			corruptBasis: r() < 0.05,
			invalidUtf8: r() < 0.05,
		});
	}
	return steps;
}

function emptyModel(): Model {
	return {
		workflows: new Map(),
		devices: new Map([
			["device:1", { revoked: false }],
			["device:2", { revoked: false }],
		]),
		sequence: 0,
	};
}

function expectedRef(m: Model, workflow: string, document: string, choice: string): string | null {
	const doc = m.workflows.get(workflow)?.documents.get(document);
	if (choice === "current") return doc?.current ?? null;
	if (choice === "previous") return doc?.revisions.at(-2) ?? "revision:0";
	if (choice === "null") return null;
	return "revision:404";
}

function resolve(m: Model, cmd: Record<string, unknown>, corrupt: boolean): KernelState {
	const wf = m.workflows.get(String(cmd.workflow));
	const doc = wf?.documents.get(String(cmd.document));
	const dev = m.devices.get(String(cmd.device));
	return {
		workflow: wf === undefined ? null : { id: String(cmd.workflow), messageCount: wf.messages },
		document:
			doc === undefined
				? null
				: { name: String(cmd.document), current: doc.current, integrity: corrupt || doc.corrupt ? "corrupt" : "intact" },
		device: dev === undefined ? null : { id: String(cmd.device), revoked: dev.revoked },
	};
}

function toCommand(m: Model, step: Step): Record<string, unknown> {
	const c = step.command;
	const type = String(c.type);
	switch (type) {
		case "createWorkflow":
			return { type, title: "A workflow" };
		case "saveDocument":
			return {
				type,
				workflow: c.workflow,
				document: c.document,
				mediaType: "text/markdown",
				expected: expectedRef(m, String(c.workflow), String(c.document), String(c.expected)),
			};
		case "requestLocalVerificationPrompt":
			return { type, workflow: c.workflow, source: "revision:missing", expectedSequence: c.expected === "current" ? m.sequence : -1 };
		case "postCoordinatorMessage":
			return { type, workflow: c.workflow, text: "hello" };
		case "enrollDevice":
			return { type, label: "phone", scope: { workflows: "all" } };
		case "revokeDevice":
			return { type, device: c.device };
		case "recordStartup":
			return {
				type,
				executorEpoch: "executor-x",
				persistence: { journal_mode: "wal", synchronous: 2, fullfsync: 1, checkpoint_fullfsync: 1 },
			};
		default:
			return { type, workflow: c.workflow };
	}
}

function facts(m: Model, principal: Principal, step: Step): VerifiedFacts {
	const seq = m.sequence + 1;
	return {
		principal,
		sequence: seq,
		ids: {
			workflow: `workflow:${seq}`,
			revision: `revision:${seq}`,
			device: `device:${seq}`,
			message: `message:${seq}`,
			fact: `fact:${seq}`,
		},
		content: { digest: `sha256:${seq.toString(16).padStart(64, "0")}`, byteLength: 10, validUtf8: !step.invalidUtf8 },
	};
}

function inScope(p: Principal, workflow: unknown): boolean {
	if (p.kind !== "human" || p.route !== "device") return true;
	return p.workflows === "all" || p.workflows.includes(String(workflow));
}

// Outcome counts guard against a generator that never reaches the interesting cases.
const outcomes = new Map<string, number>();

// Generated role commands carry no identities or packet and no assignment exists in this model, so each eligible one has
// one ordinary refusal: no target to act on, or no content to act with.
const BARE_ROLE_REFUSAL: Record<string, string> = {
	requestCheckpoint: "stale_assignment",
	stageCheckpoint: "stale_assignment",
	requestCheckpointReview: "stale_assignment",
	emitCheckpoint: "stale_assignment",
	reworkCheckpoint: "stale_assignment",
	recordSourceObservation: "not_found",
	openSuccessorPass: "not_found",
	stageOperation: "not_found",
	admitEffect: "not_found",
	recordIntegration: "not_found",
	advanceDelegatedCheckpoint: "stale_assignment",
	assignTask: "invalid_content",
	recordRecoveryState: "invalid_content",
	replaceTask: "stale_assignment",
	stageIntake: "stale_assignment",
	requestIntakeReview: "stale_assignment",
	requestRole: "stale_assignment",
	requestOwnStop: "stale_assignment",
	submitRoleResult: "stale_assignment",
	recordRunnerDiagnostic: "stale_assignment",
	cancelWork: "not_found",
	fenceAttempt: "not_found",
	stageTask: "not_found",
	rebindAttempt: "not_found",
	recordBlocker: "not_found",
	recordQuiescence: "not_found",
	recordRunnerObservation: "not_found",
	recordRuntimeHistory: "not_found",
};

// The decision every generated step must get, derived from the literal matrix and the test-owned model.
function expectedDecision(m: Model, principal: Principal, step: Step, command: Record<string, unknown>, state: KernelState): string {
	const type = String(command.type);
	const row = MATRIX[type];
	if (row === undefined) return "unknown_command";
	if (!classOf(principal).some((c) => row.admits.includes(c))) return "forbidden_principal";
	if (!row.available) return "capability_unavailable";
	const wholeProject = principal.kind !== "human" || principal.route !== "device" || principal.workflows === "all";
	const workflow = String(command.workflow);
	const exists = m.workflows.has(workflow);
	switch (type) {
		case "createWorkflow":
			return wholeProject ? "accepted" : "forbidden_scope";
		case "changeCheckpointSettings":
		case "importCheckpointSettings":
		case "changePolicy":
			return wholeProject ? "stale_basis" : "forbidden_scope"; // Generated without the expected default revision.
		case "acceptIntake":
		case "amendContract":
		case "supersedeContract":
		case "saveIntakeConcern":
		case "approveCheckpoint":
		case "saveCheckpointConcern":
		case "cancelCheckpoint":
			if (!exists) return "not_found";
			return inScope(principal, workflow) ? "not_found" : "forbidden_scope";
		case "amendDependencies":
		case "adoptPolicy":
			if (!exists) return "not_found";
			return inScope(principal, workflow) ? "stale_basis" : "forbidden_scope"; // Generated without the expected binding.
		case "requestLocalVerificationPrompt":
			if (!inScope(principal, workflow)) return "forbidden_scope";
			if (!exists) return "not_found";
			return step.command.expected === "current" ? "missing_content" : "stale_basis";
		case "saveDocument": {
			if (!inScope(principal, workflow)) return "forbidden_scope";
			if (!exists) return "not_found";
			if (step.invalidUtf8) return "invalid_content";
			if (state.document?.integrity === "corrupt") return "content_corrupt";
			return command.expected === (state.document?.current ?? null) ? "accepted" : "stale_basis";
		}
		case "postCoordinatorMessage":
			if (!inScope(principal, workflow)) return "forbidden_scope";
			return exists ? "accepted" : "not_found";
		case "enrollDevice":
		case "recordStartup":
			return "accepted";
		case "revokeDevice": {
			const device = m.devices.get(String(command.device));
			if (device === undefined) return "not_found";
			return device.revoked ? "already_revoked" : "accepted";
		}
		// Generated without a kind, operation or observation: no qualified integration or staged operation exists here.
		case "stageForgeOperation":
		case "admitForgeOperation":
		case "authorizeForgeReissue":
		case "resolveForgeRisk":
			if (!inScope(principal, workflow)) return "forbidden_scope";
			return exists ? "stale_basis" : "not_found";
		case "recordForgeObservation":
			return exists ? "invalid_content" : "not_found";
		default:
			return exists ? (BARE_ROLE_REFUSAL[type] as string) : "not_found";
	}
}

// Returns a violation message, or undefined. Applies accepted writes to the model.
function checkStep(m: Model, step: Step): string | undefined {
	const principal = PRINCIPALS[step.principal] as Principal;
	const command = toCommand(m, step);
	const state = resolve(m, step.command, step.corruptBasis);
	const f = facts(m, principal, step);
	// Kernel is pure: whatever it decides, the state, command and facts it was given must be unchanged afterwards.
	const inputs = JSON.stringify([state, command, f]);
	const d: Decision = change(state, command as never, f);
	if (JSON.stringify([state, command, f]) !== inputs) return `Kernel mutated its inputs for ${String(command.type)}`;
	const type = String(command.type);
	const decided = d.outcome === "accepted" ? "accepted" : d.code;
	const label = `${type}:${decided}`;
	outcomes.set(label, (outcomes.get(label) ?? 0) + 1);
	const expected = expectedDecision(m, principal, step, command, state);
	if (decided !== expected) {
		if (d.outcome === "accepted" && expected === "forbidden_principal")
			return `${type} accepted from forbidden ${JSON.stringify(principal)}`;
		return `${type} from ${JSON.stringify(principal)} decided ${decided}, expected ${expected}`;
	}
	if (d.outcome === "refused") return "writes" in d ? `refusal carried writes for ${type}` : undefined;
	m.sequence = f.sequence;
	switch (type) {
		case "createWorkflow": {
			if (d.result.workflow !== f.ids.workflow) return "workflow id not the supplied one";
			m.workflows.set(String(f.ids.workflow), { documents: new Map(), messages: 0 });
			return undefined;
		}
		case "saveDocument": {
			const wf = m.workflows.get(String(command.workflow));
			const doc = wf?.documents.get(String(command.document));
			const current = doc?.current ?? null;
			if (d.result.parent !== current) return `parent ${d.result.parent} is not previous current ${current}`;
			if (d.result.revision !== f.ids.revision) return "revision id not the supplied one";
			const revs = doc?.revisions ?? [];
			wf?.documents.set(String(command.document), {
				current: String(f.ids.revision),
				revisions: [...revs, String(f.ids.revision)],
				corrupt: false,
			});
			return undefined;
		}
		case "postCoordinatorMessage": {
			const wf = m.workflows.get(String(command.workflow));
			if (wf) wf.messages++;
			return undefined;
		}
		case "enrollDevice":
			m.devices.set(String(f.ids.device), { revoked: false });
			return undefined;
		case "revokeDevice": {
			const dev = m.devices.get(String(command.device));
			if (dev) dev.revoked = true;
			return undefined;
		}
		default:
			return undefined;
	}
}

function run(steps: Step[]): { index: number; message: string } | undefined {
	const m = emptyModel();
	for (let i = 0; i < steps.length; i++) {
		const message = checkStep(m, steps[i] as Step);
		if (message !== undefined) return { index: i, message };
	}
	return undefined;
}

function shrink(steps: Step[]): Step[] {
	let current = steps;
	let progress = true;
	while (progress) {
		progress = false;
		for (let i = 0; i < current.length; i++) {
			const candidate = current.filter((_, j) => j !== i);
			if (run(candidate) !== undefined) {
				current = candidate;
				progress = true;
				break;
			}
		}
	}
	return current;
}

test(`V1: ${SCHEDULES} seeded schedules never violate the matrix, basis or refusal rules`, () => {
	const base = Number(process.env.RENDER_V1_SEED ?? 0x5eed);
	let accepted = 0;
	for (let n = 0; n < SCHEDULES; n++) {
		const seed = base + n;
		const steps = generate(seed);
		const failure = run(steps);
		if (failure !== undefined) {
			const minimal = shrink(steps);
			assert.fail(
				`seed ${seed} step ${failure.index}: ${failure.message}\nreplay: RENDER_V1_SEED=${seed} RENDER_V1_SCHEDULES=1\nshrunk: ${JSON.stringify(minimal)}`,
			);
		}
		accepted++;
	}
	assert.equal(accepted, SCHEDULES);
	if (SCHEDULES >= 1_000) {
		for (const label of [
			"saveDocument:accepted",
			"saveDocument:stale_basis",
			"saveDocument:content_corrupt",
			"saveDocument:invalid_content",
			"saveDocument:forbidden_scope",
			"saveDocument:forbidden_principal",
			"enrollDevice:forbidden_principal",
			"enrollDevice:accepted",
			"revokeDevice:accepted",
			"revokeDevice:already_revoked",
			"createWorkflow:forbidden_scope",
			"approveCheckpoint:not_found",
			"recordStartup:accepted",
			"dropTables:unknown_command",
		]) {
			assert.ok((outcomes.get(label) ?? 0) >= 10, `schedules rarely reach ${label}: ${JSON.stringify(Object.fromEntries(outcomes))}`);
		}
	}
});

test("literal: stale save names current and expected revisions and a repair", () => {
	const d = change(
		{
			workflow: { id: "workflow:1", messageCount: 0 },
			document: { name: "ground", current: "revision:5", integrity: "intact" },
			device: null,
		},
		{ type: "saveDocument", workflow: "workflow:1", document: "ground", mediaType: "text/markdown", expected: "revision:3" },
		{
			principal: deviceAll,
			sequence: 9,
			ids: { revision: "revision:9", fact: "fact:9" },
			content: { digest: "sha256:aa", byteLength: 3, validUtf8: true },
		},
	);
	assert.equal(d.outcome, "refused");
	assert.equal(d.outcome === "refused" && d.code, "stale_basis");
	assert.deepEqual(d.outcome === "refused" && d.refs, { current: "revision:5", expected: "revision:3" });
	assert.ok(d.outcome === "refused" && (d.repair?.length ?? 0) > 0);
});

test("literal: corrupt basis blocks the save with an exact restoration ref", () => {
	const d = change(
		{
			workflow: { id: "workflow:1", messageCount: 0 },
			document: { name: "ground", current: "revision:5", integrity: "corrupt" },
			device: null,
		},
		{ type: "saveDocument", workflow: "workflow:1", document: "ground", mediaType: "text/markdown", expected: "revision:5" },
		{
			principal: localAdmin,
			sequence: 9,
			ids: { revision: "revision:9", fact: "fact:9" },
			content: { digest: "sha256:aa", byteLength: 3, validUtf8: true },
		},
	);
	assert.equal(d.outcome === "refused" && d.code, "content_corrupt");
	assert.deepEqual(d.outcome === "refused" && d.refs, { restore: "revision:5" });
});

test("literal: accepted first save records revision, pointer and fact writes", () => {
	const d = change(
		{ workflow: { id: "workflow:1", messageCount: 0 }, document: null, device: null },
		{ type: "saveDocument", workflow: "workflow:1", document: "ground", mediaType: "text/markdown", expected: null },
		{
			principal: deviceAll,
			sequence: 2,
			ids: { revision: "revision:2", fact: "fact:2" },
			content: { digest: "sha256:a9f5b6f878692c7bb3c76ed6b6eb4baa791a2e57d1fd15fa7e26b35e338c0c47", byteLength: 56, validUtf8: true },
		},
	);
	assert.equal(d.outcome, "accepted");
	if (d.outcome !== "accepted") return;
	assert.deepEqual(d.result, {
		revision: "revision:2",
		document: "ground",
		digest: "sha256:a9f5b6f878692c7bb3c76ed6b6eb4baa791a2e57d1fd15fa7e26b35e338c0c47",
		byteLength: 56,
		parent: null,
	});
	assert.deepEqual(d.facts, ["fact:2"]);
	assert.deepEqual(
		d.writes.map((w) => w.type),
		["revision.append", "document.advance", "fact.record"],
	);
});

test("literal: the workflow view reports handover fields and absent capabilities explicitly", () => {
	const v = view(
		{
			workflows: [
				{ id: "workflow:1", title: "Keep work safe", documents: [], messageCount: 0 },
				{ id: "workflow:2", title: "Other", documents: [], messageCount: 0 },
			],
		},
		{ workflows: ["workflow:1"] },
	);
	assert.equal(v.workflows.length, 1);
	const w = v.workflows[0];
	assert.equal(w?.workflow, "workflow:1");
	assert.equal(w?.ground, null);
	assert.deepEqual(w?.commitment, { status: "none", acceptedIntake: null });
	assert.deepEqual(w?.owner, { status: "none", assignments: [] });
	assert.deepEqual(w?.evidence, { status: "none", items: [] });
	assert.deepEqual(w?.nextHumanAction, { type: "saveGround", workflow: "workflow:1", document: "ground", expected: null });
	assert.ok(w?.unavailable.includes("coordinator-replies"));
	assert.equal(w?.unavailable.includes("intake-acceptance"), false);
	assert.deepEqual(w?.checkpoints, { requests: [], concerns: [] });
	assert.ok(w?.unavailable.includes("assignments"));
	assert.equal(w?.unavailable.includes("historical-export"), false);
	assert.equal(w?.unavailable.includes("recovery-packages"), false);
	assert.equal(w?.unavailable.includes("off-host-protection"), false);
	assert.equal(w?.blocker, null, "absent capabilities are listed as unavailable, not as a blocker");
});
