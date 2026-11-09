// Render's live chat vocabulary and its mapping from pinned pi-durable 1.4.0 agent events (X7). Only this module knows
// the runtime's event shapes; a runtime upgrade changes this mapping, not the client protocol. Hidden reasoning,
// tool-call deltas, opaque provider fields and nested calls never leave it.
import type { AgentEvent, EntryRecord, SnapshotEvent, SubmissionRecord } from "@earendil-works/pi-durable";
import type { CoordinatorView, InboxEntry, WhenBusy } from "../kernel/chat.ts";
import type { ChatEnd } from "../ledger/ledger.ts";

export const CHAT_VERSION = 1;

export type InboxItem = {
	readonly commandId: string;
	readonly whenBusy: WhenBusy;
	readonly status: "accepted" | "queued" | "pending" | "placed" | "withdrawn";
};
/** `run` names a run by its first input; `inputs` are the human commands placed in it so far. */
export type RunState = { readonly run: string; readonly inputs: readonly string[]; readonly turn: number };
export type ChatEvent =
	| { type: "run_start"; run: string; inputs: string[] }
	| { type: "run_end"; run: string; outcome: "completed" | "interrupted" | "failed"; reason?: string }
	| { type: "turn_start"; run: string; turn: number }
	| { type: "turn_end"; run: string; turn: number }
	| { type: "input_placed"; run: string; commandId: string; whenBusy: "prompt" | "steer" | "followUp" }
	| { type: "text_delta"; run: string; turn: number; message: string; delta: string }
	| { type: "message_end"; run: string; turn: number; message: string; role: "assistant" }
	| { type: "tool_start"; run: string; turn: number; call: string; tool: string; summary: string }
	| { type: "tool_end"; run: string; turn: number; call: string; outcome: "ok" | "error" | "interrupted"; summary: string };
export type ChatFrame =
	| {
			version: 1;
			kind: "chat-snapshot";
			workflow: string;
			coordinator: CoordinatorView;
			run: RunState | null;
			inbox: InboxItem[];
	  }
	| { version: 1; kind: "chat-events"; workflow: string; events: ChatEvent[] }
	| { version: 1; kind: "chat-inbox"; workflow: string; items: InboxItem[] }
	| { version: 1; kind: "end"; reason: ChatEnd | "backlog" };

const SUMMARY_CHARS = 240;

function summary(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > SUMMARY_CHARS ? `${flat.slice(0, SUMMARY_CHARS - 1)}…` : flat;
}

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	return Array.isArray(content)
		? content.map((b: { type?: string; text?: string }) => (b.type === "text" ? (b.text ?? "") : "")).join("")
		: "";
}

function humanCommand(entry: EntryRecord): string | undefined {
	return entry.kind === "render.human" ? String((entry.data as { commandId: string }).commandId) : undefined;
}

/**
 * Maps one watch from its attachment: the initial snapshot, then each committed batch. Mapping state is per stream;
 * a reconnecting client starts from a fresh snapshot and nothing is replayed.
 */
export function chatMapper(
	workflow: string,
	start: {
		readonly coordinator: CoordinatorView;
		readonly snapshot: SnapshotEvent;
		readonly inputs: readonly SubmissionRecord[];
		readonly inbox: readonly InboxEntry[];
	},
) {
	let coordinator = start.coordinator;
	let run: string | null = null;
	let inputs: string[] = [];
	let turn = 0;
	/** Human commands by the entry they were placed as, and by their submission. */
	const humans = new Map<number, string>();
	const commands = new Map<number, string>();
	/** The mode each submission waited in, from the conversation's inbox. */
	const modes = new Map<number, WhenBusy>();
	const placed = new Set<string>();
	let inbox: readonly InboxEntry[] = start.inbox;

	const learn = (record: SubmissionRecord) => {
		const command = record.type === "input" && record.entry !== undefined ? humans.get(record.entry) : undefined;
		if (command !== undefined) commands.set(record.id, command);
		if (record.type === "input" && record.status === "placed" && command !== undefined) placed.add(command);
	};
	const items = (entries: readonly InboxEntry[]): InboxItem[] =>
		entries.map(({ commandId, whenBusy, status }) => ({ commandId, whenBusy, status }));
	const snapshotFrame = (snapshot: SnapshotEvent, records: readonly SubmissionRecord[]): Extract<ChatFrame, { kind: "chat-snapshot" }> => {
		for (const entry of snapshot.entries) {
			const command = humanCommand(entry);
			if (command !== undefined) humans.set(entry.id, command);
		}
		for (const item of snapshot.inbox) if (item.mode !== "write") modes.set(item.id, item.mode);
		for (const record of records) learn(record);
		run = snapshot.run ? String(snapshot.run.inputs[0]) : null;
		inputs = (snapshot.run?.inputs ?? []).flatMap((id) => commands.get(id) ?? []);
		const first = records.find((r) => r.id === snapshot.run?.inputs[0])?.entry;
		const from = first ?? snapshot.entries.findLast((e) => e.kind === "render.human" || e.kind === "pi.user")?.id ?? 0;
		turn = snapshot.entries.filter((e) => e.kind === "pi.assistant" && e.id > from).length + (snapshot.generation ? 1 : 0);
		coordinator = { ...coordinator, state: run ? "running" : coordinator.state === "running" ? "idle" : coordinator.state };
		return { version: 1, kind: "chat-snapshot", workflow, coordinator, run: run ? { run, inputs, turn } : null, inbox: items(inbox) };
	};
	const runEnd = (ended: readonly number[], rest: readonly AgentEvent[]): ChatEvent => {
		const settled = rest.flatMap((e) => (e.type === "submission" && ended.includes(e.record.id) ? [e.record] : []));
		const unanswered = settled.find((r) => r.status === "unanswered");
		if (!unanswered || unanswered.status !== "unanswered") return { type: "run_end", run: run!, outcome: "completed" };
		return unanswered.reason === "aborted"
			? { type: "run_end", run: run!, outcome: "interrupted" }
			: { type: "run_end", run: run!, outcome: "failed", reason: unanswered.reason };
	};

	const snapshot = snapshotFrame(start.snapshot, start.inputs);
	return {
		snapshot,
		map(update: { readonly events: readonly AgentEvent[]; readonly inbox: readonly InboxEntry[] }): ChatFrame[] {
			const frames: ChatFrame[] = [];
			let events: ChatEvent[] = [];
			const flush = () => {
				if (events.length) frames.push({ version: 1, kind: "chat-events", workflow, events });
				events = [];
			};
			const previous = inbox;
			update.events.forEach((e, i) => {
				switch (e.type) {
					case "snapshot":
						flush();
						inbox = update.inbox;
						frames.push(snapshotFrame(e, []));
						return;
					case "entry_appended":
					case "message_end": {
						const command = humanCommand(e.entry);
						if (command !== undefined) humans.set(e.entry.id, command);
						else if (e.type === "message_end" && e.entry.kind === "pi.assistant" && run)
							events.push({ type: "message_end", run, turn, message: `${run}:${turn}`, role: "assistant" });
						return;
					}
					case "inbox_update":
						for (const item of e.items) if (item.mode !== "write") modes.set(item.id, item.mode);
						return;
					case "submission": {
						learn(e.record);
						const command = commands.get(e.record.id);
						// An input placed while its run is open entered that run; one placed between runs starts the next.
						if (e.record.status === "placed" && command !== undefined && run !== null)
							events.push({ type: "input_placed", run, commandId: command, whenBusy: modes.get(e.record.id) ?? "prompt" });
						return;
					}
					case "run_start":
						run = String(e.inputs[0]);
						turn = 0;
						inputs = e.inputs.flatMap((id) => commands.get(id) ?? []);
						coordinator = { ...coordinator, state: "running" };
						events.push({ type: "run_start", run, inputs: [...inputs] });
						for (const id of e.inputs) {
							const command = commands.get(id);
							if (command !== undefined)
								events.push({ type: "input_placed", run, commandId: command, whenBusy: modes.get(id) ?? "prompt" });
						}
						return;
					case "run_end":
						if (!run) return;
						events.push(runEnd(e.inputs, update.events.slice(i + 1)));
						run = null;
						coordinator = { ...coordinator, state: "idle" };
						return;
					case "turn_start":
						if (run) events.push({ type: "turn_start", run, turn: ++turn });
						return;
					case "turn_end":
						if (run) events.push({ type: "turn_end", run, turn });
						return;
					case "message_update":
						for (const change of e.changes)
							if (change.type === "text_delta" && run)
								events.push({ type: "text_delta", run, turn, message: `${run}:${turn}`, delta: change.delta });
						return;
					case "tool_execution_start":
						if (run && e.parentToolCallId === undefined)
							events.push({
								type: "tool_start",
								run,
								turn,
								call: e.toolCallId,
								tool: e.toolName,
								summary: summary(JSON.stringify(e.args)),
							});
						return;
					case "tool_execution_end": {
						if (!run || e.parentToolCallId !== undefined) return;
						const result = e.entry?.model?.[0];
						const outcome = !e.entry ? "interrupted" : result?.role === "toolResult" && result.isError ? "error" : "ok";
						events.push({ type: "tool_end", run, turn, call: e.toolCallId, outcome, summary: summary(textOf(result?.content)) });
						return;
					}
				}
			});
			flush();
			if (frames.some((f) => f.kind === "chat-snapshot")) return frames;
			const current = new Set(update.inbox.map((m) => m.commandId));
			const departed = previous
				.filter((m) => !current.has(m.commandId))
				.map(
					(m): InboxItem => ({ commandId: m.commandId, whenBusy: m.whenBusy, status: placed.has(m.commandId) ? "placed" : "withdrawn" }),
				);
			inbox = update.inbox;
			if (departed.length || JSON.stringify(items(previous)) !== JSON.stringify(items(update.inbox)))
				frames.push({ version: 1, kind: "chat-inbox", workflow, items: [...items(update.inbox), ...departed] });
			return frames;
		},
	};
}
