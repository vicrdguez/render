import { type AssistantMessage } from "@earendil-works/pi-ai";
export declare function processJourney(config?: {
    now?: () => number;
    searchUrl?: string;
}): Promise<{
    root: string;
    home: string;
    laptop: string;
    phone: string;
    faux: {
        state: {
            callCount: number;
        };
        setResponses(next: AssistantMessage[]): void;
    };
    wire: string[];
    stdout: string[];
    stderr: string[];
    requests: unknown[];
    exits: unknown[][];
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
    stop: () => Promise<void>;
    restart(): Promise<void>;
    close(): Promise<void>;
}>;
