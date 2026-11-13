/**
 * THE list of the client's calls (docs/core/host.md, "What a client must be able to do"; docs/core/protocol.md,
 * "Every other call"). Twenty entries, one per call, in host.md's order.
 *
 * Everything else derives from this object, so a call is added or changed here and nowhere else:
 * - the HTTP routes (`POST /v1/<name>`) and the `calls` field of `unknown_call`: src/protocol/http.ts reads `calls`;
 * - each body's check: a pi-schema validator compiled once per entry in src/host/host.ts. Objects are closed, so an
 *   unknown field is `bad_request` at its path;
 * - each body's and result's TypeScript type: `CallBody<N>` and `CallResult<N>` below, which `Host.call` and the tests use;
 * - which calls stream: `stream(...)` entries return a `Feed`, and the compiler holds them to it;
 * - the generic tests in test/protocol/calls.test.ts, which loop over `callNames`.
 *
 * An entry adapts its body to one domain function and does no work of its own.
 */

import type { Context } from "@earendil-works/chord/context";
import type { EntryId } from "@earendil-works/pi-durable";
import {
	arr,
	int,
	map,
	obj,
	oneOf,
	opt,
	type Properties,
	type Schema,
	type Static,
	str,
	union,
	unknown,
} from "@earendil-works/pi-schema";
import { answer, type DecisionId, type DeviceId, view } from "../store/decision.ts";
import { continueRun, create, history, input, list, open, setModel, stop, timeline } from "./conversations.ts";
import { faults } from "./faults.ts";
import type { Feed } from "./feed.ts";
import { type HostState, listExtensions } from "./host.ts";
import { inbox } from "./inbox.ts";
import { listModels } from "./models.ts";
import { readOptions, setOptions } from "./options.ts";
import { addExtensions, bind, listProjects, type OpenProject, PROJECT_NAME } from "./project.ts";
import { type Outcome, ok, refuse } from "./refusals.ts";

// ---- How an entry is built. ----------------------------------------------------------------------------------------

/** `server`: no project (`extensions`, `models`, `projects`, `inbox`). `bind`: names a new project. `project`: an open one. */
type Scope = "server" | "bind" | "project";

export type ServerCall = { readonly host: HostState; readonly device: DeviceId; readonly context: Context };
export type ProjectCall = ServerCall & { readonly project: OpenProject };
type CallOf<S extends Scope> = S extends "project" ? ProjectCall : ServerCall;

export type CallDef<S extends Scope, B, R, K extends "json" | "stream"> = {
	readonly scope: S;
	readonly reply: K;
	readonly body: Schema<B>;
	readonly run: (call: CallOf<S>, body: B) => Promise<Outcome<R>>;
};

function json<const S extends Scope, B, R>(
	scope: S,
	body: Schema<B>,
	run: (call: CallOf<S>, body: B) => Promise<Outcome<R>>,
): CallDef<S, B, R, "json"> {
	return { scope, reply: "json", body, run };
}

function stream<const S extends Scope, B>(
	scope: S,
	body: Schema<B>,
	run: (call: CallOf<S>, body: B) => Promise<Outcome<Feed>>,
): CallDef<S, B, Feed, "stream"> {
	return { scope, reply: "stream", body, run };
}

/** A body that names an open project. */
function inProject<const P extends Properties>(properties: P) {
	return obj({ project: str({ pattern: PROJECT_NAME }), ...properties });
}

const conversation = int({ minimum: 0 });
const cursor = opt(str({ minLength: 1 }));
const limit = opt(int({ minimum: 1, maximum: 500 }));
const decisionId = str({ pattern: "^.+:.+#[1-9][0-9]*$" });
const annotation = obj({
	text: str(),
	range: opt(obj({ start: int({ minimum: 0 }), end: int({ minimum: 0 }) })),
});

// ---- The list. -----------------------------------------------------------------------------------------------------

export const calls = {
	extensions: json("server", obj({}), async ({ host }) => ok(listExtensions(host))),

	models: json("server", obj({}), async ({ host }) => ok(listModels(host.config.models))),

	projects: json("server", obj({}), async ({ host }) => ok(listProjects(host))),

	bind: json(
		"bind",
		obj({ project: str({ pattern: PROJECT_NAME }), workdir: str({ pattern: "^/" }), extensions: arr(str()) }),
		({ host, context }, body) => bind(host, body, context),
	),

	addExtensions: json("project", inProject({ extensions: arr(str()) }), ({ host, project, context }, body) =>
		addExtensions(host, project, body.extensions, context),
	),

	options: json("project", inProject({}), ({ host, project, context }) => readOptions(host, project, context)),

	setOptions: json(
		"project",
		inProject({ extension: str(), patch: map(unknown()) }),
		({ host, project, context }, body) => setOptions(host, project, body.extension, body.patch, context),
	),

	create: json(
		"project",
		union([inProject({ workflow: str() }), inProject({ model: str() })]),
		({ host, project, context }, body) => create(host, project, body, context),
	),

	conversations: json("project", inProject({ cursor, limit }), ({ host, project, context }, body) =>
		list(host, project, body, context),
	),

	open: stream("project", inProject({ conversation, after: opt(int()) }), ({ host, project, device, context }, body) =>
		open(host, project, device, body, context),
	),

	history: json(
		"project",
		inProject({
			conversation,
			cursor,
			limit,
			minEntryId: opt(int()),
			maxEntryId: opt(int()),
			order: opt(oneOf(["ascending", "descending"])),
		}),
		({ host, project, context }, body) => history(host, project, body, context),
	),

	input: json(
		"project",
		inProject({
			conversation,
			text: str(),
			requestId: str({ minLength: 1 }),
			whenBusy: opt(oneOf(["steer", "followUp"])),
			whenIdle: opt(oneOf(["reject"])),
		}),
		({ host, project, device, context }, body) => input(host, project, device, body, context),
	),

	continue: json(
		"project",
		inProject({ conversation, requestId: str({ minLength: 1 }) }),
		({ host, project, device, context }, body) => continueRun(host, project, device, body, context),
	),

	stop: json("project", inProject({ conversation }), ({ host, project, context }, body) =>
		stop(host, project, body, context),
	),

	setModel: json(
		"project",
		inProject({ conversation, model: str(), thinkingLevel: opt(str()) }),
		({ host, project, context }, body) => setModel(host, project, body, context),
	),

	inbox: stream("server", obj({}), ({ host, device, context }) => inbox(host, device, context)),

	decision: json("project", inProject({ decision: decisionId }), async ({ project, context }, body) => {
		const seen = await view(project.store, body.decision as DecisionId, context);
		return seen === undefined ? refuse("unknown_decision", "No such decision in this project.") : ok(seen);
	}),

	answer: json(
		"project",
		inProject({ decision: decisionId, basis: int({ minimum: 0 }), choice: str(), annotations: arr(annotation) }),
		async ({ project, device }, body) => {
			// `by` is the device of the token. A body field `by` is refused as bad_request (protocol.md, "answer").
			const done = await answer(
				project.store,
				body.decision as DecisionId,
				{ basis: body.basis as EntryId, choice: body.choice, annotations: body.annotations },
				device,
			);
			if ("answered" in done) return ok({ decision: done.answered, repeated: done.repeated });
			// Row for row (protocol.md): `conflict` carries `decision`, `not_open` carries `open`.
			const { refused, ...fields } = done;
			return refuse(refused, `The answer was refused: ${refused}.`, fields);
		},
	),

	timeline: stream("project", inProject({ after: opt(int()) }), ({ host, project, device, context }, body) =>
		timeline(host, project, device, body, context),
	),

	faults: json("project", inProject({ cursor, limit }), ({ host, project, context }, body) =>
		faults(host, project, body, context),
	),
} as const;

// ---- What derives from the list. -------------------------------------------------------------------------------------

export type Calls = typeof calls;
export type CallName = keyof Calls;
export type CallBody<N extends CallName> = Static<Calls[N]["body"]>;
export type CallResult<N extends CallName> =
	Awaited<ReturnType<Calls[N]["run"]>> extends infer O ? (O extends { readonly result: infer R } ? R : never) : never;

/** The names, in the list's order: the routes, and the `calls` field of `unknown_call`. */
export const callNames = Object.keys(calls) as readonly CallName[];
