import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import {
	type ConversationId,
	createRegistry,
	defineDoc,
	type Extension,
	type JsonObject,
	type Registry,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { arr, compile, obj, str } from "@earendil-works/pi-schema";
import { eventLog } from "tau-store";
import { openStore, type Store } from "tau-store/host";
import type { ServerOptions } from "./index.js";
import { acquireLock } from "./lock.js";
import { type Outcome, refuse } from "./refusals.js";

export const PROJECT = "^[a-z0-9][a-z0-9-]{0,62}$";
const NAME = new RegExp(PROJECT);

export type Project = {
	readonly project: string;
	readonly workdir: string;
	readonly extensions: readonly string[];
};
export type ProjectView = Project & { readonly missing: readonly string[] };
export type OpenProject = {
	readonly name: string;
	readonly store: Store;
	readonly registry: Registry;
	readonly log: ConversationId;
	record: Project;
};
type Opened = {
	readonly name: string;
	readonly store: Store;
	readonly registry: Registry;
	readonly selection: { defaults: Extension[] };
	readonly lock: { release(): void };
};

const ProjectDoc = defineDoc<JsonObject>({
	kind: "tau.project",
	version: 1,
	scope: "session",
	initial: () => ({}),
	checkpointWhen: () => false,
});
const checkProject = compile(
	obj({ project: str(), workdir: str(), extensions: arr(str()) }),
);
const same = (a: Project, b: Project) =>
	a.project === b.project &&
	a.workdir === b.workdir &&
	a.extensions.length === b.extensions.length &&
	a.extensions.every((name, i) => name === b.extensions[i]);

async function readProject(store: Store): Promise<Project | undefined> {
	const stored = await store.harness.snapshot(ProjectDoc, context);
	return checkProject.check(stored) ? stored : undefined;
}
async function shut(opened: Opened) {
	try {
		await opened.store.harness.close(context);
	} finally {
		opened.lock.release();
	}
}

/** The catalogue under `projects/`, one lock, store, and registry for each, and each project's default selection. */
export class Projects {
	readonly skipped: { project: string; reason: string }[] = [];
	readonly #root: string;
	readonly #options: ServerOptions;
	readonly #open = new Map<string, OpenProject & { selection: Opened["selection"]; lock: Opened["lock"] }>();
	readonly #queues = new Map<string, Promise<unknown>>();
	readonly #joined = new Set<(project: OpenProject) => void>();

	constructor(options: ServerOptions) {
		this.#root = path.join(options.home, "projects");
		this.#options = options;
	}

	async start(): Promise<void> {
		const names = await readdir(this.#root).catch((error) => {
			if (error.code === "ENOENT") return [];
			throw error;
		});
		for (const name of names.sort()) {
			if (!NAME.test(name)) {
				this.skipped.push({ project: name, reason: "not a project name" });
				continue;
			}
			const opened = await this.#openDirectory(name);
			const found = await readProject(opened.store).catch(async (error) => {
				await shut(opened);
				throw error;
			});
			if (found === undefined || found.project !== name) {
				await shut(opened);
				this.skipped.push({
					project: name,
					reason:
						found === undefined
							? "its store holds no Project"
							: `its store belongs to ${found.project}`,
				});
				continue;
			}
			await this.#finish(opened, found);
		}
	}

	get(name: string): OpenProject | undefined {
		return this.#open.get(name);
	}

	list(): ProjectView[] {
		return [...this.#open.values()]
			.sort((a, b) => (a.name < b.name ? -1 : 1))
			.map((open) => this.view(open.record));
	}

	view(record: Project): ProjectView {
		return {
			project: record.project,
			workdir: record.workdir,
			extensions: [...record.extensions],
			missing: record.extensions.filter(
				(name) => !Object.hasOwn(this.#options.modules, name),
			),
		};
	}

	bind(input: Project): Promise<Outcome<{ project: ProjectView; repeated: boolean }>> {
		return this.#serial(input.project, async () => {
			const known = this.#open.get(input.project);
			if (known !== undefined) return this.#compare(known.record, input);
			const opened = await this.#openDirectory(input.project);
			try {
				const found = await readProject(opened.store);
				if (found !== undefined && !same(found, input)) {
					await shut(opened);
					return this.#compare(found, input);
				}
				if (found === undefined) {
					await opened.store.harness.commit(async (tx) => {
						Object.assign(await tx.doc(ProjectDoc), {
							project: input.project,
							workdir: input.workdir,
							extensions: [...input.extensions],
						});
					}, context);
				}
				const open = await this.#finish(opened, input);
				for (const join of this.#joined) join(open);
				return {
					result: { project: this.view(input), repeated: found !== undefined },
				};
			} catch (error) {
				if (!this.#open.has(input.project)) await shut(opened).catch(() => {});
				throw error;
			}
		});
	}

	addExtensions(name: string, names: readonly string[]): Promise<ProjectView> {
		return this.#serial(name, async () => {
			const open = this.#open.get(name);
			if (open === undefined) throw new Error(`${name} is not open`);
			const added = [...new Set(names)].filter(
				(n) => !open.record.extensions.includes(n),
			);
			if (added.length > 0) {
				const extensions = [...open.record.extensions, ...added];
				await open.store.harness.commit(async (tx) => {
					(await tx.doc(ProjectDoc)).extensions = [...extensions];
				}, context);
				open.record = { ...open.record, extensions };
				this.#install(open);
			}
			return this.view(open.record);
		});
	}

	/** Calls `join` for each project that a later `bind` opens, until the returned function is called. */
	onBind(join: (project: OpenProject) => void): () => void {
		this.#joined.add(join);
		return () => this.#joined.delete(join);
	}

	async close(): Promise<void> {
		const open = [...this.#open.values()];
		this.#open.clear();
		for (const project of open) await shut(project);
	}

	#compare(stored: Project, input: Project): Outcome<{ project: ProjectView; repeated: boolean }> {
		return same(stored, input)
			? { result: { project: this.view(stored), repeated: true } }
			: refuse("conflict", `${input.project} is bound with other fields.`, {
					project: this.view(stored),
				});
	}

	#serial<T>(name: string, work: () => Promise<T>): Promise<T> {
		const next = (this.#queues.get(name) ?? Promise.resolve()).then(work);
		this.#queues.set(
			name,
			next.catch(() => {}),
		);
		return next;
	}

	async #openDirectory(name: string): Promise<Opened> {
		const directory = path.join(this.#root, name);
		await mkdir(directory, { recursive: true });
		const lock = acquireLock(path.join(directory, "store.lock"));
		try {
			const registry = createRegistry();
			const selection: Opened["selection"] = { defaults: [] };
			const { models, env, now } = this.#options;
			const storage = await openNodeSqliteStorage(path.join(directory, "store.sqlite"));
			const store = await openStore(
				storage,
				{
					models,
					registry,
					settings: () => ({ extensions: selection.defaults }),
					...(env === undefined ? {} : { env }),
					...(now === undefined ? {} : { now }),
				},
				context,
			);
			return { name, store, registry, selection, lock };
		} catch (error) {
			lock.release();
			throw error;
		}
	}

	async #finish(opened: Opened, record: Project) {
		const log = await opened.store.harness.commit((tx) => eventLog(tx), context);
		const open = { ...opened, log, record };
		opened.registry.install(CodingTools);
		this.#install(open);
		opened.store.harness.resume();
		this.#open.set(opened.name, open);
		return open;
	}

	#install(open: Opened & { record: Project }) {
		const modules = open.record.extensions.flatMap((name) => {
			const module = this.#options.modules[name];
			return Object.hasOwn(this.#options.modules, name) && module !== undefined ? [module] : [];
		});
		const installed = open.registry.snapshot();
		for (const module of modules)
			if (installed.extension(module.extension.name) === undefined)
				open.registry.install(module.extension);
		open.selection.defaults = [
			CodingTools,
			...modules.filter((m) => m.entry === undefined).map((m) => m.extension),
		];
	}
}
