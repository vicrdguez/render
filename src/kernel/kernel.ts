// Kernel: pure domain legality. No I/O, clock reads, randomness or ID minting; Ledger supplies resolved state
// and verified facts, and stages the returned writes atomically.

import { changePolicy, initialPolicy, type PolicyCommand, type PolicyState } from "./policy.ts";
import { changeRole, ROLE_COMMANDS, type RoleAssignment, type RoleCommand, type RoleIntent, type RoleWorkState } from "./roles.ts";

export type DeviceScope = { readonly workflows: "all" | readonly string[] };

export type Principal =
	| {
			readonly kind: "human";
			readonly human: string;
			readonly route: "device";
			readonly device: string;
			readonly workflows: DeviceScope["workflows"];
	  }
	| { readonly kind: "human"; readonly human: string; readonly route: "local-admin" }
	| {
			readonly kind: "assignment-agent";
			readonly assignment: string;
			readonly generation: number;
			readonly attempt: string;
			readonly role: string;
	  }
	| { readonly kind: "host"; readonly scope: "scheduling" | "effects" | "recovery" };

export type MediaType = "text/markdown" | "text/plain";

export type Persistence = {
	readonly journal_mode: string;
	readonly synchronous: number;
	readonly fullfsync: number;
	readonly checkpoint_fullfsync: number;
};

export type Command =
	| RoleCommand
	| PolicyCommand
	| { readonly type: "createWorkflow"; readonly title: string }
	| {
			readonly type: "saveDocument";
			readonly workflow: string;
			readonly document: string;
			readonly mediaType: MediaType;
			readonly expected: string | null;
	  }
	| { readonly type: "postCoordinatorMessage"; readonly workflow: string; readonly text: string }
	| { readonly type: "enrollDevice"; readonly label: string; readonly scope: DeviceScope }
	| { readonly type: "revokeDevice"; readonly device: string }
	| { readonly type: "recordStartup"; readonly executorEpoch: string; readonly persistence: Persistence }
	| { readonly type: string; readonly workflow?: string };

export type KernelState = {
	readonly roleWork?: RoleWorkState;
	readonly policy?: PolicyState;
	/** The envelope's workflow, when it exists. */
	readonly workflow: { readonly id: string; readonly messageCount: number } | null;
	/** The named document's current revision and the integrity of its retained bytes, when it exists. */
	readonly document: { readonly name: string; readonly current: string; readonly integrity: "intact" | "corrupt" | "missing" } | null;
	/** The target device of revokeDevice, when it exists. */
	readonly device: { readonly id: string; readonly revoked: boolean } | null;
};

export type VerifiedFacts = {
	readonly executorEpoch?: string;
	readonly principal: Principal;
	/** The Render sequence an accepted command receives. */
	readonly sequence: number;
	/** Identities minted by Ledger for whatever an accepted command creates. */
	readonly ids: {
		readonly assignment?: string;
		readonly attempt?: string;
		readonly workflow?: string;
		readonly revision?: string;
		readonly device?: string;
		readonly message?: string;
		readonly fact: string;
	};
	/** Ledger's measurement of submitted document bytes. */
	readonly content?: { readonly digest: string; readonly byteLength: number; readonly validUtf8: boolean };
};

export type DomainWrite =
	| { readonly type: "policy.replace"; readonly state: PolicyState }
	| { readonly type: "roles.replace"; readonly state: RoleWorkState; readonly intents: readonly RoleIntent[] }
	| { readonly type: "workflow.create"; readonly workflow: string; readonly title: string }
	| {
			readonly type: "revision.append";
			readonly revision: string;
			readonly workflow: string;
			readonly document: string;
			readonly kind: "ground" | "document";
			readonly mediaType: MediaType;
			readonly digest: string;
			readonly byteLength: number;
			readonly parent: string | null;
	  }
	| { readonly type: "document.advance"; readonly workflow: string; readonly document: string; readonly revision: string }
	| { readonly type: "message.append"; readonly message: string; readonly workflow: string }
	| { readonly type: "device.enroll"; readonly device: string; readonly label: string; readonly scope: DeviceScope }
	| { readonly type: "device.revoke"; readonly device: string }
	| { readonly type: "store.startup"; readonly executorEpoch: string; readonly persistence: Persistence }
	| { readonly type: "fact.record"; readonly fact: string; readonly command: string; readonly refs: Readonly<Record<string, string>> };

export type RefusalCode =
	| "stale_assignment"
	| "assignment_not_running"
	| "ownership_conflict"
	| "role_already_requested"
	| "assignment_not_queued"
	| "stale_executor"
	| "capacity_exhausted"
	| "assignment_closed"
	| "quiescence_unconfirmed"
	| "recovery_required"
	| "unknown_command"
	| "forbidden_principal"
	| "forbidden_scope"
	| "capability_unavailable"
	| "not_found"
	| "invalid_content"
	| "stale_basis"
	| "content_corrupt"
	| "missing_content"
	| "already_revoked";

export type Repair = { readonly action: string; readonly [key: string]: string | null };

export type Refusal = {
	readonly outcome: "refused";
	readonly code: RefusalCode;
	readonly reason: string;
	readonly refs?: Readonly<Record<string, string | null>>;
	readonly repair?: readonly Repair[];
};

export type Decision =
	| {
			readonly outcome: "accepted";
			readonly result: Readonly<Record<string, string | number | null | DeviceScope>>;
			readonly writes: readonly DomainWrite[];
			readonly facts: readonly string[];
	  }
	| Refusal;

type Family = "human-decision" | "local-admin" | "role-work" | "scheduling" | "source-effect" | "recovery-maintenance";

const FAMILY_ADMITS: Record<Family, (p: Principal) => boolean> = {
	"human-decision": (p) => p.kind === "human",
	"local-admin": (p) => p.kind === "human" && p.route === "local-admin",
	"role-work": (p) => p.kind === "assignment-agent",
	scheduling: (p) => p.kind === "host" && (p.scope === "scheduling" || p.scope === "recovery"),
	"source-effect": (p) => p.kind === "host" && p.scope === "effects",
	"recovery-maintenance": (p) => p.kind === "host" && p.scope === "recovery",
};

/** The closed command catalogue (spec §4). Unlisted types refuse; unavailable ones are not delivered yet. */
const CATALOGUE: Readonly<Record<string, { readonly family: Family; readonly available: boolean }>> = {
	createWorkflow: { family: "human-decision", available: true },
	saveDocument: { family: "human-decision", available: true },
	postCoordinatorMessage: { family: "human-decision", available: true },
	approveCheckpoint: { family: "human-decision", available: false },
	acceptIntake: { family: "human-decision", available: false },
	amendContract: { family: "human-decision", available: false },
	supersedeContract: { family: "human-decision", available: false },
	changePolicy: { family: "human-decision", available: true },
	adoptPolicy: { family: "human-decision", available: true },
	changeCheckpointSettings: { family: "human-decision", available: false },
	cancelWork: { family: "human-decision", available: true },
	requestLocalVerificationPrompt: { family: "human-decision", available: false },
	enrollDevice: { family: "local-admin", available: true },
	revokeDevice: { family: "local-admin", available: true },
	saveDraft: { family: "role-work", available: false },
	emitCheckpoint: { family: "role-work", available: false },
	reworkCheckpoint: { family: "role-work", available: false },
	requestRole: { family: "role-work", available: true },
	requestOwnStop: { family: "role-work", available: true },
	submitRoleResult: { family: "role-work", available: true },
	retainWebEvidence: { family: "role-work", available: true },
	advanceDelegatedCheckpoint: { family: "role-work", available: false },
	assignTask: { family: "scheduling", available: true },
	replaceTask: { family: "scheduling", available: true },
	recordRuntimeHistory: { family: "scheduling", available: true },
	stageTask: { family: "scheduling", available: true },
	fenceAttempt: { family: "scheduling", available: true },
	rebindAttempt: { family: "scheduling", available: true },
	recordBlocker: { family: "scheduling", available: true },
	recordQuiescence: { family: "scheduling", available: true },
	quarantineWorkspace: { family: "scheduling", available: false },
	cleanupWorkspace: { family: "scheduling", available: false },
	stageOperation: { family: "source-effect", available: false },
	admitEffect: { family: "source-effect", available: false },
	recordSourceObservation: { family: "source-effect", available: false },
	recordRunnerObservation: { family: "source-effect", available: true },
	recordRunnerDiagnostic: { family: "source-effect", available: true },
	recordForgeObservation: { family: "source-effect", available: false },
	recordStartup: { family: "recovery-maintenance", available: true },
	rotateEpoch: { family: "recovery-maintenance", available: false },
	recordRecoveryState: { family: "recovery-maintenance", available: true },
};

export function isKnownCommand(type: string): boolean {
	return Object.hasOwn(CATALOGUE, type);
}

export function isAvailableCommand(type: string): boolean {
	return CATALOGUE[type]?.available === true;
}

function refuse(code: RefusalCode, reason: string, refs?: Record<string, string | null>, repair?: Repair[]): Refusal {
	return { outcome: "refused", code, reason, ...(refs === undefined ? {} : { refs }), ...(repair === undefined ? {} : { repair }) };
}

function inScope(p: Principal, workflow: string): boolean {
	if (p.kind !== "human" || p.route !== "device") return true;
	return p.workflows === "all" || p.workflows.includes(workflow);
}

function fact(facts: VerifiedFacts, command: string, refs: Record<string, string>): DomainWrite {
	return { type: "fact.record", fact: facts.ids.fact, command, refs };
}

/** Internal Ledger preflight: no input-dependent reads precede principal authorization. */
export function commandPermission(type: string, principal: Principal): Refusal | undefined {
	const entry = Object.hasOwn(CATALOGUE, type) ? CATALOGUE[type] : undefined;
	if (entry === undefined) return refuse("unknown_command", `Unknown command type "${type}".`);
	if (!FAMILY_ADMITS[entry.family](principal))
		return refuse("forbidden_principal", `${type} belongs to the ${entry.family} family, which does not admit this principal.`);
	if (!entry.available) return refuse("capability_unavailable", `${type} is not available in this host version.`);
	if (
		(type === "createWorkflow" || type === "changePolicy") &&
		principal.kind === "human" &&
		principal.route === "device" &&
		principal.workflows !== "all"
	)
		return refuse("forbidden_scope", "Project-wide changes require a device with all-workflow scope.");
	return undefined;
}

export function change(state: KernelState, command: Command, facts: VerifiedFacts): Decision {
	const denied = commandPermission(command.type, facts.principal);
	if (denied) return denied;

	if (command.type === "changePolicy" || command.type === "adoptPolicy") return changePolicy(state, command as PolicyCommand, facts);
	if (ROLE_COMMANDS.includes(command.type)) return changeRole(state, command as RoleCommand, facts);

	const c = command as Extract<
		Command,
		{ type: "createWorkflow" | "saveDocument" | "postCoordinatorMessage" | "enrollDevice" | "revokeDevice" | "recordStartup" }
	>;
	switch (c.type) {
		case "createWorkflow": {
			const workflow = required(facts.ids.workflow);
			return {
				outcome: "accepted",
				result: { workflow },
				writes: [
					{ type: "workflow.create", workflow, title: c.title },
					{
						type: "policy.replace",
						state: (() => {
							const policy = structuredClone(state.policy ?? initialPolicy());
							policy.bindings[workflow] = { revision: `policy-binding:${facts.sequence}`, policy: policy.defaultRevision };
							return policy;
						})(),
					},
					fact(facts, c.type, { workflow, binding: `policy-binding:${facts.sequence}` }),
				],
				facts: [facts.ids.fact],
			};
		}
		case "saveDocument": {
			if (!inScope(facts.principal, c.workflow)) return refuse("forbidden_scope", `${c.workflow} is outside this device's scope.`);
			if (state.workflow === null) return refuse("not_found", `${c.workflow} does not exist.`, { workflow: c.workflow });
			const content = facts.content;
			if (content === undefined || !content.validUtf8) return refuse("invalid_content", "Document content must be complete UTF-8 bytes.");
			const current = state.document?.current ?? null;
			if (state.document !== null && state.document.integrity !== "intact") {
				const code = state.document.integrity === "corrupt" ? "content_corrupt" : "missing_content";
				return refuse(
					code,
					`The retained bytes of ${state.document.current} failed integrity checks; restore that exact revision before saving over it.`,
					{ restore: state.document.current },
					[{ action: "restoreRevision", revision: state.document.current }],
				);
			}
			if (c.expected !== current) {
				return refuse(
					"stale_basis",
					current === null
						? `${c.document} has no saved revision, but the save expected ${c.expected}.`
						: `${c.document} is now at ${current}, but the save expected ${c.expected ?? "no revision"}.`,
					{ current, expected: c.expected },
					current === null
						? [{ action: "resubmit", expected: null }]
						: [
								{ action: "readArtifact", artifact: current },
								{ action: "resubmit", expected: current },
							],
				);
			}
			const revision = required(facts.ids.revision);
			return {
				outcome: "accepted",
				result: { revision, document: c.document, digest: content.digest, byteLength: content.byteLength, parent: current },
				writes: [
					{
						type: "revision.append",
						revision,
						workflow: c.workflow,
						document: c.document,
						kind: c.document === "ground" ? "ground" : "document",
						mediaType: c.mediaType,
						digest: content.digest,
						byteLength: content.byteLength,
						parent: current,
					},
					{ type: "document.advance", workflow: c.workflow, document: c.document, revision },
					fact(facts, c.type, { workflow: c.workflow, revision }),
				],
				facts: [facts.ids.fact],
			};
		}
		case "postCoordinatorMessage": {
			if (!inScope(facts.principal, c.workflow)) return refuse("forbidden_scope", `${c.workflow} is outside this device's scope.`);
			if (state.workflow === null) return refuse("not_found", `${c.workflow} does not exist.`, { workflow: c.workflow });
			const message = required(facts.ids.message);
			return {
				outcome: "accepted",
				result: { message },
				writes: [{ type: "message.append", message, workflow: c.workflow }, fact(facts, c.type, { workflow: c.workflow, message })],
				facts: [facts.ids.fact],
			};
		}
		case "enrollDevice": {
			const device = required(facts.ids.device);
			return {
				outcome: "accepted",
				result: { device, label: c.label, scope: c.scope },
				writes: [{ type: "device.enroll", device, label: c.label, scope: c.scope }, fact(facts, c.type, { device })],
				facts: [facts.ids.fact],
			};
		}
		case "revokeDevice": {
			if (state.device === null) return refuse("not_found", `${c.device} is not enrolled.`, { device: c.device });
			if (state.device.revoked) return refuse("already_revoked", `${c.device} is already revoked.`, { device: c.device });
			return {
				outcome: "accepted",
				result: { device: c.device, revokedAtSequence: facts.sequence },
				writes: [{ type: "device.revoke", device: c.device }, fact(facts, c.type, { device: c.device })],
				facts: [facts.ids.fact],
			};
		}
		case "recordStartup":
			return {
				outcome: "accepted",
				result: { executorEpoch: c.executorEpoch },
				writes: [
					{ type: "store.startup", executorEpoch: c.executorEpoch, persistence: c.persistence },
					fact(facts, c.type, { executorEpoch: c.executorEpoch }),
				],
				facts: [facts.ids.fact],
			};
		default:
			return refuse("unknown_command", `Unknown command type "${command.type}".`);
	}
}

function required(id: string | undefined): string {
	if (id === undefined) throw new Error("Ledger did not supply the identity this command creates");
	return id;
}

export type DocumentSummary = {
	readonly document: string;
	readonly kind: "ground" | "document";
	readonly revision: string;
	readonly mediaType: MediaType;
	readonly digest: string;
	readonly byteLength: number;
	readonly recordedAtSequence: number;
	readonly revisionCount: number;
	readonly savedBy: string | null;
};

export type WorkflowState = {
	readonly assignments?: readonly RoleAssignment[];
	readonly id: string;
	readonly title: string;
	readonly documents: readonly DocumentSummary[];
	readonly messageCount: number;
};

/** Capabilities a client may expect from later Render versions; reported as absent, never as empty successes. */
export const UNAVAILABLE = ["coordinator-replies", "checkpoints", "intake-acceptance", "assignments", "evidence-receipts"] as const;

export type WorkflowView = {
	readonly workflow: string;
	readonly title: string;
	readonly ground: DocumentSummary | null;
	readonly documents: readonly DocumentSummary[];
	readonly messages: { readonly count: number; readonly coordinator: "unavailable" };
	readonly commitment: { readonly status: "none"; readonly acceptedIntake: null };
	readonly owner: { readonly status: "none" | "active" | "blocked"; readonly assignments: readonly RoleAssignment[] };
	readonly evidence: { readonly status: "none" | "available"; readonly items: readonly string[] };
	readonly blocker: { readonly code: string; readonly reason: string; readonly capabilities: readonly string[] } | null;
	readonly nextHumanAction:
		| { readonly type: "saveGround"; readonly workflow: string; readonly document: "ground"; readonly expected: null }
		| {
				readonly type: "cancelWork";
				readonly workflow: string;
				readonly assignment: string;
				readonly generation: number;
				readonly attempt: string;
				readonly reason: string;
		  }
		| { readonly type: "none"; readonly reason: string };
	readonly unavailable: readonly string[];
};

export function view(
	state: { readonly workflows: readonly WorkflowState[] },
	scope: DeviceScope,
): { readonly workflows: readonly WorkflowView[] } {
	const visible = state.workflows.filter((w) => scope.workflows === "all" || scope.workflows.includes(w.id));
	return { workflows: visible.map(workflowView) };
}

function workflowView(w: WorkflowState): WorkflowView {
	const ground = w.documents.find((d) => d.document === "ground") ?? null;
	const owners = (w.assignments ?? []).filter((a) => a.delivery && a.status !== "submitted" && a.status !== "canceled");
	const blocked = (w.assignments ?? []).filter((a) => a.blocker !== null);
	const evidence = (w.assignments ?? []).flatMap((a) => (a.report ? [a.report] : []));
	const recoverable = blocked.find((a) => a.status === "blocked" && a.blocker !== "awaiting_role_results");
	return {
		workflow: w.id,
		title: w.title,
		ground,
		documents: w.documents,
		messages: { count: w.messageCount, coordinator: "unavailable" },
		commitment: { status: "none", acceptedIntake: null },
		owner: { status: owners.length ? (owners.some((a) => a.blocker) ? "blocked" : "active") : "none", assignments: owners },
		evidence: { status: evidence.length ? "available" : "none", items: evidence },
		blocker: blocked.length
			? { code: blocked[0]?.blocker ?? "role_blocked", reason: blocked.map((a) => `${a.id}: ${a.blocker}`).join("; "), capabilities: [] }
			: {
					code: "capability_unavailable",
					reason:
						"This host retains Ground, documents, coordinator messages and scoped role work. Full coordinator replies and checkpoint playbooks are not available in this version.",
					capabilities:
						w.assignments === undefined ? ["coordinator-replies", "checkpoints", "assignments"] : ["coordinator-replies", "checkpoints"],
				},
		nextHumanAction: recoverable
			? {
					type: "cancelWork",
					workflow: w.id,
					assignment: recoverable.id,
					generation: recoverable.generation,
					attempt: recoverable.attempt,
					reason:
						"Cancel this blocked assignment to fence its Attempt. Wait for confirmed quiescence before scheduling a fresh linked replacement.",
				}
			: ground === null
				? { type: "saveGround", workflow: w.id, document: "ground", expected: null }
				: { type: "none", reason: "No further human decision is available in this host version; saved work is retained." },
		unavailable: w.assignments === undefined ? UNAVAILABLE : UNAVAILABLE.filter((name) => name !== "assignments"),
	};
}
