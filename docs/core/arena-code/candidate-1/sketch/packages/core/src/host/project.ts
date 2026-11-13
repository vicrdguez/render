/**
 * Projects: binding, the start order, the project default, and the lock (docs/core/host.md, "Binding a project and
 * choosing extensions" and "What the server reads at start"; docs/core/topology.md, "What the server must do").
 *
 * The only writer of the `Project` document and of the in-memory list of open projects. The catalogue is the list of
 * directories under `<root>/projects/`, so it cannot disagree with the stores.
 */

import type { Context } from "@earendil-works/chord/context";
import type { Extension, Registry } from "@earendil-works/pi-durable";
import { defineDoc } from "@earendil-works/pi-durable";
import type { Store } from "../store/store.ts";
import type { HostState } from "./host.ts";
import type { Outcome } from "./refusals.ts";

declare const projectBrand: unique symbol;

/** `^[a-z0-9][a-z0-9-]{0,62}$`. The client picks it, so a resent `bind` finds its project. Its directory's name. */
export type ProjectName = string & { readonly [projectBrand]: true };

export const PROJECT_NAME = "^[a-z0-9][a-z0-9-]{0,62}$";

/** The `Project` session document, `{ project, workdir, extensions }` (host.md). The store layer never reads it. */
const ProjectDoc = defineDoc<{ project?: string; workdir?: string; extensions: string[] }>({
	kind: "tau.project",
	version: 1,
	scope: "session",
	initial: () => ({ extensions: [] }),
	checkpointWhen: () => false,
});

/** What `bind` and `projects` return for a project (docs/core/protocol.md, "Three calls in full"). */
export type ProjectView = {
	readonly project: ProjectName;
	readonly workdir: string;
	readonly extensions: readonly string[];
	readonly missing: readonly string[]; // listed names the server has no module for
};

/** One open project. Its fields change only through this module. */
export type OpenProject = {
	readonly name: ProjectName;
	readonly workdir: string;
	readonly store: Store;
	readonly registry: Registry;
	/** The names in `Project`, as last committed. */
	extensions(): readonly string[];
};

/** A store found at start that was not opened, and why. `projects` reports it. */
export type SkippedStore = { readonly directory: string; readonly reason: "no_project" | "other_project" | "locked" };

/**
 * The start order (host.md, "What the server reads at start"): for each directory under `<root>/projects/`, take the
 * lock, open the store with an empty registry, read `Project`, skip and record a store without one or with another
 * project's name, install `coding-tools` and each listed extension the server has, pass the default, `resume()`.
 * A crash between the `Project` commit of a `bind` or `addExtensions` and its install is repaired here.
 */
export async function openProjects(host: HostState, context: Context): Promise<void> {
	void [host, context, ProjectDoc];
	throw new Error("not implemented");
}

/**
 * `bind({ project, workdir, extensions })` (host.md, "Binding a project"). In order: check the name and the extension
 * names, make the directory, take the lock, open the store with an empty registry (the store layer creates the event
 * log), one commit writes `Project`, install, pass the default, `resume()`, add the project to open inbox feeds.
 * Equal fields return the project with `repeated: true`. Other fields give `conflict` with the stored project.
 */
export async function bind(
	host: HostState,
	body: { readonly project: string; readonly workdir: string; readonly extensions: readonly string[] },
	context: Context,
): Promise<Outcome<{ readonly project: ProjectView; readonly repeated: boolean }>> {
	void [host, body, context];
	throw new Error("not implemented");
}

/**
 * `addExtensions`: one commit writes the longer list, then `registry.install()`, which publishes at once. The default
 * follows from the list. The same names change nothing. No extension is ever removed (host.md, an accepted limit).
 */
export async function addExtensions(
	host: HostState,
	project: OpenProject,
	names: readonly string[],
	context: Context,
): Promise<Outcome<{ readonly project: ProjectView }>> {
	void [host, project, names, context];
	throw new Error("not implemented");
}

export function viewOf(host: HostState, project: OpenProject): ProjectView {
	void [host, project];
	throw new Error("not implemented");
}

/** The `projects` call: each open project, and each store skipped at start with its reason. */
export function listProjects(host: HostState): {
	readonly items: readonly ProjectView[];
	readonly skipped: readonly SkippedStore[];
} {
	void host;
	throw new Error("not implemented");
}

/**
 * The project default that the harness reads at every use (docs/core/extensions.md, "What a project selects"):
 * `coding-tools`, then each listed extension with no `entry` that the server has a module for.
 * A workflow is never in it.
 */
export function defaultSelection(host: HostState, project: OpenProject): readonly Extension[] {
	void [host, project];
	throw new Error("not implemented");
}

/**
 * One process writes a store at a time; pi-durable has no lock across processes (README.md:894).
 * The lock is a file beside `store.sqlite`.
 */
export async function lockStore(directory: string): Promise<{ release(): Promise<void> } | undefined> {
	// TODO: the ways it can fail come first, in test/host/lock.test.ts: a second server on the same root, a lock left by
	// a process killed with SIGKILL (must not block the restart), and a crash between taking the lock and opening the
	// store. Node has no flock, so the choice between an O_EXCL file with the owner's pid and another scheme is made there.
	void directory;
	throw new Error("not implemented");
}
