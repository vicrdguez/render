import assert from "node:assert/strict";
import { writeSync } from "node:fs";
import type { Storage } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { score } from "../../src/tasks.js";
import { args, Clock, context, open, START, until, WEEK } from "../harness.js";

const [scenario = "", file = "", step = ""] = process.argv.slice(2);
const clock = new Clock();
if (step === "look") clock.at = START + WEEK;
const real = await openNodeSqliteStorage(file);
let armed = step !== "look";
const event =
	scenario === "record"
		? "w2.recorded"
		: scenario === "revise"
			? "w2.revised"
			: "w2.resolved";
const die = () => process.kill(process.pid, "SIGKILL");
const storage = new Proxy(real, {
	get(target, key) {
		const value = Reflect.get(target, key, target);
		if (key !== "commit" || typeof value !== "function")
			return typeof value === "function" ? value.bind(target) : value;
		return async (...params: Parameters<Storage["commit"]>) => {
			const hit =
				armed &&
				params[0].some((batch) =>
					batch.some(
						(write) => write.type === "entry" && write.value.kind === event,
					),
				);
			if (hit && scenario === "score-before") die();
			const result = await value.apply(target, params);
			if (hit) die();
			return result;
		};
	},
});
const f = await open(storage, clock);
const id = `${f.subject()}#1` as const;
if (step !== "look") {
	if (scenario === "overdue" || scenario === "stale") armed = false;
	await f.call(
		"record_forecast",
		args(scenario.startsWith("score") ? START : START + 1_000),
	);
	if (scenario.startsWith("score")) {
		await until(
			() => f.read(id),
			(d) => d?.status === "open",
			"score round",
		);
		await f.finished(await f.respond(id, "yes"));
	} else if (scenario === "revise" || scenario === "stale") {
		await f.call("revise_forecast", args(START + 2 * WEEK, 0.6));
	}
	await f.sleeping();
	die();
} else {
	f.h.resume();
	await f.root.waitForIdle(context);
	let events = await f.events();
	if (scenario.startsWith("score")) {
		await until(
			f.events,
			(rows) => rows.some((e) => e.kind === "w2.resolved"),
			"score replay",
		);
		const replay = await f.h.commit(
			(tx) =>
				tx.createTask(
					score,
					{ decision: id, choice: "yes" },
					{
						ownership: { kind: "conversation" },
						conversationId: f.root.id,
						background: true,
					},
				),
			context,
		);
		await f.finished(replay);
	} else if (scenario === "stale" || scenario === "revise") {
		const timers = await f.tasks();
		const old = timers.find(
			(row) => (row.input as { dueAt: number }).dueAt === START + 1_000,
		);
		assert.ok(old);
		await f.finished(old.id);
		assert.equal(await f.read(id), undefined);
		events = await f.events();
		assert.equal(events.filter((e) => e.kind === "w2.asked").length, 0);
		f.clock.advance(START + 2 * WEEK);
		await until(
			() => f.read(id),
			(d) => d?.status === "open",
			"new timer",
		);
	} else
		await until(
			() => f.read(id),
			(d) => d?.status === "open",
			"overdue timer",
		);
	events = await f.events();
	const forecasts = await f.forecasts();
	writeSync(
		1,
		`${JSON.stringify({ forecasts: forecasts.length, recorded: events.filter((e) => e.kind === "w2.recorded").length, revised: events.filter((e) => e.kind === "w2.revised").length, asked: events.filter((e) => e.kind === "w2.asked").length, resolved: events.filter((e) => e.kind === "w2.resolved").map((e) => e.data), modelCalls: f.faux.state.callCount, reports: f.reports, decision: await f.read(id) })}\n`,
	);
	await f.h.close(context);
}
