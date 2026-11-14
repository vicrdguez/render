import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { ConversationId, EntryRecord } from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-store";
import {
	answered,
	call,
	calls,
	commitStep,
	context,
	data,
	git,
	named,
	plannedPath,
	subjects,
	toolResults,
	type World,
	world,
} from "./setup.js";

// docs/core/walk.md, "W1, design to merge", one row at a time on one piece of work. Each test continues the last.
const V1 =
	"Output: print one JSON object per row.\nErrors: exit 2 on a bad flag.";
const PASSAGE_0 = "print one JSON object per row";
const PASSAGE_1 = "exit 2 on a bad flag";
const V2 =
	"Output: print NDJSON, one object per line.\nErrors: exit 1 on a bad flag.";

describe("W1 rows 0 to 19 on one piece of work", () => {
	let w: World;
	let k: ConversationId;
	let s: ReturnType<typeof subjects>;
	let I: ConversationId;
	let R: ConversationId;
	let path: string;
	let base: string;
	let S1: string;
	let S2: string;
	let tampered = "";
	let worktreeAtReview = "";
	const one = (items: readonly EntryRecord[], what: string) => {
		assert.equal(items.length, 1, what);
		return items[0] as EntryRecord;
	};

	before(async () => {
		w = await world();
		base = git(w.repo, "rev-parse", "main");
		await w.setOptions({
			designer: "faux/faux-a",
			implementer: "faux/faux-a",
			reviewer: "faux/faux-b",
		});
	});
	after(() => w.close());

	test("row 0: the host creates D with the designer's model, the project's working directory, and an open role", async () => {
		k = await w.create();
		s = subjects(k);
		const agent = await w.agent(k);
		assert.deepEqual(agent.model, { provider: "faux", modelId: "faux-a" });
		assert.equal(agent.cwd, w.repo);
		assert.deepEqual(
			agent.extensions.map((e) => e.name),
			["coding-tools", "websearch", "w1"],
			"the project default, and W1",
		);
		assert.deepEqual(
			agent.tools.map((t) => t.name).sort(),
			["bash", "publish_design", "read", "web_search"],
			"no write, no edit, and no other role's tools",
		);
	});

	test("row 1: the client's input is admitted once under its request ID", async () => {
		w.script("designer", call("publish_design", { text: V1 }));
		const draft = {
			type: "input",
			content: "Add a --json flag to the export command.",
			requestId: "client:r1",
		} as const;
		const first = await w.submit(k, draft);
		const again = await w.submit(k, draft);
		assert.equal(again.id, first.id);
		await w.settle();
	});

	test("row 2: publish_design appends V1, opens A1 on it, emits, and ends the run", async () => {
		const v1 = one(await w.entries(k, "w1.design"), "one design entry");
		assert.equal(data(v1).text, V1);
		const a1 = await w.open(s.design(1));
		assert.equal(a1.basis, v1.id);
		assert.deepEqual(a1.choices, ["approve", "revise", "abort"]);
		assert.equal(a1.then.task, "w1.design_answer");
		assert.equal(a1.conversation, k);
		const events = await w.events();
		assert.deepEqual(
			events.map((e) => e.stage),
			["design_review"],
		);
		assert.equal(typeof events[0]?.text, "string");
		assert.equal(
			w.requests.filter((r) => r.role === "designer").length,
			1,
			"terminate ended the run without another request",
		);
	});

	test("rows 3 and 4: revise with two annotations sets D's model from the options and quotes each passage", async () => {
		const v1 = data((await w.entries(k, "w1.design"))[0]).text as string;
		const range = (passage: string) => ({
			start: v1.indexOf(passage),
			end: v1.indexOf(passage) + passage.length,
		});
		await w.setOptions({ designer: "faux/faux-b" });
		w.script(
			"designer",
			call("publish_design", { text: V2 }),
			call("publish_design", {
				text: V2,
				replies: [
					{ annotation: 0, text: "Now NDJSON." },
					{ annotation: 1, text: "Now exit 1." },
				],
			}),
		);
		const result = answered(
			await w.reply(s.design(1), "revise", [
				{ text: "Use NDJSON instead.", range: range(PASSAGE_0) },
				{ text: "Exit 1, not 2.", range: range(PASSAGE_1) },
			]),
		);
		assert.equal(result.repeated, false);
		await w.settle();
		const asked = w.requests.filter((r) => r.role === "designer")[1];
		assert.ok(asked);
		assert.equal(asked.model, "faux-b", "the option was set before the input");
		for (const quote of [
			PASSAGE_0,
			PASSAGE_1,
			"Use NDJSON instead.",
			"Exit 1, not 2.",
		])
			assert.ok(asked.seen.includes(quote), `the input quotes ${quote}`);
		const submission = await w.harness.commit(
			(tx) => tx.submissionByRequest(k, s.design(1)),
			context,
		);
		assert.equal(submission?.type, "input", "the input's request ID is A1");
		assert.ok((await w.events()).some((e) => e.stage === "designing"));
	});

	test("row 5: publish_design refuses until every annotation has a reply, then opens A2 on V2", async () => {
		const results = await toolResults(w, k);
		const refused = results.filter((r) => r.tool === "publish_design")[1];
		assert.equal(refused?.isError, true, "the call without replies failed");
		const designs = await w.entries(k, "w1.design");
		assert.equal(designs.length, 2, "the refused call appended nothing");
		const v2 = designs[1];
		assert.equal(data(v2).text, V2);
		assert.deepEqual(data(v2).replies, [
			{ annotation: 0, text: "Now NDJSON." },
			{ annotation: 1, text: "Now exit 1." },
		]);
		const a2 = await w.open(s.design(2));
		assert.equal(a2.basis, v2?.id);
	});

	test("row 6: the phone that still shows V1 answers A1 and gets conflict; the open decision is A2", async () => {
		const result = await w.reply(s.design(1), "approve", [], "phone");
		assert.equal(result.kind, "refused");
		assert.equal(result.kind === "refused" && result.refusal.code, "conflict");
		await w.open(s.design(2));
	});

	test("rows 7 to 17: approve A2, then build, review, fix, and review again", async () => {
		w.script(
			"implementer",
			commitStep("export.js", "export const format = ndjson;", "Add --json"),
			call("publish_build", { text: "Added --json." }),
			call("publish_build", {
				text: "Added --json.",
				replies: [{ annotation: 0, text: "The old --csv flag still works." }],
			}),
			call("bash", {
				command:
					"git checkout -- . && printf '%s' 'test' > export.test.js && git add -A && git commit -qm 'Test --json'",
			}),
			async () => {
				await w.setOptions({ reviewer: "faux/faux-a" });
				return call("publish_build", { text: "Added a test." });
			},
		);
		w.script(
			"reviewer",
			calls(["read", { path: "export.js" }], ["bash", { command: "ls" }]),
			call("show_diff"),
			() => {
				tampered = join(path, "export.js");
				writeFileSync(tampered, "TAMPERED AFTER PUBLISH");
				return call("show_file", { path: "export.js" });
			},
			async () => {
				worktreeAtReview = readFileSync(tampered, "utf8");
				await w.setOptions({ implementer: "faux/faux-b" });
				return call("publish_review", {
					text: "No test for --json.",
					verdict: "fail",
					findings: ["No test covers --json."],
				});
			},
			call("publish_review", {
				text: "Looks right.",
				verdict: "pass",
				findings: [],
			}),
		);
		const draft = [{ text: "Keep the old --csv flag working." }];
		const first = answered(await w.reply(s.design(2), "approve", draft));
		const again = answered(await w.reply(s.design(2), "approve", draft));
		assert.equal(again.repeated, true, "row 7: an equal resend repeats");
		assert.equal(again.decision.continuation, first.decision.continuation);
		assert.equal(again.decision.by, "laptop");
		path = plannedPath(w.repo, k);
		await w.settle();
		I = await named(w, "building");
		R = await named(w, "reviewing");
	});

	test("row 8: the plan names the path, the branch w1/k, the base, and its SHA, and the event says so", async () => {
		const preparing = (await w.events()).find((e) => e.stage === "preparing");
		assert.ok(preparing);
		assert.equal(git(w.repo, "rev-parse", `w1/${k}`).length, 40);
		assert.equal(
			git(path, "merge-base", "HEAD", "main"),
			base,
			"the worktree starts at the base SHA",
		);
	});

	test("row 9: I is the implementer, a closed role in the worktree, ownerless", async () => {
		assert.ok(existsSync(path));
		assert.equal(git(path, "rev-parse", "--abbrev-ref", "HEAD"), `w1/${k}`);
		const agent = await w.agent(I);
		assert.equal(agent.cwd, path);
		assert.deepEqual(
			agent.extensions.map((e) => e.name),
			["coding-tools", "w1"],
		);
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["read", "write", "edit", "bash", "publish_build"],
		);
		const record = await w.harness.commit((tx) => tx.conversation(I), context);
		assert.equal(record?.owner, undefined, "nobody owns I");
	});

	test("row 10: I's first input carries V2's text and A2's annotation under A2's ID, and the event names I", async () => {
		const asked = w.requests.find((r) => r.role === "implementer");
		assert.ok(asked);
		assert.ok(asked.seen.includes("print NDJSON, one object per line"));
		assert.ok(asked.seen.includes("Keep the old --csv flag working."));
		assert.ok(
			await w.harness.commit(
				(tx) => tx.submissionByRequest(I, s.design(2)),
				context,
			),
		);
		const building = (await w.events()).find((e) => e.stage === "building");
		assert.equal(building?.conversation, I);
	});

	test("row 11: publish_build refuses an unreplied annotation, then names V2 and the head SHA S1, and creates R", async () => {
		const results = (await toolResults(w, I)).filter(
			(r) => r.tool === "publish_build",
		);
		assert.equal(results[0]?.isError, true, "no reply to A2's annotation");
		const [b1] = await w.entries(I, "w1.build");
		const v2 = (await w.entries(k, "w1.design"))[1];
		S1 = data(b1).sha as string;
		assert.equal(data(b1).design, v2?.id);
		assert.equal(S1, git(path, "rev-parse", "HEAD~1"), "S1 is G1's commit");
		assert.equal(git(path, "log", "-1", "--format=%s", S1), "Add --json");
		assert.deepEqual(data(b1).replies, [
			{ annotation: 0, text: "The old --csv flag still works." },
		]);
		assert.equal(data(b1).fixes, undefined);
		const agent = await w.agent(R);
		assert.equal(
			w.requests.find((r) => r.role === "reviewer")?.model,
			"faux-b",
			"R was created with the reviewer's model",
		);
		assert.deepEqual(
			agent.extensions.map((e) => e.name),
			["w1"],
		);
		assert.deepEqual(
			agent.tools.map((t) => t.name),
			["show_diff", "show_file", "publish_review"],
		);
	});

	test("row 12: R's input names B1 and S1 on the reviewer's model, and the event names R", async () => {
		const asked = w.requests.find((r) => r.role === "reviewer");
		assert.equal(asked?.model, "faux-b");
		assert.ok(asked?.seen.includes(S1));
		const [b1] = await w.entries(I, "w1.build");
		assert.ok(
			await w.harness.commit(
				(tx) => tx.submissionByRequest(R, String(b1?.id)),
				context,
			),
		);
		const reviewing = (await w.events()).find((e) => e.stage === "reviewing");
		assert.equal(reviewing?.conversation, R);
	});

	test("row 13: the reviewer cannot read or run anything, and reads S1 from Git objects, not the worktree", async () => {
		const results = await toolResults(w, R);
		const [read, bash, diff, file] = results;
		assert.equal(read?.tool, "read");
		assert.equal(read?.isError, true);
		assert.equal(bash?.tool, "bash");
		assert.equal(bash?.isError, true);
		assert.match(`${read?.text} ${bash?.text}`, /not available|unavailable/i);
		assert.equal(diff?.isError, false);
		assert.ok(diff?.text.includes("ndjson"), diff?.text);
		assert.equal(worktreeAtReview, "TAMPERED AFTER PUBLISH");
		assert.equal(file?.isError, false);
		assert.equal(file?.text, "export const format = ndjson;");
		const [r1] = await w.entries(R, "w1.review");
		const [b1] = await w.entries(I, "w1.build");
		assert.equal(data(r1).build, b1?.id);
		assert.equal(data(r1).sha, S1);
		assert.equal(data(r1).verdict, "fail");
		assert.deepEqual(data(r1).findings, ["No test covers --json."]);
	});

	test("row 14: I gets the findings under R1's ID on the implementer's current model, and the event names I", async () => {
		const [r1] = await w.entries(R, "w1.review");
		assert.ok(
			await w.harness.commit(
				(tx) => tx.submissionByRequest(I, String(r1?.id)),
				context,
			),
		);
		const fix = w.requests.filter((r) => r.role === "implementer")[3];
		assert.equal(fix?.model, "faux-b", "set from the option before the input");
		assert.ok(fix?.seen.includes("No test covers --json."));
		const fixing = (await w.events()).find((e) => e.stage === "fixing");
		assert.equal(fixing?.conversation, I);
	});

	test("rows 15 and 16: B2 names V2, S2, and R1, and R's second round runs on the reviewer's new model", async () => {
		const [, b2] = await w.entries(I, "w1.build");
		const [r1] = await w.entries(R, "w1.review");
		const v2 = (await w.entries(k, "w1.design"))[1];
		S2 = data(b2).sha as string;
		assert.equal(S2, git(path, "rev-parse", "HEAD"));
		assert.notEqual(S2, S1);
		assert.equal(data(b2).design, v2?.id);
		assert.equal(data(b2).fixes, r1?.id);
		const second = w.requests.filter((r) => r.role === "reviewer").at(-1);
		assert.equal(second?.model, "faux-a");
		assert.ok(second?.seen.includes(S2));
	});

	test("row 17: a pass appends R2 and M, and opens J1 on M with approve and abort", async () => {
		const [, r2] = await w.entries(R, "w1.review");
		const [, b2] = await w.entries(I, "w1.build");
		const v2 = (await w.entries(k, "w1.design"))[1];
		assert.equal(data(r2).build, b2?.id);
		assert.equal(data(r2).sha, S2);
		assert.equal(data(r2).verdict, "pass");
		const m = one(await w.entries(k, "w1.merge"), "one merge basis in D");
		assert.deepEqual(
			{ ...data(m), text: undefined },
			{
				text: undefined,
				design: v2?.id,
				sha: S2,
				build: b2?.id,
				review: r2?.id,
				branch: `w1/${k}`,
			},
		);
		assert.equal(typeof data(m).text, "string");
		const j1 = await w.open(s.merge(1));
		assert.equal(j1.basis, m.id);
		assert.deepEqual(j1.choices, ["approve", "abort"]);
		assert.equal(j1.then.task, "w1.handoff");
		assert.equal(w.pending("implementer"), 0);
		assert.equal(w.pending("reviewer"), 0);
	});

	test("rows 18 and 19: approve hands over S2 and lists the annotation as not acted on, and nothing merged", async () => {
		const main = git(w.repo, "rev-parse", "main");
		answered(
			await w.reply(s.merge(1), "approve", [{ text: "Squash it later." }]),
		);
		await w.settle();
		const handed = (await w.events()).find((e) => e.stage === "handed_over");
		assert.ok(handed);
		assert.match(
			handed.text as string,
			new RegExp(`git --no-replace-objects merge --ff-only ${S2}`),
		);
		assert.equal(handed.sha, S2);
		assert.deepEqual(handed.notActedOn, [{ text: "Squash it later." }]);
		assert.equal(git(w.repo, "rev-parse", "main"), main, "W1 merged nothing");
		assert.equal(git(w.repo, "rev-parse", `w1/${k}`), S2);
	});

	test("the chain of evidence holds on real Git objects", async () => {
		const [a1, a2] = [
			await w.read(s.design(1)),
			await w.read(s.design(2)),
		] as const;
		const v2 = (await w.entries(k, "w1.design"))[1];
		const [, b2] = await w.entries(I, "w1.build");
		const [, r2] = await w.entries(R, "w1.review");
		const [m] = await w.entries(k, "w1.merge");
		const j1 = await w.read(s.merge(1));
		assert.equal(a1?.status, "answered");
		assert.equal(a2?.basis, v2?.id, "1. A2's basis is V2");
		assert.equal(data(b2).design, v2?.id, "2. B2 names V2");
		assert.equal(data(b2).sha, S2, "2. and S2");
		assert.equal(data(r2).build, b2?.id, "3. R2 names B2");
		assert.equal(data(r2).sha, S2, "3. and S2");
		assert.equal(j1?.basis, m?.id, "4. J1's basis is M");
		assert.deepEqual(
			[data(m).design, data(m).sha, data(m).build, data(m).review],
			[v2?.id, S2, b2?.id, r2?.id],
			"4. M names V2, S2, B2, and R2",
		);
		assert.equal(git(path, "cat-file", "-t", S2), "commit");
		assert.equal(
			git(w.repo, "rev-parse", `w1/${k}`),
			S2,
			"5. the branch head is S2",
		);
	});

	test("G3: the owner merges the SHA, and the timeline says handed over, not merged", async () => {
		git(w.repo, "--no-replace-objects", "merge", "--ff-only", S2);
		assert.equal(git(w.repo, "rev-parse", "main"), S2);
		const stages = (await w.events()).map((e) => e.stage);
		assert.equal(stages.at(-1), "handed_over");
		assert.ok(!stages.includes("merged"));
	});

	test("every W1 task but w1.ensure_handoff belongs to D and is background; no run ended without a handoff", async () => {
		const kinds = [
			"w1.design_answer",
			"w1.prepare",
			"w1.review_start",
			"w1.fix_start",
			"w1.handoff",
		];
		for (const kind of kinds) {
			const tasks = await w.tasks(kind);
			assert.ok(tasks.length > 0, kind);
			for (const task of tasks) {
				assert.equal(task.conversationId, k, kind);
				assert.equal(task.background, true, kind);
				assert.equal(task.state.status, "terminal", kind);
			}
		}
		const checks = await w.tasks("w1.ensure_handoff");
		assert.ok(checks.length >= 5, "one check after every run that ended");
		assert.ok(checks.every((task) => task.owner !== undefined));
		assert.equal(
			await w.read(s.stuck(1) as DecisionId),
			undefined,
			"no stuck decision",
		);
	});
});
