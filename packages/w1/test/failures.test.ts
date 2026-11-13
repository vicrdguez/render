import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
	type ConversationId,
	configure,
	LiveDoc,
} from "@earendil-works/pi-durable";
import { CodingTools as Coding } from "@earendil-works/pi-durable/tools";
import {
	answered,
	approved,
	call,
	calls,
	commitStep,
	context,
	data,
	failing,
	git,
	hanging,
	named,
	plannedPath,
	Script,
	say,
	subjects,
	toolResults,
	W1,
	type World,
	world,
} from "./setup.js";

async function using<T>(body: (w: World) => Promise<T>) {
	const w = await world();
	try {
		return await body(w);
	} finally {
		await w.close();
	}
}

/** Approve, build S1, and pass review: the merge decision J1 is open. */
async function toMergeReview(w: World) {
	w.script(
		"implementer",
		commitStep("export.js", "json", "Add --json"),
		call("publish_build", { text: "Added --json." }),
	);
	w.script(
		"reviewer",
		call("publish_review", { text: "Good.", verdict: "pass", findings: [] }),
	);
	const { k, s } = await approved(w);
	await w.open(s.merge(1));
	const I = await named(w, "building");
	return { k, s, I, path: plannedPath(w.repo, k) };
}

test("row 19: a moved head hands nothing over, names both SHAs, sets fixing, and retry sends the new head to review", () =>
	using(async (w) => {
		const { k, s, I, path } = await toMergeReview(w);
		const S1 = git(path, "rev-parse", "HEAD");
		writeFileSync(join(path, "late.txt"), "late");
		git(path, "add", "-A");
		git(path, "commit", "-qm", "A late change");
		const S3 = git(path, "rev-parse", "HEAD");
		answered(await w.reply(s.merge(1), "approve"));
		await w.settle();
		const stages = (await w.events()).map((e) => e.stage);
		assert.ok(!stages.includes("handed_over"), "nothing was handed over");
		assert.equal(stages.at(-1), "fixing");
		const notes = await w.entries(I, "w1.note");
		const note = notes.at(-1);
		assert.ok(String(data(note).text).includes(S1), "the entry names S1");
		assert.ok(String(data(note).text).includes(S3), "and the moved head");
		const stuck = await w.open(s.stuck(1));
		assert.equal(stuck.basis, note?.id);
		assert.deepEqual(stuck.choices, ["retry", "abort"]);
		assert.equal(stuck.conversation, k);

		w.script("implementer", call("publish_build", { text: "Publish S3." }));
		w.script(
			"reviewer",
			call("publish_review", { text: "Good.", verdict: "pass", findings: [] }),
		);
		answered(
			await w.reply(s.stuck(1), "retry", [{ text: "Publish the new head." }]),
		);
		await w.settle();
		const retried = w.requests.filter((r) => r.role === "implementer").at(-1);
		assert.ok(retried?.seen.includes("Publish the new head."));
		assert.ok(
			await w.harness.commit(
				(tx) => tx.submissionByRequest(I, s.stuck(1)),
				context,
			),
		);
		const builds = await w.entries(I, "w1.build");
		assert.equal(data(builds.at(-1)).sha, S3);
		const j2 = await w.open(s.merge(2));
		const [, m2] = await w.entries(k, "w1.merge");
		assert.equal(j2.basis, m2?.id);
		assert.equal(data(m2).sha, S3);
	}));

test("rows E1 to E3: a designer that asks instead of publishing opens stuck on its question, and retry carries the reply", () =>
	using(async (w) => {
		await w.setOptions({
			designer: "faux/faux-a",
			implementer: "faux/faux-a",
			reviewer: "faux/faux-b",
		});
		const k = await w.create();
		const s = subjects(k);
		w.script("designer", say("Should --json include a header row?"));
		await w.submit(k, "Add a --json flag.");
		await w.settle();
		const stuck = await w.open(s.stuck(1));
		const [note] = await w.entries(k, "w1.note");
		assert.equal(stuck.basis, note?.id);
		assert.match(String(data(note).text), /include a header row\?/);
		assert.deepEqual(stuck.choices, ["retry", "abort"]);
		assert.equal(stuck.then.task, "w1.retry");

		await w.setOptions({ designer: "faux/faux-b" });
		w.script("designer", call("publish_design", { text: "No header row." }));
		answered(
			await w.reply(s.stuck(1), "retry", [{ text: "No header, please." }]),
		);
		await w.settle();
		const asked = w.requests.filter((r) => r.role === "designer").at(-1);
		assert.equal(asked?.model, "faux-b", "retry sets the role's model first");
		assert.ok(asked?.seen.includes("No header, please."));
		assert.ok(
			await w.harness.commit(
				(tx) => tx.submissionByRequest(k, s.stuck(1)),
				context,
			),
		);
		await w.open(s.design(1));
		assert.equal(
			await w.read(s.stuck(2)),
			undefined,
			"the publish run is fine",
		);
	}));

test("row E2 for R: a reviewer that ends without a verdict opens stuck, and retry asks it again on the current model", () =>
	using(async (w) => {
		w.script(
			"implementer",
			commitStep("export.js", "json", "Add --json"),
			call("publish_build", { text: "Built." }),
		);
		w.script("reviewer", say("I need more time."));
		const { s } = await approved(w);
		const R = await named(w, "reviewing");
		const stuck = await w.open(s.stuck(1));
		const [note] = await w.entries(R, "w1.note");
		assert.equal(stuck.basis, note?.id);
		assert.equal(data(note).text, "I need more time.");

		await w.setOptions({ reviewer: "faux/faux-a" });
		w.script(
			"reviewer",
			call("publish_review", { text: "Good.", verdict: "pass", findings: [] }),
		);
		answered(await w.reply(s.stuck(1), "retry"));
		await w.settle();
		assert.equal(
			w.requests.filter((r) => r.role === "reviewer").at(-1)?.model,
			"faux-a",
		);
		await w.open(s.merge(1));
	}));

test("a run that fails opens no decision, and the owner continues it to a publish", () =>
	using(async (w) => {
		await w.setOptions({
			designer: "faux/faux-a",
			implementer: "faux/faux-a",
			reviewer: "faux/faux-b",
		});
		const k = await w.create();
		const s = subjects(k);
		w.script("designer", failing());
		await w.submit(k, "Add a --json flag.");
		await w.settle();
		const live = await w.harness.snapshot(LiveDoc, k, context);
		assert.equal(live?.runFailure?.reason, "model_error");
		assert.equal(await w.read(s.stuck(1)), undefined, "nothing in the inbox");
		w.script("designer", call("publish_design", { text: "The design." }));
		await w.submit(k, { type: "continue" });
		await w.settle();
		await w.open(s.design(1));
	}));

test("rows X1 to X6: abort cancels in one commit, withdraws the other subject, lists the owed annotation, then stops", () =>
	using(async (w) => {
		await w.setOptions({
			designer: "faux/faux-a",
			implementer: "faux/faux-a",
			reviewer: "faux/faux-b",
		});
		const k = await w.create();
		const s = subjects(k);
		w.script(
			"designer",
			say("Which format?"),
			call("publish_design", { text: "JSON." }),
		);
		await w.submit(k, "Add a --json flag.");
		await w.settle();
		await w.open(s.stuck(1));
		await w.submit(k, "Publish what you have.");
		await w.settle();
		await w.open(s.design(1));
		await w.open(s.stuck(1));

		answered(
			await w.reply(s.design(1), "abort", [{ text: "Not needed now." }]),
		);
		await w.settle();
		assert.equal((await w.read(s.stuck(1)))?.status, "withdrawn");
		const [cancel] = await w.entries(k, "w1.cancel");
		assert.deepEqual(data(cancel).notPursued, [
			{ decision: s.design(1), annotation: 0, text: "Not needed now." },
		]);
		const stages = (await w.events()).map((e) => e.stage);
		assert.deepEqual(stages.slice(-2), ["cancelled", "stopped"]);
		const [stop] = await w.tasks("w1.stop");
		assert.equal(stop?.background, true);
		assert.equal(stop?.state.status, "terminal");

		w.script("designer", call("publish_design", { text: "Again." }));
		await w.submit(k, "Publish again.");
		await w.settle();
		const last = (await toolResults(w, k)).at(-1);
		assert.equal(last?.isError, true, "every tool reads cancelled first");
		assert.match(last?.text ?? "", /cancelled|stopped/);
		assert.equal((await w.entries(k, "w1.design")).length, 1);
	}));

test("rows X3 to X6: the stop aborts a running agent, keeps the worktree, and names its path", () =>
	using(async (w) => {
		w.script("implementer", say("I am unsure how to start."));
		const { k, s } = await approved(w, [{ text: "Keep the old flag." }]);
		const I = await named(w, "building");
		const path = plannedPath(w.repo, k);
		const stuck = await w.open(s.stuck(1));
		assert.equal(stuck.conversation, k);

		w.script("designer", hanging);
		const chat = await w.submit(k, "How is it going?");
		for (let i = 0; i < 400; i++) {
			if ((await w.harness.snapshot(LiveDoc, k, context))?.run) break;
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		answered(await w.reply(s.stuck(1), "abort"));
		await w.settle();
		const ended = await chat.wait(context);
		assert.equal(ended.status, "unanswered");
		assert.equal(ended.reason, "aborted");

		const [cancel] = await w.entries(k, "w1.cancel");
		assert.deepEqual(data(cancel).notPursued, [
			{ decision: s.design(1), annotation: 0, text: "Keep the old flag." },
		]);
		const events = await w.events();
		const cancelled = events.find((e) => e.stage === "cancelled");
		const stopped = events.find((e) => e.stage === "stopped");
		assert.ok(cancelled && stopped && cancelled.id < stopped.id);
		assert.equal(stopped.path, path);
		assert.ok(String(stopped.text).includes(path));
		assert.ok(existsSync(path), "the worktree stays");
		assert.equal(git(path, "rev-parse", "--abbrev-ref", "HEAD"), `w1/${k}`);

		w.script(
			"implementer",
			commitStep("export.js", "json", "Late"),
			call("publish_build", {
				text: "Late build.",
				replies: [{ annotation: 0, text: "Kept." }],
			}),
		);
		await w.submit(I, "Publish anyway.");
		await w.settle();
		const last = (await toolResults(w, I)).at(-1);
		assert.equal(last?.tool, "publish_build");
		assert.equal(last?.isError, true);
		assert.match(last?.text ?? "", /stopped/);
		assert.equal((await w.entries(I, "w1.build")).length, 0);
	}));

test("an outside effect twice: a foreign directory at the path opens stuck, keeps every file, and retry prepares again", () =>
	using(async (w) => {
		await w.setOptions({
			designer: "faux/faux-a",
			implementer: "faux/faux-a",
			reviewer: "faux/faux-b",
		});
		const k = await w.create();
		const s = subjects(k);
		const path = plannedPath(w.repo, k);
		mkdirSync(path);
		writeFileSync(join(path, "mine.txt"), "not W1's");
		w.script("designer", call("publish_design", { text: "Design." }));
		await w.submit(k, "Add a --json flag.");
		await w.settle();
		answered(await w.reply(s.design(1), "approve"));
		await w.settle();
		const stuck = await w.open(s.stuck(1));
		const [note] = await w.entries(k, "w1.note");
		assert.equal(stuck.basis, note?.id);
		assert.ok(String(data(note).text).includes(path));
		assert.ok(existsSync(join(path, "mine.txt")), "W1 deleted nothing");
		assert.ok(!(await w.events()).some((e) => e.stage === "building"));

		rmSync(path, { recursive: true });
		w.script("implementer", commitStep("export.js", "json", "Add --json"));
		answered(await w.reply(s.stuck(1), "retry"));
		await w.settle();
		const I = await named(w, "building");
		assert.equal((await w.agent(I)).cwd, path);
		assert.equal(git(path, "rev-parse", "--abbrev-ref", "HEAD"), `w1/${k}`);
	}));

test("an option changed after the plan cannot change the worktree's base", () =>
	using(async (w) => {
		git(w.repo, "branch", "other");
		writeFileSync(join(w.repo, "other.txt"), "other");
		git(w.repo, "checkout", "-q", "other");
		git(w.repo, "add", "-A");
		git(w.repo, "commit", "-qm", "Other");
		git(w.repo, "checkout", "-q", "main");
		const main = git(w.repo, "rev-parse", "main");
		w.script(
			"implementer",
			async () => {
				await w.setOptions({ base: "other" });
				return commitStep("export.js", "json", "Add --json");
			},
			call("publish_build", { text: "Built." }),
		);
		w.script("reviewer", call("show_diff"));
		const { k } = await approved(w);
		const path = plannedPath(w.repo, k);
		assert.equal(git(path, "rev-parse", "HEAD~1"), main);
		const R = await named(w, "reviewing");
		const [diff] = await toolResults(w, R);
		assert.ok(!diff?.text.includes("other.txt"), "the diff starts at main");
	}));

test("a then task that runs twice for one decision does its work once", () =>
	using(async (w) => {
		await w.setOptions({
			designer: "faux/faux-a",
			implementer: "faux/faux-a",
			reviewer: "faux/faux-b",
		});
		const k = await w.create();
		const s = subjects(k);
		w.script(
			"designer",
			call("publish_design", { text: "Design." }),
			say("Thinking."),
		);
		await w.submit(k, "Add a --json flag.");
		await w.settle();
		answered(
			await w.reply(s.design(1), "revise", [{ text: "Shorter, please." }]),
		);
		await w.settle();
		const before = (await w.events()).length;
		const designAnswer = W1.extension.tasks?.find(
			(task) => task.definition.name === "w1.design_answer",
		);
		assert.ok(designAnswer);
		await w.harness.commit(
			(tx) =>
				tx.createTask(
					designAnswer as never,
					{ decision: s.design(1), choice: "revise" },
					{
						ownership: { kind: "conversation" },
						conversationId: k,
						background: true,
					},
				),
			context,
		);
		await w.settle();
		assert.equal((await w.events()).length, before, "no second event");
		const inputs = (await w.entries(k, "pi.user")).length;
		assert.equal(inputs, 2, "the client's input and one revise input");
		const twice = await w.tasks("w1.design_answer");
		assert.equal(twice.length, 2);
		assert.ok(twice.every((t) => t.state.outcome?.status === "completed"));
	}));

test("a then task that faulted runs again on an equal resend and finishes the work", () =>
	using(async (w) => {
		await w.setOptions({ base: "trunk" });
		w.script("implementer", commitStep("export.js", "json", "Add --json"));
		const { k, s, approval } = await approved(w);
		const dead = await w.harness.getTask(
			approval.decision.continuation,
			context,
		);
		assert.equal(dead?.state.outcome?.status, "faulted");
		assert.ok(!(await w.events()).some((e) => e.stage === "preparing"));

		git(w.repo, "branch", "trunk");
		const again = answered(await w.reply(s.design(1), "approve"));
		assert.equal(again.repeated, true);
		assert.notEqual(
			again.decision.continuation,
			approval.decision.continuation,
		);
		await w.settle();
		const I = await named(w, "building");
		assert.equal((await w.agent(I)).cwd, plannedPath(w.repo, k));
	}));

test("publish_build reads a clean head itself, runs its round in order, and refuses a nested call", () =>
	using(async (w) => {
		w.script(
			"implementer",
			call("bash", { command: "printf 'x' > dirty.txt" }),
			call("publish_build", { text: "Dirty." }),
			async () => {
				const I = await named(w, "building");
				await w.harness.commit(
					(tx) =>
						configure(tx, I, {
							extensions: [Coding, W1.extension, Script],
							tools: [
								...(Coding.tools ?? []),
								...(W1.extension.tools ?? []).filter(
									(tool) => tool.name === "publish_build",
								),
								...(Script.tools ?? []),
							],
						}),
					context,
				);
				return commitStep("export.js", "json", "Add --json");
			},
			call("script", { tool: "publish_build", text: "Nested." }),
			calls(
				["publish_build", { text: "In order." }],
				[
					"bash",
					{
						command:
							"printf 'y' > later.txt && git add -A && git commit -qm Later",
					},
				],
			),
			say("Done."),
		);
		const { k } = await approved(w);
		const I = await named(w, "building");
		const path = plannedPath(w.repo, k);
		const results = await toolResults(w, I);
		const dirty = results.find((r) => r.tool === "publish_build");
		assert.equal(dirty?.isError, true);
		assert.match(dirty?.text ?? "", /clean|commit/i);
		const nested = results.find((r) => r.tool === "script");
		assert.ok(nested?.text.includes('"isError":true'), nested?.text);
		const builds = await w.entries(I, "w1.build");
		assert.equal(builds.length, 1, "only the direct call published");
		assert.equal(
			data(builds[0]).sha,
			git(path, "rev-parse", "HEAD~1"),
			"the SHA was fixed before the later commit in the same round",
		);
		assert.equal(git(path, "log", "-1", "--format=%s"), "Later");
		assert.equal(
			await w.read(subjects(k).stuck(1)),
			undefined,
			"the run that published owes no handoff",
		);
	}));

test("roles: the designer follows the project default, the implementer and reviewer name everything exactly", () =>
	using(async (w) => {
		w.script(
			"implementer",
			commitStep("export.js", "json", "Add --json"),
			call("publish_build", { text: "Built." }),
		);
		const { k } = await approved(w);
		const R = await named(w, "reviewing");
		const I = await named(w, "building");
		const names = async (c: ConversationId) =>
			(await w.agent(c)).tools.map((t) => t.name);
		assert.ok((await names(k)).includes("web_search"));
		assert.ok(!(await names(I)).includes("web_search"));
		assert.ok(!(await names(R)).includes("web_search"));
		for (const c of [k, I, R]) {
			const record = await w.harness.commit(
				(tx) => tx.conversation(c),
				context,
			);
			assert.equal(record?.owner, undefined, "ownerless");
		}
	}));
