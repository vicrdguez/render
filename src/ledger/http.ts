// Ledger's transport adapters. The device listener authenticates bearers; the admin socket is the restrictive
// OS-owner route. No header, query parameter or body field selects a principal.
import { chmod, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import * as Effect from "effect/Effect";
import { fromPromise, runPromise } from "../effect.ts";
import { PROTOCOL_VERSION } from "./envelope.ts";
import type { HistoryQuery } from "./history.ts";
import type { Artifact, Frame, Ledger, LedgerRefusal } from "./ledger.ts";
import { type AuthenticatedContext, mintContext } from "./principals.ts";

const MAX_BODY_BYTES = 32 * 1024 * 1024;
/** Frames queued behind a full socket before a slow observer is disconnected. */
const MAX_PENDING_FRAMES = 100;

const STATUS: Record<string, number> = {
	unauthorized: 401,
	untrusted_context: 401,
	forbidden_principal: 403,
	forbidden_scope: 403,
	malformed_envelope: 400,
	invalid_query: 400,
	invalid_cursor: 400,
	unknown_command: 400,
	invalid_content: 400,
	unsupported_version: 400,
	payload_too_large: 413,
	authority_epoch_mismatch: 409,
	command_conflict: 409,
	stale_basis: 409,
	content_corrupt: 409,
	unsupported_schema: 409,
	missing_content: 409,
	already_revoked: 409,
	not_found: 404,
	capability_unavailable: 501,
	outcome_unknown: 503,
	host_unavailable: 503,
	recovery_required: 409,
};

const UNAUTHORIZED: LedgerRefusal = { status: "refused", code: "unauthorized", reason: "Authentication required." };
const UNSUPPORTED_VERSION: LedgerRefusal = {
	status: "refused",
	code: "unsupported_version",
	reason: "This host speaks protocol version 1; upgrade the client.",
	supported: [PROTOCOL_VERSION],
};

function send(res: ServerResponse, body: object): void {
	const status = "status" in body && body.status === "refused" ? (STATUS[(body as LedgerRefusal).code] ?? 400) : 200;
	const text = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	res.end(text);
}

class BodyTooLarge extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
		chunks.push(chunk as Buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function command(ledger: Ledger, context: AuthenticatedContext, req: IncomingMessage, res: ServerResponse): Effect.Effect<void, unknown> {
	return fromPromise(() => readJson(req)).pipe(
		Effect.matchEffect({
			onFailure: (error) =>
				Effect.sync(() =>
					send(
						res,
						error instanceof BodyTooLarge
							? { status: "refused", code: "payload_too_large", reason: `Request bodies are limited to ${MAX_BODY_BYTES} bytes.` }
							: { status: "refused", code: "malformed_envelope", reason: "The request body is not JSON." },
					),
				),
			// No request-close signal reaches admitted domain work.
			onSuccess: (body) =>
				fromPromise(() => ledger.command(body, context)).pipe(Effect.flatMap((reply) => Effect.sync(() => send(res, reply)))),
		}),
	);
}

function artifactBody(a: Artifact | LedgerRefusal): object {
	if ("status" in a) return a;
	const { content, ...rest } = a;
	return { ...rest, content: content.toString("base64") };
}

function observe(ledger: Ledger, context: AuthenticatedContext, req: IncomingMessage, res: ServerResponse): void {
	let open = true;
	let pending = 0;
	let stopObserving: () => void = () => undefined;
	const write = (frame: Frame) => {
		if (!open) return;
		if (res.write(`${JSON.stringify(frame)}\n`)) return;
		// Commits never wait for observers: a consumer that falls too far behind is disconnected and must resnapshot.
		if (++pending > MAX_PENDING_FRAMES) {
			open = false;
			stopObserving();
			res.destroy();
		}
	};
	const observation = ledger.observe(context, {
		send: write,
		end: (frame) => {
			write(frame);
			open = false;
			res.end();
		},
	});
	if ("status" in observation) {
		send(res, observation);
		return;
	}
	stopObserving = observation.stop;
	res.on("drain", () => {
		pending = 0;
	});
	req.on("close", () => {
		open = false;
		observation.stop();
	});
	res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" });
	write(observation.snapshot);
}

function route(ledger: Ledger, context: AuthenticatedContext, req: IncomingMessage, res: ServerResponse): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		const url = new URL(req.url ?? "/", "http://render.invalid");
		const path = url.pathname;
		const version = url.searchParams.get("version");
		if (req.method === "POST" && path === "/v1/commands") return yield* command(ledger, context, req, res);
		if (req.method === "GET" && (path === "/v1/snapshot" || path === "/v1/observe")) {
			if (version !== null && version !== String(PROTOCOL_VERSION)) return send(res, UNSUPPORTED_VERSION);
			if (path === "/v1/snapshot") return send(res, ledger.snapshot(context));
			return observe(ledger, context, req, res);
		}
		if (req.method === "GET" && (path === "/v1/history" || path === "/v1/export")) {
			const query: Record<string, string> = {};
			for (const [key, value] of url.searchParams) {
				if (Object.hasOwn(query, key))
					return send(res, { status: "refused", code: "invalid_query", reason: "Duplicate history selector." });
				query[key] = value;
			}
			return send(
				res,
				path === "/v1/history"
					? yield* fromPromise(() => ledger.observe(context, { history: query as HistoryQuery }))
					: yield* fromPromise(() => ledger.artifact(context, { export: query as HistoryQuery })),
			);
		}
		const receipt = /^\/v1\/commands\/([^/]+)$/.exec(path);
		if (req.method === "GET" && receipt)
			return send(res, yield* fromPromise(() => ledger.receipt(context, decodeURIComponent(receipt[1] as string))));
		const artifact = /^\/v1\/artifacts\/([^/]+)$/.exec(path);
		if (req.method === "GET" && artifact)
			return send(
				res,
				artifactBody(yield* fromPromise(() => ledger.artifact(context, { read: decodeURIComponent(artifact[1] as string) }))),
			);
		const messages = /^\/v1\/workflows\/([^/]+)\/messages$/.exec(path);
		if (req.method === "GET" && messages) {
			const cursor = url.searchParams.get("cursor");
			const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
			return send(
				res,
				yield* fromPromise(() =>
					ledger.messages(context, decodeURIComponent(messages[1] as string), cursor === null ? undefined : Number(cursor), limit),
				),
			);
		}
		send(res, { status: "refused", code: "not_found", reason: "No such route." });
	});
}

function failSafe(res: ServerResponse, error: unknown): void {
	if (!res.headersSent) send(res, { status: "refused", code: "host_unavailable", reason: "Internal error." });
	else res.destroy();
	process.stderr.write(`${JSON.stringify({ event: "request_error", error: error instanceof Error ? error.message : String(error) })}\n`);
}

/** Device listener: bearer authentication precedes every route, so unauthenticated requests learn nothing. */
export function deviceServer(ledger: Ledger): Server {
	return createServer((req, res) => {
		const context = ledger.authenticate(req.headers.authorization);
		if (context === undefined) {
			send(res, UNAUTHORIZED);
			return;
		}
		runPromise(route(ledger, context, req, res)).catch((error: unknown) => failSafe(res, error));
	});
}

/** Local-admin route on a Unix socket inside the 0700 data directory; reaching it is the OS owner's authentication. */
export function adminServer(ledger: Ledger, socketPath: string): Promise<Server> {
	return runPromise(adminServerEffect(ledger, socketPath));
}

export function adminServerEffect(ledger: Ledger, socketPath: string): Effect.Effect<Server, unknown> {
	return Effect.gen(function* () {
		yield* fromPromise(() => rm(socketPath, { force: true }));
		const server = createServer((req, res) => {
			const context = mintContext({ kind: "human", human: ledger.status().human, route: "local-admin" });
			const handle = Effect.gen(function* () {
				const url = new URL(req.url ?? "/", "http://render.invalid");
				if (req.method === "POST" && url.pathname === "/v1/admin/commands") return yield* command(ledger, context, req, res);
				if (req.method === "GET" && url.pathname === "/v1/admin/devices") return send(res, { devices: ledger.status().devices });
				if (req.method === "GET" && url.pathname === "/v1/admin/status") {
					const { devices: _devices, ...status } = ledger.status();
					return send(res, status);
				}
				return yield* route(ledger, context, req, res);
			});
			runPromise(handle).catch((error: unknown) => failSafe(res, error));
		});
		return yield* Effect.gen(function* () {
			yield* fromPromise(
				() =>
					new Promise<void>((resolve, reject) => {
						server.once("error", reject);
						server.listen(socketPath, () => resolve());
					}),
			);
			yield* fromPromise(() => chmod(socketPath, 0o600));
			return server;
		}).pipe(
			Effect.onError(() =>
				fromPromise(
					() =>
						new Promise<void>((resolve) => {
							server.closeAllConnections();
							server.close(() => resolve());
						}),
				).pipe(Effect.ignore),
			),
		);
	}).pipe(Effect.uninterruptible);
}
