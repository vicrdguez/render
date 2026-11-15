import type { JsonValue } from "@earendil-works/chord/json";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { Models } from "@earendil-works/pi-ai";
import type { Devices } from "./devices.js";
import { type Projects } from "./projects.js";
import { type Outcome } from "./refusals.js";
import type { StructuralQueue } from "./structural.js";
/** What every call reaches, bound once when the server starts. */
export type Host = {
    readonly projects: Projects;
    readonly devices: Devices;
    readonly structural: StructuralQueue;
    readonly models: () => Models;
};
type Run<T, R> = (host: Host, device: string, input: T) => Promise<Outcome<R>>;
export type Call = {
    readonly stream: false;
    dispatch: Run<unknown, unknown>;
} | {
    readonly stream: true;
    dispatch: Run<unknown, WatchHandle<JsonValue>>;
};
export declare const calls: Readonly<Record<string, Call>>;
export {};
