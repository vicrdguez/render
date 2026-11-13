import type { Context } from "@earendil-works/chord/context";
import type {
	ConversationId,
	ConversationRecord,
	ConversationView,
	EntryRecord,
	JsonObject,
	SubmissionRecord,
	TaskRecord,
	WatchHandle,
} from "@earendil-works/pi-durable";
import type { Static } from "@earendil-works/pi-schema";
import {
	arr,
	int,
	lit,
	map,
	num,
	obj,
	opt,
	str,
	union,
	unknown as unknownSchema,
} from "@earendil-works/pi-schema";
import type { Decision, DeviceId } from "tau-store";
import type { AnswerResult } from "tau-store/host";
import type { Fault } from "./faults.js";
import type { Refusal } from "./http.js";
import type { ServerOptions } from "./index.js";
import type { OptionsView } from "./options.js";
import type { Projects, ProjectView } from "./projects.js";
import type { Inbox } from "./streams.js";

// ONE executable call-name list. HTTP routes, discovery, request types and route tests use this value.
// Each schema is a closed pi-schema object; no separate request interface to hand-sync.
// Boundary parse turns integer IDs into pi-durable nominal IDs, and model strings into ModelRef.
type CallContext = {
	projects: Projects;
	options: ServerOptions;
	device: DeviceId;
	context: Context;
};
type Outcome<R> = { result: R } | { refused: Refusal };
type Page<T> = { items: readonly T[]; next?: string };
function unary<S extends object, R>(
	schema: S,
	run: (c: CallContext, input: Static<S>) => Promise<Outcome<R>>,
) {
	return {
		mode: "unary" as const,
		schema,
		run,
		async dispatch(c: CallContext, input: unknown): Promise<Outcome<R>> {
			// TODO compile(schema).validate(input), bad_request with pi-schema errors, or run(c, checked.value).
			// Keep the schema/handler type witness inside this closure; HTTP never casts a union of bodies.
			throw new Error("not implemented");
		},
	};
}
function stream<S extends object, R>(
	schema: S,
	run: (c: CallContext, input: Static<S>) => Promise<Outcome<WatchHandle<R>>>,
) {
	return {
		mode: "stream" as const,
		schema,
		run,
		async dispatch(
			c: CallContext,
			input: unknown,
		): Promise<Outcome<WatchHandle<R>>> {
			// TODO same closed validation before acquiring a watch or sending SSE headers.
			throw new Error("not implemented");
		},
	};
}
const project = str({ pattern: "^[a-z0-9][a-z0-9-]{0,62}$" });
const id = int({ minimum: 1 });
const model = str({ format: "model" });
const cursor = opt(str());
const limit = opt(int({ minimum: 1 }));
const empty = obj({});
const annotation = obj({
	text: str(),
	range: opt(obj({ start: num(), end: num() })),
});

export const calls = {
	extensions: unary(
		empty,
		async (
			c,
			input,
		): Promise<
			Outcome<{
				items: readonly {
					name: string;
					workflow: boolean;
					schema?: object | boolean;
				}[];
			}>
		> => {
			throw new Error("not implemented");
		},
	),
	models: unary(
		empty,
		async (
			c,
			input,
		): Promise<
			Outcome<{ items: readonly { model: string; name: string }[] }>
		> => {
			// TODO pi-ai getAvailable(), not a second model catalogue.
			throw new Error("not implemented");
		},
	),
	projects: unary(
		empty,
		async (c, input): Promise<Outcome<{ items: readonly ProjectView[] }>> => {
			throw new Error("not implemented");
		},
	),
	bind: unary(
		obj({ project, workdir: str({ pattern: "^/" }), extensions: arr(str()) }),
		async (
			c,
			input,
		): Promise<Outcome<{ project: ProjectView; repeated: boolean }>> => {
			throw new Error("not implemented");
		},
	),
	addExtensions: unary(
		obj({ project, extensions: arr(str()) }),
		async (c, input): Promise<Outcome<{ project: ProjectView }>> => {
			throw new Error("not implemented");
		},
	),
	options: unary(
		obj({ project }),
		async (c, input): Promise<Outcome<{ items: readonly OptionsView[] }>> => {
			throw new Error("not implemented");
		},
	),
	setOptions: unary(
		obj({ project, extension: str(), patch: map(unknownSchema()) }),
		async (c, input): Promise<Outcome<{ value: JsonObject }>> => {
			throw new Error("not implemented");
		},
	),
	create: unary(
		union([obj({ project, workflow: str() }), obj({ project, model })]),
		async (c, input): Promise<Outcome<{ conversation: ConversationId }>> => {
			// TODO bare: {cwd,model}, no selection. Workflow: options check INCLUDING missing,
			// create ownerless, apply entry(tx) plus project cwd in same commit.
			// cwd must win if entry supplies it: requirement in host.md and primitives.md.
			throw new Error("not implemented");
		},
	),
	conversations: unary(
		obj({ project, cursor, limit }),
		async (
			c,
			input,
		): Promise<
			Outcome<
				Page<{
					conversation: ConversationId;
					owner?: NonNullable<ConversationRecord["owner"]>;
					state: "idle" | "running" | "failed";
				}>
			>
		> => {
			// TODO scanConversations plus pi.live; exclude event log. Resolve owner from substrate ownership.
			throw new Error("not implemented");
		},
	),
	open: stream(
		obj({ project, conversation: id, after: opt(id) }),
		async (c, input): Promise<Outcome<WatchHandle<ConversationView>>> => {
			throw new Error("not implemented");
		},
	),
	history: unary(
		obj({
			project,
			conversation: id,
			cursor,
			limit,
			minEntryId: opt(id),
			maxEntryId: opt(id),
			order: opt(union([lit("ascending"), lit("descending")])),
		}),
		async (c, input): Promise<Outcome<Page<EntryRecord>>> => {
			// TODO allow event log; cursor owns query bounds through restart.
			throw new Error("not implemented");
		},
	),
	input: unary(
		obj({
			project,
			conversation: id,
			text: str(),
			requestId: str(),
			whenBusy: union([lit("steer"), lit("followUp")]),
			whenIdle: opt(lit("reject")),
		}),
		async (c, input): Promise<Outcome<{ submission: SubmissionRecord }>> => {
			// TODO reject event log. Prefix client:<device>:<requestId>. No disconnect cancellation.
			throw new Error("not implemented");
		},
	),
	continue: unary(
		obj({ project, conversation: id, requestId: str() }),
		async (c, input): Promise<Outcome<{ submission: SubmissionRecord }>> => {
			// TODO reject event log; busy refusal is not a failed-storage reply.
			throw new Error("not implemented");
		},
	),
	stop: unary(
		obj({ project, conversation: id }),
		async (c, input): Promise<Outcome<Record<string, never>>> => {
			// TODO abort and wait. A second stop stops whatever runs THEN, not the old run only.
			throw new Error("not implemented");
		},
	),
	setModel: unary(
		obj({ project, conversation: id, model, thinkingLevel: opt(str()) }),
		async (c, input): Promise<Outcome<Record<string, never>>> => {
			// TODO validate thinkingLevel against selected model's pi-ai 1.5.2 values.
			// Only model/thinkingLevel change, never instructions, cwd or tools.
			throw new Error("not implemented");
		},
	),
	inbox: stream(
		empty,
		async (c, input): Promise<Outcome<WatchHandle<Inbox>>> => {
			// TODO mount store open-list watches under project keys; newly bound projects get s ops.
			throw new Error("not implemented");
		},
	),
	decision: unary(
		obj({ project, decision: str() }),
		async (
			c,
			input,
		): Promise<
			Outcome<{
				decision: Decision;
				text: string;
				then?: TaskRecord<unknown, unknown, unknown>["state"];
			}>
		> => {
			throw new Error("not implemented");
		},
	),
	answer: unary(
		obj({
			project,
			decision: str(),
			basis: id,
			choice: str(),
			annotations: arr(annotation),
		}),
		async (
			c,
			input,
		): Promise<
			Outcome<Omit<Extract<AnswerResult, { kind: "answered" }>, "kind">>
		> => {
			// TODO tau-store/host.answer with authenticated device, never a body field named by.
			// Map its domain kind to result/refused here; no HTTP envelope enters the store.
			throw new Error("not implemented");
		},
	),
	timeline: stream(
		obj({ project, after: opt(id) }),
		async (c, input): Promise<Outcome<WatchHandle<ConversationView>>> => {
			// TODO obtain eventLog, then the same view watch as open. No cursor here.
			throw new Error("not implemented");
		},
	),
	faults: unary(
		obj({ project, cursor, limit }),
		async (c, input): Promise<Outcome<Page<Fault>>> => {
			throw new Error("not implemented");
		},
	),
};
export type Calls = typeof calls;
export type CallName = keyof Calls;
export type RequestOf<N extends CallName> = Parameters<Calls[N]["run"]>[1];
export type ResultOf<N extends CallName> = Awaited<ReturnType<Calls[N]["run"]>>;
// No separately maintained CALL_NAMES, route switch, or list in unknown_call.
