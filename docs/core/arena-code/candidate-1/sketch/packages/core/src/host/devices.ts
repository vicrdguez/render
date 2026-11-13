/**
 * Devices and tokens (docs/core/protocol.md, "Devices and tokens").
 *
 * The only reader and writer of `~/.tau/devices.json`. A token is `tau.<device>.<secret>`, the secret 32 random bytes in
 * base64url. The file keeps the SHA-256 of each secret, never a token, and is readable by the server's user only.
 * A pairing code has 8 characters, works once, for 10 minutes. Five wrong codes in a row cancel every pending code.
 */

import type { DeviceId } from "../store/decision.ts";

const DEVICE = /^[a-z][a-z0-9-]{0,31}$/;

/** The one constructor of a `DeviceId`. Throws `RangeError` on a name that does not match. */
export function deviceId(name: string): DeviceId {
	if (!DEVICE.test(name)) throw new RangeError(`not a device name: ${name}`);
	return name as DeviceId;
}

export type DeviceRecord = {
	readonly device: DeviceId;
	readonly pairedAt: number;
	readonly revokedAt?: number;
};

export type Devices = {
	/** `tau device pair <name>`: a new code for a name never used before. */
	issueCode(device: DeviceId): Promise<{ readonly code: string } | { readonly refused: "device_exists" }>;
	/** `POST /v1/pair`: a code for a token, once. */
	redeem(code: string): Promise<{ readonly device: DeviceId; readonly token: string } | undefined>;
	/** Every other request: the device of a valid, unrevoked token, compared in constant time. */
	check(authorization: string | undefined): DeviceId | undefined;
	/** `tau device revoke <name>`: records it. The host then ends the device's feeds. */
	revoke(device: DeviceId): Promise<void>;
	/** `tau device list`: every device, revoked ones too, so an unexpected pairing shows. */
	list(): readonly DeviceRecord[];
};

/** Reads the file, or starts an empty one. Writes go through a temporary file and a rename. */
export async function openDevices(file: string, now: () => number): Promise<Devices> {
	void [file, now];
	throw new Error("not implemented");
}
