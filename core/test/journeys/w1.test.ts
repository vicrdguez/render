import assert from "node:assert/strict";
import { test } from "node:test";
import { decision, journey, until } from "./journey.js";
import { answer, build, call, git, pass, setup, stage } from "./w1-steps.js";

test("W1: approve an annotated design from the phone, build, review the SHA and hand over that SHA only", {
	timeout: 15_000,
}, async () => {
	const j = await journey();
	try {
		const { repo, conversation, shown } = await setup(j);
		const inbox = await j.watch("inbox", {}, j.phone);
		assert.equal(
			inbox.value.p[`w1:${conversation}:design`].id,
			shown.decision.id,
		);
		const stale = await j.call(
			"answer",
			{ ...answer(shown, "approve"), basis: shown.decision.basis + 1 },
			j.phone,
		);
		assert.equal(stale.status, 409);
		assert.equal(stale.body.refused.code, "stale_basis");
		const annotation = {
			text: "Keep the export name unchanged.",
			range: { start: 0, end: 6 },
		};
		j.faux.setResponses([
			(request) => {
				assert.ok(JSON.stringify(request).includes(annotation.text));
				return build;
			},
			call("publish_build", {
				text: "Format changed, name kept.",
				replies: [{ annotation: 0, text: "The export name stays format." }],
			}),
			call("show_diff"),
			call("show_file", { path: "export.js" }),
			(request) => {
				assert.ok(JSON.stringify(request).includes("export const format = 42"));
				return pass;
			},
		]);
		const approved = await j.ok(
			"answer",
			answer(shown, "approve", [annotation]),
			j.phone,
		);
		assert.equal(approved.decision.by, "phone");
		const final = await decision(j, `w1:${conversation}:merge#1`);
		await until(
			"final decision reaches the inbox",
			() => inbox.value.p[`w1:${conversation}:merge`],
		);
		const I = (await stage(j, "building")).conversation;
		const R = (await stage(j, "reviewing")).conversation;
		const builds = (
			await j.ok(
				"history",
				{ project: "p", conversation: I, limit: 1000 },
				j.phone,
			)
		).items.filter((e: any) => e.kind === "w1.build");
		const reviews = (
			await j.ok(
				"history",
				{ project: "p", conversation: R, limit: 1000 },
				j.phone,
			)
		).items.filter((e: any) => e.kind === "w1.review");
		const merge = (
			await j.ok(
				"history",
				{ project: "p", conversation, limit: 1000 },
				j.phone,
			)
		).items.find((e: any) => e.id === final.decision.basis);
		assert.equal(builds.length, 1);
		assert.equal(reviews.length, 1);
		assert.equal(builds[0].data.design, shown.decision.basis);
		assert.equal(reviews[0].data.build, builds[0].id);
		assert.equal(reviews[0].data.sha, builds[0].data.sha);
		assert.equal(merge.data.design, shown.decision.basis);
		assert.equal(merge.data.build, builds[0].id);
		assert.equal(merge.data.review, reviews[0].id);
		assert.equal(merge.data.sha, reviews[0].data.sha);
		git(repo, "cat-file", "-e", `${merge.data.sha}^{commit}`);
		assert.equal(git(repo, "rev-parse", `w1/${conversation}`), merge.data.sha);
		const base = git(repo, "rev-parse", "main");
		const accepted = await j.ok("answer", answer(final, "approve"), j.laptop);
		assert.equal(accepted.decision.by, "laptop");
		assert.equal((await decision(j, final.decision.id)).decision.by, "laptop");
		assert.equal((await decision(j, shown.decision.id)).decision.by, "phone");
		const handed = await stage(j, "handed_over");
		assert.equal(handed.sha, merge.data.sha);
		assert.ok(
			handed.text.includes(
				`git --no-replace-objects merge --ff-only ${merge.data.sha}`,
			),
		);
		assert.equal(git(repo, "rev-parse", "main"), base, "Tau never merges");
		await j.restart();
		const after = await j.watch("timeline", { project: "p" }, j.phone);
		assert.equal(
			after.value.entries.filter((e: any) => e.data.stage === "handed_over")
				.length,
			1,
		);
		after.close();
		inbox.close();
	} finally {
		await j.close();
	}
});

test("W1: two devices answer at once, faults show the dead continuation, and an equal resend recovers it", {
	timeout: 15_000,
}, async () => {
	const j = await journey();
	try {
		const { repo, conversation, shown } = await setup(j, "missing-base");
		const [a, b] = await Promise.all([
			j.call(
				"answer",
				answer(shown, "approve", [{ text: "Laptop annotation" }]),
				j.laptop,
			),
			j.call(
				"answer",
				answer(shown, "approve", [{ text: "Phone annotation" }]),
				j.phone,
			),
		]);
		assert.deepEqual([a.status, b.status].sort(), [200, 409]);
		const winner = a.status === 200 ? a.body.result : b.body.result;
		const loser = a.status === 409 ? a.body.refused : b.body.refused;
		assert.equal(loser.code, "conflict");
		assert.deepEqual(loser.decision, winner.decision);
		assert.equal(winner.decision.by, a.status === 200 ? "laptop" : "phone");
		const draft = answer(shown, "approve", winner.decision.annotations);
		let fault: any;
		await until("faults lists the failed W1 task", async () => {
			const page = await j.ok("faults", { project: "p" }, j.phone);
			fault = page.items.find(
				(f: any) => f.task === winner.decision.continuation,
			);
			return !!fault;
		});
		assert.equal(fault.kind, "w1.design_answer");
		assert.equal(fault.conversation, conversation);
		assert.equal(fault.decision, shown.decision.id);
		assert.ok(
			fault.error.includes("revision") || fault.error.includes("commit"),
		);
		const conflict = await j.call("answer", answer(shown, "abort"), j.phone);
		assert.equal(conflict.body.refused.code, "conflict");
		assert.equal(conflict.body.refused.decision.by, winner.decision.by);
		git(repo, "branch", "missing-base");
		j.faux.setResponses([
			build,
			call("publish_build", {
				text: "Built.",
				replies: [{ annotation: 0, text: "Addressed the winning annotation." }],
			}),
			pass,
		]);
		const resent = await j.ok("answer", draft, j.phone);
		assert.equal(resent.repeated, true);
		assert.notEqual(resent.decision.continuation, winner.decision.continuation);
		assert.equal(resent.decision.by, winner.decision.by);
		await decision(j, `w1:${conversation}:merge#1`);
		const after = await j.watch("timeline", { project: "p" }, j.phone);
		assert.equal(
			after.value.entries.filter((e: any) => e.data.stage === "preparing")
				.length,
			1,
		);
		after.close();
	} finally {
		await j.close();
	}
});

test("W1 row 19: a moved head opens stuck and hands over nothing", {
	timeout: 15_000,
}, async () => {
	const j = await journey();
	try {
		const { repo, conversation, shown } = await setup(j);
		j.faux.setResponses([
			build,
			call("publish_build", { text: "Built." }),
			pass,
		]);
		await j.ok("answer", answer(shown, "approve"));
		const final = await decision(j, `w1:${conversation}:merge#1`);
		const published = git(repo, "rev-parse", `w1/${conversation}`);
		const path = `${repo}.w1-${conversation}`;
		git(path, "commit", "--allow-empty", "-qm", "Head moved after review");
		const moved = git(path, "rev-parse", "HEAD");
		assert.notEqual(moved, published);
		await j.ok("answer", answer(final, "approve"), j.phone);
		const inbox = await j.watch("inbox", {}, j.phone);
		await until(
			"stuck arrives at phone",
			() => inbox.value.p[`w1:${conversation}:stuck`],
		);
		const stuck = await decision(
			j,
			inbox.value.p[`w1:${conversation}:stuck`].id,
		);
		assert.deepEqual(stuck.decision.choices, ["retry", "abort"]);
		assert.ok(stuck.text.includes(published));
		assert.ok(stuck.text.includes(moved));
		const timeline = await j.watch("timeline", { project: "p" }, j.phone);
		assert.ok(
			timeline.value.entries.some((e: any) => e.data.stage === "fixing"),
		);
		assert.equal(
			timeline.value.entries.filter((e: any) => e.data.stage === "handed_over")
				.length,
			0,
		);
		await j.ok("answer", answer(stuck, "abort"), j.phone);
		await until("owner can end the stuck work", () =>
			timeline.value.entries.some((e: any) => e.data.stage === "stopped"),
		);
		inbox.close();
		timeline.close();
	} finally {
		await j.close();
	}
});
