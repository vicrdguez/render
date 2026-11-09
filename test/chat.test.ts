// Piece 6 chat delivery against the real Ledger, Engine and pinned pi-durable, with a scripted provider.
// Failure cases first: a message lost or delivered twice, a slot held by an idle chat or released under a pending
// steer, an interrupt that reaches other role tasks, a lifetime turn budget that ends a chat, a non-human principal
// that talks to the coordinator, and hidden reasoning that reaches a transcript or export.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { mintContext } from "../src/ledger/principals.ts";
import { chatFixture, coordinatorPacket, device, held, until, WORKFLOW } from "./support/chat.ts";
import { admin, scheduler } from "./support/roles.ts";

const toolTurn = () => fauxAssistantMessage(fauxToolCall("read_artifact", { ref: "revision:4" }), { stopReason: "toolUse" });

async function idle(f: Awaited<ReturnType<typeof chatFixture>>) {
	return until(() => {
		const a = f.current();
		return a.status === "idle" && !a.executing ? a : undefined;
	}, "an idle coordinator holding no slot");
}

async function facts(f: Awaited<ReturnType<typeof chatFixture>>) {
	const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: WORKFLOW, kind: "fact" } }));
	return String((exported as unknown as { jsonl: string }).jsonl)
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as { command?: string; refs?: Record<string, string> });
}

/** Withdrawal outcomes by message, as the committed facts record them. */
async function outcomes(f: Awaited<ReturnType<typeof chatFixture>>): Promise<Record<string, string>> {
	const found: Record<string, string> = {};
	for (const r of await facts(f)) {
		if (r.command === "recordMessageWithdrawal" || (r.command === "withdrawCoordinatorMessage" && r.refs?.outcome !== "requested"))
			found[r.refs!.message!] = r.refs!.outcome!;
	}
	return found;
}

test("C11 a coordinator run that ends without submit_role_result leaves it idle with no blocker", async () => {
	const f = await chatFixture();
	try {
		const a = await idle(f);
		assert.equal(a.blocker, null);
		assert.equal(a.report, null);
		assert.deepEqual(f.view().coordinator, { assignment: f.coordinator, generation: a.generation, state: "idle" });
	} finally {
		await f.close();
	}
});

test("C1 a message to an idle coordinator starts a run and is placed as render.human with device and command id", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const laptop = await device(f);
		const posted = await f.post("Summarize the repository.", "followUp", "c1-message", laptop.context);
		assert.equal(posted.status, "accepted", JSON.stringify(posted));
		const receipt = await Effect.runPromise(f.ledger.receipt(admin, "c1-message"));
		assert.equal("status" in receipt && receipt.status, "accepted");
		const placed = await until(async () => (await f.transcript()).find((m) => m.kind === "human"), "the placed human input");
		assert.equal(placed.commandId, "c1-message");
		assert.equal(placed.device, laptop.id);
		assert.equal(placed.text, "Summarize the repository.");
		assert.equal(placed.assignment, f.coordinator);
		const reply = await until(
			async () => (await f.transcript()).find((m) => m.kind === "assistant" && Number(m.entry) > Number(placed.entry)),
			"the coordinator's reply",
		);
		assert.ok(reply);
		assert.ok(f.chat.requests.some((r) => r.assignment === f.coordinator && r.users.at(-1) === "Summarize the repository."));
		await idle(f);
	} finally {
		await f.close();
	}
});

test("C2 a retried command id with the same payload yields one receipt and one submission", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const first = await f.post("Only once.", "followUp", "c2-message");
		const retry = await f.post("Only once.", "followUp", "c2-message");
		assert.equal(first.status, "accepted");
		assert.equal(retry.status === "accepted" && retry.duplicate, true);
		assert.equal(retry.status === "accepted" && retry.receipt, first.status === "accepted" && first.receipt);
		await until(async () => (await f.transcript()).some((m) => m.kind === "assistant" && JSON.stringify(m).includes("reply")), "the reply");
		await idle(f);
		await f.post("Only once.", "followUp", "c2-message");
		await idle(f);
		const placed = (await f.transcript()).filter((m) => m.kind === "human" && m.commandId === "c2-message");
		assert.equal(placed.length, 1, "one placed input for one command id");
		assert.equal(f.chat.requests.filter((r) => r.users.filter((u) => u === "Only once.").length > 0).length, 1);
	} finally {
		await f.close();
	}
});

test("C4 a steer enters the running run at its next turn boundary", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const first = held(toolTurn);
		f.chat.reply(f.coordinator, first, () => fauxAssistantMessage("Done with both."));
		await f.post("Start the review.", "followUp", "c4-start");
		await first.reached;
		await f.post("Also check the tests.", "steer", "c4-steer");
		await until(() => (f.view().inbox as unknown[]).length === 0 || undefined, "the steer submitted to the running conversation");
		first.release();
		await idle(f);
		const runs = f.chat.requests.filter((r) => r.assignment === f.coordinator).slice(-2);
		assert.deepEqual(
			runs.map((r) => r.users.filter((u) => !u.startsWith("{"))),
			[["Start the review."], ["Start the review.", "Also check the tests."]],
			"the second request of the same run sees the steer after the tool round",
		);
		const kinds = (await f.transcript()).filter((m) => m.kind !== "input").map((m) => `${m.kind}:${m.commandId ?? ""}`);
		assert.deepEqual(kinds.slice(-5), ["human:c4-start", "assistant:", "tool_result:", "human:c4-steer", "assistant:"]);
	} finally {
		await f.close();
	}
});

test("C4 a steer that misses its run starts the next run, and the slot stays held until that run settles", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const answer = held(() => fauxAssistantMessage("First answer."));
		const late = held(() => fauxAssistantMessage("Answer to the late steer."));
		f.chat.reply(f.coordinator, answer, late);
		await f.post("Quick question.", "followUp", "late-start");
		await answer.reached;
		await f.post("One more thing.", "steer", "late-steer");
		await until(() => (f.view().inbox as unknown[]).length === 0 || undefined, "the steer submitted");
		answer.release();
		await late.reached;
		assert.equal(f.current().status, "running", "the late steer's run keeps the coordinator running");
		assert.equal(f.current().executing, true, "and its slot held");
		late.release();
		await idle(f);
		assert.ok((await f.transcript()).some((m) => m.kind === "human" && m.commandId === "late-steer"));
	} finally {
		await f.close();
	}
});

test("C5 a follow-up starts a run after the current one ends", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const first = held(toolTurn);
		f.chat.reply(
			f.coordinator,
			first,
			() => fauxAssistantMessage("First run done."),
			() => fauxAssistantMessage("Follow-up done."),
		);
		await f.post("First task.", "followUp", "c5-start");
		await first.reached;
		await f.post("Then this.", "followUp", "c5-follow");
		await until(() => (f.view().inbox as unknown[]).length === 0 || undefined, "the follow-up submitted");
		first.release();
		await idle(f);
		const runs = f.chat.requests.filter((r) => r.assignment === f.coordinator).slice(-3);
		assert.deepEqual(
			runs.map((r) => r.users.filter((u) => !u.startsWith("{")).at(-1)),
			["First task.", "First task.", "Then this."],
			"the follow-up waits for the first run's final answer",
		);
		const kinds = (await f.transcript()).filter((m) => m.kind !== "input").map((m) => `${m.kind}:${m.commandId ?? ""}`);
		assert.deepEqual(kinds.slice(-6), ["human:c5-start", "assistant:", "tool_result:", "assistant:", "human:c5-follow", "assistant:"]);
	} finally {
		await f.close();
	}
});

test("C6 withdrawal: a queued message is aborted and never placed; a placed one reports already_placed", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const first = held(toolTurn);
		f.chat.reply(f.coordinator, first, () => fauxAssistantMessage("Done."));
		await f.post("Work on it.", "followUp", "c6-start");
		await first.reached;
		await f.post("Never mind this.", "followUp", "c6-queued");
		await until(() => (f.view().inbox as unknown[]).length === 0 || undefined, "the follow-up submitted");
		const withdrawn = await f.withdraw("c6-queued", "c6-withdraw");
		assert.equal(withdrawn.status, "accepted", JSON.stringify(withdrawn));
		const placed = await f.withdraw("c6-start", "c6-withdraw-placed");
		assert.equal(placed.status, "accepted");
		await until(async () => (await outcomes(f))["c6-queued"] && (await outcomes(f))["c6-start"], "the recorded withdrawal outcomes");
		first.release();
		await idle(f);
		assert.deepEqual(await outcomes(f), { "c6-queued": "aborted", "c6-start": "already_placed" });
		assert.equal(
			(await f.transcript()).some((m) => m.commandId === "c6-queued"),
			false,
		);
		assert.equal(
			f.chat.requests.some((r) => r.users.includes("Never mind this.")),
			false,
		);
	} finally {
		await f.close();
	}
});

test("C6 a withdrawal that commits while Engine is submitting still records the submission, then aborts it", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const running = held(() => fauxAssistantMessage("Done."));
		f.chat.reply(f.coordinator, running);
		await f.post("Busy.", "followUp", "race-start");
		await running.reached;
		process.env.RENDER_FAULT_BARRIER = "after-message-submission";
		process.env.RENDER_FAULT_COMMAND = "race-queued";
		try {
			await f.post("Racing.", "followUp", "race-queued");
			await until(
				async () => (await f.harness.inspect(BACKGROUND_CONTEXT)).submissions.some((s) => s.requestId === "race-queued") || undefined,
				"the runtime admitted the submission before Ledger recorded it",
			);
			const withdrawn = await f.withdraw("race-queued", "race-withdraw");
			assert.equal(withdrawn.status === "accepted" && withdrawn.result.outcome, "aborted");
		} finally {
			delete process.env.RENDER_FAULT_BARRIER;
			delete process.env.RENDER_FAULT_COMMAND;
		}
		// The test runner writes a diagnostic report on this signal; this process only needs the barrier's release.
		for (const listener of process.listeners("SIGUSR2")) if (listener.name === "signalHandler") process.off("SIGUSR2", listener);
		process.kill(process.pid, "SIGUSR2");
		await until(
			async () => (await facts(f)).some((r) => r.command === "recordMessageWithdrawal" && r.refs?.message === "race-queued"),
			"Engine's abort",
		);
		running.release();
		await idle(f);
		assert.equal(
			(await f.transcript()).some((m) => m.commandId === "race-queued"),
			false,
		);
		assert.equal(
			f.chat.requests.some((r) => r.users.includes("Racing.")),
			false,
		);
	} finally {
		await f.close();
	}
});

test("C6 a withdrawal of a message not yet submitted completes as aborted without Engine", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const busy = Array.from({ length: 4 }, () => held(() => fauxAssistantMessage("held")));
		f.chat.reply("challenger", ...busy);
		for (const [i] of busy.entries())
			await f.command({ type: "assignTask", slice: `busy:${i}`, delivery: false, packet: coordinatorPacket({ role: "challenger" }) });
		await Promise.all(busy.map((b) => b.reached));
		await f.post("Waits for capacity.", "followUp", "c6-capacity");
		const withdrawn = await f.withdraw("c6-capacity", "c6-capacity-withdraw");
		assert.equal(withdrawn.status === "accepted" && withdrawn.result.outcome, "aborted");
		for (const b of busy) b.release();
		await until(() => f.assignments().every((a) => !a.executing) || undefined, "capacity released");
		await idle(f);
		assert.equal(
			f.chat.requests.some((r) => r.users.includes("Waits for capacity.")),
			false,
		);
	} finally {
		await f.close();
	}
});

test("C7 interrupt stops the coordinator's run, leaves other role work running, and the coordinator settles idle", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const challenger = held(() =>
			fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Reviewed.\n" }), { stopReason: "toolUse" }),
		);
		f.chat.reply("challenger", challenger);
		await f.command({ type: "assignTask", slice: "review", delivery: false, packet: coordinatorPacket({ role: "challenger" }) });
		let signal: AbortSignal | undefined;
		const running = held(() => fauxAssistantMessage("never"));
		f.chat.reply(f.coordinator, async (request) => {
			signal = request.signal;
			return running(request);
		});
		await f.post("Long task.", "followUp", "c7-start");
		await Promise.all([challenger.reached, running.reached]);
		assert.equal((await f.interrupt("c7-interrupt")).status, "accepted");
		await until(() => signal?.aborted || undefined, "the coordinator's provider request aborted");
		await idle(f);
		const review = f.assignments().find((a) => a.packet.role === "challenger")!;
		assert.equal(review.status, "running", "the challenger keeps running");
		assert.equal(review.executing, true);
		challenger.release();
		await until(() => f.assignments().find((a) => a.id === review.id)?.status === "submitted" || undefined, "the challenger's report");
	} finally {
		await f.close();
	}
});

test("C7 a non-background abort in pinned pi-durable 1.4.0 withdraws queued inputs: an interrupt drops queued messages", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const running = held(() => fauxAssistantMessage("never"));
		f.chat.reply(f.coordinator, running);
		await f.post("Long task.", "followUp", "abort-start");
		await running.reached;
		await f.post("Queued behind it.", "followUp", "abort-queued");
		await until(() => (f.view().inbox as unknown[]).length === 0 || undefined, "the follow-up submitted");
		await f.interrupt("abort-interrupt");
		await idle(f);
		assert.equal(
			(await f.transcript()).some((m) => m.commandId === "abort-queued"),
			false,
			"the queued follow-up never enters the transcript",
		);
		assert.equal(
			f.chat.requests.some((r) => r.users.includes("Queued behind it.")),
			false,
		);
	} finally {
		await f.close();
	}
});

const fidelity = { packet: { requests: [{ key: "fidelity", packet: coordinatorPacket({ role: "challenger" }) }] } };
const requestFidelity = () => fauxAssistantMessage(fauxToolCall("request_role", { key: "fidelity" }), { stopReason: "toolUse" });
const fidelityHolds = () =>
	fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "Fidelity holds.\n" }), { stopReason: "toolUse" });

test("a role request ends the coordinator's run without erasing the conversation", async () => {
	const f = await chatFixture(fidelity);
	try {
		await idle(f);
		f.chat.reply("challenger", fidelityHolds);
		f.chat.reply(
			f.coordinator,
			() => fauxAssistantMessage("Reply to A."),
			requestFidelity,
			() => fauxAssistantMessage("Noted the fidelity result."),
			() => fauxAssistantMessage("Reply to B."),
		);
		await f.post("Message A.", "followUp", "ctx-a");
		await until(async () => JSON.stringify(await f.transcript()).includes("Reply to A."), "the reply to A");
		await idle(f);
		await f.post("Request fidelity now.", "followUp", "ctx-request");
		await until(
			() => f.assignments().find((a) => a.packet.role === "challenger")?.status === "submitted" || undefined,
			"the challenger's report",
		);
		await until(async () => JSON.stringify(await f.transcript()).includes("Noted the fidelity result."), "the results round");
		await idle(f);
		await f.post("Message B.", "followUp", "ctx-b");
		const b = await until(
			() => f.chat.requests.find((r) => r.assignment === f.coordinator && r.users.at(-1) === "Message B."),
			"the provider request for B",
		);
		assert.ok(b.users.includes("Message A."), "B's context keeps the earlier human message");
		assert.ok(b.assistants.includes("Reply to A."), "and the coordinator's earlier reply");
	} finally {
		await f.close();
	}
});

test("C7 with its requested challenger running, an interrupted coordinator is idle, runs a new prompt at once and still gets the result", async () => {
	const f = await chatFixture(fidelity);
	try {
		await idle(f);
		const review = held(fidelityHolds);
		f.chat.reply("challenger", review);
		const working = held(() => fauxAssistantMessage("never"));
		f.chat.reply(
			f.coordinator,
			requestFidelity,
			working,
			() => fauxAssistantMessage("Answer to C."),
			() => fauxAssistantMessage("Noted the fidelity result."),
		);
		await f.post("Request fidelity.", "followUp", "int-request");
		await review.reached;
		await f.post("Keep going meanwhile.", "followUp", "int-b");
		await working.reached;
		const challenger = f.assignments().find((a) => a.packet.role === "challenger")!;
		assert.equal(challenger.status, "running");
		assert.equal((await f.interrupt("int-interrupt")).status, "accepted");
		const a = await idle(f);
		assert.equal(a.blocker, null);
		assert.equal(f.assignments().find((x) => x.id === challenger.id)?.status, "running", "the challenger keeps running");
		await f.post("Question C.", "followUp", "int-c");
		await until(
			() => f.chat.requests.some((r) => r.assignment === f.coordinator && r.users.at(-1) === "Question C.") || undefined,
			"a run for C while the challenger still works",
		);
		assert.equal(f.assignments().find((x) => x.id === challenger.id)?.status, "running");
		await until(async () => JSON.stringify(await f.transcript()).includes("Answer to C."), "the answer to C");
		review.release();
		const report = await until(() => f.assignments().find((x) => x.id === challenger.id)?.report ?? undefined, "the challenger's report");
		await until(
			() => f.chat.requests.some((r) => r.assignment === f.coordinator && r.users.at(-1)?.includes(report)) || undefined,
			"the challenger's result delivered to the coordinator as input",
		);
		await until(async () => JSON.stringify(await f.transcript()).includes("Noted the fidelity result."), "the results round's reply");
		await idle(f);
	} finally {
		await f.close();
	}
});

test("C8 with four executing attempts a message waits for capacity and is delivered when a slot frees", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		const busy = Array.from({ length: 4 }, () => held(() => fauxAssistantMessage("held")));
		f.chat.reply("challenger", ...busy);
		for (const [i] of busy.entries())
			await f.command({ type: "assignTask", slice: `busy:${i}`, delivery: false, packet: coordinatorPacket({ role: "challenger" }) });
		await Promise.all(busy.map((b) => b.reached));
		const posted = await f.post("When you can.", "followUp", "c8-message");
		assert.equal(posted.status, "accepted");
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal((f.view().coordinator as { state: string }).state, "awaiting_capacity");
		assert.deepEqual(f.view().inbox, [{ commandId: "c8-message", whenBusy: "followUp", status: "accepted" }]);
		assert.equal(f.current().executing, false);
		busy[0]!.release();
		await until(async () => (await f.transcript()).some((m) => m.commandId === "c8-message"), "delivery after a slot frees");
		for (const b of busy) b.release();
	} finally {
		await f.close();
	}
});

test("a chat coordinator's turn budget bounds one run, not the whole chat", async () => {
	const f = await chatFixture({ packet: { maxTurns: 2 } });
	try {
		await idle(f);
		for (const n of [1, 2]) {
			f.chat.reply(f.coordinator, toolTurn, () => fauxAssistantMessage(`Run ${n} done.`));
			await f.post(`Run ${n}.`, "followUp", `budget-${n}`);
			await until(
				async () => (await f.transcript()).some((m) => m.kind === "assistant" && JSON.stringify(m).includes(`Run ${n} done.`)),
				`run ${n}`,
			);
			await idle(f);
		}
	} finally {
		await f.close();
	}
});

test("only humans post, withdraw and interrupt; only the host records delivery; whenBusy is required", async () => {
	const f = await chatFixture();
	try {
		const a = await idle(f);
		const agent = mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: "coordinator",
		});
		for (const context of [agent, scheduler])
			for (const command of [
				{ type: "postCoordinatorMessage", text: "spoofed", whenBusy: "followUp" },
				{ type: "withdrawCoordinatorMessage", message: "x" },
				{ type: "interruptCoordinator" },
			]) {
				const reply = await f.human(command, undefined, context);
				assert.equal(reply.status === "refused" && reply.code, "forbidden_principal", JSON.stringify({ command, reply }));
			}
		for (const command of [
			{ type: "recordMessageSubmission", message: "x", assignment: a.id, generation: a.generation, submission: 1 },
			{ type: "recordMessageWithdrawal", message: "x", outcome: "aborted" },
			{ type: "recordInterrupt", interrupt: 1 },
		]) {
			const reply = await f.human(command);
			assert.equal(reply.status === "refused" && reply.code, "forbidden_principal", JSON.stringify({ command, reply }));
		}
		const missing = await f.human({ type: "postCoordinatorMessage", text: "no mode" });
		assert.equal(missing.status === "refused" && missing.code, "malformed_envelope");
		const narrow = await device(f, ["workflow:999"]);
		const outside = await f.post("not mine", "followUp", "outside", narrow.context);
		assert.equal(outside.status === "refused" && outside.code, "forbidden_scope");
	} finally {
		await f.close();
	}
});

test("C10 the export carries the committed coordinator transcript without hidden reasoning or opaque provider fields", async () => {
	const f = await chatFixture();
	try {
		await idle(f);
		f.chat.reply(f.coordinator, () =>
			fauxAssistantMessage([fauxThinking("SECRET-THOUGHT"), fauxText("Visible answer.")], { responseId: "opaque-response-17" }),
		);
		await f.post("Explain.", "followUp", "c10-message");
		await until(async () => JSON.stringify(await f.transcript()).includes("Visible answer."), "the reply");
		await idle(f);
		const transcript = JSON.stringify(await f.transcript());
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: WORKFLOW } }));
		assert.ok(!("status" in exported && exported.status === "refused"), JSON.stringify(exported));
		const bundle = JSON.stringify(exported);
		const records = String((exported as unknown as { jsonl: string }).jsonl)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Record<string, unknown>);
		const chat = records.find((r) => r.kind === "chat_transcript" && r.assignment === f.coordinator);
		assert.ok(chat, "a coordinator transcript record");
		assert.deepEqual(chat.redacted, ["hidden_reasoning", "opaque_provider_fields"]);
		assert.ok(JSON.stringify(chat).includes("Visible answer."));
		assert.ok(JSON.stringify(chat).includes("c10-message"));
		for (const text of [transcript, bundle]) {
			assert.equal(text.includes("SECRET-THOUGHT"), false, "hidden reasoning stays out");
			assert.equal(text.includes("opaque-response-17"), false, "opaque provider fields stay out");
		}
	} finally {
		await f.close();
	}
});
