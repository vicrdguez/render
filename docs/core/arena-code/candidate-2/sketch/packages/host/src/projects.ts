import type { Context } from "@earendil-works/chord/context";
import type { Registry, WatchHandle } from "@earendil-works/pi-durable";
import type { Store } from "tau-store/host";
import type { ServerOptions } from "./index.js";
import type { Inbox } from "./streams.js";

export type Project = {
	project: string;
	workdir: string;
	extensions: readonly string[];
};
export type ProjectView = Project & { missing: readonly string[] };
export type OpenProject = {
	record: Project;
	registry: Registry;
	store: Store;
	close(): Promise<void>; // close harness/storage before releasing its lock
};

/** Sole owner of directory catalogue, Project doc, locks, registries and defaults.
 * No second persistent catalogue and no per-extension factory.
 */
export class Projects {
	constructor(options: ServerOptions, context: Context) {
		throw new Error("not implemented");
	}
	async start(): Promise<void> {
		// TODO enumerate ~/.tau/projects/<valid-id>/; take each lock before SQLite open.
		// TODO empty registry; openStore; read Project. Missing/mismatched doc: skip and report.
		// TODO install CodingTools and available named modules; derive default from non-workflows.
		// TODO provide settings.extensions getter, then resume every harness, even without clients.
		throw new Error("not implemented");
	}
	async bind(
		project: Project,
	): Promise<{ project: ProjectView; repeated: boolean }> {
		// TODO validate id regex, absolute workdir, extension names before mkdir.
		// TODO per-project in-process bind serialization PLUS process lifetime store lock.
		// TODO incomplete store may be completed by resent bind; conflict changes nothing.
		// TODO Project write -> install -> default -> resume; startup repairs gaps.
		throw new Error("not implemented");
	}
	async add(
		project: string,
		extensions: readonly string[],
	): Promise<ProjectView> {
		// TODO union without reorder; commit Project before install and default rebuild.
		throw new Error("not implemented");
	}
	get(project: string): OpenProject {
		throw new Error("not implemented");
	}
	list(): readonly ProjectView[] {
		throw new Error("not implemented");
	}
	async watchInbox(context: Context): Promise<WatchHandle<Inbox>> {
		// TODO own the merged watch here, where bind can add a newly opened store atomically.
		// Prefix store op paths with project; a failed store ends the merged watch.
		throw new Error("not implemented");
	}
	async close(): Promise<void> {
		throw new Error("not implemented");
	}
}
