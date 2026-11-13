import type { DeviceId } from "tau-store";
import type { AdminRequest, AdminResult } from "./index.js";

export type DeviceRecord = {
	device: DeviceId;
	hash: string;
	pairedAt: number;
	revokedAt?: number;
};
export class Devices {
	constructor(home: string, now: () => number) {
		throw new Error("not implemented");
	}
	async load(): Promise<void> {
		// TODO pi-schema validate devices.json; mode 0600; atomic replace on durable changes.
		throw new Error("not implemented");
	}
	authenticate(authorization: string | undefined): DeviceId {
		// TODO token tau.<device>.<32 random bytes base64url>; compare SHA-256 in constant time.
		throw new Error("not implemented");
	}
	async admin(request: AdminRequest): Promise<AdminResult> {
		// TODO id ^[a-z][a-z0-9-]{0,31}$; IDs never reused, even if revoked.
		// TODO pair code 8 chars, display XXXX-XXXX, one use, 10 minute expiry.
		// TODO revoke persisted first; end this device's streams with revoked.
		throw new Error("not implemented");
	}
	registerStream(
		device: DeviceId,
		end: (reason: "revoked" | "stopping") => void,
	): () => void {
		// TODO track in the same owner as revocation. Already revoked refuses attachment.
		// Return a detach function. No socket or token state is exposed to the command.
		throw new Error("not implemented");
	}
	close(): void {
		// TODO end every registered stream with stopping; revoke ends only that device.
		throw new Error("not implemented");
	}
	async pair(code: string): Promise<{ device: DeviceId; token: string }> {
		// TODO five wrong codes in a row cancel all pending codes.
		// TODO persist hash BEFORE returning token; no plaintext token persisted or logged.
		throw new Error("not implemented");
	}
}
