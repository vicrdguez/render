/**
 * Dispatch: fan out to sub-agents and join their answers. One bounded module with no knowledge of keel.
 * It imports only `tau`, `tau/durable`, `tau/schema` and `tau/chord`; a boundary test fails if it imports anything
 * under `../`. Extracting it means moving this folder into its own npm package.
 *
 * Built on pi-durable's foreground sub-agent pattern: each child is a conversation owned by the dispatching task
 * (a tool call's task, or a task such as keel's `keel.effect`). The owner's commit finds or creates the children,
 * submits each job with `requestId` `dispatch:<owner task>:<job key>`, and awaits them in memory. A rerun after a
 * crash finds the same children (`scanConversations({ ownerTaskId })` plus the child's `DispatchChild` record) and
 * the same submissions, so nothing is sent twice. Aborting the owner aborts the children.
 *
 * Children cannot dispatch, structurally: `fanOut` refuses when the owner's conversation is itself task-owned (every
 * child is), and refuses seat settings whose tools include the dispatch tool.
 */
import type { RoleSettings } from "tau";
import type {
	ConversationId,
	EntryId,
	TaskId,
	ToolRegistration,
	Tx,
} from "tau/durable";
import type { Context } from "tau/chord";

/** A named kind of child the caller may start: `explorer`, `arena_seat_1`, `judge`. */
export type Seat = string;

export type DispatchJob = {
	/** Unique within one fan-out; part of the request ID. */
	readonly key: string;
	readonly seat: Seat;
	readonly prompt: string;
	/** Working directory for the child; default: the owner conversation's. */
	readonly cwd: string | null;
};

export type JobResult = {
	readonly key: string;
	readonly seat: Seat;
	readonly conversation: ConversationId;
	readonly outcome:
		| { readonly kind: "answered"; readonly entry: EntryId; readonly text: string }
		| { readonly kind: "unanswered"; readonly reason: string };
};

/** Supplied by the host extension: which seats a caller may use and with what settings, read at use. */
export interface DispatchConfig {
	/** The tool's name; also what seat settings may never include. */
	readonly toolName: string;
	seats(tx: Tx, caller: ConversationId): Promise<Readonly<Record<Seat, RoleSettings>>>;
}

/** The structural subset shared by a tool's `api` and a task's `runtime`. */
export interface DispatchOwner {
	readonly taskId: TaskId;
	readonly conversationId: ConversationId;
	commit<T>(change: (tx: Tx) => Promise<T>, context: Context): Promise<T>;
	conversation(id: ConversationId, context: Context): Promise<
		| {
				submit(
					draft: { type: "input"; content: string; requestId: string },
					context: Context,
				): Promise<{ wait(context: Context): Promise<unknown> }>;
		  }
		| undefined
	>;
}

/** Code-facing: run jobs and join. Results are in job order. Replay-safe when the owner reruns with the same keys. */
export async function fanOut(
	owner: DispatchOwner,
	config: DispatchConfig,
	jobs: readonly DispatchJob[],
	context: Context,
): Promise<readonly JobResult[]> {
	throw new Error("not implemented");
}

/**
 * Agent-facing: a `replay: "safe"`, `callers: ["model"]` tool with parameters
 * `{ jobs: { key, seat, prompt }[] }`. Output: each answer under its key; `structuredOutput`: `JobResult[]`;
 * `details`: the child conversation IDs, so a client can open them.
 */
export function dispatchTool(config: DispatchConfig): ToolRegistration {
	throw new Error("not implemented");
}
