/**
 * The host: one server process for every project (docs/core/README.md, "What Tau ships"; docs/core/topology.md).
 *
 * `openHost` returns the deep module of the host layer. Its one way in for a client's call is `call`, which the HTTP
 * layer and the tests both use, so a test of a call exercises the same check, routing, and refusals as a client does.
 * The host knows no particular extension: it gets the import map as `config.modules` from apps/tau.
 */

import type { Context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import type { Report } from "@earendil-works/pi-durable";
import type { JsonSchema } from "@earendil-works/pi-schema";
import type { ExtensionModule } from "../module.ts";
import type { DeviceId } from "../store/decision.ts";
import type { CallBody, CallName, CallResult } from "./calls.ts";
import type { DeviceRecord, Devices } from "./devices.ts";
import type { Feeds } from "./feed.ts";
import type { OpenProject, ProjectName, SkippedStore } from "./project.ts";
import type { Refusal } from "./refusals.ts";

export type HostConfig = {
	/** `~/.tau` for the server. A temporary directory in a test. Holds `projects/`, `devices.json`, `admin.sock`. */
	readonly root: string;
	/** The import map, from apps/tau/src/extensions.ts. Keyed by `extension.name`; two modules with one name refuse to open. */
	readonly modules: readonly ExtensionModule[];
	/** pi-ai models with the owner's logins on the server's machine. A faux provider in a test. */
	readonly models: Models;
	/** The Harness clock of every project. `Date.now` by default. A test passes its own and reopens to move time. */
	readonly now?: () => number;
	/** pi-durable's reports, by project. The server logs them. */
	readonly onReport?: (project: ProjectName, report: Report) => void;
};

/** A reply has exactly one of three bodies (protocol.md, "A call"). `unknown`: the server cannot tell if it took effect. */
export type Reply<R> =
	| { readonly result: R }
	| { readonly refused: Refusal }
	| { readonly unknown: { readonly code: "storage_failed" | "failed"; readonly message: string } };

export type Host = {
	/**
	 * Runs one of the client's calls for a device whose token the transport has checked. The body is checked here, so a
	 * typed body from a test and a parsed body from HTTP take the same path.
	 */
	call<N extends CallName>(device: DeviceId, name: N, body: CallBody<N>): Promise<Reply<CallResult<N>>>;
	call(device: DeviceId, name: string, body: unknown): Promise<Reply<unknown>>;
	/** The device of an `Authorization: Bearer tau.<device>.<secret>` header, or `undefined`. */
	authenticate(authorization: string | undefined): DeviceId | undefined;
	/** `POST /v1/pair {"code"}`, the one request with no token: a code for a token, once. Else `bad_code`. */
	redeem(code: string): Promise<Reply<{ readonly device: DeviceId; readonly token: string }>>;
	/** What `tau device pair|revoke|list` asks for, through `admin.sock`. `pair` issues a code. */
	readonly admin: {
		pair(device: string): Promise<{ readonly code: string } | { readonly refused: string }>;
		revoke(device: string): Promise<void>;
		list(): readonly DeviceRecord[];
	};
	/** Ends every feed with `stopping`, closes every store, and releases every lock. */
	close(): Promise<void>;
};

/** The host's own state. Internal: the domain modules of src/host/ take it as their first argument. */
export type HostState = {
	readonly config: HostConfig & { readonly now: () => number };
	readonly modules: ReadonlyMap<string, ExtensionModule>;
	readonly projects: Map<ProjectName, OpenProject>;
	readonly skipped: SkippedStore[];
	readonly devices: Devices;
	readonly feeds: Feeds;
	/** One entry per open inbox feed: takes in a project bound while the feed is open (src/host/inbox.ts). */
	readonly inboxes: Set<(project: OpenProject) => Promise<void>>;
	/** The host's own context. Work runs under it, so a client that disconnects ends only its own feed. */
	readonly context: Context;
};

/**
 * Opens the host: index the modules by name, read `devices.json`, then open every project under `<root>/projects/`
 * in the start order of src/host/project.ts. Every project is open while the host is (topology.md, "the server opens
 * every project at start").
 */
export async function openHost(config: HostConfig): Promise<Host> {
	// TODO:
	//   modules = new Map(config.modules.map(m => [m.extension.name, m])); a repeated name throws at start
	//   devices = await openDevices(join(root, "devices.json"), now)
	//   state = { ..., projects: new Map(), feeds: createFeeds(), context: BACKGROUND_CONTEXT }
	//   await openProjects(state, state.context)
	//   validators = new Map(callNames.map(n => [n, compile(calls[n].body)]))   // derived from the list, once
	//   call(device, name, body):
	//     def = calls[name]                     -> refuse unknown_call with { calls: callNames }
	//     errors = validators.get(name).errors(body) -> refuse bad_request with { errors }
	//     scope "project": project = state.projects.get(body.project) -> refuse unknown_project
	//     try outcome = await def.run({ host: state, device, context, project? }, body)
	//     catch: a storage rejection is { unknown: storage_failed }, anything else { unknown: failed }
	//     a `stream` result is registered: state.feeds.add(device, feed)
	//   admin.revoke(name) = devices.revoke(id), then feeds.end(id, "revoked")
	//   close() = feeds.end("all", "stopping"), then close each store and release each lock
	void config;
	throw new Error("not implemented");
}

/** The `extensions` call: each extension the server has, whether it is a workflow, and its options schema. */
export function listExtensions(host: HostState): {
	readonly items: readonly { name: string; workflow: boolean; schema?: JsonSchema }[];
} {
	void host;
	throw new Error("not implemented");
}
