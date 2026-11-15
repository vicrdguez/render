import { type ConversationId, type Extension, type Registry } from "@earendil-works/pi-durable";
import { type Store } from "../store/host.js";
import type { Catalogue } from "./catalogue.js";
import type { ServerOptions } from "./index.js";
import { type Outcome } from "./refusals.js";
export declare const PROJECT = "^[a-z0-9][a-z0-9-]{0,62}$";
export type Project = {
    readonly project: string;
    readonly workdir: string;
    readonly extensions: readonly string[];
};
export type ProjectView = Project & {
    readonly missing: readonly string[];
};
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
    readonly selection: {
        defaults: Extension[];
    };
    readonly lock: {
        release(): void;
    };
};
/** The catalogue under `projects/`, one lock, store, and registry for each, and each project's default selection. */
export declare class Projects {
    #private;
    readonly skipped: {
        project: string;
        reason: string;
    }[];
    catalogue: Catalogue;
    constructor(options: ServerOptions, catalogue: Catalogue);
    start(): Promise<void>;
    get(name: string): OpenProject | undefined;
    all(): (OpenProject & {
        selection: Opened["selection"];
        lock: Opened["lock"];
    })[];
    list(): ProjectView[];
    view(record: Project, catalogue?: Catalogue): ProjectView;
    bind(input: Project, catalogue: Catalogue): Promise<Outcome<{
        project: ProjectView;
        repeated: boolean;
    }>>;
    addExtensions(name: string, names: readonly string[], catalogue: Catalogue): Promise<ProjectView>;
    /** Calls `join` for each project that a later `bind` opens, until the returned function is called. */
    onBind(join: (project: OpenProject) => void): () => void;
    publish(catalogue: Catalogue, found: ReadonlySet<string>, reaching: (project: string, extension: string) => void): Map<string, string[]>;
    close(): Promise<void>;
}
export {};
