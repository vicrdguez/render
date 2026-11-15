import { type ServerOptions } from "tau/server";
export declare function until(what: string, test: () => boolean | Promise<boolean>): Promise<void>;
export declare function post(url: string, name: string, body: object, token?: string): Promise<{
    status: number;
    body: any;
}>;
export declare function watch(url: string, name: string, body: object, token: string): Promise<{
    value: any;
    frames: string[];
    error: unknown;
    close: () => void;
}>;
export declare function journey(changes?: Partial<ServerOptions>): Promise<{
    root: string;
    home: string;
    faux: import("@earendil-works/pi-ai").FauxProviderHandle;
    laptop: string;
    phone: string;
    wire: string[];
    call: (name: string, body: object, token?: string) => Promise<{
        status: number;
        body: any;
    }>;
    ok(name: string, body: object, token?: string): Promise<any>;
    watch: (name: string, body: object, token?: string) => Promise<{
        value: any;
        frames: string[];
        error: unknown;
        close: () => void;
    }>;
    restart(patch?: Partial<ServerOptions>): Promise<void>;
    stop: () => Promise<void>;
    close(): Promise<void>;
}>;
export type Journey = Awaited<ReturnType<typeof journey>>;
export declare function decision(j: Pick<Journey, "call" | "phone">, id: string, project?: string): Promise<any>;
