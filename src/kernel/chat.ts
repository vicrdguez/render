// Human chat with a workflow's coordinator (usable-host Piece 6). Humans post, withdraw and interrupt; the host
// records what it delivered to the coordinator's runtime conversation. No command here touches role tasks.
import * as Effect from "effect/Effect";
import type { Decision, KernelState, Refusal, RefusalCode, VerifiedFacts } from "./kernel.ts";
import { isChatCoordinator, type RoleAssignment } from "./roles.ts";

export type WhenBusy = "steer" | "followUp";
export type WithdrawalOutcome = "aborted" | "already_placed" | "settled" | "not_found";
export type CoordinatorMessage = {
	commandId: string;
	/** null for the local admin. */
	device: string | null;
	whenBusy: WhenBusy;
	sequence: number;
	/** Also retained as the Ledger message record, with digest and length. */
	text: string;
	submission: { id: number; assignment: string; generation: number } | null;
	withdrawal: { outcome: WithdrawalOutcome | "requested"; sequence: number } | null;
};
export type Chat = {
	messages: CoordinatorMessage[];
	interrupts: { requested: number; handled: number };
};
export type ChatCommand =
	| { readonly type: "postCoordinatorMessage"; readonly workflow: string; readonly text: string; readonly whenBusy: WhenBusy }
	/** `message` is the original post's command ID. */
	| { readonly type: "withdrawCoordinatorMessage"; readonly workflow: string; readonly message: string }
	| { readonly type: "interruptCoordinator"; readonly workflow: string }
	| {
			readonly type: "recordMessageSubmission";
			readonly workflow: string;
			readonly message: string;
			readonly assignment: string;
			readonly generation: number;
			readonly submission: number;
	  }
	| { readonly type: "recordMessageWithdrawal"; readonly workflow: string; readonly message: string; readonly outcome: WithdrawalOutcome }
	| { readonly type: "recordInterrupt"; readonly workflow: string; readonly interrupt: number };
export const CHAT_COMMANDS: readonly string[] = [
	"postCoordinatorMessage",
	"withdrawCoordinatorMessage",
	"interruptCoordinator",
	"recordMessageSubmission",
	"recordMessageWithdrawal",
	"recordInterrupt",
];
export const WITHDRAWAL_OUTCOMES: readonly WithdrawalOutcome[] = ["aborted", "already_placed", "settled", "not_found"];

/** A message that has not left Ledger's hands: accepted and unsubmitted, or awaiting its withdrawal's outcome. */
export type InboxEntry = { readonly commandId: string; readonly whenBusy: WhenBusy; readonly status: "accepted" | "queued" | "pending" };
export type CoordinatorView = {
	readonly assignment: string;
	readonly generation: number;
	readonly state: "none" | "idle" | "running" | "awaiting_capacity";
};

export function emptyChat(): Chat {
	return { messages: [], interrupts: { requested: 0, handled: 0 } };
}

/** The workflow's current chat coordinator: the newest open top-level coordinator. */
export function chatCoordinator(assignments: readonly RoleAssignment[], workflow: string): RoleAssignment | undefined {
	return assignments.findLast(
		(a) =>
			a.workflow === workflow && isChatCoordinator(a) && a.status !== "canceling" && a.status !== "canceled" && a.status !== "submitted",
	);
}

/**
 * Undelivered messages in post order: accepted and unsubmitted, awaiting a withdrawal's outcome, or submitted and still
 * waiting in the conversation's own inbox (`queued`, known only to the runtime).
 */
export function chatInbox(chat: Chat | undefined, queued: ReadonlySet<string> = new Set()): InboxEntry[] {
	return (chat?.messages ?? []).flatMap((m): InboxEntry[] => {
		const status =
			m.withdrawal?.outcome === "requested"
				? "pending"
				: m.withdrawal
					? undefined
					: m.submission === null
						? "accepted"
						: queued.has(m.commandId)
							? "queued"
							: undefined;
		return status ? [{ commandId: m.commandId, whenBusy: m.whenBusy, status }] : [];
	});
}

/**
 * Engine delivers an accepted message at once to a running coordinator, and to an idle one when it can take a slot,
 * so an idle coordinator with undelivered messages is waiting for capacity. Queued and blocked coordinators have work
 * in progress and take messages when they run.
 */
export function coordinatorView(assignments: readonly RoleAssignment[], workflow: string, chat: Chat | undefined): CoordinatorView | null {
	const a = chatCoordinator(assignments, workflow);
	if (!a) return null;
	const waiting = chatInbox(chat).some((m) => m.status === "accepted");
	return { assignment: a.id, generation: a.generation, state: a.status === "idle" ? (waiting ? "awaiting_capacity" : "idle") : "running" };
}

function refuse(code: RefusalCode, reason: string): Effect.Effect<never, Refusal> {
	return Effect.fail({ outcome: "refused", code, reason });
}

export const changeChat = Effect.fnUntraced(function* (state: KernelState, c: ChatCommand, facts: VerifiedFacts) {
	const p = facts.principal;
	if (p.kind === "human" && p.route === "device" && p.workflows !== "all" && !p.workflows.includes(c.workflow))
		return yield* refuse("forbidden_scope", `${c.workflow} is outside this device's scope.`);
	if (state.workflow === null || state.workflow.id !== c.workflow) return yield* refuse("not_found", `${c.workflow} does not exist.`);
	const chat = structuredClone(state.chat ?? emptyChat());
	const writes: Extract<Decision, { outcome: "accepted" }>["writes"][number][] = [];
	let result: Record<string, string | number> = {};
	const message = "message" in c ? chat.messages.findIndex((m) => m.commandId === c.message) : -1;
	const found = chat.messages[message];
	if ("message" in c && !found) return yield* refuse("not_found", `No coordinator message ${c.message}.`);
	switch (c.type) {
		case "postCoordinatorMessage": {
			if (!facts.ids.message || !facts.commandId) throw new Error("Ledger omitted the message identity");
			chat.messages.push({
				commandId: facts.commandId,
				device: p.kind === "human" && p.route === "device" ? p.device : null,
				whenBusy: c.whenBusy,
				sequence: facts.sequence,
				text: c.text,
				submission: null,
				withdrawal: null,
			});
			writes.push({ type: "message.append", message: facts.ids.message, workflow: c.workflow });
			result = { message: facts.ids.message };
			break;
		}
		case "withdrawCoordinatorMessage": {
			if (found!.withdrawal) return yield* refuse("stale_basis", `${c.message} is already withdrawn (${found!.withdrawal.outcome}).`);
			// Nothing reached the conversation yet, so Ledger alone completes it; otherwise Engine aborts the submission.
			const outcome = found!.submission === null ? "aborted" : "requested";
			chat.messages[message] = { ...found!, withdrawal: { outcome, sequence: facts.sequence } };
			result = { message: c.message, outcome };
			break;
		}
		case "interruptCoordinator": {
			if (!chatCoordinator(state.roleWork?.assignments ?? [], c.workflow))
				return yield* refuse("not_found", `${c.workflow} has no coordinator to interrupt.`);
			chat.interrupts = { ...chat.interrupts, requested: chat.interrupts.requested + 1 };
			result = { interrupt: chat.interrupts.requested };
			break;
		}
		case "recordMessageSubmission": {
			const a = chatCoordinator(state.roleWork?.assignments ?? [], c.workflow);
			if (!a || a.id !== c.assignment || a.generation !== c.generation)
				return yield* refuse("stale_assignment", "The submission names a coordinator that is no longer current.");
			if (found!.submission !== null) return yield* refuse("stale_basis", `${c.message} already has a submission.`);
			// A withdrawal that committed while Engine was submitting becomes a request Engine now carries out.
			const withdrawal = found!.withdrawal ? { outcome: "requested" as const, sequence: facts.sequence } : null;
			chat.messages[message] = { ...found!, submission: { id: c.submission, assignment: a.id, generation: a.generation }, withdrawal };
			result = { message: c.message };
			break;
		}
		case "recordMessageWithdrawal": {
			if (found!.withdrawal?.outcome !== "requested")
				return yield* refuse("stale_basis", `${c.message} has no withdrawal awaiting its outcome.`);
			chat.messages[message] = { ...found!, withdrawal: { outcome: c.outcome, sequence: facts.sequence } };
			result = { message: c.message, outcome: c.outcome };
			break;
		}
		case "recordInterrupt": {
			if (!Number.isSafeInteger(c.interrupt) || c.interrupt < 1 || c.interrupt > chat.interrupts.requested)
				return yield* refuse("invalid_content", "Only a requested interrupt can be handled.");
			chat.interrupts = { ...chat.interrupts, handled: Math.max(chat.interrupts.handled, c.interrupt) };
			result = { interrupt: c.interrupt };
			break;
		}
	}
	writes.push(
		{ type: "chat.replace", workflow: c.workflow, state: chat },
		{
			type: "fact.record",
			fact: facts.ids.fact,
			command: c.type,
			refs: {
				workflow: c.workflow,
				...Object.fromEntries(Object.entries(result).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
			},
		},
	);
	return { outcome: "accepted", result, writes, facts: [facts.ids.fact] } satisfies Extract<Decision, { outcome: "accepted" }>;
});
