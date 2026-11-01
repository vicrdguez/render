// Ledger-owned local recovery: closed directory format, snapshot-derived manifest, offline origin marker and
// validation of every currently delivered retained type. No archive extraction or worker Git configuration.
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import {
	type Cursor,
	defineDoc,
	type EntryRecord,
	Harness,
	type HarnessOptions,
	type Page,
	type Storage,
} from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { validBackup } from "./backup-state.ts";
import { faultBarrier } from "./barrier.ts";
import {
	APPLICATION_ID,
	type DeviceRecord,
	type FactData,
	type MessageData,
	type MetaState,
	type ReceiptRecord,
	type RevisionData,
	type RevisionIndex,
	STORE_SCHEMA,
	type WorkflowRecord,
} from "./records.ts";

const ctx = BACKGROUND_CONTEXT;
export type Origin = { id: string; cutoff: number; priorAuthorityEpoch: string };
export type RecoveryState = {
	schema: number;
	restoreRequired: boolean;
	mode: "active" | "admission-disabled" | "recovery-reconciling";
	origin: Origin | null;
};
export const Recovery = defineDoc<RecoveryState>({
	kind: "render.recovery",
	version: 1,
	scope: "session",
	initial: () => ({ schema: 1, restoreRequired: false, mode: "active", origin: null }),
	checkpointWhen: () => true,
});
export const DISABLED_FILE = "recovery-disabled";

type Manifest = Origin & { format: 1; storeSchema: number; files: { "render.db": string }; sourceRoots: [] };

function check(value: unknown, reason: string): asserts value {
	if (!value) throw new Error(`invalid_recovery_package: ${reason}`);
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function syncPath(path: string): Promise<void> {
	const file = await open(path, "r");
	try {
		await file.sync();
	} finally {
		await file.close();
	}
}
async function durableFile(path: string, text: string): Promise<void> {
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(text);
		await file.sync();
	} finally {
		await file.close();
	}
}

export async function withRecoveryStore<T>(path: string, use: (storage: SqliteStorage) => Promise<T>): Promise<T> {
	const db = new DatabaseSync(path, { readOnly: true });
	try {
		check(Object.values(db.prepare("PRAGMA application_id").get() ?? {})[0] === APPLICATION_ID, "not a Render database");
		check(Object.values(db.prepare("PRAGMA user_version").get() ?? {})[0] === STORE_SCHEMA, "unsupported store schema");
		check(Object.values(db.prepare("PRAGMA integrity_check").get() ?? {})[0] === "ok", "SQLite integrity");
		check(db.prepare("PRAGMA foreign_key_check").all().length === 0, "SQLite foreign keys");
	} finally {
		db.close();
	}
	const adapter = await openNodeSqliteDatabase(path);
	try {
		await adapter.exec("PRAGMA synchronous = FULL");
		await adapter.exec("PRAGMA fullfsync = ON");
		await adapter.exec("PRAGMA checkpoint_fullfsync = ON");
		const storage = await SqliteStorage.open(adapter);
		return await use(storage);
	} finally {
		await adapter.close();
	}
}

async function all<T>(scan: (cursor: Cursor | undefined) => Promise<Page<T, Cursor>>): Promise<T[]> {
	const items: T[] = [];
	let cursor: Cursor | undefined;
	do {
		const page = await scan(cursor);
		items.push(...page.items);
		cursor = page.next;
	} while (cursor !== undefined);
	return items;
}

/** Validate materialized semantic state, not just the SQLite checksum. Unknown future owners must extend this. */
export async function validateRecoveryState(storage: Storage): Promise<{ meta: MetaState; recovery: RecoveryState | undefined }> {
	const docs = await all((c) => storage.scanDocuments({ scope: { kind: "session" }, at: "current" }, 200, c, ctx));
	const values = new Map<string, unknown>();
	for (const d of docs) {
		if (d.kind === "render.role-work") {
			const state = await storage.document(d.id, "current", ctx);
			// Restored role execution needs current-world reconciliation, which this host cannot establish.
			check(
				state?.version === 1 && d.key === undefined && isDeepStrictEqual(state.value, { assignments: [] }),
				"role-work reconciliation unavailable",
			);
			continue;
		}
		check(
			["render.meta", "render.workflow", "render.device", "render.receipt", "render.revision-location", "render.recovery"].includes(d.kind),
			`unsupported document ${d.kind}`,
		);
		const state = await storage.document(d.id, "current", ctx);
		check(state?.version === 1, `unsupported document schema ${d.kind}`);
		values.set(`${d.kind} ${d.key ?? ""}`, state.value);
	}
	const meta = values.get("render.meta ") as MetaState | undefined;
	check(
		meta?.initialized &&
			meta.schema === STORE_SCHEMA &&
			Number.isSafeInteger(meta.sequence) &&
			meta.sequence >= 1 &&
			typeof meta.authorityEpoch === "string" &&
			meta.authorityEpoch.length > 0,
		"meta",
	);
	check(
		Array.isArray(meta.workflows) &&
			Array.isArray(meta.devices) &&
			new Set(meta.workflows).size === meta.workflows.length &&
			new Set(meta.devices).size === meta.devices.length,
		"meta indexes",
	);
	check(meta.backup === undefined || validBackup(meta.backup, meta.sequence), "backup state");
	const recovery = values.get("render.recovery ") as RecoveryState | undefined;
	if (recovery !== undefined) {
		check(
			recovery.schema === 1 &&
				["active", "admission-disabled", "recovery-reconciling"].includes(recovery.mode) &&
				typeof recovery.restoreRequired === "boolean",
			"recovery schema",
		);
		check(!recovery.restoreRequired || meta.historyCursorKey === undefined, "raw history cursor key in package");
		if (recovery.origin !== null)
			check(
				/^package-[a-f0-9-]{36}$/.test(recovery.origin.id) &&
					Number.isSafeInteger(recovery.origin.cutoff) &&
					recovery.origin.cutoff <= meta.sequence &&
					typeof recovery.origin.priorAuthorityEpoch === "string",
				"origin",
			);
		check(
			!recovery.restoreRequired ||
				(recovery.mode === "admission-disabled" &&
					recovery.origin?.cutoff === meta.sequence &&
					recovery.origin.priorAuthorityEpoch === meta.authorityEpoch),
			"origin cutoff/epoch",
		);
	}
	// Role runtime records cannot be safely rebound from an older cutoff. Refuse rather than omit or replay them.
	check((await storage.scanTasks({}, 1, undefined, ctx)).items.length === 0, "task definitions/reconciliation unavailable");
	check((await storage.scanSubmissions({}, 1, undefined, ctx)).items.length === 0, "submission reconciliation unavailable");
	const conversations = await all((c) => storage.scanConversations({}, 200, c, ctx));
	const conversationIds = new Set(conversations.map((c) => Number(c.id)));
	check(conversationIds.has(meta.ledgerConversation), "ledger conversation");
	const entries: EntryRecord[] = [];
	for (const conversation of conversations) {
		check(conversation.owner === undefined && conversation.parent === undefined, "unsupported conversation ownership");
		const localDocs = await all((c) =>
			storage.scanDocuments({ scope: { kind: "conversation", conversationId: conversation.id }, at: "current" }, 100, c, ctx),
		);
		for (const d of localDocs) {
			check(d.kind !== "render.role-binding", "role-work reconciliation unavailable");
			const state = await storage.document(d.id, "current", ctx);
			check(state?.version === 1, "runtime document schema");
			const v = state.value;
			check(
				d.kind === "pi.live" || d.kind === "pi.agent"
					? Object.keys(v).length === 0
					: d.kind === "pi.inbox"
						? JSON.stringify(v) === '{"items":[]}'
						: d.kind === "pi.usage"
							? JSON.stringify(v) === '{"models":{},"tools":{}}'
							: d.kind === "pi.provider"
								? Object.keys(v).join() === "sessionId" && typeof v.sessionId === "string"
								: false,
				`unsupported conversation state ${d.kind}`,
			);
		}
		entries.push(...(await all((c) => storage.scanEntries({ conversationId: conversation.id, order: "ascending" }, 200, c, ctx))));
	}
	const revisions = new Map<string, { entry: EntryRecord; data: RevisionData }>();
	const facts = new Map<number, FactData>();
	const factConversations = new Map<number, number>();
	const messageConversations = new Map<string, number>();
	const messages: MessageData[] = [];
	for (const e of entries) {
		const d = e.data as unknown as RevisionData & FactData & MessageData;
		check(d.schema === 1, `unsupported entry schema ${e.id}`);
		if (e.kind === "render.revision") {
			check(d.roleBinding === undefined, "role-work reconciliation unavailable");
			check(
				typeof d.text === "string" && d.digest === `sha256:${digest(Buffer.from(d.text))}` && d.byteLength === Buffer.byteLength(d.text),
				`content ${d.revision}`,
			);
			check(
				!revisions.has(d.revision) &&
					d.revision === `revision:${d.recordedAtSequence}` &&
					["ground", "document"].includes(d.kind) &&
					["text/plain", "text/markdown"].includes(d.mediaType),
				"revision identity/type",
			);
			revisions.set(d.revision, { entry: e, data: d });
		} else if (e.kind === "render.fact") {
			check(
				[
					"createWorkflow",
					"saveDocument",
					"postCoordinatorMessage",
					"enrollDevice",
					"revokeDevice",
					"recordStartup",
					"repairRecovery",
				].includes(d.command),
				`unsupported fact command ${d.command}`,
			);
			check(
				!facts.has(d.sequence) &&
					d.fact === `fact:${d.sequence}` &&
					Number.isSafeInteger(d.sequence) &&
					d.sequence > 0 &&
					d.sequence <= meta.sequence,
				"fact identity/cutoff",
			);
			facts.set(d.sequence, d);
			factConversations.set(d.sequence, Number(e.conversationId));
		} else if (e.kind === "render.message") {
			check(d.message === `message:${d.recordedAtSequence}` && typeof d.text === "string", "message");
			check(
				(d.digest === undefined && d.byteLength === undefined) ||
					(d.digest === `sha256:${digest(Buffer.from(d.text))}` && d.byteLength === Buffer.byteLength(d.text)),
				`message content ${d.message}`,
			);
			messages.push(d);
			messageConversations.set(d.message, Number(e.conversationId));
		} else check(false, `unsupported entry ${e.kind}`);
	}
	const workflows = new Map<string, Extract<WorkflowRecord, { exists: true }>>();
	for (const id of meta.workflows) {
		const w = values.get(`render.workflow ${id}`) as WorkflowRecord | undefined;
		check(
			w?.exists && w.id === id && conversationIds.has(w.conversation) && facts.get(w.createdAtSequence)?.command === "createWorkflow",
			`workflow ${id}`,
		);
		workflows.set(id, w);
		check(messages.filter((m) => m.workflow === id).length === w.messageCount, `message count ${id}`);
		for (const [name, p] of Object.entries(w.documents)) {
			const r = revisions.get(p.revision);
			check(
				r &&
					p.document === name &&
					r.data.document === name &&
					r.data.workflow === id &&
					r.entry.id === p.entry &&
					Number(r.entry.conversationId) === w.conversation &&
					r.data.digest === p.digest &&
					r.data.byteLength === p.byteLength &&
					r.data.kind === p.kind &&
					r.data.mediaType === p.mediaType &&
					r.data.recordedAtSequence === p.recordedAtSequence,
				`document pointer ${id}/${name}`,
			);
			check(
				p.revisionCount === [...revisions.values()].filter((r) => r.data.workflow === id && r.data.document === name).length,
				`revision count ${id}/${name}`,
			);
			check(
				![...revisions.values()].some(
					(r) => r.data.workflow === id && r.data.document === name && r.data.recordedAtSequence > p.recordedAtSequence,
				),
				`not latest pointer ${id}/${name}`,
			);
		}
	}
	for (const { entry, data: r } of revisions.values()) {
		const w = workflows.get(r.workflow);
		check(
			w && Number(entry.conversationId) === w.conversation && Object.hasOwn(w.documents, r.document),
			`revision workflow ${r.revision}`,
		);
		const index = values.get(`render.revision-location ${r.revision}`) as RevisionIndex | undefined;
		check(
			index?.exists && index.workflow === r.workflow && index.entry === entry.id && index.conversation === w.conversation,
			`revision index ${r.revision}`,
		);
		const prior = [...revisions.values()]
			.map((v) => v.data)
			.filter((p) => p.workflow === r.workflow && p.document === r.document && p.recordedAtSequence < r.recordedAtSequence)
			.sort((a, b) => b.recordedAtSequence - a.recordedAtSequence)[0];
		check(r.parent === (prior?.revision ?? null), `revision chain ${r.revision}`);
		if (r.parent !== null) {
			const parent = revisions.get(r.parent)?.data;
			check(
				parent && parent.workflow === r.workflow && parent.document === r.document && parent.recordedAtSequence < r.recordedAtSequence,
				`revision parent ${r.revision}`,
			);
		}
		check(
			facts.get(r.recordedAtSequence)?.command === "saveDocument" && facts.get(r.recordedAtSequence)?.commandId === r.commandId,
			`revision fact ${r.revision}`,
		);
	}
	for (const m of messages)
		check(
			workflows.has(m.workflow) &&
				messageConversations.get(m.message) === workflows.get(m.workflow)?.conversation &&
				facts.get(m.recordedAtSequence)?.command === "postCoordinatorMessage" &&
				facts.get(m.recordedAtSequence)?.commandId === m.commandId,
			`message fact ${m.message}`,
		);
	for (const id of meta.devices) {
		const d = values.get(`render.device ${id}`) as DeviceRecord | undefined;
		check(
			d?.exists &&
				d.device === id &&
				d.human === meta.human &&
				/^[a-f0-9]{64}$/.test(d.verifier) &&
				facts.get(d.enrolledAtSequence)?.command === "enrollDevice",
			`device ${id}`,
		);
		check(
			d.scope.workflows === "all" ||
				(Array.isArray(d.scope.workflows) && d.scope.workflows.every((w) => typeof w === "string" && w.length > 0)),
			`device scope ${id}`,
		);
		check(
			d.revokedAtSequence === null ||
				(Number.isSafeInteger(d.revokedAtSequence) && d.revokedAtSequence <= meta.sequence && d.revokedAtSequence >= d.enrolledAtSequence),
			`device revocation ${id}`,
		);
	}
	const receipts = new Map<number, ReceiptRecord>();
	for (const [key, value] of values) {
		if (key.startsWith("render.receipt ")) {
			const r = value as Extract<ReceiptRecord, { exists: true }>;
			check(
				r.exists &&
					/^[a-f0-9]{64}$/.test(r.fingerprint) &&
					key === `render.receipt ${r.namespace} ${r.body.commandId}` &&
					r.body.status === "accepted" &&
					r.body.receipt === `receipt:${r.body.sequence}` &&
					!receipts.has(r.body.sequence),
				`receipt ${key}`,
			);
			const f = facts.get(r.body.sequence);
			check(
				f &&
					f.commandId === r.body.commandId &&
					r.body.facts.length === 1 &&
					r.body.facts[0] === f.fact &&
					(r.body.workflow === null || workflows.has(r.body.workflow)),
				`receipt fact/scope ${key}`,
			);
			receipts.set(r.body.sequence, r);
		} else if (key.startsWith("render.workflow ")) check(meta.workflows.includes(key.slice(16)), "orphan workflow");
		else if (key.startsWith("render.device ")) check(meta.devices.includes(key.slice(14)), "orphan device");
		else if (key.startsWith("render.revision-location ")) check(revisions.has(key.slice(25)), "orphan revision index");
	}
	check(facts.size === meta.sequence && receipts.size === meta.sequence, "complete fact/receipt sequence");
	check(
		conversations.length === workflows.size + 1 &&
			new Set([meta.ledgerConversation, ...[...workflows.values()].map((w) => w.conversation)]).size === conversations.length,
		"conversation ownership/indexes",
	);
	for (const [sequence, f] of facts) {
		const receipt = receipts.get(sequence);
		check(receipt?.exists, `missing receipt ${sequence}`);
		const body = receipt.body;
		check(body.authorityEpoch === meta.authorityEpoch && isDeepStrictEqual(body.acceptedBy, f.by), `receipt epoch/provenance ${sequence}`);
		const by = body.acceptedBy;
		check(
			(by.principal === "host" && by.route === "host" && f.command === "recordStartup" && receipt.namespace === "host:recovery") ||
				(by.principal === "human" &&
					(by.route === "local-admin" || (by.route === "device" && typeof by.device === "string" && meta.devices.includes(by.device))) &&
					receipt.namespace === meta.human),
			`principal ${sequence}`,
		);
		let refs: Record<string, string>;
		let result: unknown;
		switch (f.command) {
			case "createWorkflow": {
				const w = workflows.get(`workflow:${sequence}`);
				check(w && w.createdAtSequence === sequence, `workflow creation ${sequence}`);
				refs = { workflow: w.id };
				result = refs;
				break;
			}
			case "saveDocument": {
				const r = revisions.get(`revision:${sequence}`)?.data;
				check(r && isDeepStrictEqual(r.createdBy, f.by), `revision provenance ${sequence}`);
				refs = { workflow: r.workflow, revision: r.revision };
				result = { revision: r.revision, document: r.document, digest: r.digest, byteLength: r.byteLength, parent: r.parent };
				break;
			}
			case "postCoordinatorMessage": {
				const matches = messages.filter((m) => m.recordedAtSequence === sequence);
				check(matches.length === 1 && isDeepStrictEqual(matches[0]?.createdBy, f.by), `message provenance ${sequence}`);
				const m = matches[0] as MessageData;
				refs = { workflow: m.workflow, message: m.message };
				result = { message: m.message };
				break;
			}
			case "enrollDevice": {
				const d = values.get(`render.device device:${sequence}`) as Extract<DeviceRecord, { exists: true }>;
				check(d?.exists && d.enrolledAtSequence === sequence && by.route === "local-admin", `device enrollment ${sequence}`);
				refs = { device: d.device };
				result = { device: d.device, label: d.label, scope: d.scope };
				break;
			}
			case "revokeDevice": {
				const d = values.get(`render.device ${f.refs.device}`) as Extract<DeviceRecord, { exists: true }>;
				check(d?.exists && d.revokedAtSequence === sequence && by.route === "local-admin", `device revocation ${sequence}`);
				refs = { device: d.device };
				result = { device: d.device, revokedAtSequence: sequence };
				break;
			}
			case "recordStartup": {
				const starts = meta.startups.filter((s) => s.sequence === sequence);
				check(starts.length === 1 && starts[0]?.executorEpoch === f.refs.executorEpoch, `startup ${sequence}`);
				refs = { executorEpoch: f.refs.executorEpoch as string };
				result = refs;
				break;
			}
			default:
				check(false, `unsupported recovery history ${f.command}`);
		}
		check(
			factConversations.get(sequence) ===
				(refs.workflow === undefined ? meta.ledgerConversation : workflows.get(refs.workflow)?.conversation),
			`fact conversation ${sequence}`,
		);
		check(
			isDeepStrictEqual(f.refs, refs) && isDeepStrictEqual(body.result, result) && body.workflow === (refs.workflow ?? null),
			`receipt result/relationships ${sequence}`,
		);
		for (const ref of Object.values(f.refs)) {
			check(
				typeof ref === "string" &&
					(ref.startsWith("workflow:")
						? workflows.has(ref)
						: ref.startsWith("revision:")
							? revisions.has(ref)
							: ref.startsWith("device:")
								? meta.devices.includes(ref)
								: ref.startsWith("message:")
									? messages.some((m) => m.message === ref)
									: true),
				`fact ref ${ref}`,
			);
		}
	}
	const count = (command: string) => [...facts.values()].filter((f) => f.command === command).length;
	check(
		count("createWorkflow") === workflows.size &&
			count("enrollDevice") === meta.devices.length &&
			count("saveDocument") === revisions.size &&
			count("postCoordinatorMessage") === messages.length &&
			count("recordStartup") === meta.startups.length,
		"record/fact cardinality",
	);
	return { meta, recovery };
}

export async function createRecoveryPackage(
	data: string,
	runtime: HarnessOptions,
	commandId: string,
): Promise<Manifest & { path: string; status: "packaged" }> {
	const root = join(data, "recovery-packages");
	await mkdir(root, { recursive: true, mode: 0o700 });
	const id = `package-${randomUUID()}`;
	const staging = join(root, `.${id}.incomplete`);
	await mkdir(staging, { mode: 0o700 });
	try {
		const path = join(staging, "render.db");
		const source = new DatabaseSync(join(data, "render.db"), { readOnly: true });
		try {
			source.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
		} finally {
			source.close();
		}
		await faultBarrier("package-snapshot", commandId);
		const origin = await withRecoveryStore(path, async (storage) => {
			const { meta, recovery } = await validateRecoveryState(storage);
			check(recovery === undefined || recovery.mode === "active", "cannot package restricted recovery");
			const origin = { id, cutoff: meta.sequence, priorAuthorityEpoch: meta.authorityEpoch };
			// Session documents are current-only in pinned Durable 1.4.0: a base replaces every old base/delta.
			// Do this before opening a Harness, so no cached Meta can reintroduce the private live cursor key.
			const record = await storage.findDocument({ kind: "render.meta", scope: { kind: "session" } }, "current", ctx);
			check(record, "meta document");
			const sanitized = { ...meta };
			delete sanitized.historyCursorKey;
			await storage.commit([{ type: "document.change", id: record.id, content: { kind: "base", version: 1, value: sanitized } }], ctx);
			const harness = await Harness.open(storage, runtime, ctx);
			try {
				await harness.commit(
					async (tx) => Object.assign(await tx.doc(Recovery), { schema: 1, restoreRequired: true, mode: "admission-disabled", origin }),
					ctx,
				);
			} finally {
				await harness.close(ctx);
			}
			return origin;
		});
		// Compact only the closed offline DB: deleted pages must not carry the excluded raw key either.
		const compact = new DatabaseSync(path);
		try {
			compact.exec("VACUUM");
		} finally {
			compact.close();
		}
		const manifest: Manifest = {
			...origin,
			format: 1,
			storeSchema: STORE_SCHEMA,
			files: { "render.db": digest(await readFile(path)) },
			sourceRoots: [],
		};
		await durableFile(join(staging, "manifest.json"), JSON.stringify(manifest));
		await validatePackage(staging);
		await syncPath(path);
		await syncPath(staging);
		await faultBarrier("package-publish", commandId);
		const published = join(root, id);
		await rename(staging, published);
		await syncPath(root);
		await syncPath(data);
		return { ...manifest, path: published, status: "packaged" };
	} catch (error) {
		await rm(staging, { recursive: true, force: true });
		throw error;
	}
}

/** Closed format: no paths from a manifest are ever opened. Symlinks and extra/missing members refuse. */
export async function validatePackage(path: string): Promise<Manifest> {
	check((await lstat(path)).isDirectory(), "package directory");
	const names = (await readdir(path)).sort();
	check(JSON.stringify(names) === JSON.stringify(["manifest.json", "render.db"]), "package members");
	for (const name of names) check((await lstat(join(path, name))).isFile(), `regular file ${name}`);
	const m = JSON.parse(await readFile(join(path, "manifest.json"), "utf8")) as Manifest;
	check(
		m.format === 1 &&
			m.storeSchema === STORE_SCHEMA &&
			/^package-[a-f0-9-]{36}$/.test(m.id) &&
			Number.isSafeInteger(m.cutoff) &&
			m.cutoff > 0 &&
			typeof m.priorAuthorityEpoch === "string",
		"manifest schema",
	);
	check(
		Object.keys(m).sort().join() ===
			["id", "cutoff", "priorAuthorityEpoch", "format", "storeSchema", "files", "sourceRoots"].sort().join() &&
			Object.keys(m.files).join() === "render.db" &&
			Array.isArray(m.sourceRoots) &&
			m.sourceRoots.length === 0,
		"unsupported members/source roots",
	);
	check(digest(await readFile(join(path, "render.db"))) === m.files["render.db"], "database checksum");
	await withRecoveryStore(join(path, "render.db"), async (storage) => {
		const { meta, recovery } = await validateRecoveryState(storage);
		check(
			recovery?.restoreRequired &&
				recovery.origin?.id === m.id &&
				meta.sequence === m.cutoff &&
				meta.authorityEpoch === m.priorAuthorityEpoch,
			"manifest/origin identity",
		);
	});
	return m;
}

/** Called only while the destination owner lock is held. The durable fence precedes even malformed input reads. */
export async function restorePackage(data: string, source: string): Promise<void> {
	const entries = await readdir(data);
	check(
		entries.every((n) => [DISABLED_FILE, "owner.lock", "owner.lock-journal"].includes(n)),
		"restore needs a clean destination; existing data preserved",
	);
	const fence = join(data, DISABLED_FILE);
	try {
		await durableFile(fence, "Managed restore attempted; local-admin recovery required.\n");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
	}
	await syncPath(data);
	// Import into private staging first; validation never races a later re-read of caller-owned input.
	const staging = join(data, ".restore-incomplete");
	await mkdir(staging, { mode: 0o700 });
	try {
		check((await lstat(source)).isDirectory(), "package directory");
		check((await readdir(source)).sort().join() === "manifest.json,render.db", "package members");
		for (const name of ["manifest.json", "render.db"]) {
			check((await lstat(join(source, name))).isFile(), `regular file ${name}`);
			await copyFile(join(source, name), join(staging, name), constants.COPYFILE_EXCL);
		}
		await validatePackage(staging);
		await syncPath(join(staging, "render.db"));
		await rename(join(staging, "render.db"), join(data, "render.db"));
		await syncPath(data);
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}
