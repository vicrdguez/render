export declare const DEVICE = "^[a-z][a-z0-9-]{0,31}$";
export type DeviceInfo = {
    device: string;
    pairedAt: number;
    revokedAt?: number;
};
export type EndReason = "stopping" | "revoked" | "failed";
/** devices.json, the pending pairing codes, and the open streams of each device. */
export declare class Devices {
    #private;
    private constructor();
    static load(home: string, now: () => number): Promise<Devices>;
    authenticate(header: string | undefined): string | undefined;
    issue(device: string): {
        code: string;
        expiresAt: number;
    } | {
        error: string;
    };
    pair(code: string): Promise<{
        device: string;
        token: string;
    } | undefined>;
    revoke(device: string): Promise<{
        done: true;
    } | {
        error: string;
    }>;
    list(): DeviceInfo[];
    /** Registers a stream's end so that a revoke or a stop reaches it. Returns its removal. */
    attach(device: string, end: (reason: EndReason) => void): () => void;
    endAll(reason: EndReason): void;
}
