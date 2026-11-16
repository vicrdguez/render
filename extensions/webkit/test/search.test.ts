import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import {
	type HttpRequest,
	type HttpResponse,
	type RequestScope,
	type SearchRequest,
	type SearchResult,
	type Settings,
	WebkitError,
} from "../src/domain.ts";
import { search } from "../src/search.ts";

const defaults: Settings = {
	provider: "auto",
	fallbackProviders: "",
	hostedExtraction: false,
	timeoutMs: 1000,
	maxResponseBytes: 100000,
};
const request: SearchRequest = {
	queries: ["tau durability"],
	controls: { numResults: 5, domainFilter: [] },
	includeContent: false,
};
function response(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
): HttpResponse {
	return {
		url: "https://provider.example/search",
		status,
		headers,
		body: new TextEncoder().encode(
			typeof body === "string" ? body : JSON.stringify(body),
		),
	};
}
function mcp(body: unknown) {
	return {
		jsonrpc: "2.0",
		id: 1,
		result: { content: [{ type: "text", text: JSON.stringify(body) }] },
	};
}
function fixture(
	handler: (
		req: HttpRequest,
		signal: AbortSignal,
	) => HttpResponse | Promise<HttpResponse>,
	settings: Partial<Settings> = {},
): RequestScope {
	return {
		settings: { ...defaults, ...settings },
		signal: new AbortController().signal,
		now: () => Date.parse("2026-04-20T12:00:00Z"),
		endpoints: {
			exaMcp: "https://mcp.exa.ai/mcp",
			exa: "https://api.exa.ai",
			tavily: "https://api.tavily.com",
			github: "https://api.github.com",
		},
		http: { request: async (req, signal) => handler(req, signal) },
	};
}
function successful(result: SearchResult, index = 0) {
	const item = result.queries[index];
	assert.ok(item);
	assert.equal(item.status, "ok");
	if (item.status !== "ok") throw new Error("Expected success");
	return item.value;
}
function failed(result: SearchResult, kind: string, index = 0) {
	const item = result.queries[index];
	assert.ok(item);
	assert.equal(item.status, "failed");
	if (item.status !== "failed") throw new Error("Expected failure");
	assert.equal(item.failure.kind, kind);
	return item.failure;
}

test("keyless advanced MCP maps structured controls, publication metadata and local domain filtering", async () => {
	const scope = fixture((req) => {
		assert.equal(
			new URL(req.url).searchParams.get("tools"),
			"web_search_advanced_exa",
		);
		assert.equal(req.method, "POST");
		assert.match(
			req.headers?.Accept ?? req.headers?.accept ?? "",
			/text\/event-stream/,
		);
		const body = JSON.parse(req.body!);
		assert.equal(body.method, "tools/call");
		assert.equal(body.params.name, "web_search_advanced_exa");
		assert.deepEqual(body.params.arguments, {
			query: "tau durability",
			type: "auto",
			numResults: 2,
			includeDomains: ["example.org"],
			excludeDomains: ["bad.example.org"],
			startPublishedDate: "2026-04-13T12:00:00.000Z",
			category: "publication",
			enableHighlights: true,
			textMaxCharacters: 3000,
		});
		return response(
			mcp({
				results: [
					{ url: "https://bad.example.org/no", title: "Excluded" },
					{ url: "https://example.org.evil.test/no", title: "Wrong host" },
					{
						url: "https://sub.example.org/paper",
						title: "Paper",
						highlights: ["Useful", "evidence"],
						entities: [
							{
								type: "publication",
								properties: {
									date: "2026-04-18",
									authors: [
										{ name: "A" },
										{ name: "B" },
										{ name: "C" },
										{ name: "D" },
									],
									citationCount: 7,
									doi: "10.123/example",
								},
							},
						],
					},
				],
			}),
		);
	});
	const result = await search(
		{
			...request,
			controls: {
				numResults: 2,
				domainFilter: [
					" https://EXAMPLE.org/path ",
					"example.org",
					" -bad.example.org ",
				],
				recencyFilter: "week",
				category: "publication",
			},
		},
		scope,
	);
	assert.deepEqual(successful(result), {
		query: "tau durability",
		transport: "exa-mcp",
		hits: [
			{
				url: "https://sub.example.org/paper",
				title: "Paper",
				snippet: "Useful evidence",
				publishedDate: "2026-04-18",
				author: "A, B, C et al.",
				citationCount: 7,
				doi: "10.123/example",
			},
		],
	});
	assert.deepEqual(result.documents, []);
	assert.deepEqual(result.fetchFailures, []);
});

test("MCP accepts JSON and multiline SSE with notifications", async () => {
	const envelope = mcp({
		results: [
			{
				url: "https://example.org",
				text: "  source text  ",
				author: "Ada",
				publishedDate: "2026-01-01",
			},
		],
	});
	for (const body of [
		envelope,
		`: keepalive\r\n\r\nevent: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\nevent: message\r\ndata: ${JSON.stringify(envelope, null, 2).split("\n").join("\r\ndata: ")}\r\n\r\ndata: [DONE]\r\n\r\n`,
	]) {
		const result = await search(
			request,
			fixture(() => response(body)),
		);
		assert.deepEqual(successful(result).hits, [
			{
				url: "https://example.org",
				title: "example.org",
				snippet: "source text",
				author: "Ada",
				publishedDate: "2026-01-01",
			},
		]);
	}
});

test("auto prefers keyed Exa, then keyed Tavily, then anonymous MCP", async () => {
	for (const [settings, host, transport] of [
		[{ exaApiKey: "exa-key", tavilyApiKey: "tav-key" }, "api.exa.ai", "exa"],
		[{ tavilyApiKey: "tav-key" }, "api.tavily.com", "tavily"],
		[{}, "mcp.exa.ai", "exa-mcp"],
	] as const) {
		const result = await search(
			request,
			fixture((req) => {
				assert.equal(new URL(req.url).hostname, host);
				return response(
					transport === "exa-mcp" ? mcp({ results: [] }) : { results: [] },
				);
			}, settings),
		);
		assert.equal(successful(result).transport, transport);
	}
});

test("keyed Exa uses REST credentials and real date/domain/category fields", async () => {
	const result = await search(
		{
			...request,
			controls: {
				numResults: 99,
				domainFilter: ["example.org"],
				recencyFilter: "day",
				category: "news",
			},
		},
		fixture(
			(req) => {
				assert.equal(req.url, "https://api.exa.ai/search");
				assert.equal(req.headers?.["x-api-key"], "exa-secret");
				assert.deepEqual(JSON.parse(req.body!), {
					query: "tau durability",
					type: "auto",
					numResults: 20,
					includeDomains: ["example.org"],
					startPublishedDate: "2026-04-19T12:00:00.000Z",
					category: "news",
					contents: { highlights: true },
				});
				return response({
					results: [
						{
							url: "https://example.org/news",
							title: "News",
							text: "body",
							publishedDate: "2026-04-20",
							author: "Ada",
						},
					],
				});
			},
			{ exaApiKey: "exa-secret" },
		),
	);
	assert.equal(successful(result).transport, "exa");
	assert.equal(successful(result).hits[0]!.author, "Ada");
});

test("Tavily maps time_range and normalized domains without query hints", async () => {
	const result = await search(
		{
			...request,
			controls: {
				numResults: 1.9,
				domainFilter: ["EXAMPLE.org/path", "-bad.example.org"],
				recencyFilter: "month",
			},
		},
		fixture(
			(req) => {
				assert.equal(req.url, "https://api.tavily.com/search");
				assert.equal(req.headers?.Authorization, "Bearer tavily-secret");
				assert.deepEqual(JSON.parse(req.body!), {
					query: "tau durability",
					search_depth: "basic",
					max_results: 1,
					include_answer: false,
					include_raw_content: false,
					time_range: "month",
					include_domains: ["example.org"],
					exclude_domains: ["bad.example.org"],
				});
				return response({
					results: [
						{ url: "https://bad.example.org/no" },
						{
							url: "https://example.org/good",
							content: " useful\n evidence ",
							published_date: "2026-04-01",
						},
						{ url: "https://example.org/extra" },
					],
				});
			},
			{ tavilyApiKey: "tavily-secret" },
		),
	);
	assert.deepEqual(successful(result).hits, [
		{
			url: "https://example.org/good",
			title: "example.org",
			snippet: "useful evidence",
			publishedDate: "2026-04-01",
		},
	]);
});

test("Tavily does not request discarded generated answers and accepts a null answer", async () => {
	const result = await search(
		request,
		fixture(
			(req) => {
				assert.equal(JSON.parse(req.body!).include_answer, false);
				return response({ answer: null, results: [] });
			},
			{ tavilyApiKey: "tavily-secret" },
		),
	);
	assert.deepEqual(successful(result).hits, []);
});

test("count normalization retains upstream bounds and default", async () => {
	for (const [input, expected] of [
		[0, 1],
		[-2, 1],
		[NaN, 5],
		[Infinity, 5],
		[3.8, 3],
		[21, 20],
	] as const) {
		await search(
			{ ...request, controls: { ...request.controls, numResults: input } },
			fixture((req) => {
				assert.equal(
					JSON.parse(req.body!).params.arguments.numResults,
					expected,
				);
				return response(mcp({ results: [] }));
			}),
		);
	}
});

test("empty successful results and local domain misses do not trigger fallback", async () => {
	for (const results of [[], [{ url: "https://other.example/" }]]) {
		let calls = 0;
		const result = await search(
			{
				...request,
				controls: { ...request.controls, domainFilter: ["example.org"] },
			},
			fixture(
				() => {
					calls++;
					return response({ results });
				},
				{ exaApiKey: "key", tavilyApiKey: "key2", fallbackProviders: "tavily" },
			),
		);
		assert.deepEqual(successful(result).hits, []);
		assert.equal(calls, 1);
	}
});

test("explicit request and project provider selections remain strict", async () => {
	for (const [settings, provider] of [
		[
			{ exaApiKey: "key", tavilyApiKey: "other", fallbackProviders: "tavily" },
			"exa",
		],
		[
			{
				provider: "exa",
				exaApiKey: "key",
				tavilyApiKey: "other",
				fallbackProviders: "tavily",
			},
			undefined,
		],
	] as const) {
		let calls = 0;
		failed(
			await search(
				{ ...request, ...(provider ? { provider } : {}) },
				fixture(() => {
					calls++;
					return response("quota", 429);
				}, settings),
			),
			"quota",
		);
		assert.equal(calls, 1);
	}
	let calls = 0;
	failed(
		await search(
			{ ...request, provider: "tavily" },
			fixture(
				() => {
					calls++;
					return response({ results: [] });
				},
				{ provider: "exa", exaApiKey: "key", tavilyApiKey: "other" },
			),
		),
		"config",
	);
	assert.equal(calls, 0);
});

test("missing credentials, unsupported category, and invalid filters never send requests", async () => {
	for (const [req, settings, kind] of [
		[{ ...request, provider: "exa" }, {}, "config"],
		[{ ...request, provider: "tavily" }, {}, "config"],
		[
			{ ...request, controls: { ...request.controls, category: "news" } },
			{ tavilyApiKey: "key", fallbackProviders: "exa-mcp" },
			"unsupported",
		],
		[
			{
				...request,
				controls: { ...request.controls, domainFilter: ["not a domain"] },
			},
			{},
			"config",
		],
	] as const) {
		let calls = 0;
		failed(
			await search(
				req as SearchRequest,
				fixture(() => {
					calls++;
					return response(mcp({ results: [] }));
				}, settings),
			),
			kind,
		);
		assert.equal(calls, 0);
	}
});

test("only an explicitly configured ordered fallback list permits retryable fallback", async () => {
	const visited: string[] = [];
	const result = await search(
		request,
		fixture(
			(req) => {
				const host = new URL(req.url).hostname;
				visited.push(host);
				return host === "api.exa.ai"
					? response("quota", 429)
					: host === "mcp.exa.ai"
						? response("bad json")
						: response({ results: [] });
			},
			{
				exaApiKey: "key",
				tavilyApiKey: "other",
				fallbackProviders: "exa-mcp,tavily",
			},
		),
	);
	assert.deepEqual(visited, ["api.exa.ai", "mcp.exa.ai", "api.tavily.com"]);
	assert.equal(successful(result).transport, "tavily");
	let calls = 0;
	failed(
		await search(
			request,
			fixture(
				() => {
					calls++;
					return response("quota", 429);
				},
				{ exaApiKey: "key", tavilyApiKey: "other" },
			),
		),
		"quota",
	);
	assert.equal(calls, 1);
});

test("authentication, config, unsupported, and cancellation failures never fall back", async () => {
	for (const [status, kind] of [
		[401, "authentication"],
		[403, "authentication"],
		[400, "config"],
		[422, "config"],
		[404, "unsupported"],
	] as const) {
		let calls = 0;
		failed(
			await search(
				request,
				fixture(
					() => {
						calls++;
						return response("sk-secret", status);
					},
					{ exaApiKey: "sk-secret", fallbackProviders: "exa-mcp" },
				),
			),
			kind,
		);
		assert.equal(calls, 1);
	}
	for (const kind of [
		"cancelled",
		"config",
		"unsupported",
		"authentication",
		"blocked-url",
	] as const) {
		let calls = 0;
		failed(
			await search(
				request,
				fixture(
					() => {
						calls++;
						throw new WebkitError(kind, "Safe failure.");
					},
					{ exaApiKey: "key", fallbackProviders: "exa-mcp" },
				),
			),
			kind,
		);
		assert.equal(calls, 1);
	}
});

test("quota, timeout, network, and malformed responses allow configured fallback", async () => {
	for (const first of [
		() => response("busy", 429),
		() => {
			throw new WebkitError("timeout", "Request timed out.");
		},
		() => {
			throw new TypeError("fetch failed sk-secret");
		},
		() => response({ results: "not-an-array" }),
	]) {
		let calls = 0;
		const result = await search(
			request,
			fixture(
				() => (++calls === 1 ? first() : response(mcp({ results: [] }))),
				{ exaApiKey: "sk-secret", fallbackProviders: "exa-mcp" },
			),
		);
		assert.equal(calls, 2);
		assert.equal(successful(result).transport, "exa-mcp");
	}
});

test("MCP HTTP200 quota metadata, tool errors and JSON-RPC errors are classified without body leaks", async () => {
	for (const [payload, kind] of [
		[
			{
				result: {
					_meta: { "ai.exa/rateLimited": true },
					content: [{ type: "text", text: "sk-secret" }],
				},
			},
			"quota",
		],
		[
			{
				result: {
					isError: true,
					content: [{ type: "text", text: "Rate limit exceeded sk-secret" }],
				},
			},
			"quota",
		],
		[{ error: { code: 429, message: "sk-secret" } }, "quota"],
		[
			{ error: { code: -32601, message: "unknown tool sk-secret" } },
			"unsupported",
		],
		[
			{ error: { code: -32602, message: "invalid params sk-secret" } },
			"config",
		],
		[
			{
				result: {
					isError: true,
					content: [{ type: "text", text: "Unauthorized sk-secret" }],
				},
			},
			"authentication",
		],
		[{ error: { code: -32000, message: "sk-secret" } }, "invalid-response"],
	] as const) {
		let calls = 0;
		const result = await search(
			request,
			fixture(() => {
				calls++;
				return response(payload);
			}),
		);
		failed(result, kind);
		assert.equal(calls, 1);
		assert.doesNotMatch(JSON.stringify(result), /sk-secret/);
	}
});

test("captured upstream MCP quota SSE follows only the configured route", async () => {
	const visited: string[] = [];
	const captured = `event: message\ndata: ${JSON.stringify({ result: { _meta: { "ai.exa/rateLimited": true }, content: [{ type: "text", text: "You've hit Exa's free MCP rate limit. To continue using without limits, create your own Exa API key." }] }, jsonrpc: "2.0", id: 1 })}\n`;
	const result = await search(
		request,
		fixture(
			(req) => {
				const host = new URL(req.url).hostname;
				visited.push(host);
				return host === "api.exa.ai"
					? response("quota", 429)
					: host === "mcp.exa.ai"
						? response(captured)
						: response({ results: [] });
			},
			{
				exaApiKey: "exa-key",
				tavilyApiKey: "tavily-key",
				fallbackProviders: "exa-mcp,tavily",
			},
		),
	);
	assert.deepEqual(visited, ["api.exa.ai", "mcp.exa.ai", "api.tavily.com"]);
	assert.equal(successful(result).transport, "tavily");
});

test("explicit anonymous transport remains anonymous when a key is configured", async () => {
	const result = await search(
		{ ...request, provider: "exa-mcp" },
		fixture(
			(req) => {
				assert.equal(new URL(req.url).hostname, "mcp.exa.ai");
				assert.equal(req.headers?.["x-api-key"], undefined);
				assert.doesNotMatch(req.url + req.body, /exa-secret/);
				return response(mcp({ results: [] }));
			},
			{ exaApiKey: "exa-secret" },
		),
	);
	assert.equal(successful(result).transport, "exa-mcp");
});

test("HTTP errors discard provider bodies and retain retry-after", async () => {
	for (const settings of [
		{},
		{ exaApiKey: "sk-secret" },
		{ tavilyApiKey: "sk-secret" },
	]) {
		const result = await search(
			request,
			fixture(
				() =>
					response("secret sk-secret sk%2Dsecret", 429, { "retry-after": "2" }),
				settings,
			),
		);
		assert.equal(failed(result, "quota").retryAfterMs, 2000);
		assert.doesNotMatch(JSON.stringify(result), /sk-secret|sk%2Dsecret/);
	}
});

test("malformed result fields fail rather than silently becoming empty success", async () => {
	const bad = [
		null,
		{},
		{ results: null },
		{ results: {} },
		{ results: [null] },
		{ results: [{}] },
		{ results: [{ url: "not a URL" }] },
		{ results: [{ url: "https://example.org", title: 42 }] },
		{ results: [{ url: "https://example.org", author: {} }] },
		{ results: [{ url: "https://example.org", text: false }] },
		{ results: [{ url: "https://example.org", highlights: [42] }] },
		{
			results: [
				{
					url: "https://example.org",
					entities: [
						{ type: "publication", properties: { citationCount: "7" } },
					],
				},
			],
		},
	];
	for (const payload of bad) {
		failed(
			await search(
				request,
				fixture(() => response(mcp(payload))),
			),
			"invalid-response",
		);
		failed(
			await search(
				request,
				fixture(() => response(payload), { exaApiKey: "key" }),
			),
			"invalid-response",
		);
	}
	for (const payload of [
		{},
		{ results: [{}] },
		{ results: [{ url: "https://example.org", content: false }] },
		{ results: [{ url: "https://example.org", raw_content: {} }] },
	]) {
		failed(
			await search(
				request,
				fixture(() => response(payload), { tavilyApiKey: "key" }),
			),
			"invalid-response",
		);
	}
	for (const body of [
		"",
		"nonsense",
		{ result: {} },
		{ result: { content: [] } },
		{
			result: {
				content: [
					{ type: "text", text: "Title: prose\nURL: https://example.org" },
				],
			},
		},
	])
		failed(
			await search(
				request,
				fixture(() => response(body)),
			),
			"invalid-response",
		);
});

test("malformed MCP metadata and content blocks are invalid responses", async () => {
	for (const result of [
		{
			_meta: { "ai.exa/rateLimited": "true" },
			content: [{ type: "text", text: '{"results":[]}' }],
		},
		{ content: [{ type: "text", text: '{"results":[]}' }, { type: 42 }] },
	])
		failed(
			await search(
				request,
				fixture(() => response({ result })),
			),
			"invalid-response",
		);
	failed(
		await search(
			request,
			fixture(() => response({ results: [], error: "secret" }), {
				tavilyApiKey: "key",
			}),
		),
		"invalid-response",
	);
});

test("year-only publication metadata retains zero citations and ignores other entity types", async () => {
	const result = await search(
		request,
		fixture(() =>
			response(
				mcp({
					results: [
						{
							url: "https://example.org/paper",
							author: "N/A",
							publishedDate: "N/A",
							entities: [
								{
									type: "publication",
									properties: { year: 1974, citationCount: 0 },
								},
							],
						},
						{
							url: "https://example.org/company",
							entities: [
								{ type: "company", properties: { citationCount: 99 } },
							],
						},
					],
				}),
			),
		),
	);
	assert.deepEqual(successful(result).hits, [
		{
			url: "https://example.org/paper",
			title: "example.org",
			snippet: "",
			publishedDate: "1974",
			citationCount: 0,
		},
		{ url: "https://example.org/company", title: "example.org", snippet: "" },
	]);
});

test("query batches preserve indexes and partial outcomes with concurrency three", async () => {
	let active = 0;
	let maxActive = 0;
	const release: (() => void)[] = [];
	let signalStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});
	const queries = Array.from({ length: 8 }, (_, i) => `query ${i}`);
	const pending = search(
		{ ...request, queries },
		fixture(async (req) => {
			const query = JSON.parse(req.body!).params.arguments.query;
			active++;
			maxActive = Math.max(maxActive, active);
			if (query < "query 3")
				await new Promise<void>((resolve) => {
					release.push(resolve);
					if (release.length === 3) signalStarted();
				});
			active--;
			return query === "query 4"
				? response("bad")
				: response(
						mcp({
							results: [{ url: `https://example.org/${query.slice(-1)}` }],
						}),
					);
		}),
	);
	await started;
	assert.equal(active, 3);
	for (const resolve of release.reverse()) resolve();
	const result = await pending;
	assert.equal(maxActive, 3);
	assert.deepEqual(
		result.queries.map((item) => item.index),
		[0, 1, 2, 3, 4, 5, 6, 7],
	);
	assert.equal(successful(result, 7).query, "query 7");
	failed(result, "invalid-response", 4);
});

test("empty, oversized, and blank query batches reject before network activity", async () => {
	for (const queries of [[], Array.from({ length: 9 }, () => "q"), [" "]]) {
		let calls = 0;
		await assert.rejects(
			search(
				{ ...request, queries },
				fixture(() => {
					calls++;
					return response(mcp({ results: [] }));
				}),
			),
			(error: unknown) =>
				error instanceof WebkitError && error.failure.kind === "config",
		);
		assert.equal(calls, 0);
	}
});

test("caller abort propagates through a real HTTP request and does not start fallback", async () => {
	let signalArrived!: () => void;
	let signalClosed!: () => void;
	const arrived = new Promise<void>((resolve) => {
		signalArrived = resolve;
	});
	const closed = new Promise<void>((resolve) => {
		signalClosed = resolve;
	});
	const server = createServer((_req, res) => {
		res.on("close", signalClosed);
		signalArrived();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	assert.ok(address && typeof address === "object");
	const controller = new AbortController();
	let calls = 0;
	const scope = fixture(
		async (req, signal) => {
			calls++;
			const res = await fetch(`http://127.0.0.1:${address.port}`, {
				method: req.method ?? "GET",
				body: req.body ?? null,
				signal,
			});
			return response(await res.text(), res.status);
		},
		{ fallbackProviders: "tavily", tavilyApiKey: "key" },
	);
	scope.signal = controller.signal;
	try {
		const pending = search(
			{ ...request, queries: Array.from({ length: 8 }, (_, i) => `q${i}`) },
			scope,
		);
		await arrived;
		controller.abort();
		const result = await pending;
		await closed;
		assert.ok(calls <= 3);
		for (const item of result.queries) {
			assert.equal(item.status, "failed");
			if (item.status === "failed")
				assert.equal(item.failure.kind, "cancelled");
		}
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test("deadline errors remain timeouts and an AbortError never becomes a timeout", async () => {
	for (const [error, expected] of [
		[new DOMException("deadline", "TimeoutError"), "timeout"],
		[new DOMException("abort", "AbortError"), "cancelled"],
	] as const) {
		failed(
			await search(
				request,
				fixture(() => {
					throw error;
				}),
			),
			expected,
		);
	}
});

test("includeContent retains failed page URLs and HTTP failure causes without a document index", async () => {
	const result = await search(
		{ ...request, includeContent: true },
		fixture((req) => {
			if (req.method === "POST")
				return response(
					mcp({
						results: [
							{ url: "https://example.org/fail" },
							{ url: "https://example.org/good" },
						],
					}),
				);
			return req.url.endsWith("/fail")
				? response("Denied", 403)
				: response("# Good\n\nUseful source content.", 200, {
						"content-type": "text/markdown",
					});
		}),
	);
	assert.equal(result.documents.length, 1);
	assert.equal(successful(result).hits[0]!.documentIndex, undefined);
	assert.equal(successful(result).hits[1]!.documentIndex, 0);
	assert.equal(result.fetchFailures.length, 1);
	assert.equal(result.fetchFailures[0]!.url, "https://example.org/fail");
	assert.equal(result.fetchFailures[0]!.failure.kind, "network");
	assert.match(result.fetchFailures[0]!.failure.message, /HTTP 403/);
});

test("includeContent rejects literal and encoded provider keys before fetching without discarding search hits", async () => {
	for (const provider of ["exa", "tavily", "exa-mcp"] as const) {
		const leakedUrls = [
			"https://other.example/echo?key=exa-secret",
			"https://other.example/echo?key=exa%2Dsecret",
			"https://other.example/echo?key=tavily-secret",
			"https://other.example/echo?key=tavily%2Dsecret",
		];
		const gets: string[] = [];
		const result = await search(
			{ ...request, provider, includeContent: true },
			fixture(
				(req) => {
					if (req.method === "POST") {
						const payload = {
							results: [...leakedUrls, "https://example.org/good"].map(
								(url) => ({ url }),
							),
						};
						return response(provider === "exa-mcp" ? mcp(payload) : payload);
					}
					gets.push(req.url);
					return response(
						`# Good\n\n${"Useful source content. ".repeat(30)}`,
						200,
						{ "content-type": "text/markdown" },
					);
				},
				{ exaApiKey: "exa-secret", tavilyApiKey: "tavily-secret" },
			),
		);
		assert.deepEqual(gets, ["https://example.org/good"]);
		assert.doesNotMatch(
			decodeURIComponent(gets.join("\n")),
			/exa-secret|tavily-secret/,
		);
		assert.equal(successful(result).hits.length, 5);
		assert.ok(
			successful(result)
				.hits.slice(0, 4)
				.every((hit) => hit.documentIndex === undefined),
		);
		assert.equal(successful(result).hits[4]!.documentIndex, 0);
		assert.equal(result.fetchFailures.length, 4);
		for (const item of result.fetchFailures) {
			assert.match(item.url, /\[redacted\]/);
			assert.equal(item.failure.kind, "blocked-url");
		}
	}
});

test("includeContent attaches fetched documents by URL across duplicate hits", async () => {
	const result = await search(
		{ ...request, queries: ["one", "two"], includeContent: true },
		fixture((req) => {
			if (req.method === "POST")
				return response(
					mcp({
						results: [{ url: "https://example.org/page", title: "Page" }],
					}),
				);
			assert.equal(req.url, "https://example.org/page");
			return response("# Page\n\nUseful readable source content.", 200, {
				"content-type": "text/markdown",
			});
		}),
	);
	assert.equal(result.documents.length, 1);
	assert.equal(
		result.documents[0]!.text,
		"# Page\n\nUseful readable source content.",
	);
	assert.equal(successful(result, 0).hits[0]!.documentIndex, 0);
	assert.equal(successful(result, 1).hits[0]!.documentIndex, 0);
	assert.deepEqual(result.fetchFailures, []);
});
