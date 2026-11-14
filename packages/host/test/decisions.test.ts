import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { modules } from "./extensions.js";
import { type Running, start, until } from "./helpers.js";

const TEXT = "Design v1: add a --json flag.";
const toolCall = (name: string, args = {}) =>
	fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });

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
async function run(
	s: Running,
	conversation: number,
	tool: string,
	args: object,
) {
	s.faux.setResponses([toolCall(tool, args), fauxAssistantMessage("Asked.")]);
	const text = `${tool} ${JSON.stringify(args)} ${Math.random()}`;
	await s.call("input", { project: "p", conversation, text, requestId: text });
	await until("the run ends", async () => {
		const page = await s.call("conversations", { project: "p" });
		return page.body.result.items.every(
			(c: { state: string }) => c.state !== "running",
		);
	});
}
const answer = (s: Running, decision: string, fields: object, as?: string) =>
	s.call(
		"answer",
		{ project: "p", decision, choice: "approve", annotations: [], ...fields },
		as,
	);

test("an open decision reaches the inbox, and answer maps every row of the store's table", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		const inbox = s.watch("inbox", {});
		await inbox.until((w) => w.value !== undefined);
		await run(s, d, "ask", { key: "k" });
		await inbox.until((w) => w.value.p["flow:k"] !== undefined, "the decision");
		const slot = inbox.value.p["flow:k"];
		assert.deepEqual(Object.keys(slot).sort(), [
			"conversation",
			"id",
			"requestedAt",
			"title",
		]);
		assert.equal(slot.id, "flow:k#1");
		assert.equal(slot.title, "Review k");
		assert.equal(slot.conversation, d);

		const shown = await s.call("decision", {
			project: "p",
			decision: "flow:k#1",
		});
		assert.equal(shown.body.result.text, TEXT);
		assert.equal(shown.body.result.decision.status, "open");
		assert.equal(shown.body.result.then, undefined);
		const basis: number = shown.body.result.decision.basis;
		const unknown = await s.call("decision", {
			project: "p",
			decision: "flow:x#1",
		});
		assert.equal(unknown.status, 404);
		assert.equal(unknown.body.refused?.code, "unknown_decision");

		for (const [fields, code] of [
			[{ basis: basis + 1 }, "stale_basis"],
			[{ basis, choice: "maybe" }, "unknown_choice"],
			[
				{ basis, annotations: [{ text: "x", range: { start: 0, end: 999 } }] },
				"bad_annotation",
			],
		] as const) {
			const refused = await answer(s, "flow:k#1", fields);
			assert.equal(refused.status, 409, code);
			assert.equal(refused.body.refused?.code, code);
		}
		for (const start of [-1, 0.5]) {
			const before = (
				await s.call("history", { project: "p", conversation: d })
			).body.result.items;
			const refused = await answer(s, "flow:k#1", {
				basis,
				annotations: [{ text: "x", range: { start, end: 1 } }],
			});
			assert.equal(refused.status, 409);
			assert.equal(refused.body.refused?.code, "bad_annotation");
			assert.deepEqual(
				(await s.call("history", { project: "p", conversation: d })).body.result
					.items,
				before,
			);
			assert.equal(
				(await s.call("decision", { project: "p", decision: "flow:k#1" })).body
					.result.decision.status,
				"open",
			);
		}
		const none = await answer(s, "flow:x#1", { basis });
		assert.equal(none.status, 404);
		assert.equal(none.body.refused?.code, "unknown_decision");

		const annotations = [
			{ text: "Use NDJSON.", range: { start: 0, end: 9 } },
			{ text: "Why?" },
		];
		const phone = await s.pair("phone");
		const first = await answer(s, "flow:k#1", { basis, annotations }, phone);
		assert.equal(first.status, 200);
		assert.equal(first.body.result.repeated, false);
		const record = first.body.result.decision;
		assert.equal(record.status, "answered");
		assert.equal(record.by, "phone");
		assert.deepEqual(record.annotations, annotations);
		await inbox.until((w) => w.value.p["flow:k"] === undefined, "the d op");
		const resent = await answer(s, "flow:k#1", { basis, annotations }, phone);
		assert.deepEqual(resent.body.result, { decision: record, repeated: true });
		const late = await answer(s, "flow:k#1", { basis, choice: "revise" });
		assert.equal(late.status, 409);
		assert.equal(late.body.refused?.code, "conflict");
		assert.equal(late.body.refused?.decision.by, "phone");

		await until("the then task ends", async () => {
			const after = await s.call("decision", {
				project: "p",
				decision: "flow:k#1",
			});
			return after.body.result.then?.status === "terminal";
		});
		const history = await s.call("history", { project: "p", conversation: d });
		assert.ok(
			history.body.result.items.some(
				(e: { kind: string; data: { text: string } }) =>
					e.kind === "flow.answered" && e.data.text === "approve",
			),
		);

		await run(s, d, "ask", { key: "k2" });
		await run(s, d, "ask", { key: "k2" });
		const old = await s.call("decision", {
			project: "p",
			decision: "flow:k2#1",
		});
		const superseded = await answer(s, "flow:k2#1", {
			basis: old.body.result.decision.basis,
		});
		assert.equal(superseded.status, 409);
		assert.equal(superseded.body.refused?.code, "not_open");
		assert.equal(superseded.body.refused?.open.id, "flow:k2#2");
		inbox.close();
	} finally {
		await s.close();
	}
});

test("faults lists each faulted task of an installed kind, with the decision whose then task it is", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		await run(s, d, "explode", {});
		await run(s, d, "ask", { key: "f", fail: true });
		const asked = await s.call("decision", {
			project: "p",
			decision: "flow:f#1",
		});
		const basis = asked.body.result.decision.basis;
		const answered = await answer(s, "flow:f#1", { basis });
		const dead = answered.body.result.decision.continuation;
		const faults = async (body = {}) =>
			(await s.call("faults", { project: "p", ...body })).body.result;
		await until("two faults", async () => (await faults()).items.length === 2);
		const page = await faults();
		assert.deepEqual(
			page.items.map((f: { kind: string; decision?: string }) => [
				f.kind,
				f.decision,
			]),
			[
				["flow.dies", "flow:f#1"],
				["flow.broken", undefined],
			],
		);
		const [dies, broken] = page.items;
		assert.equal(dies.task, dead);
		assert.equal(dies.conversation, d);
		assert.equal(dies.error, "the work after the answer failed");
		assert.equal(typeof dies.endedAt, "number");
		assert.equal(broken.error, "review_start cannot go on");
		assert.equal(page.next, undefined);

		const shown = await s.call("decision", {
			project: "p",
			decision: "flow:f#1",
		});
		assert.equal(shown.body.result.then.outcome.status, "faulted");
		const again = await answer(s, "flow:f#1", { basis });
		assert.equal(again.body.result.repeated, true);
		assert.notEqual(again.body.result.decision.continuation, dead);
		await until(
			"three faults",
			async () => (await faults()).items.length === 3,
		);
		const now = await faults();
		assert.deepEqual(
			now.items.map((f: { decision?: string }) => f.decision),
			["flow:f#1", undefined, undefined],
			"only the current continuation names the decision",
		);

		const one = await faults({ limit: 1 });
		assert.equal(one.items.length, 1);
		const restarted = await s.restart();
		try {
			const rest = (
				await restarted.call("faults", {
					project: "p",
					cursor: one.next,
					limit: 5,
				})
			).body.result;
			assert.deepEqual(
				rest.items.map((f: { task: number }) => f.task),
				now.items.slice(1).map((f: { task: number }) => f.task),
			);
			assert.equal(rest.next, undefined);
			const wrong = await restarted.call("conversations", {
				project: "p",
				cursor: one.next,
			});
			assert.equal(wrong.body.refused?.code, "bad_cursor");
		} finally {
			await restarted.close();
		}

		const without = await s.restart({ modules: {} });
		try {
			assert.deepEqual(
				(await without.call("projects", {})).body.result.items[0].missing,
				["flow"],
			);
			assert.deepEqual(
				(await without.call("faults", { project: "p" })).body.result.items,
				[],
			);
			await without.call("bind", {
				project: "q",
				workdir: "/q",
				extensions: [],
			});
		} finally {
			await without.close();
		}
	} finally {
		await s.close();
	}
});

test("fault pagination stays anchored when a new fault arrives between pages and across restart", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		await run(s, d, "explode", {});
		await run(s, d, "explode", {});
		const faults = async () =>
			(await s.call("faults", { project: "p" })).body.result.items;
		await until("two faults", async () => (await faults()).length === 2);
		const original = await faults();
		const first = (await s.call("faults", { project: "p", limit: 1 })).body
			.result;
		assert.equal(first.items[0].task, original[0].task);
		await run(s, d, "explode", {});
		await until("a new fault", async () => (await faults()).length === 3);
		const again = await s.restart();
		try {
			const rest = (
				await again.call("faults", {
					project: "p",
					cursor: first.next,
					limit: 5,
				})
			).body.result;
			assert.deepEqual(
				rest.items.map((f: { task: number }) => f.task),
				[original[1].task],
			);
			assert.equal(rest.next, undefined);
		} finally {
			await again.close();
		}
	} finally {
		await s.close();
	}
});

test("answer refuses with extension_not_loaded when the server lacks the then task", async () => {
	const s = await start({ modules });
	try {
		const d = await designer(s);
		await run(s, d, "ask", { key: "k" });
		const shown = await s.call("decision", {
			project: "p",
			decision: "flow:k#1",
		});
		const without = await s.restart({ modules: {} });
		try {
			const refused = await answer(without, "flow:k#1", {
				basis: shown.body.result.decision.basis,
			});
			assert.equal(refused.status, 409);
			assert.equal(refused.body.refused?.code, "extension_not_loaded");
			const inbox = without.watch("inbox", {});
			await inbox.until((w) => w.value !== undefined);
			assert.equal(inbox.value.p["flow:k"].id, "flow:k#1");
			inbox.close();
		} finally {
			await without.close();
		}
	} finally {
		await s.close();
	}
});
