import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import {
	configure,
	defineEntry,
	defineExtension,
} from "@earendil-works/pi-durable";
import { emit } from "tau-store";
import { entry, extension, options } from "../src/index.js";
import { due, score } from "../src/tasks.js";
import { args, context, open, START, until, WEEK } from "./harness.js";

test("walk rows 1 to 15: record, due, not yet, revision, stale timer, yes and calibration", async (t) => {
	const f = await open();
	t.after(() => f.h.close(context));
	await f.call("record_forecast", args(START + 1_000));
	const [first] = await f.forecasts();
	assert.ok(first);
	assert.equal((first.data as { p: number }).p, 0.7);
	assert.match((first.data as { text: string }).text, /agent.*estimate/i);
	assert.equal(
		(await f.events()).filter((e) => e.kind === "w2.recorded").length,
		1,
	);
	const [timer] = await f.sleeping();
	assert.ok(timer);
	assert.equal(timer.background, true);
	assert.equal(f.h.wake().at, START + 1_000);
	const modelCalls = f.faux.state.callCount;
	f.clock.advance(START + 1_000);
	await f.finished(timer.id);
	const id1 = `${f.subject()}#1` as const;
	const d1 = await f.read(id1);
	assert.ok(d1);
	assert.equal(d1.basis, first.id);
	assert.equal(d1.status, "open");
	assert.deepEqual(d1.choices, ["yes", "no", "void", "not yet"]);
	assert.deepEqual(d1.then, { task: "w2.score" });
	assert.equal(f.faux.state.callCount, modelCalls);
	const continuation = await f.respond(id1, "not yet");
	f.clock.advance(START + 9_000);
	await f.finished(continuation);
	const timers = await f.sleeping();
	const retry = timers.find((row) => row.id !== timer.id);
	assert.ok(retry);
	assert.equal(
		retry.state.status === "sleeping" && retry.state.until,
		START + 1_000 + WEEK,
	);
	const t2 = START + WEEK + 20_000;
	await f.call("revise_forecast", args(t2, 0.6));
	const [, second] = await f.forecasts();
	assert.ok(second);
	assert.equal((second.data as { replaces: number }).replaces, first.id);
	await f.sleeping();
	const before = (await f.events()).length;
	const calls = f.faux.state.callCount;
	f.clock.advance(START + 1_000 + WEEK);
	await f.finished(retry.id);
	assert.equal((await f.events()).length, before);
	assert.equal(await f.read(`${f.subject()}#2`), undefined);
	assert.equal(f.faux.state.callCount, calls);
	f.clock.advance(t2);
	await until(
		() => f.read(`${f.subject()}#2`),
		(d) => d?.status === "open",
		"second decision",
	);
	const id2 = `${f.subject()}#2` as const;
	const d2 = await f.read(id2);
	assert.equal(d2?.basis, second.id);
	await f.finished(await f.respond(id2, "yes"));
	const resolved = (await f.events()).filter((e) => e.kind === "w2.resolved");
	assert.equal(resolved.length, 1);
	assert.equal((resolved[0]?.data as { forecast: number }).forecast, second.id);
	assert.equal((resolved[0]?.data as { decision: string }).decision, id2);
	assert.equal((resolved[0]?.data as { outcome: number }).outcome, 1);
	assert.ok(
		Math.abs((resolved[0]?.data as { score: number }).score - 0.16) < 1e-12,
	);
	await f.call("calibration", {});
	const transcript = JSON.stringify(
		await f.root.entries({ order: "ascending" }, 500, undefined, context),
	);
	assert.match(transcript, /1 scored forecast/);
	assert.match(transcript, /1 replaced forecast/);
	assert.deepEqual(f.reports, []);
});

test("revision withdraws an open round at once; an obsolete answer and live-timer mismatch do nothing", async (t) => {
	const f = await open();
	t.after(() => f.h.close(context));
	await f.call("record_forecast", args(START));
	const id = `${f.subject()}#1` as const;
	await until(
		() => f.read(id),
		(d) => d?.status === "open",
		"open round",
	);
	await f.call("revise_forecast", args(START + WEEK, 0.6));
	assert.equal((await f.read(id))?.status, "withdrawn");
	const [, latest] = await f.forecasts();
	assert.ok(latest);
	const before = (await f.events()).length;
	const [wrongTimer, oldScore] = await f.h.commit(async (tx) => {
		const timer = await tx.createTask(
			due,
			{ subject: f.subject(), forecast: latest.id, dueAt: START },
			{
				ownership: { kind: "conversation" },
				conversationId: f.root.id,
				background: true,
			},
		);
		const task = await tx.createTask(
			score,
			{ decision: id, choice: "yes" },
			{
				ownership: { kind: "conversation" },
				conversationId: f.root.id,
				background: true,
			},
		);
		return [timer, task] as const;
	}, context);
	await f.finished(wrongTimer);
	await f.finished(oldScore);
	assert.equal((await f.events()).length, before);
	assert.equal(await f.read(`${f.subject()}#2`), undefined);
});

for (const [choice, kind, expected] of [
	["no", "w2.resolved", 0.49],
	["void", "w2.voided", undefined],
] as const) {
	test(`${choice} settles once; a recreated score task and equal answer cannot repeat it`, async (t) => {
		const f = await open();
		t.after(() => f.h.close(context));
		await f.call("record_forecast", args(START));
		const id = `${f.subject()}#1` as const;
		await until(
			() => f.read(id),
			(d) => d?.status === "open",
			"round",
		);
		await f.finished(await f.respond(id, choice));
		const replay = await f.h.commit(
			(tx) =>
				tx.createTask(
					score,
					{ decision: id, choice },
					{
						ownership: { kind: "conversation" },
						conversationId: f.root.id,
						background: true,
					},
				),
			context,
		);
		await f.finished(replay);
		await f.finished(await f.respond(id, choice));
		const events = (await f.events()).filter((e) => e.kind === kind);
		assert.equal(events.length, 1);
		const data = events[0]?.data as { score?: number; outcome?: number };
		if (expected === undefined) {
			assert.equal(data.score, undefined);
			assert.equal(
				(await f.events()).some((e) => e.kind === "w2.resolved"),
				false,
			);
		} else {
			assert.ok(Math.abs((data.score ?? -1) - expected) < 1e-12);
			assert.equal(data.outcome, 0);
		}
		await f.call("revise_forecast", args(START + WEEK));
		assert.equal(
			(await f.forecasts()).length,
			1,
			"settled forecast cannot be revised",
		);
	});
}

test("Stop leaves background timers alive and subjects do not collide across conversations", async (t) => {
	const f = await open();
	t.after(() => f.h.close(context));
	await f.call("record_forecast", args(START + 1_000));
	await f.call("record_forecast", args(START + 1_000, 0.4, "another"));
	const other = await f.h.createConversation(
		{ ownership: { kind: "ownerless" } },
		context,
	);
	await f.h.commit(
		async (tx) => configure(tx, other.id, await entry(tx)),
		context,
	);
	await f.call("record_forecast", args(START + 1_000), other);
	await f.sleeping();
	await f.root.abort(context);
	f.clock.advance(START + 1_000);
	for (const [conversation, key] of [
		[f.root.id, "release"],
		[f.root.id, "another"],
		[other.id, "release"],
	] as const) {
		await until(
			() => f.read(`${f.subject(conversation, key)}#1`),
			(d) => d?.status === "open",
			"independent round",
		);
	}
	assert.equal(
		(await f.events()).filter((e) => e.kind === "w2.asked").length,
		3,
	);
});

test("calibration pages all project events, excludes noise, and covers other conversations", async (t) => {
	const f = await open();
	t.after(() => f.h.close(context));
	const Noise = defineEntry<{ text: string; at: number }>("test.noise");
	await f.h.commit(async (tx) => {
		for (let i = 0; i < 205; i++)
			await emit(tx, Noise, { text: "not a forecast", at: START });
	}, context);
	await f.call("record_forecast", args(START));
	await until(
		() => f.read(`${f.subject()}#1`),
		(d) => d?.status === "open",
		"round",
	);
	await f.finished(await f.respond(`${f.subject()}#1`, "yes"));
	const other = await f.h.createConversation(
		{ ownership: { kind: "ownerless" } },
		context,
	);
	await f.h.commit(
		async (tx) => configure(tx, other.id, await entry(tx)),
		context,
	);
	await f.call("record_forecast", args(START, 0.4), other);
	await until(
		() => f.read(`${f.subject(other.id)}#1`),
		(d) => d?.status === "open",
		"other round",
	);
	await f.finished(await f.respond(`${f.subject(other.id)}#1`, "no"));
	const before = (await f.events()).length;
	const transcript = JSON.stringify(await f.call("calibration", {}));
	assert.match(transcript, /2 scored forecasts/);
	assert.match(transcript, /0 replaced forecasts/);
	assert.match(transcript, /0\.125/);
	assert.equal((await f.events()).length, before);
});

test("entry reads current options, pins prose and selects exactly W2's three tools", async (t) => {
	const f = await open();
	t.after(() => f.h.close(context));
	await f.h.commit((tx) => options.set(tx, {}), context);
	await assert.rejects(
		f.h.commit((tx) => entry(tx), context),
		/Options/,
	);
	await f.h.commit(
		(tx) => options.set(tx, { model: "faux/new-model" }),
		context,
	);
	const settings = await f.h.commit((tx) => entry(tx), context);
	assert.deepEqual(settings.model, { provider: "faux", modelId: "new-model" });
	assert.deepEqual(settings.extensions, [extension]);
	assert.match(settings.instructions ?? "", /forecast/i);
	f.registry.install(defineExtension({ name: "unrelated" }));
	await f.h.commit((tx) => options.set(tx, { model: "faux/faux-1" }), context);
	f.faux.setResponses([
		(request) => {
			assert.deepEqual(
				request.messages
					.flatMap((message) =>
						message.role === "system" ? (message.toolsAdded ?? []) : [],
					)
					.map((tool) => tool.name)
					.sort(),
				["calibration", "record_forecast", "revise_forecast"],
			);
			return fauxAssistantMessage("done");
		},
	]);
	await (
		await f.root.submit({ type: "input", content: "Which tools?" }, context)
	).wait(context);
	assert.equal(f.faux.state.callCount, 1);
});

test("tool boundaries reject invalid probabilities and dates, duplicate records and missing revisions", async (t) => {
	const f = await open();
	t.after(() => f.h.close(context));
	for (const value of [
		{ ...args(START), p: 1.1 },
		{ ...args(START), p: -0.1 },
		{ ...args(START), resolveBy: "tomorrow" },
		{ ...args(START), extra: true },
	])
		await f.call("record_forecast", value);
	assert.equal((await f.forecasts()).length, 0);
	await f.call("revise_forecast", args(START));
	assert.equal((await f.forecasts()).length, 0);
	await f.call("record_forecast", args(START + WEEK));
	await f.call("record_forecast", args(START + WEEK));
	assert.equal((await f.forecasts()).length, 1);
});
