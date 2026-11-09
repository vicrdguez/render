// The host's mapping from pinned pi-durable agent events to Render's chat vocabulary (X7), driven by event batches
// shaped like the ones pi-durable 1.4.0 emits. Failure cases first: hidden reasoning or opaque provider fields in an
// event, a raw runtime event passed through, a nested tool call shown as the model's own, an interrupted or failed run
// reported as completed, an input attributed to the wrong run, and an overflow that leaves the client on stale state.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMapper } from "../src/host/chat.ts";

const coordinator = { assignment: "assignment:9", generation: 1, state: "idle" as const };
const idle = { type: "snapshot", entries: [], tools: [], nestedTools: [], compactions: [], inbox: [], agent: {}, usage: {} };
const human = (id: number, commandId: string) => ({
	type: "message_end",
	entry: { id, kind: "render.human", data: { device: null, commandId } },
});
const placed = (id: number, entry: number, requestId: string) => ({
	type: "submission",
	record: { id, conversationId: 4, type: "input", requestId, status: "placed", entry },
});
const settled = (id: number, status: "done" | "unanswered", reason?: string) => ({
	type: "submission",
	record: { id, conversationId: 4, type: "input", status, entry: 1, ...(status === "done" ? { answer: 2 } : { reason }) },
});
const assistant = (id: number) => ({
	type: "message_end",
	entry: {
		id,
		kind: "pi.assistant",
		model: [
			{
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "SECRET" },
					{ type: "text", text: "Hello" },
				],
				responseId: "opaque-1",
			},
		],
	},
});

function mapped(batches: unknown[][]) {
	const mapper = chatMapper("workflow:3", { coordinator, snapshot: idle as never, inputs: [], inbox: [] });
	return batches.flatMap((events) => mapper.map({ events: events as never, inbox: [] }));
}

test("a run maps to Render events: text deltas only, no reasoning, no opaque fields, no nested calls", () => {
	const frames = mapped([
		[human(5, "a"), placed(8, 5, "a"), { type: "run_start", inputs: [8] }, { type: "turn_start" }],
		[
			{
				type: "message_update",
				usage: {},
				changes: [
					{ type: "thinking_start", contentIndex: 0, block: { type: "thinking", thinking: "" } },
					{ type: "thinking_delta", contentIndex: 0, delta: "SECRET" },
					{ type: "text_start", contentIndex: 1, block: { type: "text", text: "" } },
					{ type: "text_delta", contentIndex: 1, delta: "Hel" },
					{ type: "text_delta", contentIndex: 1, delta: "lo" },
					{ type: "toolcall_start", contentIndex: 2, block: { type: "toolCall", id: "t1", name: "read_artifact", arguments: {} } },
					{ type: "toolcall_delta", contentIndex: 2, path: ["ref"], delta: "revision:4" },
				],
			},
		],
		[assistant(9), { type: "usage_changed", usage: {} }],
		[{ type: "tool_execution_start", toolCallId: "t1", toolName: "read_artifact", args: { ref: "revision:4" } }],
		[{ type: "tool_execution_start", toolCallId: "t1/k", toolName: "inner", args: {}, parentToolCallId: "t1" }],
		[{ type: "tool_execution_update", toolCallId: "t1", toolName: "read_artifact", output: { append: "partial" } }],
		[{ type: "tool_execution_end", toolCallId: "t1/k", toolName: "inner", parentToolCallId: "t1" }],
		[
			{
				type: "tool_execution_end",
				toolCallId: "t1",
				toolName: "read_artifact",
				entry: {
					id: 10,
					kind: "pi.tool-result",
					model: [{ role: "toolResult", isError: true, content: [{ type: "text", text: "x".repeat(1000) }] }],
				},
			},
			{ type: "turn_end" },
			{ type: "future_event_type", secret: "SECRET" },
		],
		[{ type: "run_end", inputs: [8] }, settled(8, "done")],
	]);
	assert.ok(frames.every((f) => f.kind === "chat-events" && f.version === 1 && f.workflow === "workflow:3"));
	const events = frames.flatMap((f) => (f.kind === "chat-events" ? f.events : []));
	assert.deepEqual(events.slice(0, 5), [
		{ type: "run_start", run: "8", inputs: ["a"] },
		{ type: "input_placed", run: "8", commandId: "a", whenBusy: "prompt" },
		{ type: "turn_start", run: "8", turn: 1 },
		{ type: "text_delta", run: "8", turn: 1, message: "8:1", delta: "Hel" },
		{ type: "text_delta", run: "8", turn: 1, message: "8:1", delta: "lo" },
	]);
	assert.deepEqual(events.slice(5), [
		{ type: "message_end", run: "8", turn: 1, message: "8:1", role: "assistant" },
		{ type: "tool_start", run: "8", turn: 1, call: "t1", tool: "read_artifact", summary: '{"ref":"revision:4"}' },
		{ type: "tool_end", run: "8", turn: 1, call: "t1", outcome: "error", summary: `${"x".repeat(239)}…` },
		{ type: "turn_end", run: "8", turn: 1 },
		{ type: "run_end", run: "8", outcome: "completed" },
	]);
	const wire = JSON.stringify(frames);
	for (const leak of ["SECRET", "opaque-1", "thinking", "inner", "partial", "future_event_type"])
		assert.equal(wire.includes(leak), false, leak);
});

test("run outcomes come from the inputs' settlement: aborted is interrupted, another unanswered reason is failed", () => {
	const ends = (status: "done" | "unanswered", reason?: string) =>
		mapped([
			[human(5, "a"), placed(8, 5, "a"), { type: "run_start", inputs: [8] }],
			[{ type: "run_end", inputs: [8] }, settled(8, status, reason)],
		])
			.flatMap((f) => (f.kind === "chat-events" ? f.events : []))
			.find((e) => e.type === "run_end");
	assert.deepEqual(ends("unanswered", "aborted"), { type: "run_end", run: "8", outcome: "interrupted" });
	assert.deepEqual(ends("unanswered", "Role turn budget exhausted."), {
		type: "run_end",
		run: "8",
		outcome: "failed",
		reason: "Role turn budget exhausted.",
	});
});

test("an input placed after its run ended is attributed to the run it starts, with the mode it was queued with", () => {
	const events = mapped([
		[human(5, "a"), placed(8, 5, "a"), { type: "run_start", inputs: [8] }, { type: "turn_start" }],
		[{ type: "inbox_update", items: [{ id: 11, mode: "steer" }] }],
		[
			assistant(9),
			human(12, "late"),
			{ type: "turn_end" },
			{ type: "run_end", inputs: [8] },
			settled(8, "done"),
			placed(11, 12, "late"),
			{ type: "inbox_update", items: [] },
			{ type: "run_start", inputs: [11] },
			{ type: "turn_start" },
		],
	])
		.flatMap((f) => (f.kind === "chat-events" ? f.events : []))
		.filter((e) => ["run_start", "run_end", "input_placed", "turn_start"].includes(e.type));
	assert.deepEqual(events, [
		{ type: "run_start", run: "8", inputs: ["a"] },
		{ type: "input_placed", run: "8", commandId: "a", whenBusy: "prompt" },
		{ type: "turn_start", run: "8", turn: 1 },
		{ type: "run_end", run: "8", outcome: "completed" },
		{ type: "run_start", run: "11", inputs: ["late"] },
		{ type: "input_placed", run: "11", commandId: "late", whenBusy: "steer" },
		{ type: "turn_start", run: "11", turn: 1 },
	]);
});

test("a host input such as a role packet is not reported as a human command", () => {
	const events = mapped([
		[
			{ type: "message_end", entry: { id: 5, kind: "pi.user", model: [{ role: "user", content: "{packet}" }] } },
			{
				type: "submission",
				record: { id: 8, conversationId: 4, type: "input", requestId: "role:attempt:1:0", status: "placed", entry: 5 },
			},
			{ type: "run_start", inputs: [8] },
		],
	]).flatMap((f) => (f.kind === "chat-events" ? f.events : []));
	assert.deepEqual(events, [{ type: "run_start", run: "8", inputs: [] }]);
});

test("an overflow snapshot replaces the client's state with a fresh chat snapshot naming the live run", () => {
	const mapper = chatMapper("workflow:3", { coordinator, snapshot: idle as never, inputs: [], inbox: [] });
	const frames = mapper.map({
		events: [
			{
				...idle,
				run: { inputs: [8] },
				generation: { attempt: 1 },
				entries: [
					{ id: 5, kind: "render.human", data: { device: "device:4", commandId: "a" } },
					{ id: 6, kind: "pi.assistant" },
					{ id: 7, kind: "pi.tool-result" },
				],
			},
		] as never,
		inbox: [{ commandId: "b", whenBusy: "steer", status: "queued" }],
	});
	assert.deepEqual(frames, [
		{
			version: 1,
			kind: "chat-snapshot",
			workflow: "workflow:3",
			coordinator: { ...coordinator, state: "running" },
			run: { run: "8", inputs: [], turn: 2 },
			inbox: [{ commandId: "b", whenBusy: "steer", status: "queued" }],
		},
	]);
});

test("inbox frames list undelivered messages and report each departure once as placed or withdrawn", () => {
	const mapper = chatMapper("workflow:3", {
		coordinator,
		snapshot: idle as never,
		inputs: [],
		inbox: [
			{ commandId: "a", whenBusy: "steer", status: "queued" },
			{ commandId: "b", whenBusy: "followUp", status: "queued" },
		],
	});
	assert.deepEqual(mapper.snapshot.inbox, [
		{ commandId: "a", whenBusy: "steer", status: "queued" },
		{ commandId: "b", whenBusy: "followUp", status: "queued" },
	]);
	const frames = mapper.map({
		events: [human(12, "a"), placed(11, 12, "a")] as never,
		inbox: [{ commandId: "c", whenBusy: "followUp", status: "accepted" }],
	});
	assert.deepEqual(
		frames.filter((f) => f.kind === "chat-inbox"),
		[
			{
				version: 1,
				kind: "chat-inbox",
				workflow: "workflow:3",
				items: [
					{ commandId: "c", whenBusy: "followUp", status: "accepted" },
					{ commandId: "a", whenBusy: "steer", status: "placed" },
					{ commandId: "b", whenBusy: "followUp", status: "withdrawn" },
				],
			},
		],
	);
	assert.deepEqual(mapper.map({ events: [], inbox: [{ commandId: "c", whenBusy: "followUp", status: "accepted" }] }), []);
});
