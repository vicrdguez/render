// Ledger-owned records in the Durable SQLite store. Immutable bytes and facts are Durable entries; current
// pointers, receipts and credentials are session documents committed in the same transaction.
import { defineDoc, defineDocFamily, defineEntry } from "@earendil-works/pi-durable";
import type { MediaType, Persistence } from "../kernel/kernel.ts";

/** SQLite `application_id` identifying a Render store ("REND"). */
export const APPLICATION_ID = 0x52454e44;
/** Render store schema version, recorded as SQLite `user_version` and in the meta document. */
export const STORE_SCHEMA = 1;

const checkpointWhen = (_value: unknown, _ops: unknown, info: { deltasSinceBase: number }) => info.deltasSinceBase >= 32;

export type MetaState = {
	initialized: boolean;
	schema: number;
	human: string;
	authorityEpoch: string;
	executorEpoch: string;
	sequence: number;
	/** Conversation holding facts that belong to no workflow. */
	ledgerConversation: number;
	workflows: string[];
	devices: string[];
	startups: { executorEpoch: string; sequence: number; persistence: Persistence }[];
};

export const Meta = defineDoc<MetaState>({
	kind: "render.meta",
	version: 1,
	scope: "session",
	initial: () => ({
		initialized: false,
		schema: STORE_SCHEMA,
		human: "human:owner",
		authorityEpoch: "",
		executorEpoch: "",
		sequence: 0,
		ledgerConversation: 0,
		workflows: [],
		devices: [],
		startups: [],
	}),
	checkpointWhen,
});

export type DocumentPointer = {
	document: string;
	kind: "ground" | "document";
	revision: string;
	entry: number;
	mediaType: MediaType;
	digest: string;
	byteLength: number;
	recordedAtSequence: number;
	revisionCount: number;
	savedBy: string | null;
};

export type WorkflowRecord =
	| { exists: false }
	| {
			exists: true;
			id: string;
			title: string;
			/** Conversation holding this workflow's immutable revision, message and fact entries. */
			conversation: number;
			createdAtSequence: number;
			documents: Record<string, DocumentPointer>;
			messageCount: number;
	  };

export const Workflow = defineDocFamily<WorkflowRecord, null>({
	family: true,
	kind: "render.workflow",
	version: 1,
	scope: "session",
	initial: () => ({ exists: false }),
	checkpointWhen,
});

export type RevisionIndex = { exists: false } | { exists: true; workflow: string; conversation: number; entry: number };

export const RevisionLocation = defineDocFamily<RevisionIndex, null>({
	family: true,
	kind: "render.revision-location",
	version: 1,
	scope: "session",
	initial: () => ({ exists: false }),
	checkpointWhen: () => true,
});

export type AcceptedBy = { principal: "human" | "host"; route: "device" | "local-admin" | "host"; device?: string };

export type ReceiptBody = {
	status: "accepted";
	commandId: string;
	receipt: string;
	sequence: number;
	authorityEpoch: string;
	workflow: string | null;
	result: Record<string, string | number | null | { workflows: "all" | string[] }>;
	facts: string[];
	acceptedBy: AcceptedBy;
};

export type ReceiptRecord = { exists: false } | { exists: true; namespace: string; fingerprint: string; body: ReceiptBody };

export const Receipt = defineDocFamily<ReceiptRecord, null>({
	family: true,
	kind: "render.receipt",
	version: 1,
	scope: "session",
	initial: () => ({ exists: false }),
	checkpointWhen: () => true,
});

export type DeviceRecord =
	| { exists: false }
	| {
			exists: true;
			device: string;
			label: string;
			human: string;
			scope: { workflows: "all" | string[] };
			/** SHA-256 of the bearer secret; the secret itself is never stored. */
			verifier: string;
			enrolledAtSequence: number;
			revokedAtSequence: number | null;
	  };

export const Device = defineDocFamily<DeviceRecord, null>({
	family: true,
	kind: "render.device",
	version: 1,
	scope: "session",
	initial: () => ({ exists: false }),
	checkpointWhen: () => true,
});

export type RevisionData = {
	schema: number;
	revision: string;
	workflow: string;
	document: string;
	kind: "ground" | "document";
	mediaType: MediaType;
	/** The exact document bytes, decoded as UTF-8 without BOM stripping. */
	text: string;
	digest: string;
	byteLength: number;
	parent: string | null;
	commandId: string;
	recordedAtSequence: number;
	createdBy: AcceptedBy;
};

export const RevisionEntry = defineEntry<RevisionData>("render.revision");

export type MessageData = {
	schema: number;
	message: string;
	workflow: string;
	text: string;
	commandId: string;
	recordedAtSequence: number;
	createdBy: AcceptedBy;
};

export const MessageEntry = defineEntry<MessageData>("render.message");

export type FactData = {
	schema: number;
	fact: string;
	sequence: number;
	command: string;
	commandId: string;
	refs: Record<string, string>;
	by: AcceptedBy;
};

export const FactEntry = defineEntry<FactData>("render.fact");
