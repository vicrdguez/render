import type {
	IncomingMessage,
	RequestListener,
	ServerResponse,
} from "node:http";
import { compile, obj, str } from "@earendil-works/pi-schema";
import { type Call, calls, type Host } from "./calls.js";
import { type Outcome, refuse, statusOf } from "./refusals.js";
import { pipe } from "./streams.js";

const BODY_LIMIT = 1024 * 1024;
const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];
const checkPair = compile(obj({ code: str() }));
type Unknown = {
	readonly unknown: { code: "storage_failed"; message: string };
};

function reply(response: ServerResponse, body: Outcome<unknown> | Unknown) {
	const status =
		"result" in body
			? 200
			: "refused" in body
				? statusOf[body.refused.code]
				: 500;
	response.writeHead(status, {
		"Content-Type": "application/json",
		"Cache-Control": "no-store",
		"Tau-Protocol": "1",
	});
	response.end(JSON.stringify(body));
}

const hostname = (value: string) => value.replace(/:\d+$/, "").toLowerCase();

async function readBody(request: IncomingMessage): Promise<Outcome<unknown>> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request as AsyncIterable<Buffer>) {
		size += chunk.length;
		if (size <= BODY_LIMIT) chunks.push(chunk);
	}
	if (size > BODY_LIMIT) return refuse("too_large", "The body is over 1 MiB.");
	let body: unknown;
	try {
		body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return refuse("bad_request", "The body is not JSON.", {
			errors: [{ path: "", keyword: "json", message: "must be JSON" }],
		});
	}
	if (typeof body !== "object" || body === null || Array.isArray(body))
		return refuse("bad_request", "The body is not a JSON object.", {
			errors: [{ path: "", keyword: "type", message: "must be object" }],
		});
	return { result: body };
}

/** The HTTP side of the server: one POST per call, and an event stream for a watch. */
export function handler(
	host: Host,
	allowedHosts: readonly string[],
): RequestListener {
	const allowed = new Set([
		...LOOPBACK,
		...allowedHosts.map((h) => h.toLowerCase()),
	]);
	const sameSite = (request: IncomingMessage) => {
		const header = request.headers.host;
		if (header === undefined || !allowed.has(hostname(header))) return false;
		const origin = request.headers.origin;
		if (origin === undefined) return true;
		try {
			return allowed.has(new URL(origin).hostname.toLowerCase());
		} catch {
			return false;
		}
	};
	const route = async (request: IncomingMessage, response: ServerResponse) => {
		if (!sameSite(request))
			return reply(
				response,
				refuse("unauthorized", "This Host or Origin is not allowed."),
			);
		const name = /^\/v1\/([A-Za-z]*)$/.exec(request.url ?? "")?.[1];
		if (name === "pair" && request.method === "POST") {
			const body = await readBody(request);
			if ("refused" in body) return reply(response, body);
			const parsed = checkPair.validate(body.result);
			if (!parsed.ok)
				return reply(
					response,
					refuse("bad_request", "The body does not fit the call.", {
						errors: parsed.errors,
					}),
				);
			const paired = await host.devices.pair(parsed.value.code);
			return reply(
				response,
				paired === undefined
					? refuse("unauthorized", "That code does not work.")
					: { result: paired },
			);
		}
		const device = host.devices.authenticate(request.headers.authorization);
		if (device === undefined)
			return reply(
				response,
				refuse("unauthorized", "Send a valid device token."),
			);
		const call: Call | undefined =
			request.method === "POST" &&
			name !== undefined &&
			Object.hasOwn(calls, name)
				? calls[name]
				: undefined;
		if (call === undefined)
			return reply(
				response,
				refuse("unknown_call", `This server has no call ${request.url}.`, {
					calls: Object.keys(calls),
				}),
			);
		const body = await readBody(request);
		if ("refused" in body) return reply(response, body);
		if (!call.stream)
			return reply(response, await call.dispatch(host, device, body.result));
		const opened = await call.dispatch(host, device, body.result);
		if ("refused" in opened) return reply(response, opened);
		if (
			host.devices.authenticate(request.headers.authorization) === undefined
		) {
			await opened.result.stop();
			return reply(response, refuse("unauthorized", "The device was revoked."));
		}
		pipe(opened.result, response, (end) => host.devices.attach(device, end));
	};
	return (request, response) => {
		route(request, response).catch((error: unknown) => {
			if (response.headersSent) return response.destroy();
			reply(response, {
				unknown: {
					code: "storage_failed",
					message: error instanceof Error ? error.message : String(error),
				},
			});
		});
	};
}
