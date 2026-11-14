import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { requestAdmin } from "../src/index.js";
import { gate, modules } from "./extensions.js";
import { type Running, start, until } from "./helpers.js";

test("the inbox holds each project under its name, and a project bound later joins it", async () => {
	const s = await start();
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: [] });
		await s.call("bind", { project: "q", workdir: "/q", extensions: [] });
		const inbox = s.watch("inbox", {});
		await inbox.until((w) => w.value !== undefined, "the first frame");
		assert.equal(inbox.status, 200);
		assert.equal(inbox.headers["content-type"], "text/event-stream");
		assert.equal(inbox.headers["cache-control"], "no-store");
		assert.equal(inbox.headers["tau-protocol"], "1");
		assert.deepEqual(inbox.value, { p: {}, q: {} });
		await s.call("bind", { project: "r", workdir: "/r", extensions: [] });
		await inbox.until((w) => w.value.r !== undefined, "r to join");
		assert.deepEqual(inbox.value, { p: {}, q: {}, r: {} });
		assert.equal(inbox.frames, 2);
		inbox.close();
	} finally {
		gate.release();
		await s.close();
	}
});

test("a clean stop ends each stream with stopping, and a revoke ends only that device's", async () => {
	const s = await start();
	try {
		const phone = await s.pair("phone");
		const mine = s.watch("inbox", {});
		const theirs = s.watch("inbox", {}, phone);
		await mine.until((w) => w.value !== undefined);
		await theirs.until((w) => w.value !== undefined);
		await requestAdmin(s.home, { command: "revoke", device: "phone" });
		await theirs.until((w) => w.closed, "the phone's stream to close");
		assert.equal(theirs.end, "revoked");
		assert.equal(mine.end, undefined);
		await s.close();
		await mine.until((w) => w.closed, "the laptop's stream to close");
		assert.equal(mine.end, "stopping");
	} finally {
		gate.release();
		await s.close();
	}
});

test("revoking a device while its stream body is pending refuses the stream", async () => {
	const s = await start();
	const phone = await s.pair("phone");
	let status = 0;
	let body = "";
	const request = http.request(`${s.url}/v1/inbox`, {
		method: "POST",
		headers: { Authorization: `Bearer ${phone}`, "Content-Length": "2" },
	}, (response) => {
		status = response.statusCode ?? 0;
		response.setEncoding("utf8");
		response.on("data", (chunk: string) => { body += chunk; });
	});
	request.on("error", () => {});
	try {
		request.flushHeaders();
		request.write("{");
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.deepEqual(await requestAdmin(s.home, { command: "revoke", device: "phone" }), { done: true });
		request.end("}");
		await until("the stream reply", () => body.length > 0);
		assert.equal(status, 401);
		assert.equal(JSON.parse(body).refused.code, "unauthorized");
	} finally {
		request.destroy();
		await s.close();
	}
});

async function designer(s: Running): Promise<number> {
	await s.call("bind", { project: "p", workdir: "/p", extensions: ["flow"] });
	await s.call("setOptions", {
		project: "p",
		extension: "flow",
		patch: { designer: "faux/a" },
	});
	return (await s.call("create", { project: "p", workflow: "flow" })).body
		.result.conversation;
}
const toolCall = (name: string, args = {}) =>
	fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
const ops = (s: Running, conversation: number, text: string) =>
	s.call("input", { project: "p", conversation, text, requestId: text });
const idle = (s: Running, conversation: number) =>
	until("idle", async () => {
		const page = await s.call("conversations", { project: "p" });
		return page.body.result.items.every(
			(c: { conversation: number; state: string }) =>
				c.conversation !== conversation || c.state !== "running",
		);
	});

test("open sends the view, then ops that rebuild what a new watch sees first", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		const missing = s.watch("open", { project: "p", conversation: 999 });
		await missing.until((w) => w.closed, "the refusal");
		assert.equal(missing.status, 404);
		assert.equal(missing.headers["tau-protocol"], "1");
		assert.equal(missing.refused?.refused?.code, "unknown_conversation");

		const live = s.watch("open", { project: "p", conversation: d });
		await live.until((w) => w.value !== undefined);
		assert.deepEqual(Object.keys(live.value).sort(), [
			"conversation",
			"docs",
			"entries",
		]);
		s.faux.setResponses([toolCall("hold"), fauxAssistantMessage("Counted.")]);
		gate.arm();
		await ops(s, d, "Count.");
		await gate.entered;
		await ops(s, d, "Steer.");
		gate.release();
		await idle(s, d);
		await live.until(
			(w) => w.value.docs["pi.live"]?.run === undefined,
			"the run's end",
		);
		await new Promise((resolve) => setTimeout(resolve, 100));
		const fresh = s.watch("open", { project: "p", conversation: d });
		await fresh.until((w) => w.value !== undefined);
		assert.ok(live.frames > 3, `${live.frames} frames`);
		assert.deepEqual(live.value, fresh.value);
		live.close();
		fresh.close();
	} finally {
		gate.release();
		await s.close();
	}
});

test("a client that stopped reading gets folded frames, and history fills the gap that before shows", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		s.faux.setResponses([
			toolCall("flood", { count: 300, size: 16_000 }),
			fauxAssistantMessage("Done."),
		]);
		const live = s.watch("open", { project: "p", conversation: d });
		await live.until((w) => w.value !== undefined);
		live.response?.pause();
		await ops(s, d, "Flood.");
		await idle(s, d);
		const before = live.frames;
		live.response?.resume();
		const all = (
			await s.call("history", {
				project: "p",
				conversation: d,
				order: "ascending",
				limit: 1000,
			})
		).body.result.items.map((e: { id: number }) => e.id);
		await live.until((w) => w.newest === all.at(-1), "the newest entry");
		assert.ok(
			live.frames - before < 300,
			`${live.frames - before} frames for 300 commits`,
		);
		assert.ok(live.gaps.length > 0, "the window left a gap");
		for (const gap of live.gaps) {
			let cursor: string | undefined;
			do {
				const page = await s.call("history", {
					project: "p",
					conversation: d,
					...(cursor === undefined
						? { ...gap, order: "ascending" }
						: { cursor }),
					limit: 100,
				});
				for (const entry of page.body.result.items)
					live.held.set(entry.id, entry);
				cursor = page.body.result.next;
			} while (cursor !== undefined);
		}
		assert.deepEqual(
			[...live.held.keys()].sort((a, b) => a - b),
			all,
		);
		live.close();

		const resumed = s.watch("open", {
			project: "p",
			conversation: d,
			after: all.at(-2),
		});
		await resumed.until((w) => w.value !== undefined);
		assert.deepEqual(
			resumed.value.entries.map((e: { id: number }) => e.id),
			[all.at(-1)],
		);
		assert.equal(resumed.value.before, all.at(-2));
		assert.ok(resumed.value.docs["pi.agent"] !== undefined);
		resumed.close();
	} finally {
		gate.release();
		await s.close();
	}
});

test("a client that leaves ends only its watch, and the run goes on", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		const live = s.watch("open", { project: "p", conversation: d });
		await live.until((w) => w.value !== undefined);
		gate.arm();
		s.faux.setResponses([
			toolCall("hold"),
			fauxAssistantMessage("Finished alone."),
		]);
		await ops(s, d, "Work.");
		await gate.entered;
		live.close();
		gate.release();
		await idle(s, d);
		const history = await s.call("history", { project: "p", conversation: d });
		assert.ok(
			JSON.stringify(history.body.result.items).includes("Finished alone."),
		);
	} finally {
		gate.release();
		await s.close();
	}
});

test("a quiet stream gets a heartbeat every 15 seconds, and a write that does not drain in 60 seconds ends it", async (t) => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const quiet = s.watch("inbox", {});
		const tick = async (ms: number) => {
			t.mock.timers.tick(ms);
			for (let i = 0; i < 20; i++)
				await new Promise((resolve) => setImmediate(resolve));
		};
		const settle = async (test: () => boolean) => {
			for (let i = 0; i < 2000 && !test(); i++)
				await new Promise((resolve) => setImmediate(resolve));
			assert.ok(test());
		};
		await settle(() => quiet.value !== undefined);
		await tick(14_000);
		assert.equal(quiet.heartbeats, 0);
		await tick(1_000);
		await settle(() => quiet.heartbeats === 1);
		await tick(15_000);
		await settle(() => quiet.heartbeats === 2);
		quiet.close();

		const slow = s.watch("open", { project: "p", conversation: d });
		await settle(() => slow.value !== undefined);
		slow.response?.pause();
		s.faux.setResponses([
			toolCall("flood", { count: 1, size: 8_000_000 }),
			fauxAssistantMessage("Done."),
		]);
		await ops(s, d, "Flood.");
		let waited = 0;
		while (waited < 50_000) {
			const page = await s.call("history", {
				project: "p",
				conversation: d,
				limit: 1,
			});
			if (JSON.stringify(page.body.result.items).includes("Done.")) break;
			await tick(100);
			waited += 100;
		}
		await tick(59_000 - waited);
		assert.equal(slow.closed, false, "not cut before 60 seconds");
		await tick(2_000);
		slow.response?.resume();
		await settle(() => slow.closed);
		assert.equal(slow.end, undefined, "a cut sends no end frame");
	} finally {
		t.mock.timers.reset();
		await s.close();
	}
});
