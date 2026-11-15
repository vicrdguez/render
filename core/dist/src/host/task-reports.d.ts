import { type Static } from "@earendil-works/pi-schema";
import type { Projects } from "./projects.js";
export declare const TaskWarning: import("@earendil-works/pi-schema").Schema<{
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
}>;
export type TaskWarning = Static<typeof TaskWarning>;
export declare const safeMessage: (error: unknown) => string;
export declare function taskLine(task: TaskWarning): string;
export declare function inspectTasks(projects: Projects): Promise<TaskWarning[]>;
