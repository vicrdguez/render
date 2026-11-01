// Storage-independent history protocol. Cursors bind selection/cutoff, never grant read authority.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { LedgerRefusal } from "./ledger.ts";

export const EXCLUSIONS = ["unsaved_client_buffers", "uncommitted_provider_streams", "unsnapshotted_worker_files"];
export const UNAVAILABLE_KINDS = [
	"proposal",
	"assignment",
	"attempt",
	"decision",
	"outcome",
	"policy",
	"execution",
	"effect",
	"runtime_transcript",
];
const KINDS = ["workflow", "ground", "document", "message", "fact", "receipt"];
export type HistoryQuery = Readonly<Record<string, string | undefined>>;
export type HistoryScope = { workflows: string[]; global: boolean; kinds: string[] };
export type HistoryState = {
	epoch: string;
	owner: string;
	receiptView: "admin" | "device";
	cutoff: number;
	offset: number;
	scope: HistoryScope;
};
export type HistoryRecord = {
	ref: string;
	kind: string;
	schema: number;
	workflow: string | null;
	sequence: number;
	commandId: string | null;
	parents: string[];
	supersedes: string[];
	refs: Record<string, string>;
	outcome: null;
	[key: string]: unknown;
};
export type Missing = { ref: string; code: string };
export type HistoryPage = {
	version: 1;
	cutoff: number;
	scope: HistoryScope;
	records: HistoryRecord[];
	next: string | null;
	complete: boolean;
	missing: Missing[];
	redactions: string[];
	omittedKinds: string[];
	exclusions: string[];
};
export type HistoryExport = {
	version: 1;
	manifest: {
		format: "render-history";
		version: 1;
		authorityEpoch: string;
		cutoff: number;
		scope: HistoryScope;
		complete: boolean;
		missing: Missing[];
		redactions: string[];
		omittedKinds: string[];
		exclusions: string[];
		recordCount: number;
		externalRefs: string[];
	};
	jsonl: string;
	text: string;
	content: Record<string, string>;
};

export function refusal(code: string, reason: string): LedgerRefusal {
	return { status: "refused", code, reason };
}

export function selectHistory(
	query: HistoryQuery,
	options: {
		epoch: string;
		owner: string;
		receiptView: "admin" | "device";
		key: string;
		sequence: number;
		workflows: string[];
		global: boolean;
	},
): { state: HistoryState; limit: number } | LedgerRefusal {
	if (query.version !== undefined && query.version !== "1") return refusal("unsupported_version", "History protocol supports version 1.");
	if (Object.keys(query).some((k) => !["version", "workflow", "proposal", "assignment", "kind", "outcome", "cursor", "limit"].includes(k)))
		return refusal("invalid_query", "Unknown history selector.");
	if (query.proposal !== undefined || query.assignment !== undefined || query.outcome !== undefined)
		return refusal("capability_unavailable", "Proposal/assignment and classified outcome history are not available yet.");
	const limit = query.limit === undefined ? 100 : Number(query.limit);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500)
		return refusal("invalid_query", "History page limit must be an integer from 1 to 500.");
	if (query.kind !== undefined && !KINDS.includes(query.kind))
		return refusal("capability_unavailable", "This record kind is not available yet.");
	let state: HistoryState;
	if (query.cursor !== undefined) {
		try {
			const [body, signature, extra] = query.cursor.split(".");
			if (!body || !signature || extra !== undefined) throw new Error("cursor framing");
			const expected = createHmac("sha256", options.key).update(body).digest();
			const actual = Buffer.from(signature, "base64url");
			if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("cursor signature");
			state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HistoryState;
			if (
				state.epoch !== options.epoch ||
				state.owner !== options.owner ||
				state.receiptView !== options.receiptView ||
				!Number.isSafeInteger(state.cutoff) ||
				state.cutoff < 0 ||
				state.cutoff > options.sequence ||
				!Number.isSafeInteger(state.offset) ||
				state.offset < 0 ||
				!Array.isArray(state.scope.workflows) ||
				!Array.isArray(state.scope.kinds)
			)
				throw new Error("cursor state");
			if (state.scope.workflows.some((w) => !options.workflows.includes(w)) || (state.scope.global && !options.global))
				throw new Error("cursor scope");
			if (
				query.workflow !== undefined &&
				(state.scope.workflows.length !== 1 || state.scope.workflows[0] !== query.workflow || state.scope.global)
			)
				throw new Error("changed workflow");
			if (query.kind !== undefined && (state.scope.kinds.length !== 1 || state.scope.kinds[0] !== query.kind))
				throw new Error("changed kind");
		} catch {
			return refusal("invalid_cursor", "The history cursor is invalid for this authority, caller or selection; start a new traversal.");
		}
	} else {
		if (query.workflow !== undefined && !options.workflows.includes(query.workflow))
			return refusal("unauthorized", "History scope is not authorized or does not exist.");
		state = {
			epoch: options.epoch,
			owner: options.owner,
			receiptView: options.receiptView,
			cutoff: options.sequence,
			offset: 0,
			scope: {
				workflows: query.workflow === undefined ? [...options.workflows].sort() : [query.workflow],
				global: query.workflow === undefined && options.global,
				kinds: query.kind === undefined ? [] : [query.kind],
			},
		};
	}
	return { state, limit };
}

export function cursorFor(state: HistoryState, key: string): string {
	const body = Buffer.from(JSON.stringify(state)).toString("base64url");
	return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

export function historyPage(
	records: HistoryRecord[],
	missing: Missing[],
	redactions: string[],
	state: HistoryState,
	limit: number,
	key: string,
): HistoryPage {
	const end = Math.min(records.length, state.offset + limit);
	return {
		version: 1,
		cutoff: state.cutoff,
		scope: state.scope,
		records: records.slice(state.offset, end),
		next: end < records.length ? cursorFor({ ...state, offset: end }, key) : null,
		complete: end === records.length && missing.length === 0,
		missing,
		redactions,
		omittedKinds: UNAVAILABLE_KINDS,
		exclusions: EXCLUSIONS,
	};
}

export function exportHistory(
	records: HistoryRecord[],
	missing: Missing[],
	redactions: string[],
	state: HistoryState,
	content: Record<string, string>,
): HistoryExport {
	const included = records;
	const includedRefs = new Set(included.map((r) => r.ref));
	const bytes = Object.fromEntries(Object.entries(content).filter(([ref]) => includedRefs.has(ref)));
	return {
		version: 1,
		manifest: {
			format: "render-history",
			version: 1,
			authorityEpoch: state.epoch,
			cutoff: state.cutoff,
			scope: state.scope,
			complete: missing.length === 0,
			missing,
			redactions,
			omittedKinds: UNAVAILABLE_KINDS,
			exclusions: EXCLUSIONS,
			recordCount: included.length,
			externalRefs: [
				...new Set(
					included
						.flatMap((r) => [...r.parents, ...r.supersedes, ...Object.values(r.refs)])
						.filter(
							(ref) =>
								/^(workflow|revision|packet|fact|message|receipt):/.test(ref) &&
								!includedRefs.has(ref) &&
								!missing.some((m) => m.ref === ref),
						),
				),
			].sort(),
		},
		jsonl: included.map((r) => JSON.stringify(r)).join("\n") + (included.length ? "\n" : ""),
		text: included
			.map(
				(r) =>
					`--- ${r.ref} (${r.kind}) @${r.sequence} ---\n${bytes[r.ref] === undefined ? JSON.stringify(r) : Buffer.from(bytes[r.ref] as string, "base64").toString("utf8")}`,
			)
			.join("\n"),
		content: bytes,
	};
}
