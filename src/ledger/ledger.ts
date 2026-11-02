// Ledger: the accepting authority. command/observe/artifact are its interface; adapters in this directory are the
// only places that establish principals.
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId, EntryId, Harness, HarnessOptions, Storage, Tx } from "@earendil-works/pi-durable";
import type { RoleTaskStaging } from "../engine/runtime.ts";
import {
	change,
	commandPermission,
	type DocumentSummary,
	type KernelState,
	type Persistence,
	type Principal,
	type Refusal,
	type VerifiedFacts,
	view,
	type WorkflowState,
} from "../kernel/kernel.ts";
import { bindingFor, initialPolicy, type PolicyState } from "../kernel/policy.ts";
import { packetRefs, type RoleAssignment, type RolePacket, type RoleWorkState, sameAgent } from "../kernel/roles.ts";
import { Backup, type BackupClock, realBackupClock } from "./backup.ts";
import { initialBackup, validBackup } from "./backup-state.ts";
import { faultBarrier } from "./barrier.ts";
import { decodeUtf8, type Envelope, PROTOCOL_VERSION, parseEnvelope } from "./envelope.ts";
import {
	exportHistory,
	type HistoryExport,
	type HistoryPage,
	type HistoryQuery,
	type HistoryRecord,
	historyPage,
	type Missing,
	refusal,
	selectHistory,
} from "./history.ts";
import type { OffHostDestination } from "./offhost.ts";
import { type AuthenticatedContext, bearerOf, mintContext, newSecret, parseBearer, principalOf, verifies } from "./principals.ts";
import {
	type AcceptedBy,
	Device,
	type DeviceRecord,
	type DocumentPointer,
	FactEntry,
	MessageEntry,
	Meta,
	type MetaState,
	Policy,
	PolicyEntry,
	Receipt,
	type ReceiptBody,
	type RevisionData,
	RevisionEntry,
	RevisionLocation,
	RoleBinding,
	RoleWork,
	RuntimeHistoryEntry,
	STORE_SCHEMA,
	Workflow,
	type WorkflowRecord,
} from "./records.ts";
import { createRecoveryPackage, Recovery, type RecoveryState, validateRecoveryState } from "./recovery.ts";

const ctx = BACKGROUND_CONTEXT;

export type LedgerRefusal = {
	readonly status: "refused";
	readonly code: string;
	readonly reason: string;
	readonly refs?: Readonly<Record<string, string | null>>;
	readonly repair?: readonly Readonly<Record<string, string | null>>[];
	readonly supported?: readonly number[];
};

export type CommandReply =
	| { readonly status: "packaged"; readonly path: string; readonly cutoff: number }
	| (ReceiptBody & { readonly duplicate: boolean; readonly credential?: { readonly bearer: string } })
	| LedgerRefusal;

export type Frame = Readonly<Record<string, unknown>> & { readonly version: number; readonly kind: string; readonly sequence: number };

export type Artifact = {
	readonly artifact: string;
	readonly kind: "ground" | "document" | "message";
	readonly schema: number;
	readonly workflow: string;
	readonly document: string | null;
	readonly mediaType: string;
	readonly digest: string;
	readonly byteLength: number;
	readonly integrity: "verified" | "unverified_legacy";
	readonly parents: readonly string[];
	readonly supersedes: readonly string[];
	readonly source: null;
	readonly policy: null;
	readonly assignment: string | null;
	readonly generation: number | null;
	readonly attempt: string | null;
	readonly decisionRefs: readonly string[];
	readonly outcomeRefs: readonly string[];
	readonly createdBy: AcceptedBy;
	readonly commandId: string;
	readonly recordedAtSequence: number;
	readonly content: Buffer;
};

export type HostMode = "active" | "failed" | "closing";

const UNAUTHORIZED: LedgerRefusal = { status: "refused", code: "unauthorized", reason: "Authentication required." };
const RECOVERY_REQUIRED: LedgerRefusal = {
	status: "refused",
	code: "recovery_required",
	reason: "Local-admin validation/repair or newer-world reconciliation is required. Dispatch and mutation admission remain disabled.",
};
const NOT_FOUND: LedgerRefusal = { status: "refused", code: "not_found", reason: "Not found." };
const CONFLICT: LedgerRefusal = {
	status: "refused",
	code: "command_conflict",
	reason: "This command ID was already used with a different payload.",
	repair: [{ action: "resubmit", commandId: null }],
};

/** Thrown inside a commit callback so that nothing staged becomes visible. */
class Abort extends Error {
	readonly refusal: LedgerRefusal;
	constructor(refusal: LedgerRefusal) {
		super(refusal.code);
		this.refusal = refusal;
	}
}

function fromKernel(r: Refusal): LedgerRefusal {
	return {
		status: "refused",
		code: r.code,
		reason: r.reason,
		...(r.refs ? { refs: r.refs } : {}),
		...(r.repair ? { repair: r.repair } : {}),
	};
}

function plain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/** Check compatibility before interpreting retained application content. */
function unsupportedRecordSchema(schema: unknown, ref: string): LedgerRefusal | undefined {
	if (schema === 1) return undefined;
	return {
		status: "refused",
		code: "unsupported_schema",
		reason: `Retained record ${ref} has schema ${String(schema)}; this host supports 1. Run a compatible Render version; the record was left unchanged.`,
		refs: { record: ref },
		supported: [1],
	};
}

function sha256(bytes: Buffer): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

type Present<T> = Extract<T, { exists: true }>;

type Observer = {
	readonly principal: Principal;
	readonly device: string | null;
	last: number;
	send(frame: Frame): void;
	end(frame: Frame): void;
};

type Management = { data: string; runtime: HarnessOptions; storage: Storage; backup?: OffHostDestination; backupClock?: BackupClock };

export class Ledger {
	readonly #harness: Harness;
	readonly #persistence: Persistence;
	readonly #onFatal: (error: unknown) => void;
	readonly #observers = new Set<Observer>();
	#meta: MetaState;
	#recovery: RecoveryState | undefined;
	readonly #management: Management;
	readonly #backup: Backup;
	readonly #backupClock: BackupClock;
	readonly #workflows = new Map<string, Present<WorkflowRecord>>();
	readonly #devices = new Map<string, Present<DeviceRecord>>();
	#mode: HostMode = "active";
	#roleWork: RoleWorkState = { assignments: [] };
	#policy: PolicyState = initialPolicy();
	#roleTasks: RoleTaskStaging | undefined;

	private constructor(
		harness: Harness,
		meta: MetaState,
		persistence: Persistence,
		onFatal: (error: unknown) => void,
		management: Management,
		recovery: RecoveryState | undefined,
	) {
		this.#management = management;
		this.#recovery = recovery;
		this.#harness = harness;
		this.#meta = meta;
		this.#persistence = persistence;
		this.#onFatal = onFatal;
		this.#backupClock = management.backupClock ?? realBackupClock;
		if (meta.backup !== undefined && !validBackup(meta.backup, meta.sequence)) throw new Error("Unsupported backup state");
		this.#meta.backup ??= initialBackup(meta.sequence);
		this.#backup = new Backup({
			destination: recovery !== undefined && recovery.mode !== "active" ? undefined : management.backup,
			clock: this.#backupClock,
			state: () => this.#meta.backup!,
			save: async (update) => {
				const backup = await harness.commit(async (tx) => {
					const current = await tx.doc(Meta);
					current.backup ??= initialBackup(current.sequence);
					update(current.backup);
					return plain(current.backup);
				}, ctx);
				this.#meta.backup = backup;
			},
			scratch: join(management.data, ".offhost-scratch"),
			package: (root) => createRecoveryPackage(management.data, management.runtime, "offhost", root),
			changed: () => {
				for (const observer of this.#observers) {
					observer.last = this.#meta.sequence;
					observer.send(this.#snapshotFrame(observer.principal));
				}
			},
		});
		void harness.closed.then((end) => {
			if (end.reason === "failed") this.#fail(end.error);
		});
	}

	/** Loads committed state into the read model. Called by startup after the store and runtime are validated. */
	static async load(
		harness: Harness,
		persistence: Persistence,
		onFatal: (error: unknown) => void,
		management: Management,
		roleTasks?: RoleTaskStaging,
	): Promise<Ledger> {
		const meta = await harness.snapshot(Meta, ctx);
		if (meta === undefined || !meta.initialized) throw new Error("Render store is not initialized");
		const recovery = await harness.snapshot(Recovery, ctx);
		const ledger = new Ledger(
			harness,
			plain(meta) as MetaState,
			persistence,
			onFatal,
			management,
			recovery === undefined ? undefined : (plain(recovery) as RecoveryState),
		);
		ledger.#roleTasks = roleTasks;
		ledger.#policy = plain((await harness.snapshot(Policy, ctx)) ?? initialPolicy());
		ledger.#roleWork = plain((await harness.snapshot(RoleWork, ctx)) ?? { assignments: [] });
		for (const id of meta.workflows) {
			const w = await harness.snapshot(Workflow, id, ctx);
			if (w?.exists) ledger.#workflows.set(id, plain(w) as Present<WorkflowRecord>);
		}
		for (const id of meta.devices) {
			const d = await harness.snapshot(Device, id, ctx);
			if (d?.exists) ledger.#devices.set(id, plain(d) as Present<DeviceRecord>);
		}
		ledger.#backup.schedule(false);
		return ledger;
	}

	status() {
		const m = this.#meta;
		return {
			hostMode: this.#hostMode(),
			recovery: this.#recovery ?? null,
			backup: this.#backup.status(),
			human: m.human,
			authorityEpoch: m.authorityEpoch,
			executorEpoch: m.executorEpoch,
			sequence: m.sequence,
			persistence: this.#persistence,
			startups: m.startups,
			devices: [...this.#devices.values()].map((d) => ({
				device: d.device,
				label: d.label,
				scope: d.scope,
				enrolledAtSequence: d.enrolledAtSequence,
				revoked: d.revokedAtSequence !== null,
				revokedAtSequence: d.revokedAtSequence,
			})),
		};
	}

	/** Establishes a device context from an Authorization header against current, unrevoked credentials. */
	authenticate(header: string | undefined): AuthenticatedContext | undefined {
		if (this.remoteRecoveryRequired()) return undefined;
		const bearer = parseBearer(header);
		const device = bearer === undefined ? undefined : this.#devices.get(bearer.device);
		if (bearer === undefined || device === undefined || device.revokedAtSequence !== null || !verifies(bearer.secret, device.verifier))
			return undefined;
		return mintContext({ kind: "human", human: device.human, route: "device", device: device.device, workflows: device.scope.workflows });
	}

	async command(raw: unknown, context: AuthenticatedContext): Promise<CommandReply> {
		const principal = principalOf(context);
		if (principal === undefined)
			return { status: "refused", code: "untrusted_context", reason: "The context was not established by a trusted Ledger adapter." };
		if (this.#mode !== "active") return { status: "refused", code: "host_unavailable", reason: `The host is ${this.#mode}.` };
		if (!this.#current(principal)) return UNAUTHORIZED;
		const env = parseEnvelope(raw);
		if ("status" in env) return env;
		if (env.authorityEpoch !== this.#meta.authorityEpoch)
			return {
				status: "refused",
				code: "authority_epoch_mismatch",
				reason: "The envelope names a different authority epoch; take a fresh snapshot.",
				refs: { current: this.#meta.authorityEpoch, expected: env.authorityEpoch },
			};
		const localAdmin = principal.kind === "human" && principal.route === "local-admin";
		if (env.command.type === "createRecoveryPackage" || env.command.type === "repairRecovery") {
			if (!localAdmin) return { status: "refused", code: "forbidden_principal", reason: "Local-admin only." };
			if (env.workflow !== null || Object.keys((raw as { command: object }).command).join() !== "type")
				return { status: "refused", code: "malformed_envelope", reason: "Recovery management takes only a command type." };
			if (env.command.type === "repairRecovery") return this.#repair(env, principal);
			if (this.#recovery?.mode !== undefined && this.#recovery.mode !== "active") return RECOVERY_REQUIRED;
			try {
				return await createRecoveryPackage(this.#management.data, this.#management.runtime, env.commandId);
			} catch (error) {
				return { status: "refused", code: "invalid_recovery_package", reason: String(error) };
			}
		}
		if (
			this.#recovery !== undefined &&
			this.#recovery.mode !== "active" &&
			!(localAdmin && this.#recovery.mode === "recovery-reconciling" && ["enrollDevice", "revokeDevice"].includes(env.command.type))
		)
			return RECOVERY_REQUIRED;
		const enrollment = env.command.type === "enrollDevice" ? newSecret() : undefined;
		let outcome: Awaited<ReturnType<Ledger["stage"]>>;
		try {
			outcome = await this.#harness.commit((tx) => this.stage(tx, env, principal, enrollment?.verifier), ctx);
		} catch (error) {
			if (error instanceof Abort) return error.refusal;
			this.#fail(error);
			return {
				status: "refused",
				code: "outcome_unknown",
				reason: "Storage failed while committing; the host is stopping. Retry the original command ID after restart.",
			};
		}
		if (!outcome.duplicate) {
			this.#adopt(outcome);
			this.#backup.schedule(["saveDocument", "assignTask", "requestRole", "cancelWork", "submitRoleResult"].includes(env.command.type));
		}
		await faultBarrier("after-commit", env.commandId);
		if (outcome.duplicate) return { ...outcome.body, duplicate: true };
		const result = outcome.body.result;
		const credential =
			enrollment !== undefined && typeof result.device === "string" ? { bearer: bearerOf(result.device, enrollment.secret) } : undefined;
		return { ...outcome.body, duplicate: false, ...(credential ? { credential } : {}) };
	}

	/** Checked before remote credential interpretation, not after receipt lookup. */
	remoteRecoveryRequired(): boolean {
		return this.#recovery?.restoreRequired === true || this.#recovery?.mode === "admission-disabled";
	}

	#hostMode(): string {
		return this.#mode === "active" ? (this.#recovery?.mode ?? "active") : this.#mode;
	}

	async #repair(env: Envelope, principal: Principal): Promise<CommandReply> {
		if (!this.#recovery?.restoreRequired) return RECOVERY_REQUIRED;
		try {
			await validateRecoveryState(this.#management.storage);
		} catch (error) {
			return { status: "refused", code: "invalid_recovery_package", reason: String(error) };
		}
		try {
			const outcome = await this.#harness.commit(async (tx) => {
				const recovery = await tx.doc(Recovery);
				if (!recovery.restoreRequired) throw new Abort(RECOVERY_REQUIRED);
				const meta = await tx.doc(Meta);
				if (meta.authorityEpoch !== env.authorityEpoch) throw new Abort(RECOVERY_REQUIRED);
				const sequence = meta.sequence + 1;
				for (const id of meta.devices) {
					const d = await tx.doc(Device, id, null);
					if (d.exists && d.revokedAtSequence === null) d.revokedAtSequence = sequence;
				}
				meta.authorityEpoch = `authority-${randomUUID()}`;
				meta.historyCursorKey = randomUUID();
				meta.sequence = sequence;
				recovery.restoreRequired = false;
				recovery.mode = "recovery-reconciling";
				const by: AcceptedBy = { principal: "human", route: "local-admin" };
				await tx.appendEntry(FactEntry, meta.ledgerConversation as ConversationId, {
					data: { schema: 1, fact: `fact:${sequence}`, sequence, command: "repairRecovery", commandId: env.commandId, refs: {}, by },
				});
				const body: ReceiptBody = {
					status: "accepted",
					commandId: env.commandId,
					receipt: `receipt:${sequence}`,
					sequence,
					authorityEpoch: meta.authorityEpoch,
					workflow: null,
					result: { recovery: "recovery-reconciling" },
					facts: [`fact:${sequence}`],
					acceptedBy: by,
				};
				const receipt = await tx.doc(Receipt, `${namespaceOf(principal)} ${env.commandId}`, null);
				if (receipt.exists) throw new Abort(CONFLICT);
				Object.assign(receipt, { exists: true, namespace: namespaceOf(principal), fingerprint: env.fingerprint, body });
				await faultBarrier("repair-before-commit", env.commandId);
				return { body, meta: plain(meta) as MetaState, recovery: plain(recovery) as RecoveryState };
			}, ctx);
			await faultBarrier("repair-after-commit", env.commandId);
			this.#meta = outcome.meta;
			this.#recovery = outcome.recovery;
			for (const [id, d] of this.#devices) {
				if (d.revokedAtSequence === null) this.#devices.set(id, { ...d, revokedAtSequence: outcome.body.sequence });
			}
			return { ...outcome.body, duplicate: false };
		} catch (error) {
			if (error instanceof Abort) return error.refusal;
			this.#fail(error);
			return { status: "refused", code: "outcome_unknown", reason: "Repair failed; restart remains restricted." };
		}
	}

	/** One Ledger transaction: authorization, dedup, Kernel decision and every staged record. */
	private async stage(
		tx: Parameters<Parameters<Harness["commit"]>[0]>[0],
		env: Envelope,
		principal: Principal,
		verifier: string | undefined,
	) {
		let current = principal;
		if (principal.kind === "human" && principal.route === "device") {
			const device = await tx.doc(Device, principal.device, null);
			if (!device.exists || device.revokedAtSequence !== null) throw new Abort(UNAUTHORIZED);
			const workflows = plain(device.scope.workflows);
			current = { ...principal, workflows };
			if (env.workflow !== null && workflows !== "all" && !workflows.includes(env.workflow))
				throw new Abort({ status: "refused", code: "forbidden_scope", reason: `${env.workflow} is outside this device's scope.` });
		}
		const recovery = await tx.doc(Recovery);
		if (
			recovery.mode !== "active" &&
			!(
				current.kind === "human" &&
				current.route === "local-admin" &&
				recovery.mode === "recovery-reconciling" &&
				["enrollDevice", "revokeDevice"].includes(env.command.type)
			)
		)
			throw new Abort(RECOVERY_REQUIRED);
		const roles = await tx.doc(RoleWork);
		const policy = await tx.doc(Policy);
		if (current.kind === "assignment-agent") {
			const own = roles.assignments.find((a) => sameAgent(a as RoleAssignment, current));
			if (!own) throw new Abort(UNAUTHORIZED);
			if (env.workflow !== own.workflow) throw new Abort(refusal("forbidden_scope", "Assignment workflow differs."));
		}
		const namespace = namespaceOf(current);
		const receipt = await tx.doc(Receipt, `${namespace} ${env.commandId}`, null);
		if (receipt.exists) {
			if (receipt.fingerprint !== env.fingerprint || !readable(receipt.body, current)) throw new Abort(CONFLICT);
			return { duplicate: true as const, body: plain(receipt.body) as ReceiptBody };
		}

		const denied = commandPermission(env.command.type, current);
		if (denied) throw new Abort(fromKernel(denied));
		const meta = await tx.doc(Meta);
		const sequence = meta.sequence + 1;
		const workflow = env.workflow === null ? undefined : await tx.doc(Workflow, env.workflow, null);
		const command = env.command;
		if (
			["createWorkflow", "adoptPolicy", "assignTask", "replaceTask", "stageTask", "rebindAttempt", "requestRole"].includes(command.type)
		) {
			const revision =
				command.type === "adoptPolicy"
					? (command as { revision: string }).revision
					: command.type === "createWorkflow"
						? policy.defaultRevision
						: bindingFor(policy, env.workflow!).policy;
			if (command.type !== "adoptPolicy" || Object.hasOwn(policy.revisions, revision))
				await this.#verifyPolicySource(tx, meta, revision, plain(policy));
		}
		let document: KernelState["document"] = null;
		if (command.type === "saveDocument" && workflow?.exists) {
			const pointer = documentPointer(workflow.documents, (command as { document: string }).document);
			if (pointer !== undefined) {
				// Table read before any table write: verify the bytes this save is based on.
				const prior = await tx.entry(RevisionEntry, pointer.entry as EntryId);
				if (prior !== undefined) {
					const unsupported = unsupportedRecordSchema(prior.data.schema, pointer.revision);
					if (unsupported !== undefined) throw new Abort(unsupported);
				}
				const integrity =
					prior === undefined ? "missing" : intact(prior.data.text, pointer.digest, pointer.byteLength) ? "intact" : "corrupt";
				document = { name: pointer.document, current: pointer.revision, integrity };
			}
		}
		const packets: RolePacket[] =
			command.type === "assignTask" || command.type === "replaceTask"
				? [(command as { packet: RolePacket }).packet]
				: command.type === "requestRole" && current.kind === "assignment-agent"
					? roles.assignments
							.filter((a) => a.id === current.assignment)
							.flatMap((a) => a.packet.requests.filter((r) => r.key === (command as { key: string }).key).map((r) => plain(r.packet)))
					: [];
		const allPackets = (p: RolePacket): RolePacket[] => [p, ...p.requests.flatMap((r) => allPackets(r.packet))];
		for (const packet of packets.flatMap(allPackets))
			for (const ref of packetRefs(packet)) {
				const location = await tx.doc(RevisionLocation, ref, null);
				if (!location.exists || location.workflow !== env.workflow)
					throw new Abort({
						status: "refused",
						code: "missing_content",
						reason: `Restore exact role input ${ref}.`,
						refs: { restore: ref },
					});
				const input = await tx.entry(RevisionEntry, location.entry as EntryId);
				if (!input || !intact(input.data.text, input.data.digest, input.data.byteLength))
					throw new Abort({
						status: "refused",
						code: "content_corrupt",
						reason: `Restore exact role input ${ref}.`,
						refs: { restore: ref },
					});
				if (input.data.roleBinding && packet.role !== "coordinator" && packet.role !== "implementer") {
					const owner = roles.assignments.find((a) => a.id === input.data.roleBinding!.assignment);
					if (
						input.data.document.startsWith("role-packet/") ||
						owner?.packet.role === "candidate" ||
						owner?.packet.role === "experiment-candidate"
					)
						throw new Abort({
							status: "refused",
							code: "forbidden_scope",
							reason: "Independent roles cannot inherit private role context or candidate-private handles.",
						});
				}
				const unsupported = unsupportedRecordSchema(input.data.schema, ref);
				if (unsupported) throw new Abort(unsupported);
			}
		const target = command.type === "revokeDevice" ? await tx.doc(Device, (command as { device: string }).device, null) : undefined;
		const text = env.content === undefined ? undefined : decodeUtf8(env.content);
		const facts: VerifiedFacts = {
			principal: current,
			sequence,
			executorEpoch: meta.executorEpoch,
			ids: {
				fact: `fact:${sequence}`,
				assignment: `assignment:${sequence}`,
				attempt: `attempt:${sequence}`,
				workflow: `workflow:${sequence}`,
				revision: `revision:${sequence}`,
				device: `device:${sequence}`,
				message: `message:${sequence}`,
			},
			...(env.content === undefined
				? {}
				: { content: { digest: sha256(env.content), byteLength: env.content.length, validUtf8: text !== undefined } }),
		};
		const state: KernelState = {
			roleWork: plain(roles),
			policy: plain(policy),
			workflow: workflow?.exists ? { id: workflow.id, messageCount: workflow.messageCount } : null,
			document,
			device: target?.exists ? { id: target.device, revoked: target.revokedAtSequence !== null } : null,
		};
		const decision = change(state, command, facts);
		if (decision.outcome === "refused") throw new Abort(fromKernel(decision));

		const by: AcceptedBy =
			current.kind === "human"
				? current.route === "device"
					? { principal: "human", route: "device", device: current.device }
					: { principal: "human", route: "local-admin" }
				: current.kind === "assignment-agent"
					? {
							principal: "assignment-agent",
							route: "role",
							assignment: current.assignment,
							generation: current.generation,
							attempt: current.attempt,
							role: current.role,
						}
					: { principal: "host", route: "host" };
		meta.sequence = sequence;
		let revisionEntry = 0;
		let changedDevice: string | undefined;
		for (const write of decision.writes) {
			switch (write.type) {
				case "policy.replace": {
					Object.assign(policy, plain(write.state));
					const owner = env.workflow ?? (typeof decision.result.workflow === "string" ? decision.result.workflow : null);
					const w = owner === null ? undefined : await tx.doc(Workflow, owner, null);
					const binding = owner ? bindingFor(write.state, owner) : null;
					const revision = binding?.policy ?? write.state.defaultRevision;
					const text = JSON.stringify({ binding, revision, policy: write.state.revisions[revision] });
					await tx.appendEntry(PolicyEntry, (w?.exists ? w.conversation : meta.ledgerConversation) as ConversationId, {
						data: {
							schema: 1,
							sequence,
							commandId: env.commandId,
							ref: binding?.revision ?? revision,
							workflow: owner,
							text,
							digest: sha256(Buffer.from(text)),
							byteLength: Buffer.byteLength(text),
						},
					});
					break;
				}
				case "roles.replace": {
					if (!this.#roleTasks)
						throw new Abort({ status: "refused", code: "capability_unavailable", reason: "Role runtime is not installed." });
					const priorPackets = new Map(roles.assignments.map((a) => [a.id, a.packetRef]));
					Object.assign(roles, plain(write.state));
					for (const a of roles.assignments) {
						if (priorPackets.get(a.id) === a.packetRef) continue;
						if (!priorPackets.has(a.id)) {
							const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
							a.conversation = conversation.id;
							Object.assign(await tx.doc(RoleBinding, conversation.id), {
								assignment: a.id,
								generation: a.generation,
								attempt: a.attempt,
								role: a.packet.role,
							});
						}
						await this.#retainRoleText(tx, env, by, sequence, a.packetRef, `role-packet/${a.id}`, JSON.stringify(a.packet), {
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
						});
					}
					// Debt: whole snapshots repeat earlier bytes. Keep this simple until the real streaming
					// workload justifies durable incremental capture cursors; no full V9 claim is made here.
					if (command.type === "recordRuntimeHistory") {
						const a = roles.assignments.find((a) => a.id === (command as { assignment: string }).assignment)!;
						const entries: unknown[] = [];
						let cursor: Parameters<typeof tx.scanEntries>[2];
						for (;;) {
							const page = await tx.scanEntries({ conversationId: a.conversation as ConversationId, order: "ascending" }, 200, cursor);
							for (const entry of page.items)
								entries.push({
									id: entry.id,
									kind: entry.kind,
									head: entry.head ?? null,
									model:
										entry.model?.map((message) =>
											message.role === "assistant"
												? {
														role: "assistant",
														content: message.content.filter((c) => c.type !== "thinking"),
														stopReason: message.stopReason,
													}
												: message,
										) ?? [],
								});
							if (!page.next) break;
							cursor = page.next;
						}
						const tasks: unknown[] = [];
						let taskCursor: Parameters<typeof tx.scanTasks>[2];
						for (;;) {
							const page = await tx.scanTasks({ conversationId: a.conversation as ConversationId }, 200, taskCursor);
							for (const task of page.items)
								if (task.state.status === "terminal")
									tasks.push({ id: task.id, kind: task.kind, version: task.version, owner: task.owner, outcome: task.state.outcome });
							if (!page.next) break;
							taskCursor = page.next;
						}
						const roleTask = await tx.task(a.task as import("@earendil-works/pi-durable").TaskId);
						if (roleTask?.state.status === "terminal") {
							tasks.push({
								id: roleTask.id,
								kind: roleTask.kind,
								version: roleTask.version,
								owner: roleTask.owner,
								outcome: roleTask.state.outcome,
							});
							a.runtimeTaskCaptured = true;
						}
						const text = JSON.stringify({ entries, tasks });
						const workflow = await tx.doc(Workflow, a.workflow, null);
						if (!workflow.exists) throw new Error("Missing runtime history owner");
						await tx.appendEntry(RuntimeHistoryEntry, workflow.conversation as ConversationId, {
							data: {
								schema: 1,
								sequence,
								commandId: env.commandId,
								ref: a.runtimeHistory!,
								assignment: a.id,
								conversation: a.conversation,
								predecessor: a.predecessor ?? null,
								packet: a.packetRef,
								policyBinding: a.policyBinding ?? null,
								text,
								digest: sha256(Buffer.from(text)),
								byteLength: Buffer.byteLength(text),
							},
						});
					}
					if (command.type === "submitRoleResult" && current.kind === "assignment-agent") {
						const a = roles.assignments.find((a) => a.id === current.assignment);
						if (!a?.report) throw new Error("role report identity omitted");
						await this.#retainRoleText(tx, env, by, sequence, a.report, `role-report/${a.id}`, (command as { text: string }).text, {
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
						});
					}
					if (command.type === "recordRunnerDiagnostic" && typeof decision.result.diagnostic === "string") {
						const c = command as { assignment: string; generation: number; attempt: string; text: string };
						await this.#retainRoleText(
							tx,
							env,
							by,
							sequence,
							decision.result.diagnostic,
							`owned-check-diagnostic/${c.assignment}`,
							c.text,
							c,
						);
					}
					if (command.type === "recordRunnerObservation") {
						const c = command as { assignment: string; generation: number; attempt: string; text: string };
						const a = roles.assignments.find((a) => a.id === c.assignment);
						if (!a?.report) throw new Error("owned check receipt identity omitted");
						await this.#retainRoleText(tx, env, by, sequence, a.report, `owned-check/${a.id}`, c.text, c);
					}
					if (command.type === "recordRecoveryState" && typeof decision.result.quarantined === "string")
						await this.#retainRoleText(
							tx,
							env,
							by,
							sequence,
							decision.result.quarantined,
							`quarantined-role-result/${(command as { assignment: string }).assignment}`,
							JSON.stringify(command),
							command as NonNullable<RevisionData["roleBinding"]>,
						);
					for (const intent of write.intents) {
						const a = roles.assignments.find((a) => a.id === intent.assignment);
						if (!a) throw new Error("role intent without assignment");
						const task = await this.#roleTasks.stage(tx, intent, plain(a));
						if (intent.kind === "run-role") {
							a.task = task;
							Object.assign(decision.result, { task });
						}
					}
					break;
				}
				case "workflow.create": {
					const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
					Object.assign(workflow ?? (await tx.doc(Workflow, write.workflow, null)), {
						exists: true,
						id: write.workflow,
						title: write.title,
						conversation: conversation.id,
						createdAtSequence: sequence,
						documents: {},
						messageCount: 0,
					});
					meta.workflows.push(write.workflow);
					break;
				}
				case "revision.append": {
					const w = await tx.doc(Workflow, write.workflow, null);
					if (!w.exists || text === undefined) throw new Error("revision without workflow or text");
					const entry = await tx.appendEntry(RevisionEntry, w.conversation as ConversationId, {
						data: {
							schema: STORE_SCHEMA,
							revision: write.revision,
							workflow: write.workflow,
							document: write.document,
							kind: write.kind,
							mediaType: write.mediaType,
							text,
							digest: write.digest,
							byteLength: write.byteLength,
							parent: write.parent,
							commandId: env.commandId,
							recordedAtSequence: sequence,
							createdBy: by,
						},
					});
					revisionEntry = entry.id;
					Object.assign(await tx.doc(RevisionLocation, write.revision, null), {
						exists: true,
						workflow: write.workflow,
						conversation: w.conversation,
						entry: entry.id,
					});
					break;
				}
				case "document.advance": {
					const w = await tx.doc(Workflow, write.workflow, null);
					if (!w.exists) throw new Error("document advance without workflow");
					const previous = documentPointer(w.documents, write.document);
					const save = command as { mediaType: "text/markdown" | "text/plain" };
					w.documents[write.document] = {
						document: write.document,
						kind: write.document === "ground" ? "ground" : "document",
						revision: write.revision,
						entry: revisionEntry,
						mediaType: save.mediaType,
						digest: facts.content?.digest ?? "",
						byteLength: facts.content?.byteLength ?? 0,
						recordedAtSequence: sequence,
						revisionCount: (previous?.revisionCount ?? 0) + 1,
						savedBy: by.device ?? by.route,
					};
					break;
				}
				case "message.append": {
					const w = await tx.doc(Workflow, write.workflow, null);
					if (!w.exists) throw new Error("message without workflow");
					await tx.appendEntry(MessageEntry, w.conversation as ConversationId, {
						data: {
							schema: STORE_SCHEMA,
							message: write.message,
							workflow: write.workflow,
							text: (command as { text: string }).text,
							digest: sha256(Buffer.from((command as { text: string }).text, "utf8")),
							byteLength: Buffer.byteLength((command as { text: string }).text, "utf8"),
							commandId: env.commandId,
							recordedAtSequence: sequence,
							createdBy: by,
						},
					});
					w.messageCount++;
					break;
				}
				case "device.enroll": {
					if (verifier === undefined) throw new Error("enrollment without a verifier");
					Object.assign(await tx.doc(Device, write.device, null), {
						exists: true,
						device: write.device,
						label: write.label,
						human: meta.human,
						scope: { workflows: write.scope.workflows === "all" ? "all" : [...write.scope.workflows] },
						verifier,
						enrolledAtSequence: sequence,
						revokedAtSequence: null,
					});
					meta.devices.push(write.device);
					changedDevice = write.device;
					break;
				}
				case "device.revoke": {
					const d = await tx.doc(Device, write.device, null);
					if (!d.exists) throw new Error("revocation of an absent device");
					d.revokedAtSequence = sequence;
					changedDevice = write.device;
					break;
				}
				case "store.startup":
					meta.executorEpoch = write.executorEpoch;
					meta.startups.push({ executorEpoch: write.executorEpoch, sequence, persistence: { ...write.persistence } });
					break;
				case "fact.record": {
					const owner = env.workflow ?? (typeof decision.result.workflow === "string" ? decision.result.workflow : null);
					const w = owner === null ? undefined : await tx.doc(Workflow, owner, null);
					const conversation = (w?.exists ? w.conversation : meta.ledgerConversation) as ConversationId;
					await tx.appendEntry(FactEntry, conversation, {
						data: {
							schema: STORE_SCHEMA,
							fact: write.fact,
							sequence,
							command: write.command,
							commandId: env.commandId,
							refs: write.refs,
							by,
						},
					});
					break;
				}
			}
		}
		const body: ReceiptBody = {
			status: "accepted",
			commandId: env.commandId,
			receipt: `receipt:${sequence}`,
			sequence,
			authorityEpoch: meta.authorityEpoch,
			workflow: env.workflow ?? (typeof decision.result.workflow === "string" ? decision.result.workflow : null),
			result: plain(decision.result) as ReceiptBody["result"],
			facts: [...decision.facts],
			acceptedBy: by,
		};
		Object.assign(receipt, { exists: true, namespace, fingerprint: env.fingerprint, body });
		meta.backup ??= initialBackup(sequence - 1);
		if (env.command.type !== "recordStartup") meta.backup.pending.push({ sequence, at: this.#backupClock.now() });
		await faultBarrier("before-commit", env.commandId);
		const affected = env.workflow ?? (typeof decision.result.workflow === "string" ? decision.result.workflow : undefined);
		const workflowDoc = affected === undefined ? undefined : await tx.doc(Workflow, affected, null);
		return {
			duplicate: false as const,
			body,
			roles: plain(roles),
			policy: plain(policy),
			meta: plain(meta) as MetaState,
			workflow: workflowDoc?.exists ? (plain(workflowDoc) as Present<WorkflowRecord>) : undefined,
			device: changedDevice === undefined ? undefined : (plain(await tx.doc(Device, changedDevice, null)) as DeviceRecord),
		};
	}

	async #verifyPolicySource(tx: Tx, meta: MetaState, revision: string, policy: PolicyState): Promise<void> {
		if (revision === "policy:initial" && JSON.stringify(policy.revisions[revision]) === JSON.stringify(initialPolicy().revisions[revision]))
			return;
		let cursor: Parameters<typeof tx.scanEntries>[2];
		for (;;) {
			const page = await tx.scanEntries({ conversationId: meta.ledgerConversation as ConversationId, order: "ascending" }, 200, cursor);
			for (const entry of page.items) {
				const d = entry.data as Record<string, unknown>;
				if (entry.kind !== PolicyEntry.kind || d.ref !== revision) continue;
				const unsupported = unsupportedRecordSchema(d.schema, revision);
				if (unsupported) throw new Abort(unsupported);
				if (typeof d.text !== "string" || !intact(d.text, String(d.digest), Number(d.byteLength)))
					throw new Abort(refusal("content_corrupt", `Restore exact policy ${revision}; cached state is not replacement evidence.`));
				const retained = JSON.parse(d.text) as { revision: string; policy: unknown };
				if (retained.revision !== revision || JSON.stringify(retained.policy) !== JSON.stringify(policy.revisions[revision]))
					throw new Abort(refusal("content_corrupt", `Policy ${revision} differs from its retained source.`));
				return;
			}
			if (!page.next) break;
			cursor = page.next;
		}
		throw new Abort(refusal("missing_content", `Restore exact policy ${revision}; cached state is not replacement evidence.`));
	}

	/** Installs committed values in the read model and notifies observers. Runs after the commit resolved. */
	#adopt(outcome: {
		meta: MetaState;
		roles?: RoleWorkState;
		policy?: PolicyState;
		workflow?: Present<WorkflowRecord> | undefined;
		device?: DeviceRecord | undefined;
	}): void {
		this.#meta = outcome.meta;
		if (outcome.roles) this.#roleWork = outcome.roles;
		if (outcome.policy) this.#policy = outcome.policy;
		this.#roleTasks?.committed();
		if (outcome.workflow !== undefined) this.#workflows.set(outcome.workflow.id, outcome.workflow);
		if (outcome.device?.exists) {
			this.#devices.set(outcome.device.device, outcome.device);
			if (outcome.device.revokedAtSequence !== null) {
				for (const o of this.#observers) if (o.device === outcome.device.device) this.#endObserver(o, "credential_revoked");
			}
		}
		const changed = outcome.workflow;
		if (changed === undefined) return;
		for (const o of this.#observers) {
			if (!visible(o.principal, changed.id)) continue;
			const frame: Frame = {
				...this.#frameHeader(o.principal),
				kind: "change",
				base: o.last,
				sequence: this.#meta.sequence,
				workflows: view({ workflows: [workflowState(changed, this.#roleWork)] }, scopeOf(o.principal)).workflows,
			};
			o.last = this.#meta.sequence;
			o.send(frame);
		}
	}

	snapshot(context: AuthenticatedContext): Frame | LedgerRefusal {
		const principal = principalOf(context);
		if (principal === undefined || !this.#current(principal)) return UNAUTHORIZED;
		return this.#snapshotFrame(principal);
	}

	/** Starts an observation: a complete snapshot, then change frames delivered without ever delaying commits. */
	observe(context: AuthenticatedContext, request: { history: HistoryQuery }): Promise<HistoryPage | LedgerRefusal>;
	observe(
		context: AuthenticatedContext,
		sink: { send(frame: Frame): void; end(frame: Frame): void },
	): { snapshot: Frame; stop(): void } | LedgerRefusal;
	observe(
		context: AuthenticatedContext,
		sink: { send(frame: Frame): void; end(frame: Frame): void } | { history: HistoryQuery },
	): { snapshot: Frame; stop(): void } | LedgerRefusal | Promise<HistoryPage | LedgerRefusal> {
		if ("history" in sink) return this.#history(context, sink.history, false);
		const principal = principalOf(context);
		if (principal === undefined || !this.#current(principal)) return UNAUTHORIZED;
		if (this.#mode !== "active") return { status: "refused", code: "host_unavailable", reason: `The host is ${this.#mode}.` };
		const snapshot = this.#snapshotFrame(principal);
		const observer: Observer = {
			principal,
			device: principal.kind === "human" && principal.route === "device" ? principal.device : null,
			last: snapshot.sequence,
			send: sink.send,
			end: sink.end,
		};
		this.#observers.add(observer);
		return { snapshot, stop: () => this.#observers.delete(observer) };
	}

	receipt(context: AuthenticatedContext, commandId: string): Promise<ReceiptBody | LedgerRefusal> {
		return this.#read(context, async (principal) => {
			const record = await this.#harness.snapshot(Receipt, `${namespaceOf(principal)} ${commandId}`, ctx);
			if (record?.exists && readable(record.body, principal)) return plain(record.body);
			if (this.#recovery?.mode === "recovery-reconciling")
				return {
					status: "refused",
					code: "outcome_unknown_after_restore",
					reason:
						"Missing history after restore does not establish that this command was unsent; newer-world reconciliation and an explicit recovery decision are required.",
				};
			return NOT_FOUND;
		});
	}

	async #retainRoleText(
		tx: Parameters<Parameters<Harness["commit"]>[0]>[0],
		env: Envelope,
		by: AcceptedBy,
		sequence: number,
		revision: string,
		document: string,
		text: string,
		binding: NonNullable<RevisionData["roleBinding"]>,
	) {
		const w = await tx.doc(Workflow, env.workflow as string, null);
		if (!w.exists) throw new Error("role text without workflow");
		const bytes = Buffer.from(text, "utf8");
		const entry = await tx.appendEntry(RevisionEntry, w.conversation as ConversationId, {
			data: {
				schema: 1,
				roleBinding: { assignment: binding.assignment, generation: binding.generation, attempt: binding.attempt },
				revision,
				workflow: w.id,
				document,
				kind: "document",
				mediaType: "text/plain",
				text,
				digest: sha256(bytes),
				byteLength: bytes.length,
				parent: null,
				commandId: env.commandId,
				recordedAtSequence: sequence,
				createdBy: by,
			},
		});
		Object.assign(await tx.doc(RevisionLocation, revision, null), {
			exists: true,
			workflow: w.id,
			conversation: w.conversation,
			entry: entry.id,
		});
	}

	/** Immutable content reads. Uploads are not a separate capability in this version: saves carry complete bytes. */
	artifact(context: AuthenticatedContext, request: { export: HistoryQuery }): Promise<HistoryExport | LedgerRefusal>;
	artifact(context: AuthenticatedContext, request: { read: string } | { upload: unknown }): Promise<Artifact | LedgerRefusal>;
	artifact(
		context: AuthenticatedContext,
		request: { read: string } | { upload: unknown } | { export: HistoryQuery },
	): Promise<Artifact | HistoryExport | LedgerRefusal> {
		if ("export" in request) return this.#history(context, request.export, true);
		return this.#read(context, async (principal) => {
			if (!("read" in request))
				return {
					status: "refused",
					code: "capability_unavailable",
					reason: "Separate artifact uploads are not available; saves carry bytes.",
				};
			const ref = request.read;
			if (ref.startsWith("message:")) return this.#messageArtifact(principal, ref);
			const location = await this.#harness.snapshot(RevisionLocation, ref, ctx);
			if (!location?.exists || !visible(principal, location.workflow, this.#roleWork))
				return principal.kind === "assignment-agent" ? NOT_FOUND : UNAUTHORIZED;
			if (principal.kind === "assignment-agent") {
				const own = this.#roleWork.assignments.find((a) => sameAgent(a, principal));
				const results = this.#roleWork.assignments
					.filter((child) => child.parent === own?.id && child.status === "submitted")
					.map((child) => child.report);
				if (!own || ![...packetRefs(own.packet), own.packetRef, own.report, ...results].includes(ref)) return NOT_FOUND;
			}
			const entry = await this.#entry(location.conversation, location.entry);
			const restore = { restore: ref };
			if (entry === undefined || entry.kind !== RevisionEntry.kind)
				return { status: "refused", code: "missing_content", reason: `The retained bytes of ${ref} are missing.`, refs: restore };
			const unsupported = unsupportedRecordSchema((entry.data as Record<string, unknown>).schema, ref);
			if (unsupported !== undefined) return unsupported;
			const data = entry.data as unknown as RevisionData;
			const bytes = Buffer.from(data.text, "utf8");
			if (data.revision !== ref || !intact(data.text, data.digest, data.byteLength))
				return {
					status: "refused",
					code: "content_corrupt",
					reason: `The retained bytes of ${ref} fail their digest or length check; restore that exact revision.`,
					refs: restore,
					repair: [{ action: "restoreRevision", revision: ref }],
				};
			return {
				artifact: ref,
				kind: data.kind,
				schema: data.schema,
				workflow: data.workflow,
				document: data.document,
				mediaType: data.mediaType,
				digest: data.digest,
				byteLength: data.byteLength,
				integrity: "verified",
				parents: data.parent === null ? [] : [data.parent],
				supersedes: data.parent === null ? [] : [data.parent],
				source: null,
				policy: null,
				assignment: data.roleBinding?.assignment ?? null,
				generation: data.roleBinding?.generation ?? null,
				attempt: data.roleBinding?.attempt ?? null,
				decisionRefs: [],
				outcomeRefs: [],
				createdBy: data.createdBy,
				commandId: data.commandId,
				recordedAtSequence: data.recordedAtSequence,
				content: bytes,
			};
		});
	}

	/** Scoped coordinator messages of one workflow, oldest first. */
	messages(
		context: AuthenticatedContext,
		workflow: string,
		cursor: number | undefined,
		limit: number,
	): Promise<{ messages: Record<string, unknown>[]; next: string | null; complete: boolean } | LedgerRefusal> {
		return this.#read(context, async (principal) => {
			const w = this.#workflows.get(workflow);
			if (w === undefined || !visible(principal, workflow)) return NOT_FOUND;
			const conversation = await this.#harness.conversation(w.conversation as ConversationId, ctx);
			if (conversation === undefined) return NOT_FOUND;
			const messages: Record<string, unknown>[] = [];
			let scanCursor: Parameters<typeof conversation.entries>[2];
			let last = cursor ?? 0;
			for (;;) {
				const page = await conversation.entries({ order: "ascending", minEntryId: (last + 1) as EntryId }, 200, scanCursor, ctx);
				for (const e of page.items) {
					last = e.id;
					if (e.kind !== MessageEntry.kind) continue;
					const d = e.data as Record<string, unknown>;
					const unsupported = unsupportedRecordSchema(d.schema, `entry:${e.id}`);
					if (unsupported !== undefined) return unsupported;
					messages.push({
						message: d.message,
						text: d.text,
						createdBy: d.createdBy,
						commandId: d.commandId,
						recordedAtSequence: d.recordedAtSequence,
					});
					if (messages.length === limit) return { messages, next: String(e.id), complete: false };
				}
				if (page.next === undefined) return { messages, next: null, complete: true };
				scanCursor = page.next;
			}
		});
	}

	async #messageArtifact(principal: Principal, ref: string): Promise<Artifact | LedgerRefusal> {
		// Exact reads stop at their target; history owns an exhaustive scan. Keep both pagination paths aligned.
		let acknowledged = false;
		for (const w of this.#workflows.values()) {
			if (!visible(principal, w.id)) continue;
			const conversation = await this.#harness.conversation(w.conversation as ConversationId, ctx);
			if (!conversation) continue;
			let cursor: Parameters<typeof conversation.entries>[2];
			for (;;) {
				const page = await conversation.entries({ order: "ascending" }, 200, cursor, ctx);
				for (const entry of page.items) {
					const d = entry.data as Record<string, unknown>;
					if (entry.kind === FactEntry.kind && (d.refs as Record<string, string>)?.message === ref) acknowledged = true;
					if (entry.kind !== MessageEntry.kind || d.message !== ref) continue;
					return messageArtifact(ref, w.id, d);
				}
				if (page.next === undefined) break;
				cursor = page.next;
			}
		}
		return acknowledged ? refusal("missing_content", `Restore exact message ${ref}.`) : UNAUTHORIZED;
	}

	#history(context: AuthenticatedContext, query: HistoryQuery, exporting: false): Promise<HistoryPage | LedgerRefusal>;
	#history(context: AuthenticatedContext, query: HistoryQuery, exporting: true): Promise<HistoryExport | LedgerRefusal>;
	#history(context: AuthenticatedContext, query: HistoryQuery, exporting: boolean): Promise<HistoryPage | HistoryExport | LedgerRefusal> {
		return this.#read(context, async (principal) => {
			if (principal.kind !== "human") return refusal("forbidden_principal", "History requires a scoped human reader in this version.");
			const selected = selectHistory(query, {
				epoch: this.#meta.authorityEpoch,
				owner: namespaceOf(principal),
				receiptView: principal.route === "local-admin" ? "admin" : "device",
				key: this.#meta.historyCursorKey ?? "",
				sequence: this.#meta.sequence,
				workflows: [...this.#workflows.keys()].filter((w) => visible(principal, w)),
				global: principal.route === "local-admin" || principal.workflows === "all",
			});
			if ("status" in selected) return selected;
			const { state, limit } = selected;
			const records: HistoryRecord[] = [];
			const missing: Missing[] = [];
			const redactions: string[] = [];
			const content: Record<string, string> = {};
			const artifacts = new Set<string>();
			const expectedRetained = new Set<string>();
			const seenRetained = new Set<string>();
			const messages = new Map<string, Artifact | LedgerRefusal>();
			const wanted = (kind: string) => state.scope.kinds.length === 0 || state.scope.kinds.includes(kind);
			const add = (r: HistoryRecord) => {
				if (wanted(r.kind)) records.push(r);
			};
			const base = (ref: string, kind: string, workflow: string | null, sequence: number, commandId: string | null): HistoryRecord => ({
				ref,
				kind,
				schema: 1,
				workflow,
				sequence,
				commandId,
				parents: [],
				supersedes: [],
				refs: {},
				outcome: null,
				source: null,
				policy: null,
				assignment: null,
				attempt: null,
				decisionRefs: [],
				outcomeRefs: [],
			});
			const conversations: { id: number; workflow: string | null }[] = [];
			for (const id of state.scope.workflows) {
				const w = this.#workflows.get(id);
				if (!w || w.createdAtSequence > state.cutoff) continue;
				add({ ...base(id, "workflow", id, w.createdAtSequence, null), title: w.title });
				conversations.push({ id: w.conversation, workflow: id });
			}
			if (state.scope.global) conversations.push({ id: this.#meta.ledgerConversation, workflow: null });
			for (const owner of conversations) {
				const conversation = await this.#harness.conversation(owner.id as ConversationId, ctx);
				if (!conversation) {
					missing.push({ ref: owner.workflow ?? "ledger", code: "missing_content" });
					continue;
				}
				let cursor: Parameters<typeof conversation.entries>[2];
				for (;;) {
					const page = await conversation.entries({ order: "ascending" }, 200, cursor, ctx);
					for (const entry of page.items) {
						const d = entry.data as Record<string, unknown>;
						const sequence = Number(d.recordedAtSequence ?? d.sequence);
						if (sequence > state.cutoff) continue;
						const ref = String(entry.kind === PolicyEntry.kind ? d.ref : (d.revision ?? d.message ?? d.fact ?? `entry:${entry.id}`));
						if (entry.kind === RuntimeHistoryEntry.kind) {
							const ref = String(d.ref);
							seenRetained.add(ref);
							if (wanted("document") && typeof d.packet === "string") artifacts.add(d.packet);
							if (d.schema !== 1 || typeof d.text !== "string" || !intact(d.text, String(d.digest), Number(d.byteLength))) {
								missing.push({ ref, code: d.schema !== 1 ? "unsupported_schema" : "content_corrupt" });
								continue;
							}
							const retained = JSON.parse(d.text) as { entries: unknown[]; tasks: unknown[] };
							add({
								...base(ref, "runtime_transcript", owner.workflow, sequence, String(d.commandId)),
								assignment: d.assignment,
								conversation: d.conversation,
								predecessor: d.predecessor,
								refs: { packet: String(d.packet) },
								policyBinding: d.policyBinding,
								entries: retained.entries,
								claimType: "unverified_transcript",
								content: true,
								mediaType: "text/plain",
								digest: d.digest,
								byteLength: d.byteLength,
								redacted: ["hidden_reasoning", "opaque_provider_fields"],
							});
							content[ref] = Buffer.from(d.text).toString("base64");
							for (const task of retained.tasks as { id: number }[])
								add({
									...base(`${ref}:task:${task.id}`, "runtime_task", owner.workflow, sequence, String(d.commandId)),
									assignment: d.assignment,
									conversation: d.conversation,
									receipt: task,
									parents: [ref],
								});
							continue;
						}
						if (entry.kind === PolicyEntry.kind) {
							seenRetained.add(ref);
							if (d.schema !== 1 || typeof d.text !== "string" || !intact(d.text, String(d.digest), Number(d.byteLength))) {
								missing.push({ ref, code: d.schema !== 1 ? "unsupported_schema" : "content_corrupt" });
								continue;
							}
							const payload = JSON.parse(d.text) as { policy: unknown; binding: unknown; revision: string };
							add({
								...base(ref, "policy", owner.workflow, sequence, String(d.commandId)),
								policy: payload.policy,
								binding: payload.binding,
								policyRevision: payload.revision,
								content: true,
								mediaType: "text/plain",
								digest: d.digest,
								byteLength: d.byteLength,
							});
							content[ref] = Buffer.from(d.text).toString("base64");
							continue;
						}
						if (entry.kind === RevisionEntry.kind || entry.kind === MessageEntry.kind) {
							if (wanted(entry.kind === MessageEntry.kind ? "message" : String(d.kind))) {
								artifacts.add(ref);
								if (entry.kind === MessageEntry.kind && owner.workflow !== null) messages.set(ref, messageArtifact(ref, owner.workflow, d));
							}
							continue;
						}
						const kind = entry.kind === FactEntry.kind ? "fact" : entry.kind === MessageEntry.kind ? "message" : entry.kind;
						if (!wanted(kind) && kind !== "fact") continue;
						if (d.schema !== 1) {
							missing.push({ ref, code: "unsupported_schema" });
							continue;
						}
						if (kind === "fact") {
							const refs = d.refs as Record<string, string>;
							if ((wanted("runtime_transcript") || wanted("runtime_task")) && refs.runtimeHistory)
								expectedRetained.add(refs.runtimeHistory);
							if (wanted("policy")) {
								if (refs.binding) expectedRetained.add(refs.binding);
								else if (d.command === "changePolicy" && refs.policy) expectedRetained.add(refs.policy);
							}
							if (refs.revision && (wanted("ground") || wanted("document"))) artifacts.add(refs.revision);
							if (refs.message && wanted("message")) artifacts.add(refs.message);
							if (wanted("document")) for (const key of ["packet", "report", "quarantined"]) if (refs[key]) artifacts.add(refs[key]);
							add({ ...base(ref, kind, owner.workflow, sequence, String(d.commandId)), command: d.command, refs, createdBy: d.by });
							const by = d.by as AcceptedBy;
							const namespaces =
								by.principal === "human"
									? [this.#meta.human]
									: by.principal === "assignment-agent"
										? [`agent:${by.assignment}:${by.generation}:${by.attempt}`]
										: ["host:recovery", "host:scheduling", "host:effects"];
							// Older host facts omit scope. Match the actual receipt to this unique committed fact,
							// never another scope that happened to reuse its command ID.
							const candidates = await Promise.all(
								namespaces.map((namespace) => this.#harness.snapshot(Receipt, `${namespace} ${String(d.commandId)}`, ctx)),
							);
							const receipt = candidates.find((r) => r?.exists && r.body.sequence === sequence && r.body.facts.includes(ref));
							if (!receipt?.exists) {
								missing.push({ ref: `receipt:${sequence}`, code: "missing_content" });
								continue;
							}
							if (!readable(receipt.body, principal)) {
								redactions.push(receipt.body.receipt);
								continue;
							}
							add({
								...base(receipt.body.receipt, "receipt", owner.workflow, sequence, receipt.body.commandId),
								acceptedBy: receipt.body.acceptedBy,
								status: "accepted",
								authorityEpoch: receipt.body.authorityEpoch,
								result: receipt.body.result,
								refs: Object.fromEntries(receipt.body.facts.map((f, i) => [`fact${i}`, f])),
							});
						} else {
							missing.push({ ref, code: "unsupported_schema" });
						}
					}
					if (page.next === undefined) break;
					cursor = page.next;
				}
			}
			for (const ref of expectedRetained) if (!seenRetained.has(ref)) missing.push({ ref, code: "missing_content" });
			for (const ref of artifacts) {
				const artifact = ref.startsWith("message:")
					? (messages.get(ref) ?? refusal("missing_content", `Restore exact message ${ref}.`))
					: await this.artifact(context, { read: ref });
				if ("status" in artifact) {
					missing.push({ ref, code: artifact.code === "unauthorized" ? "missing_content" : artifact.code });
					continue;
				}
				if (artifact.recordedAtSequence > state.cutoff) continue;
				if (!wanted(artifact.kind)) continue;
				const { content: bytes, artifact: id, recordedAtSequence: sequence, ...metadata } = artifact;
				records.push({
					...base(id, artifact.kind, artifact.workflow, sequence, artifact.commandId),
					...metadata,
					parents: [...artifact.parents],
					supersedes: [...artifact.supersedes],
					content: true,
					claimType: artifact.kind === "message" ? "human_text" : null,
				});
				for (const parent of artifact.parents) artifacts.add(parent);
				content[id] = bytes.toString("base64");
			}
			records.sort((a, b) => a.sequence - b.sequence || a.ref.localeCompare(b.ref));
			const result = exporting
				? exportHistory(records, missing, redactions, state, content)
				: historyPage(records, missing, redactions, state, limit, this.#meta.historyCursorKey ?? "");
			return this.#recovery !== undefined && this.#recovery.mode !== "active"
				? {
						...result,
						backup: this.#backup.status(),
						recovery: {
							mode: this.#recovery.mode,
							restoredCutoff: this.#recovery.origin?.cutoff ?? null,
							newerWorld: "unreconciled" as const,
						},
					}
				: { ...result, backup: this.#backup.status() };
		});
	}

	async #read<T>(context: AuthenticatedContext, read: (principal: Principal) => Promise<T | LedgerRefusal>): Promise<T | LedgerRefusal> {
		const principal = principalOf(context);
		if (principal === undefined || !this.#current(principal)) return UNAUTHORIZED;
		if (this.#mode === "failed") return { status: "refused", code: "host_unavailable", reason: "The host failed." };
		const result = await read(principal);
		// Revocation during a multi-read page/export must also prevent its final disclosure.
		return this.#current(principal) ? result : UNAUTHORIZED;
	}

	async #entry(conversation: number, id: number) {
		const c = await this.#harness.conversation(conversation as ConversationId, ctx);
		const page = await c?.entries({ minEntryId: id as EntryId, maxEntryId: id as EntryId }, 1, undefined, ctx);
		return page?.items[0];
	}

	#current(principal: Principal): boolean {
		if (
			this.remoteRecoveryRequired() &&
			!(principal.kind === "human" && principal.route === "local-admin") &&
			!(principal.kind === "host" && principal.scope === "recovery")
		)
			return false;
		if (principal.kind === "assignment-agent")
			return (
				(this.#recovery === undefined || this.#recovery.mode === "active") &&
				this.#roleWork.assignments.some((a) => sameAgent(a, principal))
			);
		if (principal.kind !== "human" || principal.route !== "device") return true;
		const device = this.#devices.get(principal.device);
		return device !== undefined && device.revokedAtSequence === null;
	}

	#frameHeader(principal: Principal) {
		return { version: PROTOCOL_VERSION, scope: scopeOf(principal), authorityEpoch: this.#meta.authorityEpoch };
	}

	#snapshotFrame(principal: Principal): Frame {
		const workflows = this.#meta.workflows.flatMap((id) => {
			const w = this.#workflows.get(id);
			return w === undefined ? [] : [workflowState(w, this.#roleWork)];
		});
		return {
			...this.#frameHeader(principal),
			kind: "snapshot",
			sequence: this.#meta.sequence,
			hostMode: this.#hostMode(),
			recovery: this.#recovery ?? null,
			executorEpoch: this.#meta.executorEpoch,
			persistence: this.#persistence,
			backup: this.#backup.status(),
			history: {
				status: "available",
				head: `history:${this.#meta.sequence}`,
				completeThroughSequence: this.#meta.sequence,
				exportVersion: 1,
				backup: false,
			},
			policy:
				principal.kind === "assignment-agent"
					? null
					: {
							defaultRevision: this.#policy.defaultRevision,
							revisions: plain(this.#policy.revisions),
							bindings: Object.fromEntries(
								this.#meta.workflows.filter((w) => visible(principal, w)).map((w) => [w, bindingFor(this.#policy, w)]),
							),
						},
			assignments: plain(
				this.#roleWork.assignments.filter((a) =>
					principal.kind === "assignment-agent" ? sameAgent(a, principal) : visible(principal, a.workflow, this.#roleWork),
				),
			),
			workflows: principal.kind === "assignment-agent" ? [] : view({ workflows }, scopeOf(principal, this.#roleWork)).workflows,
		};
	}

	#endObserver(o: Observer, reason: string): void {
		this.#observers.delete(o);
		o.end({ ...this.#frameHeader(o.principal), kind: "end", sequence: o.last, reason });
	}

	#fail(error: unknown): void {
		if (this.#mode === "failed") return;
		this.#mode = "failed";
		for (const o of [...this.#observers]) this.#endObserver(o, "host_failed");
		this.#onFatal(error);
	}

	async close(): Promise<void> {
		if (this.#mode === "active") this.#mode = "closing";
		for (const o of [...this.#observers]) this.#endObserver(o, "host_closing");
		await this.#backup.close();
		await this.#harness.close(ctx);
	}
}

/** Validate already-located message bytes identically for exact reads and history, without rescanning. */
function messageArtifact(ref: string, workflow: string, d: Record<string, unknown>): Artifact | LedgerRefusal {
	const unsupported = unsupportedRecordSchema(d.schema, ref);
	if (unsupported) return unsupported;
	if (typeof d.text !== "string") return refusal("content_corrupt", `Restore exact message ${ref}.`);
	const bytes = Buffer.from(d.text, "utf8");
	const legacy = d.digest === undefined && d.byteLength === undefined;
	if (!legacy && (d.digest !== sha256(bytes) || d.byteLength !== bytes.length))
		return refusal("content_corrupt", `Restore exact message ${ref}.`);
	return {
		artifact: ref,
		kind: "message",
		schema: 1,
		workflow,
		document: null,
		mediaType: "text/plain",
		digest: sha256(bytes),
		byteLength: bytes.length,
		integrity: legacy ? "unverified_legacy" : "verified",
		parents: [],
		supersedes: [],
		source: null,
		policy: null,
		assignment: null,
		generation: null,
		attempt: null,
		decisionRefs: [],
		outcomeRefs: [],
		createdBy: d.createdBy as AcceptedBy,
		commandId: String(d.commandId),
		recordedAtSequence: Number(d.recordedAtSequence),
		content: bytes,
	};
}

/** Document names are client-chosen keys: only own properties are documents, never inherited object members. */
function documentPointer(documents: Readonly<Record<string, DocumentPointer>>, name: string): DocumentPointer | undefined {
	return Object.hasOwn(documents, name) ? documents[name] : undefined;
}

function intact(text: string, digest: string, byteLength: number): boolean {
	const bytes = Buffer.from(text, "utf8");
	return bytes.length === byteLength && sha256(bytes) === digest;
}

function scopeOf(principal: Principal, roles?: RoleWorkState): { device?: string; workflows: "all" | readonly string[] } {
	if (principal.kind === "assignment-agent")
		return { workflows: roles?.assignments.filter((a) => sameAgent(a, principal)).map((a) => a.workflow) ?? [] };
	if (principal.kind === "human" && principal.route === "device") return { device: principal.device, workflows: principal.workflows };
	return { workflows: "all" };
}

function visible(principal: Principal, workflow: string, roles?: RoleWorkState): boolean {
	const scope = scopeOf(principal, roles).workflows;
	return scope === "all" || scope.includes(workflow);
}

/** Who may read a receipt: the scope it concerns, never merely the namespace. */
function readable(body: ReceiptBody, principal: Principal): boolean {
	if (principal.kind === "host") return body.acceptedBy.principal === "host";
	if (principal.kind === "assignment-agent")
		return (
			body.acceptedBy.assignment === principal.assignment &&
			body.acceptedBy.generation === principal.generation &&
			body.acceptedBy.attempt === principal.attempt &&
			body.acceptedBy.role === principal.role
		);
	if (principal.kind !== "human") return false;
	if (principal.route === "local-admin") return true;
	if (body.workflow !== null) return visible(principal, body.workflow);
	return body.acceptedBy.route === "device" && principal.workflows === "all";
}

function workflowState(w: Present<WorkflowRecord>, roles: RoleWorkState): WorkflowState {
	const documents: DocumentSummary[] = Object.values(w.documents)
		.sort((a, b) => a.document.localeCompare(b.document))
		.map((d) => ({
			document: d.document,
			kind: d.kind,
			revision: d.revision,
			mediaType: d.mediaType,
			digest: d.digest,
			byteLength: d.byteLength,
			recordedAtSequence: d.recordedAtSequence,
			revisionCount: d.revisionCount,
			savedBy: d.savedBy,
		}));
	return {
		id: w.id,
		title: w.title,
		documents,
		messageCount: w.messageCount,
		assignments: plain(roles.assignments.filter((a) => a.workflow === w.id)),
	};
}

/** Command IDs are namespaced by principal: one human across devices, or one host scope. */
function namespaceOf(principal: Principal): string {
	if (principal.kind === "human") return principal.human;
	if (principal.kind === "host") return `host:${principal.scope}`;
	return `agent:${principal.assignment}:${principal.generation}:${principal.attempt}`;
}
