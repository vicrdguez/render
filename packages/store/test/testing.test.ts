import assert from "node:assert/strict";
import { test } from "node:test";
import { withCancel } from "@earendil-works/chord/context";
import {
	type AnswerInput,
	type AnswerResult,
	fauxAnswer,
	type Store,
} from "tau-store/testing";
import { context, setup } from "./setup.js";

test("fauxAnswer records !test and runs the continuation without a context argument", async (t) => {
	const s = await setup();
	t.after(() => s.store.harness.close(context));
	const opened = await s.ask(await s.draft());
	const store: Store = s.store;
	const input: AnswerInput = {
		basis: opened.basis,
		choice: "revise",
		annotations: [{ text: "Shorter.", range: { start: 0, end: 3 } }],
	};
	const result: AnswerResult = await fauxAnswer(store, opened.id, input);
	assert.equal(result.kind, "answered");
	assert.ok(result.kind === "answered");
	assert.equal(result.repeated, false);
	assert.deepEqual(result.decision, {
		...opened,
		status: "answered",
		...input,
		by: "!test",
		at: 1_000,
		continuation: result.decision.continuation,
	});
	assert.deepEqual(await s.read(opened.id), result.decision);
	s.store.harness.resume();
	await s.store.harness.waitForTask(result.decision.continuation, context);
	assert.deepEqual(await s.seen(), [
		{
			input: { decision: opened.id, choice: "revise" },
			read: JSON.stringify(result.decision),
		},
	]);
});

test("fauxAnswer preserves refusals and equal resends without extra writes", async (t) => {
	const s = await setup();
	t.after(() => s.store.harness.close(context));
	const opened = await s.ask(await s.draft());
	const input: AnswerInput = {
		basis: opened.basis,
		choice: "approve",
		annotations: [],
	};
	const before = s.commits();
	const stale = await fauxAnswer(
		s.store,
		opened.id,
		{ ...input, basis: opened.basis + 1 },
		context,
	);
	assert.ok(stale.kind === "refused");
	assert.equal(stale.refusal.code, "stale_basis");
	assert.equal(s.commits(), before);
	assert.deepEqual(await s.read(opened.id), opened);
	const first = await fauxAnswer(s.store, opened.id, input, context);
	assert.ok(first.kind === "answered");
	const after = s.commits();
	s.clock.now = 5_000;
	assert.deepEqual(await fauxAnswer(s.store, opened.id, input, context), {
		...first,
		repeated: true,
	});
	const conflict = await fauxAnswer(
		s.store,
		opened.id,
		{ ...input, choice: "abort" },
		context,
	);
	assert.ok(
		conflict.kind === "refused" && conflict.refusal.code === "conflict",
	);
	assert.deepEqual(conflict.refusal.decision, first.decision);
	assert.equal(s.commits(), after);
});

test("fauxAnswer forwards caller cancellation without answering", async (t) => {
	const s = await setup();
	t.after(() => s.store.harness.close(context));
	const opened = await s.ask(await s.draft());
	const cancelled = withCancel(context);
	cancelled.cancel(new Error("test caller cancelled"));
	const before = s.commits();
	await assert.rejects(
		() =>
			fauxAnswer(
				s.store,
				opened.id,
				{
					basis: opened.basis,
					choice: "approve",
					annotations: [],
				},
				cancelled.context,
			),
		/test caller cancelled/,
	);
	assert.equal(s.commits(), before);
	assert.deepEqual(await s.read(opened.id), opened);
});
