import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { modules } from "../src/modules.js";
import { decision, journey, until } from "./journey.js";
import { processJourney } from "./process-journey.js";

const WEEK = 604_800_000;
const publish = (name: string, key: string, due: number, p = 0.7) =>
	fauxAssistantMessage(
		[
			fauxToolCall(name, {
				key,
				text: `Claim ${key}`,
				p,
				resolveBy: due,
				rule: "The owner observes the release.",
			}),
		],
		{ stopReason: "toolUse" },
	);

test("W2: overdue restart reaches the phone inbox, scores, defers, withdraws on revision and refuses the old answer", {
	timeout: 15_000,
}, async () => {
	let clock = Date.UTC(2026, 10, 14);
	const j = await processJourney({ now: () => clock });
	try {
		await j.ok("bind", { project: "p", workdir: j.root, extensions: ["w2"] });
		await j.ok("setOptions", {
			project: "p",
			extension: "w2",
			patch: { model: "faux/a" },
		});
		const { conversation } = await j.ok("create", {
			project: "p",
			workflow: "w2",
		});
		const send = async (
			step: ReturnType<typeof publish>,
			requestId: string,
		) => {
			j.faux.setResponses([step]);
			await j.ok("input", {
				project: "p",
				conversation,
				text: requestId,
				requestId,
			});
		};
		const timeline = await j.watch("timeline", { project: "p" }, j.phone);
		await send(publish("record_forecast", "release", clock + 1000), "record");
		await until("forecast recorded", () =>
			timeline.value.entries.some((e: any) => e.kind === "w2.recorded"),
		);
		await j.stop();
		clock += 2000;
		const calls = j.faux.state.callCount;
		await j.restart();
		assert.deepEqual(j.exits, [[null, "SIGKILL"]]);
		const inbox = await j.watch("inbox", {}, j.phone);
		const subject = `w2:${conversation}:release`;
		await until(
			"phone sees overdue decision",
			() => inbox.value.p[subject] !== undefined,
		);
		const id = inbox.value.p[subject].id;
		const shown = await decision(j, id);
		assert.match(shown.text, /Claim release/);
		const body = {
			project: "p",
			decision: id,
			basis: shown.decision.basis,
			choice: "yes",
			annotations: [],
		};
		assert.equal((await j.ok("answer", body, j.phone)).decision.by, "phone");
		await until("phone inbox clears", () => !inbox.value.p[subject]);
		const resumed = await j.watch("timeline", { project: "p" }, j.phone);
		await until("score lands", () =>
			resumed.value.entries.some((e: any) => e.kind === "w2.resolved"),
		);
		const score = resumed.value.entries.find(
			(e: any) => e.kind === "w2.resolved",
		).data;
		assert.equal(score.decision, id);
		assert.equal(score.forecast, shown.decision.basis);
		assert.equal(score.outcome, 1);
		assert.ok(Math.abs(score.score - 0.09) < 1e-12);
		assert.equal(
			j.faux.state.callCount,
			calls,
			"timer and scoring use no model",
		);
		assert.equal((await j.ok("answer", body, j.laptop)).repeated, true);

		await send(publish("record_forecast", "later", clock - 1), "later");
		const laterSubject = `w2:${conversation}:later`;
		await until("later decision", () => inbox.value.p[laterSubject]);
		const later = await decision(j, inbox.value.p[laterSubject].id);
		await j.ok(
			"answer",
			{
				project: "p",
				decision: later.decision.id,
				basis: later.decision.basis,
				choice: "not yet",
				annotations: [],
			},
			j.phone,
		);
		await until("rescheduled event", () =>
			resumed.value.entries.some((e: any) => e.kind === "w2.rescheduled"),
		);
		const schedule = resumed.value.entries.find(
			(e: any) => e.kind === "w2.rescheduled",
		).data;
		assert.equal(schedule.due, clock + WEEK);
		await j.stop();
		clock += WEEK + 1;
		await j.restart();
		assert.deepEqual(j.exits, [
			[null, "SIGKILL"],
			[null, "SIGKILL"],
		]);
		const again = await j.watch("inbox", {}, j.phone);
		await until("deferred round", () => again.value.p[laterSubject]);
		const old = await decision(j, again.value.p[laterSubject].id);
		assert.notEqual(old.decision.id, later.decision.id);
		assert.equal(old.decision.basis, later.decision.basis);
		await send(
			publish("revise_forecast", "later", clock + WEEK, 0.6),
			"revise",
		);
		await until(
			"revision withdraws immediately",
			() => !again.value.p[laterSubject],
		);
		const refused = await j.call(
			"answer",
			{
				project: "p",
				decision: old.decision.id,
				basis: old.decision.basis,
				choice: "yes",
				annotations: [],
			},
			j.phone,
		);
		assert.equal(refused.status, 409);
		assert.equal(refused.body.refused.code, "not_open");
		assert.equal(
			(await decision(j, old.decision.id)).decision.status,
			"withdrawn",
		);
		const finalTimeline = await j.watch("timeline", { project: "p" }, j.phone);
		assert.ok(
			finalTimeline.value.entries.some((e: any) => e.kind === "w2.revised"),
		);
		assert.equal(
			finalTimeline.value.entries.filter((e: any) => e.kind === "w2.resolved")
				.length,
			1,
		);
		for (const w of [timeline, inbox, resumed, again, finalTimeline]) w.close();
	} finally {
		await j.close();
	}
});

test("missing extension: bind succeeds, tasks wait without code, and a restart with W2 restores options and the due decision", {
	timeout: 15_000,
}, async () => {
	let clock = Date.UTC(2026, 10, 14);
	const without = { w1: modules.w1!, websearch: modules.websearch! };
	const j = await journey({ modules: without, now: () => clock });
	try {
		const bound = await j.ok("bind", {
			project: "p",
			workdir: j.root,
			extensions: ["w2"],
		});
		assert.deepEqual(bound.project.missing, ["w2"]);
		await j.restart({ modules });
		await j.ok("setOptions", {
			project: "p",
			extension: "w2",
			patch: { model: "faux/a" },
		});
		const { conversation } = await j.ok("create", {
			project: "p",
			workflow: "w2",
		});
		j.faux.setResponses([publish("record_forecast", "missing", clock + 1000)]);
		await j.ok("input", {
			project: "p",
			conversation,
			text: "Record",
			requestId: "r",
		});
		const timeline = await j.watch("timeline", { project: "p" });
		await until("record saved", () =>
			timeline.value.entries.some((e: any) => e.kind === "w2.recorded"),
		);
		await j.stop();
		clock += 2000;
		await j.restart({ modules: without });
		assert.deepEqual((await j.ok("projects", {}, j.phone)).items[0].missing, [
			"w2",
		]);
		const inbox = await j.watch("inbox", {}, j.phone);
		assert.deepEqual(inbox.value.p, {});
		const before = await j.watch("timeline", { project: "p" }, j.phone);
		assert.equal(
			before.value.entries.filter((e: any) => e.kind === "w2.asked").length,
			0,
		);
		assert.equal(
			(
				await j.call(
					"decision",
					{ project: "p", decision: `w2:${conversation}:missing#1` },
					j.phone,
				)
			).body.refused.code,
			"unknown_decision",
		);
		await j.restart({ modules });
		assert.deepEqual((await j.ok("projects", {})).items[0].missing, []);
		assert.equal(
			(await j.ok("options", { project: "p" })).items[0].value.model,
			"faux/a",
		);
		const restored = await j.watch("inbox", {}, j.phone);
		await until(
			"waiting timer runs with restored code",
			() => restored.value.p[`w2:${conversation}:missing`],
		);
		assert.equal(
			restored.value.p[`w2:${conversation}:missing`].id,
			`w2:${conversation}:missing#1`,
		);
		assert.equal(j.faux.state.callCount, 1);
		for (const w of [timeline, inbox, before, restored]) w.close();
	} finally {
		await j.close();
	}
});
