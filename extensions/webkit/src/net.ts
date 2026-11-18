// URL, DNS and redirect guards and the curl transport are ported from pi-web-access 0.46
// (ssrf-protection.ts, utils.ts, extract.ts); see LICENSE.
import { lookup as systemLookup } from "node:dns/promises";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { isIP, type LookupFunction } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	Agent,
	type Dispatcher,
	ProxyAgent,
	fetch as undiciFetch,
} from "undici";
import {
	type HttpClient,
	type HttpRequest,
	type HttpResponse,
	type Settings,
	WebkitError,
} from "./domain.ts";
import { nativeTool, runNative } from "./runtime.ts";

export interface Address {
	address: string;
	family: number;
}
export type Lookup = (hostname: string) => Promise<readonly Address[]>;
export interface TransportInit {
	method: string;
	headers: Headers;
	body: string | null;
	signal: AbortSignal;
	redirect: "manual";
}
export interface NetworkDependencies {
	fetch?: (url: URL, init: TransportInit) => Promise<Response>;
	lookup?: Lookup;
}

interface Hop {
	url: URL;
	addresses: readonly Address[];
	method: string;
	headers: Headers;
	body: string | null;
}
interface Transport {
	send(hop: Hop, signal: AbortSignal): Promise<Response>;
	close(): Promise<void>;
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BODY_HEADERS = [
	"content-encoding",
	"content-language",
	"content-location",
	"content-type",
];
const PORTABLE_HEADERS = new Set([
	"accept",
	"accept-language",
	"cache-control",
	"content-type",
	"upgrade-insecure-requests",
	"user-agent",
	"sec-fetch-dest",
	"sec-fetch-mode",
	"sec-fetch-site",
	"sec-fetch-user",
]);

const blocked = (message: string) => new WebkitError("blocked-url", message);
const tooLarge = (maxBytes: number) =>
	new WebkitError(
		"invalid-response",
		`The response exceeded ${maxBytes} bytes.`,
	);
const hostOf = (url: URL) =>
	url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");

export function validateUrl(value: string): URL {
	const url = URL.parse(value);
	if (!url) throw blocked("The URL is not valid.");
	if (url.protocol !== "http:" && url.protocol !== "https:")
		throw blocked("Only HTTP and HTTPS URLs can be fetched.");
	if (url.username || url.password)
		throw blocked("Target URLs cannot contain embedded credentials.");
	const host = hostOf(url);
	if (host === "localhost" || host.endsWith(".localhost"))
		throw blocked(`Blocked internal hostname: ${host}.`);
	if (isIP(host)) assertPublic(host, host);
	return url;
}

export function createHttpClient(
	settings: Settings,
	dependencies: NetworkDependencies = {},
): HttpClient {
	const lookup =
		dependencies.lookup ??
		((hostname: string) =>
			systemLookup(hostname, { all: true, verbatim: true }));
	const secrets = [settings.exaApiKey, settings.tavilyApiKey].filter(
		(secret): secret is string => Boolean(secret),
	);
	return {
		async request(request, signal) {
			const maxBytes = request.maxBytes ?? settings.maxResponseBytes;
			// curl reveals the content type only after the transfer, so it may download up to the larger cap before readBody applies the right one.
			const transport = openTransport(
				settings,
				dependencies,
				Math.max(maxBytes, request.pdfMaxBytes ?? 0),
			);
			const deadline = new AbortController();
			const onAbort = () =>
				deadline.abort(
					new WebkitError("cancelled", "The web request was cancelled."),
				);
			const timer = setTimeout(
				() =>
					deadline.abort(
						new WebkitError(
							"timeout",
							`The web request timed out after ${settings.timeoutMs} ms.`,
						),
					),
				settings.timeoutMs,
			);
			signal.addEventListener("abort", onAbort, { once: true });
			if (signal.aborted) onAbort();
			try {
				return await follow(request, {
					maxBytes,
					transport,
					lookup,
					secrets,
					signal: deadline.signal,
				});
			} catch (error) {
				if (deadline.signal.aborted) throw deadline.signal.reason;
				throw error instanceof WebkitError
					? error
					: new WebkitError("network", "The web request failed.");
			} finally {
				clearTimeout(timer);
				signal.removeEventListener("abort", onAbort);
				await transport.close();
			}
		},
	};
}

async function follow(
	request: HttpRequest,
	{
		maxBytes,
		transport,
		lookup,
		secrets,
		signal,
	}: {
		maxBytes: number;
		transport: Transport;
		lookup: Lookup;
		secrets: readonly string[];
		signal: AbortSignal;
	},
): Promise<HttpResponse> {
	signal.throwIfAborted();
	const requested = validateUrl(request.url);
	let url = requested;
	let method: string = request.method ?? "GET";
	let body = request.body ?? null;
	const headers = new Headers(request.headers);
	for (let redirects = 0; ; redirects++) {
		const addresses = await resolvePublic(url, lookup, signal);
		const response = await transport.send(
			{ url, addresses, method, headers: new Headers(headers), body },
			signal,
		);
		const location = REDIRECT_STATUSES.has(response.status)
			? response.headers.get("location")
			: null;
		if (location === null) {
			const pdf =
				(response.headers.get("content-type") ?? "")
					.toLowerCase()
					.includes("application/pdf") ||
				requested.pathname.toLowerCase().endsWith(".pdf");
			const limit =
				pdf && request.pdfMaxBytes !== undefined
					? request.pdfMaxBytes
					: maxBytes;
			return {
				url: url.href,
				status: response.status,
				headers: Object.fromEntries(response.headers),
				body: await readBody(response, limit),
			};
		}
		await response.body?.cancel();
		if (redirects === MAX_REDIRECTS)
			throw new WebkitError(
				"network",
				`The web request redirected more than ${MAX_REDIRECTS} times.`,
			);
		const target = URL.parse(location, url);
		if (!target)
			throw new WebkitError(
				"invalid-response",
				"The redirect location is not a valid URL.",
			);
		const next = validateUrl(target.href);
		if (request.redirects === "same-origin" && next.origin !== requested.origin)
			throw blocked("The redirect left the requested origin.");
		if (
			(response.status === 303 && method !== "GET") ||
			((response.status === 301 || response.status === 302) &&
				method === "POST")
		) {
			method = "GET";
			body = null;
			for (const name of BODY_HEADERS) headers.delete(name);
		}
		if (next.origin !== url.origin) {
			const carriesSecret = (value: string) =>
				secrets.some((secret) => value.includes(secret));
			if (body !== null && carriesSecret(body))
				throw blocked(
					"A request body carrying a credential cannot follow a cross-origin redirect.",
				);
			for (const name of [...headers.keys()])
				if (!PORTABLE_HEADERS.has(name)) headers.delete(name);
			for (const [name, value] of [...next.searchParams])
				if (carriesSecret(value)) next.searchParams.delete(name);
		}
		url = next;
	}
}

async function resolvePublic(
	url: URL,
	lookup: Lookup,
	signal: AbortSignal,
): Promise<readonly Address[]> {
	const host = hostOf(url);
	const family = isIP(host);
	if (family) return [{ address: host, family }];
	let addresses: readonly Address[];
	try {
		addresses = await abortable(lookup(host), signal);
	} catch {
		throw new WebkitError("network", `Could not resolve ${host}.`);
	}
	if (addresses.length === 0)
		throw new WebkitError("network", `Could not resolve ${host}.`);
	for (const { address } of addresses) assertPublic(address, host);
	// Exa's anonymous MCP endpoint rejects IPv6 clients, so direct connections use IPv4 when the name has it.
	const ipv4 = addresses.filter(({ address }) => isIP(address) === 4);
	return ipv4.length > 0 ? ipv4 : addresses;
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason);
		if (signal.aborted) return onAbort();
		signal.addEventListener("abort", onAbort, { once: true });
		operation
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", onAbort));
	});
}

async function readBody(
	response: Response,
	maxBytes: number,
): Promise<Uint8Array> {
	if (Number(response.headers.get("content-length")) > maxBytes) {
		await response.body?.cancel();
		throw tooLarge(maxBytes);
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	for await (const chunk of response.body ?? []) {
		total += chunk.byteLength;
		if (total > maxBytes) throw tooLarge(maxBytes);
		chunks.push(chunk);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function openTransport(
	settings: Settings,
	dependencies: NetworkDependencies,
	maxBytes: number,
): Transport {
	const injected = dependencies.fetch;
	if (injected) {
		return {
			send: ({ url, method, headers, body }, signal) =>
				injected(url, { method, headers, body, signal, redirect: "manual" }),
			close: async () => {},
		};
	}
	const { curlCommand, proxy } = settings;
	if (curlCommand || /^socks(?:4a?|5h?):\/\//i.test(proxy ?? "")) {
		const executable = curlCommand ?? "curl";
		const command = executable === "curl" ? nativeTool("curl") : executable;
		return {
			send: (hop, signal) => curl(command, proxy, hop, maxBytes, signal),
			close: async () => {},
		};
	}
	const pins = new Map<string, readonly Address[]>();
	const lookup: LookupFunction = (hostname, options, callback) => {
		const addresses = pins.get(hostname);
		if (!addresses?.[0])
			callback(new Error(`No validated address for ${hostname}.`), "");
		else if (options.all) callback(null, [...addresses]);
		else callback(null, addresses[0].address, addresses[0].family);
	};
	const dispatcher: Dispatcher = proxy
		? proxyAgent(proxy)
		: new Agent({ connect: { lookup } });
	return {
		async send({ url, addresses, method, headers, body }, signal) {
			pins.set(url.hostname, addresses);
			const response = await undiciFetch(url, {
				method,
				headers: Object.fromEntries(headers),
				body,
				signal,
				redirect: "manual",
				dispatcher,
			});
			return response as unknown as Response;
		},
		close: () => dispatcher.destroy(),
	};
}

function proxyAgent(proxy: string): ProxyAgent {
	try {
		return new ProxyAgent(proxy);
	} catch {
		throw new WebkitError(
			"config",
			"The configured proxy is not a usable proxy URL.",
		);
	}
}

const CONFIG_ESCAPES: Record<string, string> = {
	"\\": "\\\\",
	'"': '\\"',
	"\n": "\\n",
	"\r": "\\r",
	"\t": "\\t",
};
const quoted = (value: string) =>
	`"${value.replace(/[\\"\n\r\t]/g, (character) => CONFIG_ESCAPES[character] ?? character)}"`;

// The URL, headers, body and proxy go through a private config file so credentials stay out of the process list.
async function curl(
	command: string,
	proxy: string | undefined,
	hop: Hop,
	maxBytes: number,
	signal: AbortSignal,
): Promise<Response> {
	const dir = await mkdtemp(join(tmpdir(), "webkit-curl-"));
	try {
		const config = [
			`url = ${quoted(hop.url.href)}`,
			`proxy = ${quoted(proxy ?? "")}`,
		];
		for (const [name, value] of hop.headers)
			if (value !== "") config.push(`header = ${quoted(`${name}: ${value}`)}`);
		if (hop.body !== null) {
			await writeFile(join(dir, "body"), hop.body);
			config.push(`data-binary = ${quoted(`@${join(dir, "body")}`)}`);
		}
		await writeFile(join(dir, "config"), `${config.join("\n")}\n`, "latin1");
		const port = hop.url.port || (hop.url.protocol === "https:" ? "443" : "80");
		const pin =
			(proxy && !/^socks[45]:\/\//i.test(proxy)) || isIP(hostOf(hop.url))
				? []
				: [
						"--resolve",
						`${hop.url.hostname}:${port}:${hop.addresses.map(({ address }) => (isIP(address) === 6 ? `[${address}]` : address)).join(",")}`,
					];
		const { stdout, status } = await runNative(
			command,
			[
				// -q must be first: it stops curl reading .curlrc, which could follow redirects or add headers.
				"-q",
				"--silent",
				"--show-error",
				"--compressed",
				"--no-location",
				"--globoff",
				"--request",
				hop.method,
				"--max-filesize",
				String(maxBytes),
				...(proxy ? ["--noproxy", ""] : []),
				...pin,
				"--dump-header",
				join(dir, "headers"),
				"--config",
				join(dir, "config"),
			],
			{ signal, maxBytes },
		);
		if (status === 63) throw tooLarge(maxBytes);
		if (status !== 0)
			throw new WebkitError(
				"network",
				`curl failed with exit status ${status}.`,
			);
		const response = parseHeaderDump(
			await readFile(join(dir, "headers"), "latin1"),
		);
		if (response.status < 200 || response.status > 599)
			throw new WebkitError(
				"invalid-response",
				"curl returned no usable HTTP status.",
			);
		const empty =
			response.status === 204 ||
			response.status === 205 ||
			response.status === 304;
		return new Response(empty ? null : new Uint8Array(stdout), response);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

// The dump holds every response curl saw (1xx, proxy CONNECT); the last block is the answer.
// --compressed decodes the body, so its encoding and length headers no longer describe it.
function parseHeaderDump(dump: string): {
	status: number;
	headers: [string, string][];
} {
	const blocks = dump
		.split(/\r?\n\r?\n/)
		.filter((block) => /^HTTP\/[\d.]+\s+\d{3}/.test(block.trim()));
	const [statusLine = "", ...lines] = (blocks.at(-1) ?? "")
		.trim()
		.split(/\r?\n/);
	const status = Number(/^HTTP\/[\d.]+\s+(\d{3})/.exec(statusLine)?.[1] ?? 0);
	const headers: [string, string][] = [];
	for (const line of lines) {
		const separator = line.indexOf(":");
		const name = line.slice(0, separator).trim().toLowerCase();
		if (
			separator > 0 &&
			name !== "content-encoding" &&
			name !== "content-length"
		)
			headers.push([name, line.slice(separator + 1).trim()]);
	}
	return { status, headers };
}

function assertPublic(address: string, host: string): void {
	const version = isIP(address);
	if (
		version === 4
			? isBlockedIPv4(address)
			: version === 6
				? isBlockedIPv6(address)
				: true
	)
		throw blocked(`Blocked internal address for ${host}: ${address}.`);
}

function isBlockedIPv4(address: string): boolean {
	const parts = address.split(".").map(Number);
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	)
		return true;
	const [a = 0, b = 0] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function isBlockedIPv6(address: string): boolean {
	const groups = parseIPv6(address);
	if (!groups) return true;
	const first = groups[0] ?? 0;
	if (groups.every((group) => group === 0)) return true;
	if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)
		return true;
	if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true;
	if (
		groups.slice(0, 5).every((group) => group === 0) &&
		groups[5] === 0xffff
	) {
		const [high = 0, low = 0] = groups.slice(6);
		return isBlockedIPv4(
			[high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
		);
	}
	return false;
}

function parseIPv6(address: string): number[] | null {
	if (address.includes(".")) {
		const lastColon = address.lastIndexOf(":");
		const ipv4 = address.slice(lastColon + 1);
		if (isIP(ipv4) !== 4) return null;
		const [a = 0, b = 0, c = 0, d = 0] = ipv4.split(".").map(Number);
		address = `${address.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const pieces = address.split("::");
	if (pieces.length > 2) return null;
	const left = pieces[0] ? pieces[0].split(":") : [];
	const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
	const missing = 8 - left.length - right.length;
	if ((pieces.length === 1 && missing !== 0) || missing < 0) return null;
	const groups = [...left, ...Array<string>(missing).fill("0"), ...right].map(
		(part) => (/^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : -1),
	);
	return groups.length === 8 && groups.every((group) => group >= 0)
		? groups
		: null;
}
