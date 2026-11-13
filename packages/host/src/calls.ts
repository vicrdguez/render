import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { Models } from "@earendil-works/pi-ai";
import {
	type Conversation,
	ConversationBusy,
	type ConversationId,
	ConversationIdle,
	type Cursor,
	configure,
	type EntryId,
	type EntryQuery,
	LiveDoc,
	type ScanOrder,
} from "@earendil-works/pi-durable";
import {
	arr,
	compile,
	int,
	map,
	obj,
	oneOf,
	opt,
	type Schema,
	str,
	union,
	unknown,
} from "@earendil-works/pi-schema";
import { type DecisionId, decision } from "tau-store";
import { answer } from "tau-store/host";
import { decodeCursor, encodeCursor } from "./cursors.js";
import type { Devices } from "./devices.js";
import { type Positions, scanFaults } from "./faults.js";
import { watchInbox } from "./inbox.js";
import type { ExtensionModule } from "./index.js";
import { hasModel, modelRef, type Options } from "./options.js";
import { type OpenProject, PROJECT, type Projects } from "./projects.js";
import { type Outcome, refuse } from "./refusals.js";

/** What every call reaches, bound once when the server starts. */
export type Host = {
	readonly projects: Projects;
	readonly devices: Devices;
	readonly modules: Readonly<Record<string, ExtensionModule>>;
	readonly options: ReadonlyMap<string, Options>;
	readonly models: () => Models;
};
type Run<T, R> = (host: Host, device: string, input: T) => Promise<Outcome<R>>;
export type Call =
	| { readonly stream: false; dispatch: Run<unknown, unknown> }
	| { readonly stream: true; dispatch: Run<unknown, WatchHandle<JsonValue>> };

function checked<T, R>(schema: Schema<T>, run: Run<T, R>): Run<unknown, R> {
	const validator = compile(schema);
	return async (host, device, body) => {
		const parsed = validator.validate(body);
		return parsed.ok
			? run(host, device, parsed.value as T)
			: refuse("bad_request", "The body does not fit the call.", {
					errors: parsed.errors,
				});
	};
}
function inProject<T extends { project: string }, R>(
	run: (
		host: Host,
		device: string,
		input: T,
		open: OpenProject,
	) => Promise<Outcome<R>>,
): Run<T, R> {
	return async (host, device, input) => {
		const open = host.projects.get(input.project);
		return open === undefined
			? refuse("unknown_project", `No project is named ${input.project}.`)
			: run(host, device, input, open);
	};
}
const unary = <T, R>(schema: Schema<T>, run: Run<T, R>): Call => ({
	stream: false,
	dispatch: checked(schema, run),
});
const stream = <T>(
	schema: Schema<T>,
	run: Run<T, WatchHandle<JsonValue>>,
): Call => ({
	stream: true,
	dispatch: checked(schema, run),
});
function inConversation<T extends { project: string; conversation: number }, R>(
	writes: boolean,
	run: (
		host: Host,
		device: string,
		input: T,
		conversation: Conversation,
		open: OpenProject,
	) => Promise<Outcome<R>>,
): Run<T, R> {
	return inProject(async (host, device, input, open) => {
		if (writes && input.conversation === open.log)
			return refuse("event_log", "Nothing may run in the event log.");
		const conversation = await open.store.harness.conversation(
			input.conversation as ConversationId,
			context,
		);
		return conversation === undefined
			? refuse(
					"unknown_conversation",
					`${input.project} has no conversation ${input.conversation}.`,
				)
			: run(host, device, input, conversation, open);
	});
}
const watchOf = async (
	conversation: Conversation,
	after: number | undefined,
): Promise<Outcome<WatchHandle<JsonValue>>> => {
	const watch = await conversation.watch(
		context,
		after === undefined ? undefined : { from: (after + 1) as EntryId },
	);
	return { result: watch as unknown as WatchHandle<JsonValue> };
};
const page = <T>(
	items: T[],
	next: string | undefined,
): { items: T[]; next?: string } =>
	next === undefined ? { items } : { items, next };
const badCursor = () =>
	refuse("bad_cursor", "This cursor was not made by this call.");
const DEFAULT_LIMIT = 50;

const project = str({ pattern: PROJECT });
const id = int({ minimum: 1 });
const cursor = opt(str());
const limit = opt(int({ minimum: 1 }));
const levels = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

// The one list of calls. HTTP routes and `unknown_call` both read its keys.
export const calls: Readonly<Record<string, Call>> = {
	extensions: unary(obj({}), async (host) => ({
		result: {
			items: Object.entries(host.modules).map(([name, module]) => ({
				name,
				workflow: module.entry !== undefined,
				...(module.options === undefined
					? {}
					: { schema: module.options.schema }),
			})),
		},
	})),
	models: unary(obj({}), async (host) => ({
		result: {
			items: (await host.models().getAvailable()).map((model) => ({
				model: `${model.provider}/${model.id}`,
				name: model.name,
			})),
		},
	})),
	projects: unary(obj({}), async (host) => ({
		result: { items: host.projects.list() },
	})),
	bind: unary(
		obj({ project, workdir: str({ pattern: "^/" }), extensions: arr(str()) }),
		(host, _device, input) => host.projects.bind(input),
	),
	addExtensions: unary(
		obj({ project, extensions: arr(str()) }),
		inProject(async (host, _device, input) => ({
			result: {
				project: await host.projects.addExtensions(
					input.project,
					input.extensions,
				),
			},
		})),
	),
	options: unary(
		obj({ project }),
		inProject(async (host, _device, _input, open) => {
			const items = await open.store.harness.commit(async (tx) => {
				const views = [];
				for (const name of open.record.extensions) {
					const options = host.options.get(name);
					if (options === undefined) continue;
					views.push({
						extension: name,
						schema: options.schema,
						...(await options.view(tx)),
					});
				}
				return views;
			}, context);
			return { result: { items } };
		}),
	),
	setOptions: unary(
		obj({ project, extension: str(), patch: map(unknown()) }),
		inProject(async (host, _device, input, open) => {
			const name = input.extension;
			if (
				!open.record.extensions.includes(name) ||
				!Object.hasOwn(host.modules, name)
			)
				return refuse(
					"extension_not_loaded",
					`${input.project} has no extension ${name}.`,
				);
			const options = host.options.get(name);
			if (options === undefined)
				return refuse("bad_options", `${name} has no options.`, {
					errors: [
						{ path: "", keyword: "options", message: `${name} has no options` },
					],
				});
			const patched = await open.store.harness.commit(
				(tx) => options.patch(tx, input.patch),
				context,
			);
			return "errors" in patched
				? refuse("bad_options", `The options of ${name} do not fit.`, {
						errors: patched.errors,
					})
				: { result: patched };
		}),
	),
	create: unary(
		union([obj({ project, workflow: str() }), obj({ project, model: str() })]),
		inProject(async (host, _device, input, open) => {
			const { harness } = open.store;
			const cwd = open.record.workdir;
			if ("model" in input) {
				const model = modelRef(input.model);
				if (model === undefined || !hasModel(host.models, input.model))
					return refuse(
						"unknown_model",
						`This server has no model ${input.model}.`,
					);
				const conversation = await harness.commit(async (tx) => {
					const created = await tx.createConversation({
						ownership: { kind: "ownerless" },
					});
					await configure(tx, created.id, { cwd, model });
					return created.id;
				}, context);
				return { result: { conversation } };
			}
			const name = input.workflow;
			const module = Object.hasOwn(host.modules, name)
				? host.modules[name]
				: undefined;
			if (!open.record.extensions.includes(name))
				return refuse(
					"not_a_workflow",
					`${input.project} has no workflow ${name}.`,
				);
			if (module === undefined)
				return refuse(
					"extension_not_loaded",
					`This server has no code for ${name}.`,
				);
			const entry = module.entry;
			if (entry === undefined)
				return refuse("not_a_workflow", `${name} is not a workflow.`);
			const options = host.options.get(name);
			return harness.commit(async (tx) => {
				const errors =
					options === undefined ? [] : (await options.view(tx)).errors;
				if (errors.length > 0)
					return refuse(
						"options_invalid",
						`The options of ${name} are not all set.`,
						{
							errors,
						},
					);
				const created = await tx.createConversation({
					ownership: { kind: "ownerless" },
				});
				const change = typeof entry === "function" ? await entry(tx) : entry;
				await configure(tx, created.id, { cwd, ...change });
				return { result: { conversation: created.id } };
			}, context);
		}),
	),
	conversations: unary(
		obj({ project, cursor, limit }),
		inProject(async (_host, _device, input, open) => {
			const { harness } = open.store;
			let position: Cursor | undefined;
			if (input.cursor !== undefined) {
				const decoded = decodeCursor(
					input.cursor,
					"conversations",
					input.project,
				);
				if (decoded === undefined) return badCursor();
				position = decoded.position as Cursor;
			}
			const scanned = await harness.commit(
				(tx) =>
					tx.scanConversations({}, input.limit ?? DEFAULT_LIMIT, position),
				context,
			);
			const items = [];
			for (const record of scanned.items) {
				if (record.id === open.log) continue;
				const live = await harness.snapshot(LiveDoc, record.id, context);
				items.push({
					conversation: record.id,
					...(record.owner === undefined ? {} : { owner: record.owner }),
					state:
						live?.run !== undefined
							? "running"
							: live?.runFailure !== undefined
								? "failed"
								: "idle",
				});
			}
			const next =
				scanned.next === undefined
					? undefined
					: encodeCursor("conversations", input.project, {}, scanned.next);
			return { result: page(items, next) };
		}),
	),
	open: stream(
		obj({ project, conversation: id, after: opt(int({ minimum: 0 })) }),
		inConversation(false, (_host, _device, input, conversation) =>
			watchOf(conversation, input.after),
		),
	),
	history: unary(
		obj({
			project,
			conversation: id,
			cursor,
			limit,
			minEntryId: opt(id),
			maxEntryId: opt(id),
			order: opt(oneOf(["ascending", "descending"])),
		}),
		inConversation(false, async (_host, _device, input, conversation) => {
			const asked = {
				conversation: input.conversation,
				minEntryId: input.minEntryId,
				maxEntryId: input.maxEntryId,
				order: input.order,
			};
			let query: Readonly<Record<string, unknown>> = asked;
			let position: Cursor | undefined;
			if (input.cursor !== undefined) {
				const decoded = decodeCursor(input.cursor, "history", input.project);
				if (
					decoded === undefined ||
					Object.entries(asked).some(
						([key, value]) =>
							value !== undefined && decoded.query[key] !== value,
					)
				)
					return badCursor();
				query = decoded.query;
				position = decoded.position as Cursor;
			}
			const bounds: Omit<EntryQuery, "conversationId"> = {
				...(typeof query.minEntryId === "number"
					? { minEntryId: query.minEntryId as EntryId }
					: {}),
				...(typeof query.maxEntryId === "number"
					? { maxEntryId: query.maxEntryId as EntryId }
					: {}),
				...(query.order === "ascending" || query.order === "descending"
					? { order: query.order as ScanOrder }
					: {}),
			};
			const entries = await conversation.entries(
				bounds,
				input.limit ?? DEFAULT_LIMIT,
				position,
				context,
			);
			const next =
				entries.next === undefined
					? undefined
					: encodeCursor(
							"history",
							input.project,
							{ conversation: input.conversation, ...bounds },
							entries.next,
						);
			return { result: page([...entries.items], next) };
		}),
	),
	input: unary(
		obj({
			project,
			conversation: id,
			text: str(),
			requestId: str({ minLength: 1 }),
			whenBusy: opt(oneOf(["steer", "followUp"])),
			whenIdle: opt(oneOf(["reject"])),
		}),
		inConversation(true, async (_host, device, input, conversation) => {
			try {
				const submission = await conversation.submit(
					{
						type: "input",
						content: input.text,
						requestId: `client:${device}:${input.requestId}`,
						...(input.whenBusy === undefined
							? {}
							: { whenBusy: input.whenBusy }),
						...(input.whenIdle === undefined
							? {}
							: { whenIdle: input.whenIdle }),
					},
					context,
				);
				return { result: { submission: await submission.status(context) } };
			} catch (error) {
				if (error instanceof ConversationIdle)
					return refuse("idle", "Nothing runs in this conversation.");
				throw error;
			}
		}),
	),
	continue: unary(
		obj({ project, conversation: id, requestId: str({ minLength: 1 }) }),
		inConversation(true, async (_host, device, input, conversation) => {
			try {
				const submission = await conversation.submit(
					{
						type: "continue",
						requestId: `client:${device}:${input.requestId}`,
					},
					context,
				);
				return { result: { submission: await submission.status(context) } };
			} catch (error) {
				if (error instanceof ConversationBusy)
					return refuse("busy", "A run is working in this conversation.");
				throw error;
			}
		}),
	),
	stop: unary(
		obj({ project, conversation: id }),
		inConversation(true, async (_host, _device, _input, conversation) => {
			await conversation.abort(context);
			return { result: {} };
		}),
	),
	setModel: unary(
		obj({
			project,
			conversation: id,
			model: str(),
			thinkingLevel: opt(oneOf(levels)),
		}),
		inConversation(true, async (host, _device, input, conversation) => {
			const model = modelRef(input.model);
			if (model === undefined || !hasModel(host.models, input.model))
				return refuse(
					"unknown_model",
					`This server has no model ${input.model}.`,
				);
			await conversation.configure(
				{
					model,
					...(input.thinkingLevel === undefined
						? {}
						: { thinkingLevel: input.thinkingLevel }),
				},
				context,
			);
			return { result: {} };
		}),
	),
	inbox: stream(obj({}), async (host) => ({
		result: await watchInbox(host.projects),
	})),
	decision: unary(
		obj({ project, decision: str() }),
		inProject(async (_host, _device, input, open) => {
			const { harness } = open.store;
			const found = await harness.commit(async (tx) => {
				const record = await decision(tx, input.decision as DecisionId);
				if (record === undefined) return undefined;
				const data = (await tx.entry(record.basis))?.data as
					| { text?: unknown }
					| undefined;
				return {
					record,
					text: typeof data?.text === "string" ? data.text : "",
				};
			}, context);
			if (found === undefined)
				return refuse(
					"unknown_decision",
					`${input.project} has no decision ${input.decision}.`,
				);
			const then =
				found.record.status === "answered"
					? (await harness.getTask(found.record.continuation, context))?.state
					: undefined;
			return {
				result: {
					decision: found.record,
					text: found.text,
					...(then === undefined ? {} : { then }),
				},
			};
		}),
	),
	answer: unary(
		obj({
			project,
			decision: str(),
			basis: id,
			choice: str(),
			annotations: arr(
				obj({
					text: str(),
					range: opt(
						obj({ start: int({ minimum: 0 }), end: int({ minimum: 0 }) }),
					),
				}),
			),
		}),
		inProject(async (_host, device, input, open) => {
			const answered = await answer(
				open.store,
				input.decision as DecisionId,
				{
					basis: input.basis as EntryId,
					choice: input.choice,
					annotations: input.annotations,
				},
				device,
				context,
			);
			return answered.kind === "answered"
				? {
						result: {
							decision: answered.decision,
							repeated: answered.repeated,
						},
					}
				: { refused: answered.refusal };
		}),
	),
	timeline: stream(
		obj({ project, after: opt(int({ minimum: 0 })) }),
		inProject(async (_host, _device, input, open) => {
			const log = await open.store.harness.conversation(open.log, context);
			if (log === undefined)
				throw new Error(`${input.project} has lost its event log`);
			return watchOf(log, input.after);
		}),
	),
	faults: unary(
		obj({ project, cursor, limit }),
		inProject(async (host, _device, input, open) => {
			let positions: Positions = {};
			if (input.cursor !== undefined) {
				const decoded = decodeCursor(input.cursor, "faults", input.project);
				if (decoded === undefined) return badCursor();
				positions = decoded.position as Positions;
			}
			const kinds = open.record.extensions.flatMap((name) =>
				Object.hasOwn(host.modules, name)
					? (host.modules[name]?.extension.tasks ?? []).map(
							(task) => task.definition.name,
						)
					: [],
			);
			const scanned = await scanFaults(
				open,
				kinds,
				input.limit ?? DEFAULT_LIMIT,
				positions,
			);
			const more = kinds.some((kind) => scanned.positions[kind] !== null);
			const next = more
				? encodeCursor(
						"faults",
						input.project,
						{},
						scanned.positions as JsonValue,
					)
				: undefined;
			return { result: page(scanned.items, next) };
		}),
	),
};
