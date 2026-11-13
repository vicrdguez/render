import { defineTask, type EntryId } from "@earendil-works/pi-durable";
import { type DecisionInput, decision, emit, request } from "tau-store";
import {
	Asked,
	Book,
	Forecast,
	Rescheduled,
	Resolved,
	Voided,
} from "./book.js";

export type Choice = "yes" | "no" | "void" | "not yet";
export type DueInput = { subject: string; forecast: EntryId; dueAt: number };
const completed = {
	status: "terminal",
	outcome: { status: "completed", result: null },
} as const;
const aborted = { status: "terminal", outcome: { status: "aborted" } } as const;

export const due = defineTask<
	DueInput,
	{ phase: "sleep" } | { phase: "ask" },
	null
>({
	name: "w2.due",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: (task, runtime, context) =>
			runtime.sleepUntil(task.input.dueAt, { phase: "ask" }, context),
		ask: (task, runtime, context) =>
			runtime.commit(async (tx) => {
				const book = await tx.doc(Book, runtime.conversationId);
				const current = book.forecasts[task.input.subject];
				if (
					current?.state !== "waiting" ||
					current.latest !== task.input.forecast ||
					current.timer !== task.id
				)
					return completed;
				const basis = await tx.entry(Forecast, current.latest);
				if (!basis) throw new Error("Forecast entry is missing.");
				const asked = await request(tx, {
					subject: task.input.subject,
					title: "Resolve forecast",
					basis,
					choices: ["yes", "no", "void", "not yet"],
					conversation: runtime.conversationId,
					then: score,
					requestedAt: runtime.now(),
				});
				book.forecasts[task.input.subject] = {
					latest: current.latest,
					state: "open",
					round: asked.id,
				};
				await emit(tx, Asked, {
					text: "Forecast is due.",
					at: runtime.now(),
					conversation: runtime.conversationId,
					forecast: basis.id,
					decision: asked.id,
				});
				return completed;
			}, context),
	},
	abort: (_task, runtime, context) => runtime.commit(() => aborted, context),
});

export const score = defineTask<
	DecisionInput<Choice>,
	{ phase: "score" },
	null
>({
	name: "w2.score",
	version: 1,
	initial: () => ({ phase: "score" }),
	phases: {
		score: (task, runtime, context) =>
			runtime.commit(async (tx) => {
				const answered = await decision(tx, task.input.decision);
				const book = await tx.doc(Book, runtime.conversationId);
				if (
					answered?.status !== "answered" ||
					answered.conversation !== runtime.conversationId ||
					answered.choice !== task.input.choice ||
					book.scored[answered.id]
				)
					return completed;
				const current = book.forecasts[answered.subject];
				if (
					current?.state !== "open" ||
					current.round !== answered.id ||
					current.latest !== answered.basis
				)
					return completed;
				const forecast = await tx.entry(Forecast, current.latest);
				if (!forecast) throw new Error("Forecast entry is missing.");
				const event = {
					at: runtime.now(),
					conversation: runtime.conversationId,
					forecast: forecast.id,
					decision: answered.id,
				};
				switch (task.input.choice) {
					case "not yet": {
						const dueAt = answered.at + 604_800_000;
						const timer = await tx.createTask(
							due,
							{ subject: answered.subject, forecast: forecast.id, dueAt },
							{
								ownership: { kind: "conversation" },
								conversationId: runtime.conversationId,
								background: true,
							},
						);
						book.forecasts[answered.subject] = {
							latest: forecast.id,
							state: "waiting",
							timer,
						};
						await emit(tx, Rescheduled, {
							...event,
							text: "Forecast deferred for seven days after the answer.",
							due: dueAt,
						});
						break;
					}
					case "void":
						book.forecasts[answered.subject] = {
							latest: forecast.id,
							state: "voided",
						};
						await emit(tx, Voided, {
							...event,
							text: "Forecast voided without a score.",
						});
						break;
					case "yes":
					case "no": {
						const outcome = task.input.choice === "yes" ? 1 : 0;
						const p = forecast.data.p;
						const brier = (p - outcome) ** 2;
						book.forecasts[answered.subject] = {
							latest: forecast.id,
							state: "resolved",
						};
						await emit(tx, Resolved, {
							...event,
							text: `Forecast resolved ${task.input.choice}. Brier score: ${brier.toFixed(3)}.`,
							p,
							outcome,
							score: brier,
						});
						break;
					}
				}
				book.scored[answered.id] = true;
				return completed;
			}, context),
	},
	abort: (_task, runtime, context) => runtime.commit(() => aborted, context),
});
