import {
	defineDoc,
	defineEntry,
	defineExtension,
	defineTask,
	defineTool,
	type JsonObject,
	type TaskDefinition,
	type Tx,
} from "@earendil-works/pi-durable";
import {
	bool,
	compile,
	int,
	type JsonSchema,
	obj,
	opt,
	str,
} from "@earendil-works/pi-schema";
import { type DecisionInput, type EventData, emit, request } from "tau-store";
import type { ExtensionModule } from "../src/index.js";

export const WEEK = 7 * 24 * 3600 * 1000;
const text = (t: string) => [{ type: "text" as const, text: t }];
const plain = (value: unknown): JsonObject => JSON.parse(JSON.stringify(value));

function optionsOf(name: string, schema: JsonSchema) {
	const Doc = defineDoc<JsonObject>({
		kind: `${name}.options`,
		version: 1,
		scope: "session",
		initial: () => ({}),
		checkpointWhen: () => false,
	});
	return {
		schema,
		get: async (tx: Tx) => plain(await tx.doc(Doc)),
		set: async (tx: Tx, value: JsonObject) => {
			const doc = await tx.doc(Doc);
			for (const key of Object.keys(doc)) delete doc[key];
			Object.assign(doc, value);
		},
	};
}

const searchOptions = optionsOf(
	"search",
	obj({ provider: str(), apiKey: str({ format: "secret", minLength: 1 }) }),
);
export const Search = defineExtension({
	name: "search",
	tools: [
		defineTool({
			name: "web_search",
			description: "Search the web.",
			parameters: obj({ query: str() }),
			execute: async () => ({ output: text("three results") }),
		}),
	],
});
export const search: ExtensionModule = {
	extension: Search,
	options: searchOptions,
};

export const Notes = defineExtension({
	name: "notes",
	tools: [
		defineTool({
			name: "note",
			description: "Take a note.",
			parameters: obj({}),
			execute: async () => ({ output: text("noted") }),
		}),
	],
});
export const notes: ExtensionModule = { extension: Notes };

type Phase = { phase: string };
const done = {
	status: "terminal" as const,
	outcome: { status: "completed" as const, result: null },
};
function abort<I>(): TaskDefinition<I, Phase, null, object>["abort"] {
	return async (_task, runtime, c) => {
		await runtime.commit(
			() => ({
				status: "terminal",
				outcome: { status: "aborted", reason: "stopped" },
			}),
			c,
		);
	};
}

export const Due = defineTask<Record<string, never>, Phase, null>({
	name: "flow.due",
	version: 1,
	initial: () => ({ phase: "sleep" }),
	phases: {
		sleep: async (_task, runtime, c) => {
			await runtime.sleepUntil(runtime.now() + WEEK, { phase: "wake" }, c);
		},
		wake: async (task, runtime, c) => {
			await runtime.commit(async (tx) => {
				await tx.appendEntry(task.conversationId, {
					kind: "flow.woke",
					data: { text: "woke" },
				});
				return done;
			}, c);
		},
	},
	abort: abort(),
});
export const Broken = defineTask<Record<string, never>, Phase, null>({
	name: "flow.broken",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async () => {
			throw new Error("review_start cannot go on");
		},
	},
	abort: abort(),
});

type Choice = "approve" | "revise";
export const Approved = defineTask<DecisionInput<Choice>, Phase, null>({
	name: "flow.approved",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async (task, runtime, c) => {
			await runtime.commit(async (tx) => {
				await tx.appendEntry(task.conversationId, {
					kind: "flow.answered",
					data: { text: task.input.choice },
				});
				return done;
			}, c);
		},
	},
	abort: abort(),
});
export const Dies = defineTask<DecisionInput<Choice>, Phase, null>({
	name: "flow.dies",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async () => {
			throw new Error("the work after the answer failed");
		},
	},
	abort: abort(),
});
const Design = defineEntry<{ text: string }>("flow.design");
export const Asked = defineEntry<EventData>("flow.asked");

/** Lets a test hold a run inside a tool round. */
export const gate = {
	entered: Promise.resolve(),
	release: () => {},
	arm() {
		let enter = () => {};
		gate.entered = new Promise<void>((resolve) => {
			enter = resolve;
		});
		const opened = new Promise<void>((resolve) => {
			gate.release = resolve;
		});
		gate.wait = async () => {
			enter();
			await opened;
		};
	},
	wait: async () => {},
};

const flowSchema = obj({
	designer: str({ format: "model" }),
	base: str({ minLength: 1, default: "main" }),
});
const flowOptions = optionsOf("flow", flowSchema);
const checkFlow = compile(flowSchema);
const background = (conversationId: never) => ({
	ownership: { kind: "conversation" as const },
	conversationId,
	background: true,
});
export const Flow = defineExtension({
	name: "flow",
	tools: [
		defineTool({
			name: "hold",
			description: "Wait until the test lets go.",
			parameters: obj({}),
			execute: async () => {
				await gate.wait();
				return { output: text("held") };
			},
		}),
		defineTool({
			name: "flood",
			description: "Write many notes, one commit each.",
			parameters: obj({
				count: int({ minimum: 1 }),
				size: int({ minimum: 0 }),
			}),
			execute: async (args, api, c) => {
				const big = "x".repeat(args.size);
				for (let i = 0; i < args.count; i++) {
					await api.commit(async (tx) => {
						await tx.appendEntry(api.conversationId, {
							kind: "flow.note",
							data: { i, big },
						});
					}, c);
				}
				return { output: text("flooded") };
			},
		}),
		defineTool({
			name: "ask",
			description: "Ask the owner to review a design.",
			parameters: obj({ key: str(), fail: opt(bool()) }),
			execute: async (args, api, c) => {
				const id = await api.commit(async (tx) => {
					const conversation = api.conversationId;
					const basis = await tx.appendEntry(Design, conversation, {
						data: { text: "Design v1: add a --json flag." },
					});
					const common = {
						subject: `flow:${args.key}`,
						title: `Review ${args.key}`,
						basis,
						choices: ["approve", "revise"] as const,
						conversation,
						requestedAt: api.now(),
					};
					const asked = args.fail
						? await request(tx, { ...common, then: Dies })
						: await request(tx, { ...common, then: Approved });
					await emit(tx, Asked, {
						text: `Asked for a review of ${args.key}.`,
						at: api.now(),
						conversation,
					});
					return asked.id;
				}, c);
				return { output: text(id) };
			},
		}),
		defineTool({
			name: "schedule",
			description: "Wake up in a week.",
			parameters: obj({}),
			execute: async (_args, api, c) => {
				await api.commit(
					(tx) =>
						tx.createTask(Due, {}, background(api.conversationId as never)),
					c,
				);
				return { output: text("scheduled") };
			},
		}),
		defineTool({
			name: "explode",
			description: "Start a task that throws.",
			parameters: obj({}),
			execute: async (_args, api, c) => {
				await api.commit(
					(tx) =>
						tx.createTask(Broken, {}, background(api.conversationId as never)),
					c,
				);
				return { output: text("started") };
			},
		}),
	],
	tasks: [Due, Broken, Approved, Dies],
});
export const flow: ExtensionModule = {
	extension: Flow,
	options: flowOptions,
	entry: async (tx: Tx) => {
		const value = { base: "main", ...(await flowOptions.get(tx)) };
		if (!checkFlow.check(value)) throw new Error("flow options do not fit");
		const cut = value.designer.indexOf("/");
		return {
			model: {
				provider: value.designer.slice(0, cut),
				modelId: value.designer.slice(cut + 1),
			},
			extensions: { add: [Flow] },
		};
	},
};

export const modules = { search, notes, flow };
