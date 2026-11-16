import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { type HttpRequest, type Settings, WebkitError } from "../src/domain.ts";
import { createHttpClient, type Lookup, validateUrl } from "../src/net.ts";
import { runNative } from "../src/runtime.ts";

const PUBLIC = "93.184.216.34";
const KEY = "exa-unit-test-key-0123456789";
const base: Settings = {
	provider: "auto",
	fallbackProviders: "",
	hostedExtraction: false,
	timeoutMs: 5000,
	maxResponseBytes: 1_000_000,
};
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const isFailure = (kind: string) => (error: unknown) => {
	assert.ok(
		error instanceof WebkitError,
		`expected WebkitError, got ${String(error)}`,
	);
	assert.equal(error.failure.kind, kind, error.message);
	return true;
};
const live = () => new AbortController().signal;

function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const late = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(label)), ms);
	});
	return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

const answers: Record<string, string[]> = {
	"site.test": [PUBLIC],
	"other.test": [PUBLIC],
	"private.test": ["10.0.0.7"],
	"mixed.test": [PUBLIC, "127.0.0.1"],
	"v6private.test": ["fd00::5"],
	"empty.test": [],
	"dual.test": ["2606:4700::1111", "93.184.216.35"],
	"v6only.test": ["2606:4700::1111"],
};
let lookups: string[] = [];
const lookup: Lookup = async (hostname) => {
	lookups.push(hostname);
	const list = answers[hostname];
	if (!list)
		throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), {
			code: "ENOTFOUND",
		});
	return list.map((address) => ({
		address,
		family: address.includes(":") ? 6 : 4,
	}));
};

interface Seen {
	host: string;
	method: string;
	path: string;
	headers: http.IncomingHttpHeaders;
	body: string;
}
type Route = (
	request: http.IncomingMessage,
	response: http.ServerResponse,
	url: URL,
) => void;
let routes = new Map<string, Route>();
let seen: Seen[] = [];

const internet = http.createServer(async (request, response) => {
	const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
	let body = "";
	for await (const chunk of request) body += chunk;
	seen.push({
		host: url.host,
		method: request.method ?? "",
		path: url.pathname + url.search,
		headers: request.headers,
		body,
	});
	const route = routes.get(url.host);
	if (route) route(request, response, url);
	else response.writeHead(502).end("no route");
});
const sockets = new Set<import("node:net").Socket>();
internet.on("connection", (socket) => {
	sockets.add(socket);
	socket.once("close", () => sockets.delete(socket));
});
let proxy = "";
let port = 0;
before(async () => {
	await new Promise<void>((resolve) =>
		internet.listen(0, "127.0.0.1", resolve),
	);
	port = (internet.address() as AddressInfo).port;
	proxy = `http://127.0.0.1:${port}`;
});
after(() => {
	internet.closeAllConnections();
	internet.close();
});
beforeEach(() => {
	routes = new Map();
	seen = [];
	lookups = [];
});

function redirect(location: string, status = 302): Route {
	return (_request, response) => response.writeHead(status, { location }).end();
}

function closedWhen(response: http.ServerResponse): Promise<void> {
	return new Promise((resolve) => response.once("close", () => resolve()));
}

const transports = {
	undici: (settings: Partial<Settings> = {}) =>
		createHttpClient({ ...base, proxy, ...settings }, { lookup }),
	curl: (settings: Partial<Settings> = {}) =>
		createHttpClient(
			{ ...base, proxy, curlCommand: "curl", ...settings },
			{ lookup },
		),
};

describe("validateUrl", () => {
	test("accepts public HTTP and HTTPS URLs", () => {
		for (const value of [
			"https://example.com/a?b=c",
			"http://8.8.8.8/",
			"http://172.32.0.1/",
			"http://100.128.0.1/",
			"http://[2606:4700:4700::1111]/",
			"http://example.com./",
		])
			assert.ok(validateUrl(value) instanceof URL, value);
	});

	test("rejects unparseable URLs and non-HTTP schemes", () => {
		for (const value of [
			"not a url",
			"ftp://example.com/",
			"file:///etc/passwd",
			"data:text/plain,hi",
			"javascript:alert(1)",
			"ws://example.com/",
		])
			assert.throws(() => validateUrl(value), isFailure("blocked-url"), value);
	});

	test("rejects target URLs with embedded credentials", () => {
		for (const value of [
			"https://user:password@example.com/",
			"https://user@example.com/",
			"https://user%3Apassword@example.com/",
		])
			assert.throws(() => validateUrl(value), isFailure("blocked-url"));
	});

	test("rejects localhost names", () => {
		for (const value of [
			"http://localhost/",
			"http://LOCALHOST:8080/",
			"http://localhost./",
			"http://api.localhost/",
		])
			assert.throws(() => validateUrl(value), isFailure("blocked-url"), value);
	});

	test("rejects internal IPv4 literals in every notation", () => {
		for (const value of [
			"http://127.0.0.1/",
			"http://2130706433/",
			"http://0x7f.0.0.1/",
			"http://0177.0.0.1/",
			"http://0.0.0.0/",
			"http://10.1.2.3/",
			"http://172.16.0.1/",
			"http://172.31.255.255/",
			"http://192.168.1.1/",
			"http://169.254.169.254/",
			"http://100.64.0.1/",
			"http://198.18.0.1/",
			"http://224.0.0.1/",
			"http://255.255.255.255/",
		])
			assert.throws(() => validateUrl(value), isFailure("blocked-url"), value);
	});

	test("rejects internal IPv6 literals, including mapped IPv4", () => {
		for (const value of [
			"http://[::1]/",
			"http://[::]/",
			"http://[fd00::1]/",
			"http://[fc00::1]/",
			"http://[fe80::1]/",
			"http://[::ffff:127.0.0.1]/",
			"http://[::ffff:10.0.0.1]/",
		])
			assert.throws(() => validateUrl(value), isFailure("blocked-url"), value);
	});
});

test("a configured SOCKS proxy uses the declared curl transport without requiring curlCommand", async () => {
	const dir = await mkdtemp(join(tmpdir(), "webkit-socks-route-"));
	const command = join(dir, "curl");
	const oldPath = process.env.PATH;
	try {
		await writeFile(
			command,
			`#!${process.execPath}\nconst fs = require('node:fs'); const args = process.argv.slice(2); const config = fs.readFileSync(args[args.indexOf('--config') + 1], 'utf8'); if (!config.includes('socks5h://proxy.example:1080')) process.exit(5); fs.writeFileSync(args[args.indexOf('--dump-header') + 1], 'HTTP/1.1 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\n'); process.stdout.write('SOCKS-ROUTED');\n`,
		);
		await chmod(command, 0o700);
		process.env.PATH = `${dir}:${oldPath ?? ""}`;
		const client = createHttpClient(
			{ ...base, proxy: "socks5h://proxy.example:1080" },
			{ lookup },
		);
		assert.equal(
			text((await client.request({ url: "https://site.test/" }, live())).body),
			"SOCKS-ROUTED",
		);
	} finally {
		if (oldPath === undefined) delete process.env.PATH;
		else process.env.PATH = oldPath;
		await rm(dir, { recursive: true, force: true });
	}
});

describe("production guards", () => {
	test("the default client refuses loopback targets, with or without an explicit proxy, and sends nothing", async () => {
		for (const settings of [base, { ...base, proxy }]) {
			const client = createHttpClient(settings);
			for (const url of [
				`http://127.0.0.1:${port}/`,
				`http://localhost:${port}/`,
				`http://[::1]:${port}/`,
			])
				await assert.rejects(
					client.request({ url }, live()),
					isFailure("blocked-url"),
					url,
				);
		}
		assert.deepEqual(seen, []);
	});

	test("an injected transport receives only validated public targets with manual redirects", async () => {
		const calls: string[] = [];
		const client = createHttpClient(base, {
			lookup,
			fetch: async (url, init) => {
				calls.push(url.href);
				assert.equal(init.redirect, "manual");
				return new Response("ok", { headers: { "X-Mixed-Case": "v" } });
			},
		});
		await assert.rejects(
			client.request({ url: "http://private.test/" }, live()),
			isFailure("blocked-url"),
		);
		const response = await client.request(
			{ url: "http://site.test/x" },
			live(),
		);
		assert.deepEqual(calls, ["http://site.test/x"]);
		assert.equal(text(response.body), "ok");
		assert.equal(response.headers["x-mixed-case"], "v");
	});

	test("an already-cancelled request does no lookup and sends nothing", async () => {
		const controller = new AbortController();
		controller.abort();
		await assert.rejects(
			transports
				.undici()
				.request({ url: "http://site.test/" }, controller.signal),
			isFailure("cancelled"),
		);
		assert.deepEqual(lookups, []);
		assert.deepEqual(seen, []);
	});

	test("cancellation and the deadline both interrupt a stuck DNS lookup", async () => {
		const stuck: Lookup = () => new Promise(() => {});
		const controller = new AbortController();
		const cancelled = createHttpClient(base, { lookup: stuck }).request(
			{ url: "http://site.test/" },
			controller.signal,
		);
		setTimeout(() => controller.abort(), 30);
		await within(
			assert.rejects(cancelled, isFailure("cancelled")),
			2000,
			"cancellation interrupts DNS",
		);
		const timed = createHttpClient(
			{ ...base, timeoutMs: 100 },
			{ lookup: stuck },
		).request({ url: "http://site.test/" }, live());
		await within(
			assert.rejects(timed, isFailure("timeout")),
			2000,
			"the deadline interrupts DNS",
		);
	});
});

for (const [name, connect] of Object.entries(transports)) {
	describe(`${name} transport`, () => {
		test("returns error statuses, lower-case headers and bodies for the caller to classify", async () => {
			routes.set("site.test", (_request, response) =>
				response
					.writeHead(429, {
						"Retry-After": "7",
						"X-Trace": "abc",
						"Content-Type": "application/json",
					})
					.end('{"error":"quota"}'),
			);
			const response = await connect().request(
				{ url: "http://site.test/limited" },
				live(),
			);
			assert.equal(response.status, 429);
			assert.equal(response.url, "http://site.test/limited");
			assert.equal(response.headers["retry-after"], "7");
			assert.equal(response.headers["x-trace"], "abc");
			assert.equal(text(response.body), '{"error":"quota"}');
		});

		test("sends the method, headers and body through the configured proxy", async () => {
			routes.set("site.test", (_request, response) => response.end("created"));
			const response = await connect().request(
				{
					url: "http://site.test/search?q=1",
					method: "POST",
					headers: { "Content-Type": "application/json", "x-api-key": KEY },
					body: '{"query":"tau"}',
				},
				live(),
			);
			assert.equal(text(response.body), "created");
			assert.equal(seen.length, 1);
			assert.deepEqual(
				{ ...seen[0], headers: undefined },
				{
					host: "site.test",
					method: "POST",
					path: "/search?q=1",
					headers: undefined,
					body: '{"query":"tau"}',
				},
			);
			assert.equal(seen[0]?.headers["content-type"], "application/json");
			assert.equal(seen[0]?.headers["x-api-key"], KEY);
		});

		test("follows same-origin and cross-origin redirects and reports the final URL", async () => {
			routes.set("site.test", (_request, response, url) => {
				if (url.pathname === "/a") redirect("/b")(_request, response, url);
				else redirect("http://other.test/c", 301)(_request, response, url);
			});
			routes.set("other.test", (_request, response) => response.end("done"));
			const response = await connect().request(
				{ url: "http://site.test/a" },
				live(),
			);
			assert.equal(response.status, 200);
			assert.equal(response.url, "http://other.test/c");
			assert.equal(text(response.body), "done");
			assert.deepEqual(
				seen.map((entry) => `${entry.host}${entry.path}`),
				["site.test/a", "site.test/b", "other.test/c"],
			);
		});

		test("cross-origin redirects drop credential headers and echoed key parameters but keep content negotiation", async () => {
			routes.set("site.test", (_request, response, url) => {
				if (url.pathname === "/start")
					redirect(`/again?key=${KEY}`, 307)(_request, response, url);
				else
					redirect(`http://other.test/land?key=${KEY}&page=2`, 307)(
						_request,
						response,
						url,
					);
			});
			routes.set("other.test", (_request, response) => response.end("landed"));
			const headers = {
				Authorization: `Bearer ${KEY}`,
				"x-api-key": KEY,
				"x-custom": "private",
				Accept: "text/markdown",
				"User-Agent": "webkit-test",
			};
			const response = await connect({ exaApiKey: KEY }).request(
				{ url: "http://site.test/start", headers },
				live(),
			);
			assert.equal(text(response.body), "landed");
			const [first, again, landed] = seen;
			assert.equal(again?.path, `/again?key=${KEY}`);
			assert.equal(
				again?.headers["x-api-key"],
				KEY,
				"same-origin hops keep credentials",
			);
			assert.equal(again?.headers.authorization, `Bearer ${KEY}`);
			assert.equal(first?.headers["x-api-key"], KEY);
			assert.equal(landed?.host, "other.test");
			assert.equal(landed?.path, "/land?page=2");
			assert.equal(landed?.headers.authorization, undefined);
			assert.equal(landed?.headers["x-api-key"], undefined);
			assert.equal(landed?.headers["x-custom"], undefined);
			assert.equal(landed?.headers.accept, "text/markdown");
			assert.equal(landed?.headers["user-agent"], "webkit-test");
			assert.ok(
				!JSON.stringify(landed).includes(KEY.slice(0, 12)),
				"no part of the key reaches the other origin",
			);
		});

		test("a request body carrying a configured key never follows a cross-origin redirect", async () => {
			routes.set("site.test", redirect("http://other.test/collect", 307));
			routes.set("other.test", (_request, response) =>
				response.end("collected"),
			);
			const request: HttpRequest = {
				url: "http://site.test/search",
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ api_key: KEY, query: "tau" }),
			};
			await assert.rejects(
				connect({ tavilyApiKey: KEY }).request(request, live()),
				isFailure("blocked-url"),
			);
			assert.deepEqual(
				seen.map((entry) => entry.host),
				["site.test"],
			);
			const plain = await connect({ tavilyApiKey: KEY }).request(
				{ ...request, body: '{"query":"tau"}' },
				live(),
			);
			assert.equal(
				text(plain.body),
				"collected",
				"bodies without credentials still follow",
			);
		});

		test("303, 302 and 301 turn a POST into a bodyless GET while 307 and 308 keep it", async () => {
			routes.set("site.test", (request, response, url) => {
				const status = Number(url.pathname.slice(1));
				if (status)
					redirect(`/result-${status}`, status)(request, response, url);
				else response.end("ok");
			});
			for (const status of [301, 302, 303, 307, 308]) {
				seen = [];
				await connect().request(
					{
						url: `http://site.test/${status}`,
						method: "POST",
						headers: { "Content-Type": "text/plain" },
						body: "payload",
					},
					live(),
				);
				const result = seen[1];
				const kept = status === 307 || status === 308;
				assert.equal(result?.method, kept ? "POST" : "GET", `${status} method`);
				assert.equal(result?.body, kept ? "payload" : "", `${status} body`);
				assert.equal(
					result?.headers["content-type"],
					kept ? "text/plain" : undefined,
					`${status} body headers`,
				);
			}
		});

		test("stops after five redirects", async () => {
			routes.set("site.test", (request, response, url) =>
				redirect(`/loop/${Number(url.pathname.split("/")[2]) + 1}`)(
					request,
					response,
					url,
				),
			);
			await assert.rejects(
				connect().request({ url: "http://site.test/loop/0" }, live()),
				isFailure("network"),
			);
			assert.equal(seen.length, 6);
		});

		test("returns a redirect status without a location to the caller", async () => {
			routes.set("site.test", (_request, response) =>
				response.writeHead(302).end("nowhere"),
			);
			const response = await connect().request(
				{ url: "http://site.test/" },
				live(),
			);
			assert.equal(response.status, 302);
		});

		test("refuses redirects to private, loopback, localhost and non-HTTP targets without contacting them", async () => {
			const targets: Record<string, string> = {
				"/private": "http://private.test/secret",
				"/loopback": `http://127.0.0.1:${port}/secret`,
				"/localhost": `http://localhost:${port}/secret`,
				"/metadata": "http://169.254.169.254/latest/meta-data/",
				"/file": "file:///etc/passwd",
			};
			routes.set("site.test", (request, response, url) =>
				redirect(targets[url.pathname] ?? "/")(request, response, url),
			);
			routes.set("private.test", (_request, response) =>
				response.end("secret"),
			);
			for (const path of Object.keys(targets))
				await assert.rejects(
					connect().request({ url: `http://site.test${path}` }, live()),
					isFailure("blocked-url"),
					path,
				);
			assert.deepEqual(
				seen.map((entry) => entry.host),
				Object.keys(targets).map(() => "site.test"),
			);
		});

		test("same-origin redirect mode follows same-origin hops and refuses others", async () => {
			routes.set("site.test", (request, response, url) => {
				if (url.pathname === "/same")
					redirect("/landing")(request, response, url);
				else if (url.pathname === "/away")
					redirect("http://other.test/")(request, response, url);
				else response.end("home");
			});
			routes.set("other.test", (_request, response) => response.end("away"));
			const client = connect();
			assert.equal(
				text(
					(
						await client.request(
							{ url: "http://site.test/same", redirects: "same-origin" },
							live(),
						)
					).body,
				),
				"home",
			);
			await assert.rejects(
				client.request(
					{ url: "http://site.test/away", redirects: "same-origin" },
					live(),
				),
				isFailure("blocked-url"),
			);
			assert.ok(!seen.some((entry) => entry.host === "other.test"));
		});

		test("blocks names that resolve to any private address before sending", async () => {
			for (const host of ["private.test", "mixed.test", "v6private.test"])
				await assert.rejects(
					connect().request({ url: `http://${host}/` }, live()),
					isFailure("blocked-url"),
					host,
				);
			assert.deepEqual(seen, []);
		});

		test("DNS failures and empty answers are network failures without sending", async () => {
			for (const host of ["missing.test", "empty.test"])
				await assert.rejects(
					connect().request({ url: `http://${host}/` }, live()),
					isFailure("network"),
					host,
				);
			assert.deepEqual(seen, []);
		});

		test("a streamed body over the limit fails and closes the transfer", async () => {
			let closed!: Promise<void>;
			routes.set("site.test", (_request, response) => {
				closed = closedWhen(response);
				response.writeHead(200, { "content-type": "text/plain" });
				const timer = setInterval(
					() => response.write(Buffer.alloc(16_384, 97)),
					2,
				);
				response.once("close", () => clearInterval(timer));
			});
			await assert.rejects(
				connect({ maxResponseBytes: 100_000 }).request(
					{ url: "http://site.test/endless" },
					live(),
				),
				isFailure("invalid-response"),
			);
			await within(closed, 2000, "the server saw the transfer close");
		});

		test("a declared length over the limit fails without waiting for the body", async () => {
			routes.set("site.test", (_request, response) => {
				response.writeHead(200, { "content-length": "50000000" });
				response.write("start");
			});
			await assert.rejects(
				connect({ maxResponseBytes: 100_000, timeoutMs: 3000 }).request(
					{ url: "http://site.test/declared" },
					live(),
				),
				isFailure("invalid-response"),
			);
		});

		test("request.maxBytes overrides the setting and admits a body exactly at the limit", async () => {
			routes.set("site.test", (_request, response) =>
				response.end("x".repeat(1000)),
			);
			const client = connect({ maxResponseBytes: 10 });
			assert.equal(
				(
					await client.request(
						{ url: "http://site.test/", maxBytes: 1000 },
						live(),
					)
				).body.byteLength,
				1000,
			);
			await assert.rejects(
				client.request({ url: "http://site.test/", maxBytes: 999 }, live()),
				isFailure("invalid-response"),
			);
		});

		test("PDF responses use pdfMaxBytes while HTML and other content keep the normal cap", async () => {
			const pdf = Buffer.alloc(3000, 37);
			routes.set("site.test", (_request, response, url) => {
				if (url.pathname === "/paper")
					response
						.writeHead(200, { "content-type": "Application/PDF" })
						.end(pdf);
				else if (url.pathname === "/files/paper.pdf")
					response
						.writeHead(200, { "content-type": "application/octet-stream" })
						.end(pdf);
				else
					response
						.writeHead(200, { "content-type": "text/html" })
						.end("x".repeat(3000));
			});
			const client = connect({ maxResponseBytes: 1000 });
			assert.equal(
				(
					await client.request(
						{ url: "http://site.test/paper", pdfMaxBytes: 5000 },
						live(),
					)
				).body.byteLength,
				3000,
			);
			assert.equal(
				(
					await client.request(
						{ url: "http://site.test/files/paper.pdf", pdfMaxBytes: 5000 },
						live(),
					)
				).body.byteLength,
				3000,
				"a .pdf path counts as PDF",
			);
			await assert.rejects(
				client.request(
					{ url: "http://site.test/page", pdfMaxBytes: 5000 },
					live(),
				),
				isFailure("invalid-response"),
				"HTML keeps the normal cap",
			);
			await assert.rejects(
				client.request(
					{ url: "http://site.test/paper", pdfMaxBytes: 2000 },
					live(),
				),
				isFailure("invalid-response"),
				"the PDF cap is still a cap",
			);
			await assert.rejects(
				client.request({ url: "http://site.test/paper" }, live()),
				isFailure("invalid-response"),
				"without pdfMaxBytes PDFs keep the normal cap",
			);
		});

		test("a streamed PDF over pdfMaxBytes fails and closes the transfer", async () => {
			let closed!: Promise<void>;
			routes.set("site.test", (_request, response) => {
				closed = closedWhen(response);
				response.writeHead(200, { "content-type": "application/pdf" });
				const timer = setInterval(
					() => response.write(Buffer.alloc(16_384, 37)),
					2,
				);
				response.once("close", () => clearInterval(timer));
			});
			await assert.rejects(
				connect({ maxResponseBytes: 1000 }).request(
					{ url: "http://site.test/endless.pdf", pdfMaxBytes: 100_000 },
					live(),
				),
				isFailure("invalid-response"),
			);
			await within(closed, 2000, "the server saw the transfer close");
		});

		test("the deadline fails a stalled response and closes the connection", async () => {
			let closed!: Promise<void>;
			routes.set("site.test", (_request, response) => {
				closed = closedWhen(response);
				response.writeHead(200, { "content-type": "text/plain" });
				response.write("partial");
			});
			const started = Date.now();
			await assert.rejects(
				connect({ timeoutMs: 300 }).request(
					{ url: "http://site.test/stall" },
					live(),
				),
				isFailure("timeout"),
			);
			assert.ok(Date.now() - started < 2500, "the deadline fired promptly");
			await within(closed, 2000, "the server saw the connection close");
		});

		test("caller cancellation aborts the active transfer and releases the caller's signal", async () => {
			let closed!: Promise<void>;
			let arrived!: () => void;
			const reached = new Promise<void>((resolve) => {
				arrived = resolve;
			});
			routes.set("site.test", (_request, response) => {
				closed = closedWhen(response);
				response.writeHead(200, { "content-type": "text/plain" });
				response.write("partial");
				arrived();
			});
			const controller = new AbortController();
			const pending = connect().request(
				{ url: "http://site.test/stall" },
				controller.signal,
			);
			await within(reached, 3000, "the request reached the server");
			controller.abort();
			await within(
				assert.rejects(pending, isFailure("cancelled")),
				2000,
				"cancellation settles promptly",
			);
			await within(closed, 2000, "the server saw the connection close");
			assert.equal(getEventListeners(controller.signal, "abort").length, 0);
		});

		test("a completed request leaves no connection open", async () => {
			routes.set("site.test", (_request, response) => response.end("ok"));
			await connect().request({ url: "http://site.test/" }, live());
			const end = Date.now() + 1000;
			while (sockets.size > 0 && Date.now() < end)
				await new Promise((resolve) => setTimeout(resolve, 10));
			assert.equal(sockets.size, 0, "every connection closed");
		});

		test("completed and failed requests leave no abort listener on the caller's signal", async () => {
			routes.set("site.test", (_request, response) => response.end("ok"));
			const signal = live();
			await connect().request({ url: "http://site.test/" }, signal);
			await assert.rejects(
				connect().request({ url: "http://private.test/" }, signal),
			);
			await assert.rejects(
				connect().request({ url: "http://site.test/", maxBytes: 1 }, signal),
			);
			assert.equal(getEventListeners(signal, "abort").length, 0);
		});
	});
}

describe("curl transport configuration", () => {
	const scratch = mkdtemp(join(tmpdir(), "webkit-net-test-"));
	after(async () => rm(await scratch, { recursive: true, force: true }));

	test("ignores curlrc and keeps API and proxy credentials off the command line", async () => {
		const dir = await scratch;
		await writeFile(join(dir, ".curlrc"), 'header = "X-From-Curlrc: yes"\n');
		routes.set("site.test", (_request, response) => response.end("ok"));
		const control = await runNative(
			"curl",
			["-s", "-x", proxy, "http://site.test/control"],
			{ signal: live(), maxBytes: 1000, env: { CURL_HOME: dir } },
		);
		assert.equal(control.status, 0);
		assert.equal(
			seen[0]?.headers["x-from-curlrc"],
			"yes",
			"this curl reads CURL_HOME/.curlrc",
		);

		const argsFile = join(dir, "args");
		const wrapper = join(dir, "curl-wrapper");
		await writeFile(
			wrapper,
			`#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\nexec curl "$@"\n`,
		);
		await chmod(wrapper, 0o755);
		const previous = process.env.CURL_HOME;
		process.env.CURL_HOME = dir;
		try {
			const client = createHttpClient(
				{
					...base,
					proxy: `http://webkit:proxy-pass-4321@127.0.0.1:${port}`,
					curlCommand: wrapper,
					exaApiKey: KEY,
				},
				{ lookup },
			);
			const request: HttpRequest = {
				url: "http://site.test/keyed",
				method: "POST",
				headers: { "x-api-key": KEY, "content-type": "application/json" },
				body: '{"q":1}',
			};
			assert.equal(text((await client.request(request, live())).body), "ok");
		} finally {
			if (previous === undefined) delete process.env.CURL_HOME;
			else process.env.CURL_HOME = previous;
		}
		const keyed = seen[1];
		assert.equal(keyed?.headers["x-api-key"], KEY);
		assert.equal(keyed?.body, '{"q":1}');
		assert.equal(
			keyed?.headers["proxy-authorization"],
			`Basic ${Buffer.from("webkit:proxy-pass-4321").toString("base64")}`,
		);
		assert.equal(
			keyed?.headers["x-from-curlrc"],
			undefined,
			"curlrc was ignored",
		);
		const argv = await readFile(argsFile, "utf8");
		assert.ok(argv.length > 0, "the wrapper recorded curl's arguments");
		for (const secret of [KEY, "proxy-pass-4321", '{"q":1}'])
			assert.ok(!argv.includes(secret), `${secret} stays off the command line`);
	});

	test("direct curl connects only to validated addresses, preferring IPv4, while a proxy resolves names itself", async () => {
		const dir = await scratch;
		const argsFile = join(dir, "fake-args");
		const fake = join(dir, "fake-curl");
		await writeFile(
			fake,
			[
				"#!/bin/sh",
				`printf '%s\\n' "$@" > '${argsFile}'`,
				"while [ $# -gt 0 ]; do",
				`  if [ "$1" = "--dump-header" ]; then printf 'HTTP/1.1 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\n' > "$2"; fi`,
				"  shift",
				"done",
				"printf fake",
				"",
			].join("\n"),
		);
		await chmod(fake, 0o755);
		const resolved = async (url: string, settings: Partial<Settings> = {}) => {
			const response = await createHttpClient(
				{ ...base, curlCommand: fake, ...settings },
				{ lookup },
			).request({ url }, live());
			assert.equal(text(response.body), "fake");
			const args = (await readFile(argsFile, "utf8")).split("\n");
			return args.flatMap((arg, index) =>
				arg === "--resolve" ? [args[index + 1]] : [],
			);
		};
		assert.deepEqual(await resolved("http://dual.test/"), [
			"dual.test:80:93.184.216.35",
		]);
		assert.deepEqual(await resolved("https://v6only.test:8443/"), [
			"v6only.test:8443:[2606:4700::1111]",
		]);
		assert.deepEqual(await resolved("http://dual.test/", { proxy }), []);
		for (const scheme of ["socks4", "socks5"])
			assert.deepEqual(
				await resolved("http://dual.test/", {
					proxy: `${scheme}://proxy.example:1080`,
				}),
				["dual.test:80:93.184.216.35"],
			);
		for (const scheme of ["socks4a", "socks5h"])
			assert.deepEqual(
				await resolved("http://dual.test/", {
					proxy: `${scheme}://proxy.example:1080`,
				}),
				[],
			);
	});

	test("a missing curl executable is a configuration failure", async () => {
		const client = createHttpClient(
			{ ...base, proxy, curlCommand: join(await scratch, "missing-curl") },
			{ lookup },
		);
		await assert.rejects(
			client.request({ url: "http://site.test/" }, live()),
			isFailure("config"),
		);
		assert.deepEqual(seen, []);
	});
});
