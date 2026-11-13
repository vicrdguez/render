import {
	defineDoc,
	defineExtension,
	defineTask,
	defineTool,
	type JsonObject,
	type TaskDefinition,
	type Tx,
} from "@earendil-works/pi-durable";
import { compile, type JsonSchema, obj, str } from "@earendil-works/pi-schema";
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
const done = { status: "terminal" as const, outcome: { status: "completed" as const, result: null } };
const abort: TaskDefinition<Record<string, never>, Phase, null, object>["abort"] = async (
	_task,
	runtime,
	c,
) => {
	await runtime.commit(
		() => ({ status: "terminal", outcome: { status: "aborted", reason: "stopped" } }),
		c,
	);
};

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
	abort,
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
	abort,
});

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
			name: "schedule",
			description: "Wake up in a week.",
			parameters: obj({}),
			execute: async (_args, api, c) => {
				await api.commit(
					(tx) => tx.createTask(Due, {}, background(api.conversationId as never)),
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
	tasks: [Due, Broken],
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
