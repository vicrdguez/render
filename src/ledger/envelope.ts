// Strict parsing of the version-1 command envelope (docs/protocol.md). Unknown fields are refused so that no
// body field can pose as a principal, route or capability.
import { createHash } from "node:crypto";
import { type Command, isAvailableCommand, type MediaType, type Persistence } from "../kernel/kernel.ts";

export const PROTOCOL_VERSION = 1;
const MAX_CONTENT_BYTES = 16 * 1024 * 1024;

export type Envelope = {
	readonly authorityEpoch: string;
	readonly commandId: string;
	readonly workflow: string | null;
	readonly command: Command;
	/** Exact submitted document bytes, for saveDocument. */
	readonly content?: Buffer;
	/** Canonical payload fingerprint: command, workflow and expected basis, not the submitting device. */
	readonly fingerprint: string;
};

export type EnvelopeRefusal = {
	readonly status: "refused";
	readonly code: "malformed_envelope" | "unsupported_version";
	readonly reason: string;
	readonly supported?: readonly number[];
};

type Fields = Record<string, unknown>;

const COMMAND_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const DOCUMENT = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

class Malformed extends Error {}

function malformed(reason: string): never {
	throw new Malformed(reason);
}

function object(value: unknown, what: string): Fields {
	if (typeof value !== "object" || value === null || Array.isArray(value)) malformed(`${what} must be an object`);
	return value as Fields;
}

function only(value: Fields, allowed: readonly string[], what: string): void {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) malformed(`${what} has unexpected field "${key}"`);
}

function text(value: unknown, what: string, max: number): string {
	if (typeof value !== "string" || value.length < 1 || value.length > max) malformed(`${what} must be a string of 1-${max} characters`);
	return value;
}

export function parseEnvelope(raw: unknown): Envelope | EnvelopeRefusal {
	try {
		const e = object(raw, "envelope");
		if (e.version !== PROTOCOL_VERSION)
			return {
				status: "refused",
				code: "unsupported_version",
				reason: `Protocol version ${JSON.stringify(e.version)} is not supported; upgrade the client to a version that speaks protocol 1.`,
				supported: [PROTOCOL_VERSION],
			};
		only(e, ["version", "authorityEpoch", "commandId", "workflow", "expected", "command"], "envelope");
		const authorityEpoch = text(e.authorityEpoch, "authorityEpoch", 128);
		const commandId = text(e.commandId, "commandId", 128);
		if (!COMMAND_ID.test(commandId)) malformed("commandId has characters outside [A-Za-z0-9._:-]");
		const workflow = e.workflow === undefined ? null : text(e.workflow, "workflow", 128);
		const expected = e.expected === undefined ? undefined : object(e.expected, "expected");
		if (expected !== undefined) only(expected, ["document"], "expected");
		const c = object(e.command, "command");
		const type = typeof c.type === "string" ? c.type : malformed("command.type must be a string");
		const parsed = isAvailableCommand(type)
			? available(type, c, workflow, expected)
			: { command: { type, ...(workflow === null ? {} : { workflow }) } };
		const fingerprint = createHash("sha256")
			.update(canonical({ workflow, expected: expected ?? null, command: c }))
			.digest("hex");
		return { authorityEpoch, commandId, workflow, fingerprint, ...parsed };
	} catch (error) {
		if (error instanceof Malformed) return { status: "refused", code: "malformed_envelope", reason: error.message };
		throw error;
	}
}

function available(type: string, c: Fields, workflow: string | null, expected: Fields | undefined): { command: Command; content?: Buffer } {
	const needsWorkflow = type === "saveDocument" || type === "postCoordinatorMessage";
	if (needsWorkflow && workflow === null) malformed(`${type} requires a workflow`);
	if (!needsWorkflow && workflow !== null) malformed(`${type} takes no workflow`);
	if (type !== "saveDocument" && expected !== undefined) malformed(`${type} takes no expected basis`);
	switch (type) {
		case "createWorkflow":
			only(c, ["type", "title"], "command");
			return { command: { type, title: text(c.title, "title", 200) } };
		case "saveDocument": {
			only(c, ["type", "document", "mediaType", "content"], "command");
			const document = text(c.document, "document", 128);
			if (!DOCUMENT.test(document)) malformed("document must match [a-z0-9][a-z0-9._/-]{0,127}");
			if (c.mediaType !== "text/markdown" && c.mediaType !== "text/plain") malformed("mediaType must be text/markdown or text/plain");
			if (typeof c.content !== "string" || !BASE64.test(c.content)) malformed("content must be base64");
			const content = Buffer.from(c.content, "base64");
			if (content.length > MAX_CONTENT_BYTES) malformed(`content exceeds ${MAX_CONTENT_BYTES} bytes`);
			if (expected === undefined || !("document" in expected)) malformed("saveDocument requires expected.document (a revision or null)");
			const basis = expected.document;
			if (basis !== null && typeof basis !== "string") malformed("expected.document must be a revision or null");
			return {
				command: { type, workflow: workflow as string, document, mediaType: c.mediaType as MediaType, expected: basis },
				content,
			};
		}
		case "postCoordinatorMessage":
			only(c, ["type", "text"], "command");
			return { command: { type, workflow: workflow as string, text: text(c.text, "text", 65_536) } };
		case "enrollDevice": {
			only(c, ["type", "label", "scope"], "command");
			const scope = object(c.scope, "scope");
			only(scope, ["workflows"], "scope");
			const workflows = scope.workflows;
			if (workflows !== "all" && !(Array.isArray(workflows) && workflows.every((w) => typeof w === "string" && w.length > 0)))
				malformed('scope.workflows must be "all" or a list of workflow refs');
			return { command: { type, label: text(c.label, "label", 100), scope: { workflows: workflows as "all" | string[] } } };
		}
		case "revokeDevice":
			only(c, ["type", "device"], "command");
			return { command: { type, device: text(c.device, "device", 64) } };
		case "recordStartup": {
			only(c, ["type", "executorEpoch", "persistence"], "command");
			const p = object(c.persistence, "persistence");
			return { command: { type, executorEpoch: text(c.executorEpoch, "executorEpoch", 128), persistence: p as unknown as Persistence } };
		}
		default:
			return malformed(`unhandled command ${type}`);
	}
}

/** Strict UTF-8 decoding that preserves a leading BOM, so the stored text re-encodes to the same bytes. */
export function decodeUtf8(bytes: Buffer): string | undefined {
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object")
		return `{${Object.keys(value)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical((value as Fields)[k])}`)
			.join(",")}}`;
	return JSON.stringify(value);
}
