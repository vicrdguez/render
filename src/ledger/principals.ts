// Contexts minted by trusted Ledger and Engine code are registered here. Hand-built objects are refused.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Principal } from "../kernel/kernel.ts";

declare const contextBrand: unique symbol;
export type AuthenticatedContext = { readonly [contextBrand]: true };

export type Principals = {
	device(authorization: string | undefined): AuthenticatedContext | undefined;
	localAdmin(): AuthenticatedContext;
	projectWideHuman(context: AuthenticatedContext): boolean;
};

const minted = new WeakMap<object, Principal>();

export function mintContext(principal: Principal): AuthenticatedContext {
	const context = Object.freeze({}) as AuthenticatedContext;
	minted.set(context, principal);
	return context;
}

export function principalOf(context: unknown): Principal | undefined {
	return typeof context === "object" && context !== null ? minted.get(context) : undefined;
}

const BEARER = /^render_(device:\d+)_([A-Za-z0-9_-]{43})$/;

/** A fresh 256-bit device secret. The device ID joins it into a bearer once enrollment has committed. */
export function newSecret(): { secret: string; verifier: string } {
	const secret = randomBytes(32).toString("base64url");
	return { secret, verifier: verifierOf(secret) };
}

export function bearerOf(device: string, secret: string): string {
	return `render_${device}_${secret}`;
}

export function parseBearer(header: string | undefined): { device: string; secret: string } | undefined {
	const match = header === undefined ? null : /^Bearer (\S+)$/.exec(header);
	const token = match === null ? undefined : BEARER.exec(match[1] as string);
	return token === null || token === undefined ? undefined : { device: token[1] as string, secret: token[2] as string };
}

export function verifierOf(secret: string): string {
	return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifies(secret: string, verifier: string): boolean {
	const a = Buffer.from(verifierOf(secret), "hex");
	const b = Buffer.from(verifier, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}
