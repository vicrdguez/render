import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createRegistry, defineDoc, } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { arr, compile, obj, str } from "@earendil-works/pi-schema";
import { eventLog } from "../store/index.js";
import { openStore } from "../store/host.js";
import { acquireLock } from "./lock.js";
import { refuse } from "./refusals.js";
import { safeMessage } from "./task-reports.js";
export const PROJECT = "^[a-z0-9][a-z0-9-]{0,62}$";
const NAME = new RegExp(PROJECT);
const ProjectDoc = defineDoc({
    kind: "tau.project",
    version: 1,
    scope: "session",
    initial: () => ({}),
    checkpointWhen: () => false,
});
const checkProject = compile(obj({ project: str(), workdir: str(), extensions: arr(str()) }));
const same = (a, b) => a.project === b.project &&
    a.workdir === b.workdir &&
    a.extensions.length === b.extensions.length &&
    a.extensions.every((name, i) => name === b.extensions[i]);
async function readProject(store) {
    const stored = await store.harness.snapshot(ProjectDoc, context);
    return checkProject.check(stored) ? stored : undefined;
}
async function shut(opened) {
    try {
        await opened.store.harness.close(context);
    }
    finally {
        opened.lock.release();
    }
}
/** The catalogue under `projects/`, one lock, store, and registry for each, and each project's default selection. */
export class Projects {
    skipped = [];
    #root;
    #options;
    catalogue;
    #open = new Map();
    #queues = new Map();
    #joined = new Set();
    constructor(options, catalogue) {
        this.#root = path.join(options.home, "projects");
        this.#options = options;
        this.catalogue = catalogue;
    }
    async start() {
        const catalogue = this.catalogue;
        const names = await readdir(this.#root).catch((error) => {
            if (error.code === "ENOENT")
                return [];
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
                    reason: found === undefined
                        ? "its store holds no Project"
                        : `its store belongs to ${found.project}`,
                });
                continue;
            }
            await this.#finish(opened, found, catalogue);
        }
    }
    get(name) {
        return this.#open.get(name);
    }
    all() {
        return [...this.#open.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
    }
    list() {
        return this.all().map((open) => this.view(open.record));
    }
    view(record, catalogue = this.catalogue) {
        return {
            project: record.project,
            workdir: record.workdir,
            extensions: [...record.extensions],
            missing: record.extensions.filter((name) => catalogue.get(name) === undefined),
        };
    }
    bind(input, catalogue) {
        return this.#serial(input.project, async () => {
            const known = this.#open.get(input.project);
            if (known !== undefined)
                return this.#compare(known.record, input, catalogue);
            const opened = await this.#openDirectory(input.project);
            try {
                const found = await readProject(opened.store);
                if (found !== undefined && !same(found, input)) {
                    await shut(opened);
                    return this.#compare(found, input, catalogue);
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
                const open = await this.#finish(opened, input, catalogue);
                for (const join of this.#joined)
                    join(open);
                return {
                    result: {
                        project: this.view(input, catalogue),
                        repeated: found !== undefined,
                    },
                };
            }
            catch (error) {
                if (!this.#open.has(input.project))
                    await shut(opened).catch(() => { });
                throw error;
            }
        });
    }
    addExtensions(name, names, catalogue) {
        return this.#serial(name, async () => {
            const open = this.#open.get(name);
            if (open === undefined)
                throw new Error(`${name} is not open`);
            const added = [...new Set(names)].filter((n) => !open.record.extensions.includes(n));
            if (added.length > 0) {
                const extensions = [...open.record.extensions, ...added];
                await open.store.harness.commit(async (tx) => {
                    (await tx.doc(ProjectDoc)).extensions = [...extensions];
                }, context);
                open.record = { ...open.record, extensions };
                this.#install(open, catalogue);
            }
            return this.view(open.record, catalogue);
        });
    }
    /** Calls `join` for each project that a later `bind` opens, until the returned function is called. */
    onBind(join) {
        this.#joined.add(join);
        return () => this.#joined.delete(join);
    }
    publish(catalogue, found, reaching) {
        const installed = new Map();
        for (const open of this.all()) {
            for (const name of open.record.extensions) {
                if (!found.has(name))
                    continue;
                const loaded = catalogue.get(name);
                if (loaded === undefined)
                    continue;
                reaching(open.name, name);
                open.registry.install(loaded.module.extension);
                const projects = installed.get(name) ?? [];
                projects.push(open.name);
                installed.set(name, projects);
            }
            open.selection.defaults = catalogue.defaults(open.record.extensions);
        }
        this.catalogue = catalogue;
        return installed;
    }
    async close() {
        const open = [...this.#open.values()];
        this.#open.clear();
        for (const project of open)
            await shut(project);
    }
    #compare(stored, input, catalogue) {
        return same(stored, input)
            ? { result: { project: this.view(stored, catalogue), repeated: true } }
            : refuse("conflict", `${input.project} is bound with other fields.`, {
                project: this.view(stored, catalogue),
            });
    }
    #serial(name, work) {
        const next = (this.#queues.get(name) ?? Promise.resolve()).then(work);
        this.#queues.set(name, next.catch(() => { }));
        return next;
    }
    async #openDirectory(name) {
        const directory = path.join(this.#root, name);
        await mkdir(directory, { recursive: true });
        const lock = acquireLock(path.join(directory, "store.lock"));
        try {
            const registry = createRegistry();
            const selection = { defaults: [] };
            const { models, env, now } = this.#options;
            const storage = await (this.#options.storage ?? openNodeSqliteStorage)(path.join(directory, "store.sqlite"));
            const store = await openStore(storage, {
                models,
                registry,
                onReport: (report) => {
                    if (report.kind === "migration_failed" ||
                        report.kind === "task_outdated")
                        process.stderr.write(`tau: ${report.kind} ${name} task=${report.task.id} kind=${report.task.kind}: ${safeMessage(report.error)}\n`);
                },
                settings: () => ({ extensions: selection.defaults }),
                ...(env === undefined ? {} : { env }),
                ...(now === undefined ? {} : { now }),
            }, context);
            return { name, store, registry, selection, lock };
        }
        catch (error) {
            lock.release();
            throw error;
        }
    }
    async #finish(opened, record, catalogue) {
        const log = await opened.store.harness.commit((tx) => eventLog(tx), context);
        const open = { ...opened, log, record };
        opened.registry.install(CodingTools);
        this.#install(open, catalogue);
        opened.store.harness.resume();
        this.#open.set(opened.name, open);
        return open;
    }
    #install(open, catalogue) {
        const installed = open.registry.snapshot();
        for (const { module } of catalogue.selected(open.record.extensions))
            if (installed.extension(module.extension.name) === undefined)
                open.registry.install(module.extension);
        open.selection.defaults = catalogue.defaults(open.record.extensions);
    }
}
//# sourceMappingURL=projects.js.map