import net from "node:net";
import { type Static } from "@earendil-works/pi-schema";
import { type Devices } from "./devices.js";
import type { Outcome } from "./refusals.js";
import { ReloadReport } from "./reload.js";
declare const Result: import("@earendil-works/pi-schema").Schema<{
    code: string;
    expiresAt: number;
} | {
    devices: {
        device: string;
        pairedAt: number;
        revokedAt?: number;
    }[];
} | {
    done: true;
} | {
    reload: {
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
    };
} | {
    error: string;
}>;
export type AdminRequest = {
    command: "pair";
    device: string;
} | {
    command: "revoke";
    device: string;
} | {
    command: "list";
} | {
    command: "extension_reload";
};
export type AdminResult = Static<typeof Result>;
export declare const adminSocket: (home: string) => string;
/** Sends one command to the server that runs on `home`, through its owner-only socket. */
export declare function requestAdmin(home: string, request: AdminRequest): Promise<AdminResult>;
/** Refuses when a live server answers on the socket, and removes a socket that a killed server left. */
export declare function refuseRunning(file: string): Promise<void>;
export declare function listenAdmin(file: string, devices: Devices, reload: () => Promise<Outcome<ReloadReport>>): Promise<net.Server>;
export {};
