/**
 * The calls on conversations (docs/core/host.md, "What a client must be able to do", and "Joining a running agent").
 *
 * Each is one pi-durable call or one host commit. A conversation that a workflow created is an ordinary conversation,
 * so these work on W1's designer as on the bare agent, and no workflow has code for it.
 * The event log is read with `timeline` and `history` and refused by `input`, `continue`, `stop`, and `setModel`.
 */

import type { Context } from "@earendil-works/chord/context";
import type { ConversationId, EntryRecord, SubmissionRecord } from "@earendil-works/pi-durable";
import type { DeviceId } from "../store/decision.ts";
import type { Feed } from "./feed.ts";
import type { HostState } from "./host.ts";
import type { OpenProject } from "./project.ts";
import type { Outcome } from "./refusals.ts";

/** A page, as every paging call returns it. No `next` is the end. */
export type Page<T> = { readonly items: readonly T[]; readonly next?: string };

/**
 * `create`, one commit (host.md, "How the first conversation gets its model"):
 * a workflow: check its options with `required` errors (`options_invalid`), `tx.createConversation` ownerless, then
 * `configure(tx, id, { cwd: workdir, ...entry })` where a function `entry` is called with the same `tx`.
 * a model: `{ cwd, model }` and no selection, so it follows the project default.
 * A name that is not one of the project's workflows is `not_a_workflow`. A resend makes a second conversation.
 */
export async function create(
	host: HostState,
	project: OpenProject,
	body: { readonly workflow: string } | { readonly model: string },
	context: Context,
): Promise<Outcome<{ readonly conversation: ConversationId }>> {
	void [host, project, body, context];
	throw new Error("not implemented");
}

export type ConversationState = "idle" | "running" | "failed";

/** `conversations`: `tx.scanConversations`, then `pi.live` of each. The event log is left out. */
export async function list(
	host: HostState,
	project: OpenProject,
	page: { readonly cursor?: string; readonly limit?: number },
	context: Context,
): Promise<
	Outcome<
		Page<{ readonly conversation: ConversationId; readonly owner?: ConversationId; readonly state: ConversationState }>
	>
> {
	void [host, project, page, context];
	throw new Error("not implemented");
}

/**
 * `open`: a feed of pi-durable's `ConversationView`, sent as pi-durable 1.5.2 shapes it (protocol.md, "`open`").
 * `after` starts the window at the entry after it. Nothing is replayed.
 */
export async function open(
	host: HostState,
	project: OpenProject,
	device: DeviceId,
	body: { readonly conversation: number; readonly after?: number },
	context: Context,
): Promise<Outcome<Feed>> {
	void [host, project, device, body, context];
	throw new Error("not implemented");
}

/** `timeline`: `open` on the event log. */
export async function timeline(
	host: HostState,
	project: OpenProject,
	device: DeviceId,
	body: { readonly after?: number },
	context: Context,
): Promise<Outcome<Feed>> {
	void [host, project, device, body, context];
	throw new Error("not implemented");
}

/** `history`: a page of older entries, `Conversation.entries()`. Works on the event log. */
export async function history(
	host: HostState,
	project: OpenProject,
	body: {
		readonly conversation: number;
		readonly cursor?: string;
		readonly limit?: number;
		readonly minEntryId?: number;
		readonly maxEntryId?: number;
		readonly order?: "ascending" | "descending";
	},
	context: Context,
): Promise<Outcome<Page<EntryRecord>>> {
	void [host, project, body, context];
	throw new Error("not implemented");
}

/**
 * `input`: `Conversation.submit()` with the request ID stored as `client:<device>:<requestId>` (protocol.md,
 * "A request ID belongs to one device"). `whenIdle: "reject"` on an idle conversation is `idle` and writes nothing.
 */
export async function input(
	host: HostState,
	project: OpenProject,
	device: DeviceId,
	body: {
		readonly conversation: number;
		readonly text: string;
		readonly requestId: string;
		readonly whenBusy?: "steer" | "followUp";
		readonly whenIdle?: "reject";
	},
	context: Context,
): Promise<Outcome<{ readonly submission: SubmissionRecord }>> {
	void [host, project, device, body, context];
	throw new Error("not implemented");
}

/** `continue`: `submit({ type: "continue" })`, never queued. A busy conversation is `busy`. */
export async function continueRun(
	host: HostState,
	project: OpenProject,
	device: DeviceId,
	body: { readonly conversation: number; readonly requestId: string },
	context: Context,
): Promise<Outcome<{ readonly submission: SubmissionRecord }>> {
	void [host, project, device, body, context];
	throw new Error("not implemented");
}

/**
 * `stop`: `Conversation.abort()`, done once nothing runs. A second `stop` later ends whatever runs then
 * (host.md: "A second `stop` is not harmless"). A `background` task, such as every `then` task, is left alone.
 */
export async function stop(
	host: HostState,
	project: OpenProject,
	body: { readonly conversation: number },
	context: Context,
): Promise<Outcome<Record<string, never>>> {
	void [host, project, body, context];
	throw new Error("not implemented");
}

/** `setModel`: `Conversation.configure({ model, thinkingLevel })`, from the next model request. */
export async function setModel(
	host: HostState,
	project: OpenProject,
	body: { readonly conversation: number; readonly model: string; readonly thinkingLevel?: string },
	context: Context,
): Promise<Outcome<Record<string, never>>> {
	void [host, project, body, context];
	throw new Error("not implemented");
}
