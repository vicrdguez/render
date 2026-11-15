import { type Static } from "@earendil-works/pi-schema";
import type { ServerOptions } from "./index.js";
import type { Projects } from "./projects.js";
export declare const ReloadReport: import("@earendil-works/pi-schema").Schema<{
    status: "refused" | "applied" | "restart_required";
    extensions: {
        name: string;
        status: "added" | "replaced" | "kept";
        projects: string[];
    }[];
    tasks: {
        project: string;
        task: number;
        kind: string;
        conversation: number;
        stored: number;
        installed: number;
        status: "blocked" | "migration-needed-on-reservation";
        reason: "migration_failed" | "task_too_old";
        until?: number;
        message?: string;
    }[];
    skipped: {
        project: string;
        reason: string;
    }[];
    failures: {
        name: string;
        stage: string;
        message: string;
        path?: string;
    }[];
    reached?: {
        project: string;
        extension: string;
    };
}>;
export type ReloadReport = Static<typeof ReloadReport>;
export declare function reload(projects: Projects, options: Pick<ServerOptions, "source" | "models">): Promise<ReloadReport>;
