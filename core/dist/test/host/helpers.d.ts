import http from "node:http";
import { createModels, type FauxProviderHandle } from "@earendil-works/pi-ai";
import { type Server, type ServerOptions } from "../../src/host/index.js";
export type Reply = {
    status: number;
    headers: http.IncomingHttpHeaders;
    body: {
        result?: any;
        refused?: {
            code: string;
            message: string;
            [key: string]: any;
        };
        unknown?: {
            code: string;
            message: string;
        };
    };
};
export declare const newHome: () => Promise<string>;
export declare function faux(ids?: readonly string[]): {
    faux: FauxProviderHandle;
    models: ReturnType<typeof createModels>;
};
export declare function send(url: string, pathname: string, body: string | undefined, headers?: Record<string, string>, method?: string): Promise<Reply>;
export type Running = {
    readonly server: Server;
    readonly url: string;
    readonly home: string;
    readonly token: string;
    readonly faux: FauxProviderHandle;
    call(name: string, body: unknown, token?: string): Promise<Reply>;
    pair(device: string): Promise<string>;
    watch(name: string, body: unknown, token?: string): Watch;
    restart(changes?: TestOptions): Promise<Running>;
    close(): Promise<void>;
};
export type TestOptions = Partial<Omit<ServerOptions, "models">> & {
    models?: ReturnType<typeof faux>;
    token?: string;
};
export declare function start(options?: TestOptions, device?: string): Promise<Running>;
export type Watch = {
    status: number;
    headers: http.IncomingHttpHeaders;
    value: any;
    frames: number;
    heartbeats: number;
    end: string | undefined;
    closed: boolean;
    refused: Reply["body"] | undefined;
    newest: number;
    held: Map<number, any>;
    gaps: {
        minEntryId: number;
        maxEntryId: number;
    }[];
    response: http.IncomingMessage | undefined;
    until(test: (watch: Watch) => boolean, what?: string): Promise<void>;
    close(): void;
};
export declare function watch(url: string, name: string, body: unknown, token: string): Watch;
export declare function until(what: string, test: () => boolean | Promise<boolean>): Promise<void>;
export declare const TWENTY_CALLS: readonly ["extensions", "models", "projects", "bind", "addExtensions", "options", "setOptions", "create", "conversations", "open", "history", "input", "continue", "stop", "setModel", "inbox", "decision", "answer", "timeline", "faults"];
