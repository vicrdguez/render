import { type Cursor, defineTool } from "@earendil-works/pi-durable";
import { int, num, obj, str } from "@earendil-works/pi-schema";
import { emit, eventLog, withdraw } from "tau-store";
import { Book, Forecast, Recorded, Resolved, Revised } from "./book.js";
import { due } from "./tasks.js";

const parameters = obj({
	key: str(),
	text: str(),
	p: num({ minimum: 0, maximum: 1 }),
	resolveBy: int(),
	rule: str(),
});

function publishingTool(revising: boolean) {
	return defineTool({
		name: revising ? "revise_forecast" : "record_forecast",
		description: revising
			? "Replace an unsettled forecast on its existing key."
			: "Fix a forecast before the result. The probability is the agent's estimate.",
		parameters,
		replay: "safe",
		callers: ["model"],
		executionMode: "sequential",
		execute: async (args, api, context) => {
			const saved = await api.commit(async (tx) => {
				const book = await tx.doc(Book, api.conversationId);
				const receipt = book.receipts[api.taskId];
				if (receipt) return { forecast: receipt.forecast };
				const subject = `w2:${api.conversationId}:${args.key}`;
				const current = book.forecasts[subject];
				if (
					revising
						? !current ||
							current.state === "resolved" ||
							current.state === "voided"
						: current !== undefined
				)
					throw new Error(
						revising
							? "No unsettled forecast has that key."
							: "Forecast key already exists. Use revise_forecast.",
					);
				const replaces = revising ? current?.latest : undefined;
				const forecast = await tx.appendEntry(Forecast, api.conversationId, {
					data: {
						text: `${args.text}\n\nThe probability ${args.p} is the agent's estimate.\nResolve by ${args.resolveBy} (epoch milliseconds).\nRule: ${args.rule}`,
						p: args.p,
						resolveBy: args.resolveBy,
						rule: args.rule,
						...(replaces !== undefined && { replaces }),
					},
				});
				const timer = await tx.createTask(
					due,
					{ subject, forecast: forecast.id, dueAt: args.resolveBy },
					{
						ownership: { kind: "conversation" },
						conversationId: api.conversationId,
						background: true,
					},
				);
				if (revising) await withdraw(tx, subject);
				book.forecasts[subject] = {
					latest: forecast.id,
					state: "waiting",
					timer,
				};
				const result = { forecast: forecast.id };
				book.receipts[api.taskId] = result;
				const event = {
					forecast: forecast.id,
					at: api.now(),
					conversation: api.conversationId,
				};
				if (replaces !== undefined)
					await emit(tx, Revised, {
						...event,
						text: "Forecast revised. The previous version is replaced.",
						replaces,
					});
				else
					await emit(tx, Recorded, {
						...event,
						text: "Forecast recorded with the agent's probability estimate.",
					});
				return result;
			}, context);
			return {
				output: [{ type: "text", text: `Forecast ${saved.forecast} saved.` }],
				control: { terminate: true },
			};
		},
	});
}

export const recordForecast = publishingTool(false);
export const reviseForecast = publishingTool(true);
export const calibration = defineTool({
	name: "calibration",
	description:
		"Compare stated probabilities with outcomes across this project's event log.",
	parameters: obj({}),
	async execute(_args, api, context) {
		const report = await api.commit(async (tx) => {
			const log = await eventLog(tx);
			let cursor: Cursor | undefined;
			let scored = 0;
			let replaced = 0;
			let brier = 0;
			let probability = 0;
			let outcome = 0;
			do {
				const page = await tx.scanEntries(
					{ conversationId: log, order: "ascending" },
					100,
					cursor,
				);
				for (const entry of page.items) {
					if (Resolved.is(entry)) {
						scored++;
						brier += entry.data.score;
						probability += entry.data.p;
						outcome += entry.data.outcome;
					} else if (Revised.is(entry)) replaced++;
				}
				cursor = page.next;
			} while (cursor !== undefined);
			return `${scored} scored forecast${scored === 1 ? "" : "s"}, ${replaced} replaced forecast${replaced === 1 ? "" : "s"}.${scored ? ` Mean Brier score: ${brier / scored}. Mean stated probability: ${probability / scored}. Observed yes rate: ${outcome / scored}.` : " No scores yet."}`;
		}, context);
		return { output: [{ type: "text", text: report }] };
	},
});
