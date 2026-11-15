import type { JsonObject } from "@earendil-works/pi-durable";
import { type Journey } from "./journey.js";
export declare const identity: {
    GIT_AUTHOR_NAME: string;
    GIT_AUTHOR_EMAIL: string;
    GIT_COMMITTER_NAME: string;
    GIT_COMMITTER_EMAIL: string;
    GIT_CONFIG_GLOBAL: string;
    GIT_CONFIG_NOSYSTEM: string;
};
export declare const git: (cwd: string, ...args: string[]) => string;
export declare const call: (name: string, args?: JsonObject) => import("@earendil-works/pi-ai").AssistantMessage;
export declare const build: import("@earendil-works/pi-ai").AssistantMessage;
export declare const pass: import("@earendil-works/pi-ai").AssistantMessage;
export declare function setup(j: Journey, base?: string): Promise<{
    repo: string;
    conversation: number;
    shown: any;
}>;
export declare function answer(shown: any, choice: string, annotations?: object[]): {
    project: string;
    decision: any;
    basis: any;
    choice: string;
    annotations: object[];
};
export declare function stage(j: Journey, stage: string): Promise<any>;
