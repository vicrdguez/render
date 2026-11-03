// Safe startup (spec §5.1, §10): owner lock before anything opens the store, read-only store identification,
// effective persistence readback, runtime open without dispatch, a fence commit with a fresh executorEpoch, and only
// then explicit resume.
import { randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { access, chmod, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type NodeSqliteDatabase, openNodeSqliteDatabase } from "@earendil-works/chord/sqlite/node";
import { Harness, type ReportInfo } from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import type { RenderRuntimeOptions } from "../engine/runtime.ts";
import type { Persistence } from "../kernel/kernel.ts";
import { Ledger } from "./ledger.ts";
import { mintContext } from "./principals.ts";
import { APPLICATION_ID, Meta, STORE_SCHEMA } from "./records.ts";

const ctx = BACKGROUND_CONTEXT;

export const REQUIRED_PERSISTENCE: Persistence = { journal_mode: "wal", synchronous: 2, fullfsync: 1, checkpoint_fullfsync: 1 };

export class StartupFailure extends Error {
	readonly event: "startup_refused" | "startup_blocked";
	readonly code: string;
	readonly detail: string;
	readonly action: string;
	constructor(event: StartupFailure["event"], code: string, detail: string, action: string) {
		super(`${code}: ${detail}`);
		this.event = event;
		this.code = code;
		this.detail = detail;
		this.action = action;
	}
}

function blocked(code: string, detail: string, action: string): StartupFailure {
	return new StartupFailure("startup_blocked", code, detail, action);
}

export type OpenedLedger = {
	readonly ledger: Ledger;
	readonly persistence: Persistence;
	readonly authorityEpoch: string;
	readonly executorEpoch: string;
	readonly dataDir: string;
	close(): Promise<void>;
};

export async function openLedger(options: {
	readonly data: string;
	readonly runtime: (onReport: (error: unknown, info: ReportInfo) => void) => RenderRuntimeOptions;
	readonly onFatal: (error: unknown) => void;
}): Promise<OpenedLedger> {
	await mkdir(options.data, { recursive: true, mode: 0o700 });
	await chmod(options.data, 0o700);
	const lock = acquireOwnerLock(join(options.data, "owner.lock"));
	let adapter: NodeSqliteDatabase | undefined;
	let harness: Harness | undefined;
	try {
		const path = join(options.data, "render.db");
		const fresh = identifyStore(path) === "new";
		const opened = await openPersistent(path, fresh);
		adapter = opened.adapter;
		const storage = await SqliteStorage.open(adapter).catch((error: unknown) => {
			throw blocked(
				"unsupported_schema",
				`The runtime store schema is not supported: ${message(error)}`,
				"Run a Render version that supports this store.",
			);
		});
		const runtime = options.runtime((error, info) => {
			if (info.type === "session_failed") options.onFatal(error);
		});
		harness = await Harness.open(storage, runtime, ctx);
		// Read-only inspection: nothing is scheduled, aborted or migrated here.
		const inspection = await harness.inspect(ctx);
		const unsupported = inspection.tasks.filter((t) => t.state.kind === "blocked");
		if (unsupported.length > 0) {
			throw blocked(
				"unsupported_definitions",
				`Retained tasks have no compatible definition: ${unsupported
					.map((t) => `${t.record.kind} v${t.record.version} (task ${t.record.id}, ${t.state.kind === "blocked" ? t.state.reason : ""})`)
					.join("; ")}`,
				"Start the Render version that owns these tasks. The store was left unchanged.",
			);
		}
		// Orphaned state and an interrupted unsafe tool are uncertainty, not permission to replay.
		const uncertain = await harness.commit(async (tx) => {
			let cursor: Parameters<typeof tx.scanTasks>[2];
			for (;;) {
				const page = await tx.scanTasks({}, 200, cursor);
				for (const task of page.items) {
					if (task.state.status === "terminal" && task.state.outcome.status === "orphaned") return `orphaned task ${task.id}`;
					if (
						task.kind === "pi.tool" &&
						"checkpoint" in task.state &&
						(task.state.checkpoint as { phase?: string; replay?: string }).phase === "execute" &&
						(task.state.checkpoint as { replay?: string }).replay !== "safe"
					)
						return `uncertain tool ${task.id}`;
				}
				if (!page.next) return undefined;
				cursor = page.next;
			}
		}, ctx);
		if (uncertain)
			throw blocked(
				"uncertain_execution",
				uncertain,
				"Reconcile original execution and effects before explicit resume; no automatic replay.",
			);
		const meta = await harness.snapshot(Meta, ctx).catch((error: unknown) => {
			throw blocked(
				"unsupported_schema",
				`Render records are not readable: ${message(error)}`,
				"Run a Render version that supports this store.",
			);
		});
		if (meta !== undefined && meta.schema !== STORE_SCHEMA)
			throw blocked(
				"unsupported_schema",
				`Render records have schema ${meta.schema}; this host supports ${STORE_SCHEMA}.`,
				"Run a compatible Render version.",
			);
		if (meta === undefined || !meta.initialized) {
			await harness.commit(async (tx) => {
				const conversation = await tx.createConversation({ ownership: { kind: "ownerless" } });
				Object.assign(await tx.doc(Meta), {
					initialized: true,
					authorityEpoch: `authority-${randomUUID()}`,
					ledgerConversation: conversation.id,
				});
			}, ctx);
		}
		if (meta?.historyCursorKey === undefined) {
			await harness.commit(async (tx) => {
				const current = await tx.doc(Meta);
				current.historyCursorKey ??= randomUUID();
			}, ctx);
		}
		const executorEpoch = `executor-${randomUUID()}`;
		const ledger = await Ledger.load(harness, opened.persistence, options.onFatal, runtime.roleTasks).catch((error: unknown) => {
			throw blocked(
				"unsupported_schema",
				`Retained Ledger records are unreadable: ${message(error)}`,
				"Run a compatible Render version; no tasks were dispatched.",
			);
		});
		runtime.bindLedger?.(ledger, harness);
		const fence = await ledger.command(
			{
				version: 1,
				authorityEpoch: ledger.status().authorityEpoch,
				commandId: `startup:${executorEpoch}`,
				command: { type: "recordStartup", executorEpoch, persistence: opened.persistence },
			},
			mintContext({ kind: "host", scope: "recovery" }),
		);
		if (fence.status !== "accepted")
			throw blocked("startup_fence_refused", JSON.stringify(fence), "Inspect the store; nothing was dispatched.");
		// Unchecked work is fenced by the new executorEpoch; only now may scheduling start.
		await runtime.beforeResume?.();
		harness.resume();
		runtime.afterResume?.();
		return {
			ledger,
			persistence: opened.persistence,
			authorityEpoch: ledger.status().authorityEpoch,
			executorEpoch,
			dataDir: options.data,
			close: async () => {
				await ledger.close();
				lock.release();
			},
		};
	} catch (error) {
		await harness?.close(ctx).catch(() => undefined);
		if (harness === undefined) await adapter?.close().catch(() => undefined);
		lock.release();
		throw error;
	}
}

/** OS-lifetime exclusive lock: SQLite's exclusive file lock on a separate lock file, released by the kernel on exit. */
function acquireOwnerLock(path: string): { release(): void } {
	const db = new DatabaseSync(path, { timeout: 0 });
	try {
		db.exec("PRAGMA locking_mode = EXCLUSIVE");
		db.exec("BEGIN EXCLUSIVE");
	} catch (error) {
		db.close();
		throw new StartupFailure(
			"startup_refused",
			"store_owned",
			`Another process owns this data directory (${message(error)}).`,
			"Stop the other Render host first; this process opened nothing.",
		);
	}
	let held = true;
	return {
		release: () => {
			if (!held) return;
			held = false;
			db.close();
		},
	};
}

/** Identifies the store with a read-only connection, so that an incompatible file is never modified. */
function identifyStore(path: string): "new" | "render" {
	if (!existsSync(path)) return "new";
	let header: { applicationId: number; userVersion: number; objects: number };
	let db: DatabaseSync | undefined;
	try {
		db = new DatabaseSync(path, { readOnly: true });
		header = {
			applicationId: Number((db.prepare("PRAGMA application_id").get() as { application_id: number }).application_id),
			userVersion: Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version),
			objects: Number((db.prepare("SELECT count(*) AS n FROM sqlite_master").get() as { n: number }).n),
		};
	} catch (error) {
		throw blocked(
			"store_unreadable",
			`render.db is not a readable SQLite database: ${message(error)}`,
			"Restore render.db or move it aside; it was left unchanged.",
		);
	} finally {
		db?.close();
	}
	if (header.applicationId === 0 && header.objects === 0) return "new";
	if (header.applicationId !== APPLICATION_ID)
		throw blocked(
			"unsupported_store",
			`render.db has application_id ${header.applicationId}, not a Render store (${APPLICATION_ID}).`,
			"Point --data at a Render data directory; the file was left unchanged.",
		);
	if (header.userVersion !== STORE_SCHEMA)
		throw blocked(
			"unsupported_schema",
			`render.db has store schema ${header.userVersion}; this host supports ${STORE_SCHEMA}.`,
			"Run a Render version that supports this schema; the file was left unchanged.",
		);
	return "render";
}

/** Opens the store with the declared profile and refuses to admit work if the effective settings differ. */
async function openPersistent(path: string, fresh: boolean): Promise<{ adapter: NodeSqliteDatabase; persistence: Persistence }> {
	let adapter: NodeSqliteDatabase | undefined;
	try {
		// A read-only store or directory cannot hold WAL writes; SQLite would only fail at the first real write.
		await access(dirname(path), constants.W_OK);
		if (!fresh || existsSync(path)) await access(path, constants.R_OK | constants.W_OK);
		adapter = await openNodeSqliteDatabase(path);
		await adapter.exec("PRAGMA synchronous = FULL");
		await adapter.exec("PRAGMA fullfsync = ON");
		await adapter.exec("PRAGMA checkpoint_fullfsync = ON");
		const read = async (pragma: string) => Object.values((await adapter?.get<Record<string, unknown>>(`PRAGMA ${pragma}`)) ?? {})[0];
		const persistence: Persistence = {
			journal_mode: String(await read("journal_mode")),
			synchronous: Number(await read("synchronous")),
			fullfsync: Number(await read("fullfsync")),
			checkpoint_fullfsync: Number(await read("checkpoint_fullfsync")),
		};
		const mismatched = (Object.keys(REQUIRED_PERSISTENCE) as (keyof Persistence)[]).filter(
			(k) => persistence[k] !== REQUIRED_PERSISTENCE[k],
		);
		if (mismatched.length > 0)
			throw blocked(
				"persistence_unavailable",
				`Effective persistence ${JSON.stringify(persistence)} differs from the required ${JSON.stringify(REQUIRED_PERSISTENCE)}.`,
				"Move the data directory to a local filesystem that supports SQLite WAL with full synchronization.",
			);
		if (fresh) {
			await adapter.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
			await adapter.exec(`PRAGMA user_version = ${STORE_SCHEMA}`);
		}
		return { adapter, persistence };
	} catch (error) {
		await adapter?.close().catch(() => undefined);
		if (error instanceof StartupFailure) throw error;
		throw blocked(
			"persistence_unavailable",
			`The store cannot be opened with the required persistence profile: ${message(error)}`,
			"Check that render.db and its directory are writable by this user; the file was left unchanged.",
		);
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
