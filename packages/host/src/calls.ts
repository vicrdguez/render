import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { Models } from "@earendil-works/pi-ai";
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
import type { Devices } from "./devices.js";
import { watchInbox } from "./inbox.js";
import type { ExtensionModule } from "./index.js";
import type { Options } from "./options.js";
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
const notYet = async (): Promise<never> => {
	throw new Error("not built yet");
};

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
		inProject(notYet),
	),
	conversations: unary(obj({ project, cursor, limit }), inProject(notYet)),
	open: stream(
		obj({ project, conversation: id, after: opt(int({ minimum: 0 })) }),
		inProject(notYet),
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
		inProject(notYet),
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
		inProject(notYet),
	),
	continue: unary(
		obj({ project, conversation: id, requestId: str({ minLength: 1 }) }),
		inProject(notYet),
	),
	stop: unary(obj({ project, conversation: id }), inProject(notYet)),
	setModel: unary(
		obj({
			project,
			conversation: id,
			model: str(),
			thinkingLevel: opt(oneOf(levels)),
		}),
		inProject(notYet),
	),
	inbox: stream(obj({}), async (host) => ({
		result: await watchInbox(host.projects),
	})),
	decision: unary(obj({ project, decision: str() }), inProject(notYet)),
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
		inProject(notYet),
	),
	timeline: stream(
		obj({ project, after: opt(int({ minimum: 0 })) }),
		inProject(notYet),
	),
	faults: unary(obj({ project, cursor, limit }), inProject(notYet)),
};
