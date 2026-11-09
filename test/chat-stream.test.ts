// The live chat stream over the host transport: Render's own frames and event vocabulary, scoped by Ledger.
// Failure cases first: a stream that outlives revocation, a device that reads another workflow's chat, a frame that
// carries hidden reasoning or opaque provider fields, run and placement events that misstate where an input went,
// and a closed stream that stops the coordinator's run.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { deviceServer } from "../src/host/transport.ts";
import { chatFixture, device, held, until, WORKFLOW } from "./support/chat.ts";
import { admin } from "./support/roles.ts";

type Frame = { version: number; kind: string; [key: string]: unknown };
type Event = { type: string; [key: string]: unknown };

async function serve(f: Awaited<ReturnType<typeof chatFixture>>) {
	const server: Server = deviceServer({ ledger: f.ledger, engine: f.engine }, f.principals);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		close: () =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	};
}

async function open(url: string, bearer: string | undefined, workflow = WORKFLOW) {
	const controller = new AbortController();
	const res = await fetch(`${url}/v1/workflows/${encodeURIComponent(workflow)}/chat?version=1`, {
		headers: bearer === undefined ? {} : { authorization: `Bearer ${bearer}` },
		signal: controller.signal,
	});
	const frames: Frame[] = [];
	const ended = (async () => {
		if (!res.ok || !res.body) return;
		let buffer = "";
		try {
			for await (const chunk of res.body) {
				buffer += Buffer.from(chunk).toString("utf8");
				for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
					frames.push(JSON.parse(buffer.slice(0, i)) as Frame);
					buffer = buffer.slice(i + 1);
				}
			}
		} catch {}
	})();
	return {
		status: res.status,
		body: res.ok ? undefined : ((await res.json()) as Record<string, unknown>),
		frames,
		ended,
		events: () => frames.filter((f) => f.kind === "chat-events").flatMap((f) => f.events as Event[]),
		close: () => controller.abort(),
	};
}

const idle = (f: Awaited<ReturnType<typeof chatFixture>>) =>
	until(() => (f.current().status === "idle" && !f.current().executing) || undefined, "an idle coordinator");

test("chat frames: a snapshot, then one run in Render's vocabulary with no hidden reasoning or opaque provider fields", async () => {
	const f = await chatFixture();
	const host = await serve(f);
	try {
		await idle(f);
		const laptop = await device(f);
		const chat = await open(host.url, laptop.bearer);
		assert.equal(chat.status, 200);
		const snapshot = await until(() => chat.frames[0], "the chat snapshot");
		assert.deepEqual(snapshot, {
			version: 1,
			kind: "chat-snapshot",
			workflow: WORKFLOW,
			coordinator: { assignment: f.coordinator, generation: f.current().generation, state: "idle" },
			run: null,
			inbox: [],
		});
		f.chat.reply(
			f.coordinator,
			() =>
				fauxAssistantMessage(
					[fauxThinking("SECRET-THOUGHT"), fauxText("Let me look."), fauxToolCall("read_artifact", { ref: "revision:4" })],
					{
						stopReason: "toolUse",
						responseId: "opaque-response-17",
					},
				),
			() => fauxAssistantMessage("All done."),
		);
		await f.post("Go.", "followUp", "s-go", laptop.context);
		await until(() => chat.events().some((e) => e.type === "run_end") || undefined, "the run's end");
		const events = chat.events();
		const run = String(events[0]?.run);
		const shape = events.filter((e) => e.type !== "text_delta").map((e) => (e.call ? { ...e, call: "c" } : e));
		assert.deepEqual(shape, [
			{ type: "run_start", run, inputs: ["s-go"] },
			{ type: "input_placed", run, commandId: "s-go", whenBusy: "prompt" },
			{ type: "turn_start", run, turn: 1 },
			{ type: "message_end", run, turn: 1, message: `${run}:1`, role: "assistant" },
			{ type: "tool_start", run, turn: 1, call: "c", tool: "read_artifact", summary: '{"ref":"revision:4"}' },
			{ type: "tool_end", run, turn: 1, call: "c", outcome: "ok", summary: (events.find((e) => e.type === "tool_end") as Event).summary },
			{ type: "turn_end", run, turn: 1 },
			{ type: "turn_start", run, turn: 2 },
			{ type: "message_end", run, turn: 2, message: `${run}:2`, role: "assistant" },
			{ type: "turn_end", run, turn: 2 },
			{ type: "run_end", run, outcome: "completed" },
		]);
		// A fast provider may commit the whole message before any partial: deltas, when present, are its prefix.
		for (const [turn, full] of [
			[1, "Let me look."],
			[2, "All done."],
		] as const) {
			const deltas = events.filter((e) => e.type === "text_delta" && e.turn === turn);
			assert.ok(deltas.every((e) => e.message === `${run}:${turn}`));
			assert.ok(full.startsWith(deltas.map((e) => e.delta).join("")));
		}
		const wire = JSON.stringify(chat.frames);
		assert.equal(wire.includes("SECRET-THOUGHT"), false, "hidden reasoning never reaches a frame");
		assert.equal(wire.includes("thinking"), false);
		assert.equal(wire.includes("opaque-response-17"), false, "opaque provider fields never reach a frame");
		assert.ok(String((events.find((e) => e.type === "tool_end") as Event).summary).length <= 240);
		chat.close();
	} finally {
		await host.close();
		await f.close();
	}
});

test("placement events say which run an input entered: a steer joins the run, a follow-up starts the next", async () => {
	const f = await chatFixture();
	const host = await serve(f);
	try {
		await idle(f);
		const laptop = await device(f);
		const chat = await open(host.url, laptop.bearer);
		const first = held(() => fauxAssistantMessage(fauxToolCall("read_artifact", { ref: "revision:4" }), { stopReason: "toolUse" }));
		f.chat.reply(
			f.coordinator,
			first,
			() => fauxAssistantMessage("Steered."),
			() => fauxAssistantMessage("Followed."),
		);
		await f.post("Start.", "followUp", "p-start", laptop.context);
		await first.reached;
		await f.post("Steer.", "steer", "p-steer", laptop.context);
		await f.post("Follow.", "followUp", "p-follow", laptop.context);
		await until(
			() =>
				chat.frames.some(
					(fr) =>
						fr.kind === "chat-inbox" &&
						(fr.items as { commandId: string; status: string }[]).filter((i) => i.status === "queued").length === 2,
				) || undefined,
			"both inputs queued in the inbox frame",
		);
		first.release();
		await until(() => chat.events().filter((e) => e.type === "run_end").length === 2 || undefined, "two runs");
		const events = chat.events().filter((e) => ["run_start", "run_end", "input_placed"].includes(e.type));
		const [one, two] = events.filter((e) => e.type === "run_start").map((e) => String(e.run));
		assert.deepEqual(events, [
			{ type: "run_start", run: one, inputs: ["p-start"] },
			{ type: "input_placed", run: one, commandId: "p-start", whenBusy: "prompt" },
			{ type: "input_placed", run: one, commandId: "p-steer", whenBusy: "steer" },
			{ type: "run_end", run: one, outcome: "completed" },
			{ type: "run_start", run: two, inputs: ["p-follow"] },
			{ type: "input_placed", run: two, commandId: "p-follow", whenBusy: "followUp" },
			{ type: "run_end", run: two, outcome: "completed" },
		]);
		const inbox = chat.frames.filter((fr) => fr.kind === "chat-inbox").flatMap((fr) => fr.items as { commandId: string; status: string }[]);
		assert.ok(inbox.some((i) => i.commandId === "p-steer" && i.status === "placed"));
		assert.ok(inbox.some((i) => i.commandId === "p-follow" && i.status === "placed"));
		chat.close();
	} finally {
		await host.close();
		await f.close();
	}
});

test("a withdrawn message leaves the inbox as withdrawn; an interrupt ends the run as interrupted", async () => {
	const f = await chatFixture();
	const host = await serve(f);
	try {
		await idle(f);
		const laptop = await device(f);
		const chat = await open(host.url, laptop.bearer);
		const running = held(() => fauxAssistantMessage("never"));
		f.chat.reply(f.coordinator, running);
		await f.post("Long.", "followUp", "w-start", laptop.context);
		await running.reached;
		await f.post("Drop me.", "followUp", "w-queued", laptop.context);
		await until(
			() =>
				chat.frames.some(
					(fr) =>
						fr.kind === "chat-inbox" &&
						(fr.items as { commandId: string; status: string }[]).some((i) => i.commandId === "w-queued" && i.status === "queued"),
				) || undefined,
			"the queued item",
		);
		await f.withdraw("w-queued", "w-withdraw");
		await until(
			() =>
				chat.frames.some(
					(fr) =>
						fr.kind === "chat-inbox" &&
						(fr.items as { commandId: string; status: string }[]).some((i) => i.commandId === "w-queued" && i.status === "withdrawn"),
				) || undefined,
			"the withdrawn item",
		);
		await f.interrupt("w-interrupt");
		const end = await until(() => chat.events().find((e) => e.type === "run_end"), "the interrupted run's end");
		assert.equal(end.outcome, "interrupted");
		chat.close();
	} finally {
		await host.close();
		await f.close();
	}
});

test("C9 the chat stream is scoped by Ledger: another workflow is not found, a revoked device's stream ends", async () => {
	const f = await chatFixture();
	const host = await serve(f);
	try {
		await idle(f);
		const narrow = await device(f, ["workflow:999"]);
		const outside = await open(host.url, narrow.bearer);
		assert.equal(outside.status, 404);
		assert.equal(outside.body?.code, "not_found");
		assert.equal((await open(host.url, undefined)).status, 401);
		const laptop = await device(f);
		const chat = await open(host.url, laptop.bearer);
		assert.equal(chat.status, 200);
		await until(() => chat.frames[0], "the snapshot");
		const revoked = await Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "revoke",
					command: { type: "revokeDevice", device: laptop.id },
				},
				admin,
			),
		);
		assert.equal(revoked.status, "accepted");
		await chat.ended;
		assert.deepEqual(chat.frames.at(-1), { version: 1, kind: "end", reason: "credential_revoked" });
	} finally {
		await host.close();
		await f.close();
	}
});

test("closing the chat stream never stops the coordinator's run", async () => {
	const f = await chatFixture();
	const host = await serve(f);
	try {
		await idle(f);
		const laptop = await device(f);
		const chat = await open(host.url, laptop.bearer);
		const running = held(() => fauxAssistantMessage("Finished without a viewer."));
		f.chat.reply(f.coordinator, running);
		await f.post("Work.", "followUp", "close-start", laptop.context);
		await running.reached;
		chat.close();
		await chat.ended;
		running.release();
		await until(async () => JSON.stringify(await f.transcript()).includes("Finished without a viewer."), "the run's reply");
	} finally {
		await host.close();
		await f.close();
	}
});
