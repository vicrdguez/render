// Ledger: the accepting authority. command/observe/artifact are its interface; adapters in this directory are the
// only places that establish principals.
import { createHash } from "node:crypto";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId, EntryId, Harness } from "@earendil-works/pi-durable";
import type { RoleTaskStaging } from "../engine/runtime.ts";
import {
	change,
	type DocumentSummary,
	type KernelState,
	type Persistence,
	type Principal,
	type Refusal,
	type VerifiedFacts,
	view,
	type WorkflowState,
} from "../kernel/kernel.ts";
import { packetRefs, type RoleAssignment, type RolePacket, type RoleWorkState, sameAgent } from "../kernel/roles.ts";
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
	Receipt,
	type ReceiptBody,
	type RevisionData,
	RevisionEntry,
	RevisionLocation,
	RoleBinding,
	RoleWork,
	STORE_SCHEMA,
	Workflow,
	type WorkflowRecord,
} from "./records.ts";

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

export class Ledger {
	readonly #harness: Harness;
	readonly #persistence: Persistence;
	readonly #onFatal: (error: unknown) => void;
	readonly #observers = new Set<Observer>();
	#meta: MetaState;
	readonly #workflows = new Map<string, Present<WorkflowRecord>>();
	readonly #devices = new Map<string, Present<DeviceRecord>>();
	#mode: HostMode = "active";
	#roleWork: RoleWorkState = { assignments: [] };
	#roleTasks: RoleTaskStaging | undefined;

	private constructor(harness: Harness, meta: MetaState, persistence: Persistence, onFatal: (error: unknown) => void) {
		this.#harness = harness;
		this.#meta = meta;
		this.#persistence = persistence;
		this.#onFatal = onFatal;
		void harness.closed.then((end) => {
			if (end.reason === "failed") this.#fail(end.error);
		});
	}

	/** Loads committed state into the read model. Called by startup after the store and runtime are validated. */
	static async load(
		harness: Harness,
		persistence: Persistence,
		onFatal: (error: unknown) => void,
		roleTasks?: RoleTaskStaging,
	): Promise<Ledger> {
		const meta = await harness.snapshot(Meta, ctx);
		if (meta === undefined || !meta.initialized) throw new Error("Render store is not initialized");
		const ledger = new Ledger(harness, plain(meta) as MetaState, persistence, onFatal);
		ledger.#roleTasks = roleTasks;
		ledger.#roleWork = plain((await harness.snapshot(RoleWork, ctx)) ?? { assignments: [] });
		for (const id of meta.workflows) {
			const w = await harness.snapshot(Workflow, id, ctx);
			if (w?.exists) ledger.#workflows.set(id, plain(w) as Present<WorkflowRecord>);
		}
		for (const id of meta.devices) {
			const d = await harness.snapshot(Device, id, ctx);
			if (d?.exists) ledger.#devices.set(id, plain(d) as Present<DeviceRecord>);
		}
		return ledger;
	}

	status() {
		const m = this.#meta;
		return {
			hostMode: this.#mode,
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
		if (!outcome.duplicate) this.#adopt(outcome);
		await faultBarrier("after-commit", env.commandId);
		if (outcome.duplicate) return { ...outcome.body, duplicate: true };
		const result = outcome.body.result;
		const credential =
			enrollment !== undefined && typeof result.device === "string" ? { bearer: bearerOf(result.device, enrollment.secret) } : undefined;
		return { ...outcome.body, duplicate: false, ...(credential ? { credential } : {}) };
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
		const roles = await tx.doc(RoleWork);
		if (current.kind === "assignment-agent" && !roles.assignments.some((a) => sameAgent(a as RoleAssignment, current)))
			throw new Abort(UNAUTHORIZED);
		const namespace = namespaceOf(current);
		const receipt = await tx.doc(Receipt, `${namespace} ${env.commandId}`, null);
		if (receipt.exists) {
			if (receipt.fingerprint !== env.fingerprint || !readable(receipt.body, current)) throw new Abort(CONFLICT);
			return { duplicate: true as const, body: plain(receipt.body) as ReceiptBody };
		}

		const meta = await tx.doc(Meta);
		const sequence = meta.sequence + 1;
		const workflow = env.workflow === null ? undefined : await tx.doc(Workflow, env.workflow, null);
		const command = env.command;
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
			command.type === "assignTask"
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
				case "roles.replace": {
					if (!this.#roleTasks)
						throw new Abort({ status: "refused", code: "capability_unavailable", reason: "Role runtime is not installed." });
					const priorIds = new Set(roles.assignments.map((a) => a.id));
					Object.assign(roles, plain(write.state));
					for (const a of roles.assignments) {
						if (priorIds.has(a.id)) continue;
						const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
						a.conversation = conversation.id;
						Object.assign(await tx.doc(RoleBinding, conversation.id), {
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
							role: a.packet.role,
						});
						await this.#retainRoleText(tx, env, by, sequence, a.packetRef, `role-packet/${a.id}`, JSON.stringify(a.packet), {
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
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
					if (command.type === "recordRecoveryState" && typeof decision.result.quarantined === "string")
						await this.#retainRoleText(
							tx,
							env,
							by,
							sequence,
							decision.result.quarantined,
							`quarantined-role-result/${(command as { assignment: string }).assignment}`,
							JSON.stringify(command),
							command as { assignment: string; generation: number; attempt: string },
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
		await faultBarrier("before-commit", env.commandId);
		const affected = env.workflow ?? (typeof decision.result.workflow === "string" ? decision.result.workflow : undefined);
		const workflowDoc = affected === undefined ? undefined : await tx.doc(Workflow, affected, null);
		return {
			duplicate: false as const,
			body,
			roles: plain(roles),
			meta: plain(meta) as MetaState,
			workflow: workflowDoc?.exists ? (plain(workflowDoc) as Present<WorkflowRecord>) : undefined,
			device: changedDevice === undefined ? undefined : (plain(await tx.doc(Device, changedDevice, null)) as DeviceRecord),
		};
	}

	/** Installs committed values in the read model and notifies observers. Runs after the commit resolved. */
	#adopt(outcome: {
		meta: MetaState;
		roles?: RoleWorkState;
		workflow?: Present<WorkflowRecord> | undefined;
		device?: DeviceRecord | undefined;
	}): void {
		this.#meta = outcome.meta;
		if (outcome.roles) this.#roleWork = outcome.roles;
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
			return record?.exists && readable(record.body, principal) ? plain(record.body) : NOT_FOUND;
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
		binding: { assignment: string; generation: number; attempt: string },
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
						const ref = String(d.revision ?? d.message ?? d.fact ?? `entry:${entry.id}`);
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
										: ["host:recovery", "host:scheduling"];
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
			return exporting
				? exportHistory(records, missing, redactions, state, content)
				: historyPage(records, missing, redactions, state, limit, this.#meta.historyCursorKey ?? "");
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
		if (principal.kind === "assignment-agent") return this.#roleWork.assignments.some((a) => sameAgent(a, principal));
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
			hostMode: this.#mode,
			executorEpoch: this.#meta.executorEpoch,
			persistence: this.#persistence,
			backup: {
				health: "unavailable",
				reason: "Off-host protection is not available in this host version; no acknowledged work is protected off-host.",
				targetExposedWorkSeconds: 300,
				verifiedOffHostCutoffSequence: null,
			},
			history: {
				status: "available",
				head: `history:${this.#meta.sequence}`,
				completeThroughSequence: this.#meta.sequence,
				exportVersion: 1,
				backup: false,
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
