import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Storage, TaskId } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
	type Annotation,
	type Decision,
	type DecisionId,
	decision,
	request,
	withdraw,
} from "tau-store";
import {
	type AnswerInput,
	answer,
	type Store,
	watchOpen,
} from "tau-store/host";
import {
	Basis,
	context,
	extension,
	Fails,
	setup,
	Then,
	Throws,
} from "./setup.js";

async function openList(store: Store) {
	const watch = await watchOpen(store, context);
	const value = watch.value;
	await watch.stop();
	return value;
}

async function tasksOf(store: Store, kind: string) {
	return (
		await store.harness.commit((tx) => tx.scanTasks({ kind }, 100), context)
	).items;
}

function answered(result: Awaited<ReturnType<typeof answer>>) {
	assert.equal(result.kind, "answered", JSON.stringify(result));
	if (result.kind !== "answered") throw new Error("not answered");
	return result;
}

function refused(result: Awaited<ReturnType<typeof answer>>) {
	assert.equal(result.kind, "refused", JSON.stringify(result));
	if (result.kind !== "refused") throw new Error("not refused");
	return result.refusal;
}

test("request opens one decision on a subject with no open decision", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const expected: Decision = {
		id: "test:k#1",
		subject: "test:k",
		title: "Review the design",
		basis: draft.basis.id,
		choices: ["approve", "revise", "abort"],
		conversation: s.conversation,
		then: { task: "test.then" },
		requestedAt: 1_000,
		status: "open",
	};
	assert.deepEqual(opened, expected);
	assert.deepEqual(await s.read("test:k#1"), expected);
	assert.deepEqual(await openList(s.store), {
		"test:k": {
			id: "test:k#1",
			title: "Review the design",
			requestedAt: 1_000,
			conversation: s.conversation,
		},
	});
});

test("an equal draft returns the open decision and writes nothing, whatever requestedAt", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const before = s.commits();
	s.clock.now = 9_000;
	const again = await s.ask({ ...draft, requestedAt: 9_000 });
	assert.deepEqual(again, opened);
	assert.equal(s.commits(), before, "no commit reached storage");
});

test("any other difference supersedes the open decision and opens a new ID", async () => {
	const s = await setup();
	const draft = await s.draft();
	await s.ask(draft);
	const other = (
		await s.store.harness.commit(
			(tx) => tx.createConversation({ ownership: { kind: "ownerless" } }),
			context,
		)
	).id;
	const changes = [
		{ title: "Review the second design" },
		{ basis: await s.basis("The design text.") },
		{ choices: ["approve", "abort"] as ["approve", "abort"] },
		{ conversation: other },
		{ then: Fails },
	];
	for (const [index, change] of changes.entries()) {
		const previous: DecisionId = `test:k#${index + 1}`;
		const opened = await s.ask({ ...draft, ...change });
		assert.equal(opened.id, `test:k#${index + 2}`, JSON.stringify(change));
		assert.equal(opened.status, "open");
		assert.equal((await s.read(previous))?.status, "superseded");
		assert.equal((await openList(s.store))["test:k"]?.id, opened.id);
	}
});

test("withdraw closes only the open decision of its subject and creates no task", async () => {
	const s = await setup();
	const draft = await s.draft();
	await s.ask(draft);
	await s.ask({ ...draft, subject: "test:other" });
	await s.store.harness.commit((tx) => withdraw(tx, "test:k"), context);
	assert.equal((await s.read("test:k#1"))?.status, "withdrawn");
	assert.equal((await s.read("test:other#1"))?.status, "open");
	assert.deepEqual(Object.keys(await openList(s.store)), ["test:other"]);
	assert.equal((await s.store.harness.inspect(context)).tasks.length, 0);
	const before = s.commits();
	await s.store.harness.commit((tx) => withdraw(tx, "test:k"), context);
	assert.equal(s.commits(), before, "a second withdraw writes nothing");
	assert.equal(
		(await s.ask(draft)).id,
		"test:k#2",
		"a new request gets a new ID",
	);
});

test("request, withdraw, and decision touch only documents, so they run after a table write", async () => {
	const s = await setup();
	const draft = await s.draft();
	await s.store.harness.commit(async (tx) => {
		const basis = await tx.appendEntry(Basis, s.conversation, {
			data: { text: "Written in this commit." },
		});
		const opened = await request(tx, { ...draft, basis });
		assert.equal((await decision(tx, opened.id))?.status, "open");
		await withdraw(tx, opened.subject);
		assert.equal((await decision(tx, opened.id))?.status, "withdrawn");
	}, context);
	assert.equal((await s.read("test:k#1"))?.status, "withdrawn");
});

test("decision reads a made-up ID as undefined and writes nothing", async () => {
	const s = await setup();
	const before = s.commits();
	assert.equal(await s.read("test:k#1"), undefined);
	await s.ask(await s.draft());
	const after = s.commits();
	for (const id of [
		"test:k#2",
		"test:k#0",
		"test:k#01",
		"test:k#1.5",
		"test:k#-1",
		"test:none#1",
		"test:k",
		"#1",
		"constructor#1",
		"__proto__#1",
		"toString#1",
	]) {
		assert.equal(await s.read(id as DecisionId), undefined, id);
	}
	assert.equal(s.commits(), after, "no read of a made-up ID reached storage");
	assert.ok(after > before);
});

test("answer refuses an unknown ID with unknown_decision and writes nothing", async () => {
	const s = await setup();
	const draft = await s.draft();
	await s.ask(draft);
	const before = s.commits();
	for (const id of ["test:k#2", "test:none#1", "nonsense"]) {
		const refusal = refused(
			await answer(
				s.store,
				id as DecisionId,
				{ basis: draft.basis.id, choice: "approve", annotations: [] },
				"phone",
				context,
			),
		);
		assert.equal(refusal.code, "unknown_decision");
	}
	assert.equal(s.commits(), before);
});

test("an answer records the choice, notes, device, and time, creates the then task, and clears the slot", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	s.clock.now = 2_000;
	const annotations: Annotation[] = [
		{ text: "Use NDJSON.", range: { start: 4, end: 10 } },
		{ text: "What about errors?" },
	];
	const result = answered(
		await answer(
			s.store,
			opened.id,
			{ basis: draft.basis.id, choice: "revise", annotations },
			"phone",
			context,
		),
	);
	assert.equal(result.repeated, false);
	const { continuation } = result.decision;
	assert.deepEqual(result.decision, {
		...opened,
		status: "answered",
		choice: "revise",
		annotations,
		by: "phone",
		at: 2_000,
		continuation,
	});
	assert.deepEqual(await s.read(opened.id), result.decision);
	assert.deepEqual(await openList(s.store), {});
	const task = await s.store.harness.getTask(continuation, context);
	assert.equal(task?.kind, "test.then");
	assert.deepEqual(task?.input, { decision: "test:k#1", choice: "revise" });
	assert.equal(
		task?.conversationId,
		s.conversation,
		"owned by the decision's conversation",
	);
	assert.equal(task?.owner, undefined);
	assert.equal(task?.background, true);
	assert.equal(
		task?.state.status,
		"pending",
		"openStore leaves the scheduler paused",
	);
	s.store.harness.resume();
	await s.store.harness.waitForTask(continuation, context);
	assert.deepEqual(await s.seen(), [
		{
			input: { decision: "test:k#1", choice: "revise" },
			read: JSON.stringify(result.decision),
		},
	]);
});

test("a Stop in the decision's conversation does not cancel the then task", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const result = answered(
		await answer(
			s.store,
			opened.id,
			{ basis: draft.basis.id, choice: "approve", annotations: [] },
			"phone",
			context,
		),
	);
	await (await s.store.harness.conversation(s.conversation, context))?.abort(
		context,
	);
	const settled = await s.store.harness.waitForTask(
		result.decision.continuation,
		context,
	);
	assert.equal(settled.state.outcome.status, "completed");
});

test("an equal resend repeats the record without a write and keeps the first device and time", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "revise",
		annotations: [{ text: "Here.", range: { start: 0, end: 3 } }],
	};
	const first = answered(
		await answer(s.store, opened.id, input, "phone", context),
	);
	const before = s.commits();
	s.clock.now = 5_000;
	const again = answered(
		await answer(
			s.store,
			opened.id,
			{
				...input,
				annotations: [{ text: "Here.", range: { end: 3, start: 0 } }],
			},
			"laptop",
			context,
		),
	);
	assert.equal(again.repeated, true);
	assert.deepEqual(again.decision, first.decision);
	assert.equal(again.decision.by, "phone");
	assert.equal(again.decision.at, 1_000);
	assert.equal(s.commits(), before, "no commit reached storage");
});

test("a resend that differs in basis, choice, or annotations is refused with conflict and the record", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "revise",
		annotations: [{ text: "Here.", range: { start: 0, end: 3 } }],
	};
	const first = answered(
		await answer(s.store, opened.id, input, "phone", context),
	);
	const other = await s.basis("Another text.");
	const before = s.commits();
	for (const change of [
		{ basis: other.id },
		{ choice: "approve" },
		{ annotations: [] },
		{ annotations: [{ text: "Here." }] },
		{ annotations: [{ text: "Here.", range: { start: 0, end: 4 } }] },
		{ annotations: [{ text: "There.", range: { start: 0, end: 3 } }] },
		{ annotations: [...input.annotations, { text: "More." }] },
	]) {
		const refusal = refused(
			await answer(
				s.store,
				opened.id,
				{ ...input, ...change },
				"laptop",
				context,
			),
		);
		assert.equal(refusal.code, "conflict", JSON.stringify(change));
		assert.ok(refusal.code === "conflict");
		assert.deepEqual(refusal.decision, first.decision);
	}
	assert.equal(s.commits(), before);
});

test("an equal resend after the then task faulted creates it once more, even when two resends race", async () => {
	const s = await setup();
	const draft = await s.draft({ then: Throws });
	const opened = await s.ask(draft);
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "approve",
		annotations: [],
	};
	const first = answered(
		await answer(s.store, opened.id, input, "phone", context),
	);
	const dead = first.decision.continuation;
	s.store.harness.resume();
	const settled = await s.store.harness.waitForTask(dead, context);
	assert.equal(settled.state.outcome.status, "faulted");
	s.clock.now = 7_000;
	const [a, b] = await Promise.all([
		answer(s.store, opened.id, input, "laptop", context),
		answer(s.store, opened.id, input, "tablet", context),
	]);
	const one = answered(a);
	const two = answered(b);
	assert.equal(one.repeated, true);
	assert.equal(two.repeated, true);
	assert.notEqual(one.decision.continuation, dead);
	assert.equal(
		two.decision.continuation,
		one.decision.continuation,
		"one replacement",
	);
	assert.deepEqual(one.decision, {
		...first.decision,
		continuation: one.decision.continuation,
	});
	assert.equal(one.decision.by, "phone");
	assert.equal(one.decision.at, 1_000);
	assert.deepEqual(await s.read(opened.id), one.decision);
	const tasks = await tasksOf(s.store, "test.throws");
	assert.equal(tasks.length, 2);
	const replacement = tasks.find(
		(task) => task.id === one.decision.continuation,
	);
	assert.deepEqual(replacement?.input, {
		decision: opened.id,
		choice: "approve",
	});
	assert.equal(replacement?.background, true);
	assert.equal(replacement?.conversationId, s.conversation);
});

test("an equal resend after the then task failed, was aborted, or completed creates nothing", async () => {
	const s = await setup();
	s.store.harness.resume();
	const ending = async (
		subject: string,
		then: typeof Then,
		end: (task: TaskId) => Promise<unknown>,
		expected: string,
	) => {
		const draft = await s.draft({ subject, then });
		const opened = await s.ask(draft);
		const input: AnswerInput = {
			basis: draft.basis.id,
			choice: "approve",
			annotations: [],
		};
		const first = answered(
			await answer(s.store, opened.id, input, "phone", context),
		);
		await end(first.decision.continuation);
		const settled = await s.store.harness.waitForTask(
			first.decision.continuation,
			context,
		);
		assert.equal(settled.state.outcome.status, expected);
		const before = s.commits();
		const again = answered(
			await answer(s.store, opened.id, input, "laptop", context),
		);
		assert.equal(again.repeated, true);
		assert.deepEqual(again.decision, first.decision, expected);
		assert.equal(s.commits(), before, expected);
	};
	await ending("test:failed", Fails, async () => {}, "failed");
	await ending("test:completed", Then, async () => {}, "completed");
	const pausing = await setup();
	const draft = await pausing.draft();
	const opened = await pausing.ask(draft);
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "abort",
		annotations: [],
	};
	const first = answered(
		await answer(pausing.store, opened.id, input, "phone", context),
	);
	await pausing.store.harness.abortTask(first.decision.continuation, context);
	const settled = await pausing.store.harness.waitForTask(
		first.decision.continuation,
		context,
	);
	assert.equal(settled.state.outcome.status, "aborted");
	const again = answered(
		await answer(pausing.store, opened.id, input, "laptop", context),
	);
	assert.deepEqual(again.decision, first.decision, "aborted");
});

test("an equal resend after a fault, with the then task's extension gone, gives extension_not_loaded", async () => {
	const s = await setup();
	const draft = await s.draft({ then: Throws });
	const opened = await s.ask(draft);
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "approve",
		annotations: [],
	};
	const first = answered(
		await answer(s.store, opened.id, input, "phone", context),
	);
	s.store.harness.resume();
	await s.store.harness.waitForTask(first.decision.continuation, context);
	s.registry.uninstall(extension);
	const before = s.commits();
	const refusal = refused(
		await answer(s.store, opened.id, input, "laptop", context),
	);
	assert.equal(refusal.code, "extension_not_loaded");
	assert.deepEqual(await s.read(opened.id), first.decision);
	assert.equal(s.commits(), before);
});

test("superseded or withdrawn gives not_open with the subject's open decision", async () => {
	const s = await setup();
	const draft = await s.draft();
	const old = await s.ask(draft);
	const current = await s.ask({ ...draft, title: "Second version" });
	const before = s.commits();
	const superseded = refused(
		await answer(
			s.store,
			old.id,
			{ basis: draft.basis.id, choice: "approve", annotations: [] },
			"phone",
			context,
		),
	);
	assert.equal(superseded.code, "not_open");
	assert.ok(superseded.code === "not_open");
	assert.deepEqual(superseded.open, current);
	await s.store.harness.commit((tx) => withdraw(tx, "test:k"), context);
	const after = s.commits();
	for (const id of [old.id, current.id]) {
		const withdrawn = refused(
			await answer(
				s.store,
				id,
				{ basis: draft.basis.id, choice: "approve", annotations: [] },
				"phone",
				context,
			),
		);
		assert.equal(withdrawn.code, "not_open");
		assert.ok(withdrawn.code === "not_open");
		assert.equal("open" in withdrawn, false, "no open decision to return");
	}
	assert.equal(s.commits(), after);
	assert.ok(after > before);
	assert.equal((await s.read(current.id))?.status, "withdrawn");
});

test("an open decision refuses another basis with stale_basis and writes nothing", async () => {
	const s = await setup();
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const stale = await s.basis("The first version.");
	const before = s.commits();
	const refusal = refused(
		await answer(
			s.store,
			opened.id,
			{ basis: stale.id, choice: "approve", annotations: [] },
			"phone",
			context,
		),
	);
	assert.equal(refusal.code, "stale_basis");
	assert.equal(s.commits(), before);
	assert.deepEqual(await s.read(opened.id), opened);
});

test("an open decision refuses a choice it does not offer with unknown_choice and writes nothing", async () => {
	const s = await setup();
	const draft = await s.draft({ choices: ["approve", "abort"] });
	const opened = await s.ask(draft);
	const before = s.commits();
	for (const choice of ["revise", "Approve", ""]) {
		const refusal = refused(
			await answer(
				s.store,
				opened.id,
				{ basis: draft.basis.id, choice, annotations: [] },
				"phone",
				context,
			),
		);
		assert.equal(refusal.code, "unknown_choice", choice);
	}
	assert.equal(s.commits(), before);
	assert.deepEqual(await s.read(opened.id), opened);
});

test("bad_annotation refuses a range that does not fit the basis text and writes nothing", async () => {
	const s = await setup();
	const text = "a👍b";
	const draft = await s.draft({ basis: await s.basis(text) });
	const opened = await s.ask(draft);
	const before = s.commits();
	for (const range of [
		{ start: 3, end: 2 },
		{ start: -1, end: 2 },
		{ start: 0, end: text.length + 1 },
		{ start: 5, end: 6 },
		{ start: 0.5, end: 2 },
		{ start: 0, end: 2.5 },
	]) {
		const refusal = refused(
			await answer(
				s.store,
				opened.id,
				{
					basis: draft.basis.id,
					choice: "revise",
					annotations: [{ text: "fine" }, { text: "bad", range }],
				},
				"phone",
				context,
			),
		);
		assert.equal(refusal.code, "bad_annotation", JSON.stringify(range));
	}
	assert.equal(s.commits(), before);
	assert.deepEqual(await s.read(opened.id), opened);
});

test("ranges that fit, in UTF-16 units, and whole-basis notes are stored with every choice", async () => {
	const s = await setup();
	const basis = await s.basis("a👍b");
	const annotations: Annotation[] = [
		{ text: "The thumb.", range: { start: 1, end: 3 } },
		{ text: "All of it.", range: { start: 0, end: 4 } },
		{ text: "A note on the whole basis." },
	];
	for (const choice of ["approve", "revise", "abort"] as const) {
		const draft = await s.draft({ subject: `test:${choice}`, basis });
		const opened = await s.ask(draft);
		const result = answered(
			await answer(
				s.store,
				opened.id,
				{ basis: basis.id, choice, annotations },
				"phone",
				context,
			),
		);
		assert.deepEqual(
			result.decision.status === "answered" && result.decision.annotations,
			annotations,
		);
	}
});

test("a then task the registry lacks gives extension_not_loaded and the decision stays open", async () => {
	const s = await setup(undefined, false);
	const draft = await s.draft();
	const opened = await s.ask(draft);
	const before = s.commits();
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "approve",
		annotations: [],
	};
	const refusal = refused(
		await answer(s.store, opened.id, input, "phone", context),
	);
	assert.equal(refusal.code, "extension_not_loaded");
	assert.equal(s.commits(), before);
	assert.deepEqual(await s.read(opened.id), opened);
	assert.deepEqual(Object.keys(await openList(s.store)), ["test:k"]);
	assert.equal((await s.store.harness.inspect(context)).tasks.length, 0);
	s.registry.install(extension);
	answered(await answer(s.store, opened.id, input, "phone", context));
});

test("the refusals of an open decision follow the table's order", async () => {
	const s = await setup(undefined, false);
	const draft = await s.draft({ choices: ["approve"] });
	const opened = await s.ask(draft);
	const stale = await s.basis("Old.");
	const bad = [{ text: "x", range: { start: 2, end: 1 } }];
	const code = async (input: AnswerInput) =>
		refused(await answer(s.store, opened.id, input, "phone", context)).code;
	assert.equal(
		await code({ basis: stale.id, choice: "revise", annotations: bad }),
		"stale_basis",
	);
	assert.equal(
		await code({ basis: draft.basis.id, choice: "revise", annotations: bad }),
		"unknown_choice",
	);
	assert.equal(
		await code({ basis: draft.basis.id, choice: "approve", annotations: bad }),
		"bad_annotation",
	);
	assert.equal(
		await code({ basis: draft.basis.id, choice: "approve", annotations: [] }),
		"extension_not_loaded",
	);
});

test("two answers at once: one lands, the other is refused or repeated, and one task exists", async () => {
	const s = await setup();
	const draft = await s.draft();
	const differ = await s.ask(draft);
	const [a, b] = await Promise.all([
		answer(
			s.store,
			differ.id,
			{ basis: draft.basis.id, choice: "revise", annotations: [] },
			"phone",
			context,
		),
		answer(
			s.store,
			differ.id,
			{ basis: draft.basis.id, choice: "approve", annotations: [] },
			"laptop",
			context,
		),
	]);
	const winner = answered(a);
	assert.equal(winner.repeated, false);
	const loser = refused(b);
	assert.equal(loser.code, "conflict");
	assert.ok(loser.code === "conflict");
	assert.deepEqual(loser.decision, winner.decision);

	const same = await s.ask({ ...draft, subject: "test:same" });
	const input: AnswerInput = {
		basis: draft.basis.id,
		choice: "approve",
		annotations: [],
	};
	const [c, d] = await Promise.all([
		answer(s.store, same.id, input, "phone", context),
		answer(s.store, same.id, input, "laptop", context),
	]);
	assert.equal(answered(c).repeated, false);
	assert.equal(answered(d).repeated, true);
	assert.deepEqual(answered(d).decision, answered(c).decision);
	assert.equal(answered(d).decision.by, "phone");
	assert.equal(
		(await tasksOf(s.store, "test.then")).length,
		2,
		"one task per decision",
	);
});

test("a storage failure rejects answer, and an equal resend after reopen converges", async () => {
	const dir = await mkdtemp(path.join(tmpdir(), "tau-store-answer-"));
	for (const when of ["before", "after"] as const) {
		const file = path.join(dir, `${when}.sqlite`);
		const real = await openNodeSqliteStorage(file);
		let armed = false;
		const failing = new Proxy(real, {
			get(target, key) {
				const value = Reflect.get(target, key, target);
				if (key !== "commit" || typeof value !== "function")
					return typeof value === "function" ? value.bind(target) : value;
				return async (...args: Parameters<Storage["commit"]>) => {
					if (armed && when === "before") throw new Error("connection lost");
					const result = await value.apply(target, args);
					if (armed) throw new Error("connection lost after the commit");
					return result;
				};
			},
		});
		const s = await setup(failing);
		const draft = await s.draft();
		const opened = await s.ask(draft);
		const input: AnswerInput = {
			basis: draft.basis.id,
			choice: "revise",
			annotations: [],
		};
		armed = true;
		await assert.rejects(answer(s.store, opened.id, input, "phone", context));
		const reopened = await setup(await openNodeSqliteStorage(file));
		const result = answered(
			await answer(reopened.store, opened.id, input, "laptop", context),
		);
		assert.equal(result.repeated, when === "after", when);
		assert.equal(
			result.decision.by,
			when === "after" ? "phone" : "laptop",
			when,
		);
		assert.equal((await tasksOf(reopened.store, "test.then")).length, 1, when);
		await reopened.store.harness.close(context);
	}
});

test("watchOpen follows the open list as decisions open, are answered, and are withdrawn", async () => {
	const s = await setup();
	const watch = await watchOpen(s.store, context);
	assert.deepEqual(watch.value, {});
	const values: unknown[] = [];
	let notify = () => {};
	watch.start(async (call) => {
		if (call.kind === "value") values.push(call.value);
		notify();
	});
	const settle = (expected: unknown) =>
		new Promise<void>((resolve) => {
			const check = () => {
				if (JSON.stringify(values.at(-1)) === JSON.stringify(expected))
					resolve();
			};
			notify = check;
			check();
		});
	const draft = await s.draft();
	const opened = await s.ask(draft);
	await settle({
		"test:k": {
			id: opened.id,
			title: opened.title,
			requestedAt: 1_000,
			conversation: s.conversation,
		},
	});
	await s.ask({ ...draft, subject: "test:other" });
	answered(
		await answer(
			s.store,
			opened.id,
			{ basis: draft.basis.id, choice: "approve", annotations: [] },
			"phone",
			context,
		),
	);
	await s.store.harness.commit((tx) => withdraw(tx, "test:other"), context);
	await settle({});
	await watch.stop();
});
