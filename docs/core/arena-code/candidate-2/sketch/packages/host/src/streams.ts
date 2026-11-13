import type { ServerResponse } from "node:http";
import type { Op } from "@earendil-works/chord/delta";
import type { ConversationView, WatchHandle } from "@earendil-works/pi-durable";
import type { OpenDecisions } from "tau-store/host";

// Copied framing and values from docs/core/protocol.md, without a Chord host.
export type Inbox = Record<string, OpenDecisions>;
export type Frame =
	| { ops: readonly Op[] }
	| { end: { reason: "stopping" | "revoked" | "failed" } };
export type StreamValue = ConversationView | Inbox;
export async function pipeWatch<T extends StreamValue>(
	watch: WatchHandle<T>,
	response: ServerResponse,
	signal: AbortSignal,
): Promise<void> {
	// TODO refusal happens before SSE headers. First frame [["r", value]].
	// TODO await drain in serialized listener, not an unbounded queue; let pi fold ops.
	// TODO no drain for 60s: end; idle 15s: heartbeat; device revoke/stopping: end then close.
	// TODO response Cache-Control:no-store; data: JSON + blank line; no SSE event IDs.
	// TODO detach watches/timers on disconnect. Never stop conversation work.
	// Window: initial 50, max 100; after catches up <=100 then current docs, no replay.
	// Folded/reconnected gaps are filled by history using before, not by a server replay.
	throw new Error("not implemented");
}
