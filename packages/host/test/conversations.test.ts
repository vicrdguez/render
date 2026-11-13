import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type FauxResponseFactory,
	fauxAssistantMessage,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { gate, modules } from "./extensions.js";
import { type Running, start, until } from "./helpers.js";

type Seen = { model: string; tools: string[]; text: string };
const seen: Seen[] = [];
const record =
	(reply: ReturnType<typeof fauxAssistantMessage>): FauxResponseFactory =>
	(context, _options, _state, model) => {
		seen.push({
			model: model.id,
			tools: ((context as { tools?: { name: string }[] }).tools ?? [])
				.map((t) => t.name)
				.sort(),
			text: JSON.stringify(context),
		});
		return reply;
	};
const call = (name: string, args = {}) =>
	fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
const stopped = (_context: unknown, options?: { signal?: AbortSignal }) =>
	new Promise<never>((_, reject) =>
		options?.signal?.addEventListener("abort", () =>
			reject(new Error("stopped")),
		),
	);

async function project(s: Running, extensions: string[] = ["flow", "search"]) {
	await s.call("bind", { project: "p", workdir: "/srv/p", extensions });
	if (extensions.includes("flow"))
		await s.call("setOptions", {
			project: "p",
			extension: "flow",
			patch: { designer: "faux/b" },
		});
}
async function create(s: Running, body: object): Promise<number> {
	const reply = await s.call("create", { project: "p", ...body });
	assert.ok(reply.body.result, JSON.stringify(reply.body));
	return reply.body.result.conversation;
}
async function view(s: Running, conversation: number, name = "open") {
	const watch = s.watch(name, { project: "p", conversation });
	await watch.until((w) => w.value !== undefined, "the first frame");
	watch.close();
	return watch.value;
}
const idle = (s: Running, conversation: number) =>
	until("the conversation is idle", async () => {
		const value = await view(s, conversation);
		return value.docs["pi.live"]?.run === undefined;
	});
const send = (
	s: Running,
	conversation: number,
	text: string,
	more = {},
	as?: string,
) =>
	s.call(
		"input",
		{ project: "p", conversation, text, requestId: text, ...more },
		as,
	);

test("create makes a bare conversation in the working directory, and a workflow's from its entry", async () => {
	const s = await start({ modules });
	try {
		await s.call("bind", {
			project: "p",
			workdir: "/srv/p",
			extensions: ["flow", "search", "gone"],
		});
		const unknown = await s.call("create", {
			project: "p",
			model: "faux/none",
		});
		assert.equal(unknown.status, 409);
		assert.equal(unknown.body.refused?.code, "unknown_model");
		const bare = await create(s, { model: "faux/a" });
		assert.deepEqual((await view(s, bare)).docs["pi.agent"], {
			cwd: "/srv/p",
			model: { provider: "faux", modelId: "a" },
		});
		for (const workflow of ["search", "notes", "nothing"]) {
			const reply = await s.call("create", { project: "p", workflow });
			assert.equal(reply.body.refused?.code, "not_a_workflow", workflow);
		}
		const gone = await s.call("create", { project: "p", workflow: "gone" });
		assert.equal(gone.body.refused?.code, "extension_not_loaded");
		const early = await s.call("create", { project: "p", workflow: "flow" });
		assert.equal(early.status, 409);
		assert.equal(early.body.refused?.code, "options_invalid");
		assert.ok(
			early.body.refused?.errors.some(
				(e: { keyword: string }) => e.keyword === "required",
			),
		);
		await s.call("setOptions", {
			project: "p",
			extension: "flow",
			patch: { designer: "faux/b" },
		});
		const first = await create(s, { workflow: "flow" });
		const second = await create(s, { workflow: "flow" });
		assert.notEqual(first, second, "a resent create makes a second one");
		assert.deepEqual((await view(s, first)).docs["pi.agent"], {
			cwd: "/srv/p",
			model: { provider: "faux", modelId: "b" },
			extensions: { add: ["flow"] },
		});
	} finally {
		await s.close();
	}
});

test("the bare agent follows the project default, and an added extension reaches it from its next request", async () => {
	const Closed = defineExtension({
		name: "closed",
		tools: [
			defineTool({
				name: "show_diff",
				description: "Show the diff.",
				parameters: obj({}),
				execute: async () => ({ output: [] }),
			}),
		],
	});
	const s = await start({
		modules: {
			...modules,
			closed: { extension: Closed, entry: { extensions: [Closed] } },
		},
	});
	try {
		await project(s, ["flow", "search", "closed"]);
		const bare = await create(s, { model: "faux/a" });
		const designer = await create(s, { workflow: "flow" });
		const reviewer = await create(s, { workflow: "closed" });
		await s.call("setModel", {
			project: "p",
			conversation: reviewer,
			model: "faux/a",
		});
		const ask = async (conversation: number) => {
			s.faux.setResponses([record(fauxAssistantMessage("ok"))]);
			await send(s, conversation, `hi ${seen.length}`);
			await idle(s, conversation);
			return seen.at(-1)?.tools;
		};
		const coding = ["bash", "edit", "read", "write"];
		assert.deepEqual(await ask(bare), [...coding, "web_search"]);
		const flowTools = ["ask", "explode", "flood", "hold", "schedule"];
		assert.deepEqual(
			await ask(designer),
			[...coding, ...flowTools, "web_search"].sort(),
		);
		assert.deepEqual(await ask(reviewer), ["show_diff"]);
		await s.call("addExtensions", { project: "p", extensions: ["notes"] });
		assert.deepEqual(await ask(bare), [...coding, "note", "web_search"]);
		assert.deepEqual(await ask(reviewer), ["show_diff"]);
	} finally {
		await s.close();
	}
});

test("conversations pages each one's state, leaves out the event log, and its cursor survives a restart", async () => {
	const s = await start({ modules });
	try {
		await project(s);
		const failed = await create(s, { model: "faux/a" });
		const running = await create(s, { workflow: "flow" });
		const quiet = await create(s, { model: "faux/a" });
		s.faux.setResponses([
			fauxAssistantMessage("", { stopReason: "error", errorMessage: "no" }),
		]);
		await send(s, failed, "fail");
		await idle(s, failed);
		gate.arm();
		s.faux.setResponses([call("hold"), fauxAssistantMessage("done")]);
		await send(s, running, "hold");
		await gate.entered;
		const first = await s.call("conversations", { project: "p", limit: 2 });
		assert.equal(first.body.result.items.length, 2);
		assert.equal(typeof first.body.result.next, "string");
		const rest = await s.call("conversations", {
			project: "p",
			cursor: first.body.result.next,
		});
		assert.equal(rest.body.result.next, undefined);
		const all = [...first.body.result.items, ...rest.body.result.items];
		assert.deepEqual(
			all.map((c: { conversation: number; state: string }) => [
				c.conversation,
				c.state,
			]),
			[
				[failed, "failed"],
				[running, "running"],
				[quiet, "idle"],
			],
		);
		gate.release();
		await idle(s, running);
		const again = await s.restart();
		try {
			const after = await again.call("conversations", {
				project: "p",
				cursor: first.body.result.next,
			});
			assert.deepEqual(
				after.body.result.items.map(
					(c: { conversation: number }) => c.conversation,
				),
				[quiet],
			);
			for (const cursor of [
				"nonsense",
				Buffer.from("{}").toString("base64url"),
			]) {
				const bad = await again.call("conversations", { project: "p", cursor });
				assert.equal(bad.status, 400);
				assert.equal(bad.body.refused?.code, "bad_cursor");
			}
			const other = await again.call("history", {
				project: "p",
				conversation: quiet,
				cursor: first.body.result.next,
			});
			assert.equal(other.body.refused?.code, "bad_cursor");
		} finally {
			await again.close();
		}
	} finally {
		await s.close();
	}
});

test("input is keyed by device, refuses only-if-running when idle, and steers a working run", async () => {
	const s = await start({ modules });
	try {
		await project(s);
		const phone = await s.pair("phone");
		const bare = await create(s, { model: "faux/a" });
		s.faux.setResponses([
			fauxAssistantMessage("one"),
			fauxAssistantMessage("two"),
		]);
		const first = await send(s, bare, "r1");
		const again = await send(s, bare, "r1");
		const other = await send(s, bare, "r1", {}, phone);
		assert.equal(first.body.result.submission.requestId, "client:laptop:r1");
		assert.equal(first.body.result.submission.type, "input");
		assert.equal(
			again.body.result.submission.id,
			first.body.result.submission.id,
		);
		assert.notEqual(
			other.body.result.submission.id,
			first.body.result.submission.id,
		);
		assert.equal(other.body.result.submission.requestId, "client:phone:r1");
		await idle(s, bare);

		const count = async () =>
			(
				await s.call("history", {
					project: "p",
					conversation: bare,
					limit: 1000,
				})
			).body.result.items.length;
		const before = await count();
		const late = await send(s, bare, "late", {
			whenBusy: "steer",
			whenIdle: "reject",
		});
		assert.equal(late.status, 409);
		assert.equal(late.body.refused?.code, "idle");
		assert.equal(await count(), before);

		const designer = await create(s, { workflow: "flow" });
		gate.arm();
		seen.length = 0;
		s.faux.setResponses([
			record(call("hold")),
			record(fauxAssistantMessage("steered")),
			record(fauxAssistantMessage("followed")),
		]);
		await send(s, designer, "start");
		await gate.entered;
		await send(s, designer, "Use the existing serializer.", {
			whenBusy: "steer",
		});
		await send(s, designer, "And then this.");
		const queued = (await view(s, designer)).docs["pi.inbox"].items;
		assert.deepEqual(
			queued.map((i: { mode: string }) => i.mode),
			["steer", "followUp"],
		);
		gate.release();
		await idle(s, designer);
		assert.deepEqual(
			seen.map((r) => r.text.includes("Use the existing serializer.")),
			[false, true, true],
		);
		assert.ok(!seen[1]?.text.includes("And then this."));
	} finally {
		await s.close();
	}
});

test("continue answers a failed run and refuses a busy one, and each stop ends the run working then", async () => {
	const s = await start({ modules });
	try {
		await project(s);
		const bare = await create(s, { model: "faux/a" });
		s.faux.setResponses([
			fauxAssistantMessage("", {
				stopReason: "error",
				errorMessage: "provider said no",
			}),
			fauxAssistantMessage("Fixed."),
		]);
		await send(s, bare, "fix");
		await idle(s, bare);
		assert.equal(
			(await view(s, bare)).docs["pi.live"].runFailure.reason,
			"model_error",
		);
		const resumed = await s.call("continue", {
			project: "p",
			conversation: bare,
			requestId: "c1",
		});
		assert.equal(resumed.body.result.submission.type, "continue");
		assert.equal(resumed.body.result.submission.requestId, "client:laptop:c1");
		await idle(s, bare);
		assert.equal((await view(s, bare)).docs["pi.live"].runFailure, undefined);

		s.faux.setResponses([stopped, stopped]);
		await send(s, bare, "first");
		await until(
			"run one works",
			async () => (await view(s, bare)).docs["pi.live"].run !== undefined,
		);
		const busy = await s.call("continue", {
			project: "p",
			conversation: bare,
			requestId: "c2",
		});
		assert.equal(busy.status, 409);
		assert.equal(busy.body.refused?.code, "busy");
		assert.deepEqual(
			(await s.call("stop", { project: "p", conversation: bare })).body,
			{
				result: {},
			},
		);
		assert.equal((await view(s, bare)).docs["pi.live"].run, undefined);
		await send(s, bare, "second");
		await until(
			"run two works",
			async () => (await view(s, bare)).docs["pi.live"].run !== undefined,
		);
		await s.call("stop", { project: "p", conversation: bare });
		const items = (
			await s.call("history", { project: "p", conversation: bare, limit: 100 })
		).body.result.items;
		assert.equal(
			items.filter((e: { kind: string }) => e.kind === "pi.user").length,
			3,
		);
		assert.equal((await view(s, bare)).docs["pi.live"].run, undefined);
	} finally {
		await s.close();
	}
});

test("setModel changes the model and thinking level from the next request", async () => {
	const s = await start({ modules });
	try {
		await project(s);
		const designer = await create(s, { workflow: "flow" });
		const unknown = await s.call("setModel", {
			project: "p",
			conversation: designer,
			model: "faux/none",
		});
		assert.equal(unknown.body.refused?.code, "unknown_model");
		gate.arm();
		seen.length = 0;
		s.faux.setResponses([
			record(call("hold")),
			record(fauxAssistantMessage("done")),
		]);
		await send(s, designer, "go");
		await gate.entered;
		const set = await s.call("setModel", {
			project: "p",
			conversation: designer,
			model: "faux/c",
			thinkingLevel: "high",
		});
		assert.deepEqual(set.body, { result: {} });
		gate.release();
		await idle(s, designer);
		assert.deepEqual(
			seen.map((r) => r.model),
			["b", "c"],
		);
		const agent = (await view(s, designer)).docs["pi.agent"];
		assert.deepEqual(agent.model, { provider: "faux", modelId: "c" });
		assert.equal(agent.thinkingLevel, "high");
		assert.deepEqual(agent.extensions, { add: ["flow"] });
		const missing = await s.call("setModel", {
			project: "p",
			conversation: 999,
			model: "faux/a",
		});
		assert.equal(missing.status, 404);
		assert.equal(missing.body.refused?.code, "unknown_conversation");
	} finally {
		await s.close();
	}
});

test("the event log is read with history and timeline, and refuses every write call", async () => {
	const s = await start({ modules });
	try {
		await project(s);
		const timeline = s.watch("timeline", { project: "p" });
		await timeline.until((w) => w.value !== undefined, "the timeline");
		const log: number = timeline.value.conversation.id;
		for (const [name, body] of [
			["input", { text: "x", requestId: "r" }],
			["continue", { requestId: "r" }],
			["stop", {}],
			["setModel", { model: "faux/a" }],
		] as const) {
			const reply = await s.call(name, {
				project: "p",
				conversation: log,
				...body,
			});
			assert.equal(reply.status, 409, name);
			assert.equal(reply.body.refused?.code, "event_log", name);
		}
		const listed = await s.call("conversations", { project: "p" });
		assert.ok(
			!listed.body.result.items.some(
				(c: { conversation: number }) => c.conversation === log,
			),
		);
		const designer = await create(s, { workflow: "flow" });
		s.faux.setResponses([
			call("ask", { key: "k" }),
			fauxAssistantMessage("asked"),
		]);
		await send(s, designer, "ask");
		await timeline.until(
			(w) =>
				w.value.entries.some((e: { kind: string }) => e.kind === "flow.asked"),
			"the event",
		);
		const event = timeline.value.entries.find(
			(e: { kind: string }) => e.kind === "flow.asked",
		);
		assert.equal(event.data.text, "Asked for a review of k.");
		assert.equal(event.data.conversation, designer);
		const history = await s.call("history", {
			project: "p",
			conversation: log,
		});
		assert.deepEqual(
			history.body.result.items.map((e: { id: number }) => e.id),
			[event.id],
		);
		timeline.close();
	} finally {
		await s.close();
	}
});

test("two projects keep separate stores", async () => {
	const s = await start({ modules });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: [] });
		await s.call("bind", { project: "q", workdir: "/q", extensions: [] });
		const inP = await create(s, { model: "faux/a" });
		const inQ = (await s.call("create", { project: "q", model: "faux/a" })).body
			.result.conversation;
		assert.equal(inP, inQ, "IDs belong to one store");
		s.faux.setResponses([fauxAssistantMessage("only in p")]);
		await send(s, inP, "hello p");
		await idle(s, inP);
		const q = await s.call("history", { project: "q", conversation: inQ });
		assert.deepEqual(q.body.result.items, []);
		const p = await s.call("history", { project: "p", conversation: inP });
		assert.equal(p.body.result.items.length, 2);
	} finally {
		await s.close();
	}
});
