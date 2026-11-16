import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type FetchResult,
	type HttpRequest,
	type HttpResponse,
	type RequestScope,
	WebkitError,
} from "../src/domain.ts";
import { fetchExaPages } from "../src/exa.ts";

const urls: [string, string, string] = [
	"https://example.org/a",
	"https://example.org/b",
	"https://example.org/c",
];
function response(body: unknown, status = 200): HttpResponse {
	return {
		url: "https://api.exa.ai/contents",
		status,
		headers: {},
		body: new TextEncoder().encode(
			typeof body === "string" ? body : JSON.stringify(body),
		),
	};
}
function fixture(
	handler: (
		req: HttpRequest,
		signal: AbortSignal,
	) => HttpResponse | Promise<HttpResponse>,
): RequestScope {
	return {
		settings: {
			provider: "auto",
			exaApiKey: "exa-secret",
			fallbackProviders: "",
			hostedExtraction: true,
			timeoutMs: 1000,
			maxResponseBytes: 100000,
		},
		signal: new AbortController().signal,
		now: () => 0,
		endpoints: {
			exaMcp: "https://mcp.exa.ai/mcp",
			exa: "https://api.exa.ai",
			tavily: "https://api.tavily.com",
			github: "https://api.github.com",
		},
		http: { request: async (req, signal) => handler(req, signal) },
	};
}
function failed(result: FetchResult, index: number, kind: string) {
	const item = result.items[index];
	assert.ok(item);
	assert.equal(item.status, "failed");
	if (item.status === "failed") assert.equal(item.failure.kind, kind);
}

test("hosted contents uses keyed /contents and correlates reordered URLs and per-URL statuses", async () => {
	const result = await fetchExaPages(
		urls,
		fixture((req) => {
			assert.equal(req.url, "https://api.exa.ai/contents");
			assert.equal(req.method, "POST");
			assert.equal(req.headers?.["x-api-key"], "exa-secret");
			assert.deepEqual(JSON.parse(req.body!), { urls, text: true });
			return response({
				results: [
					{
						url: urls[2],
						title: "Third",
						text: " Third body ",
						publishedDate: "2026-01-01",
					},
					{ url: urls[0], title: "First", text: "First body" },
				],
				statuses: [
					{ id: urls[0], status: "success" },
					{
						id: urls[1],
						status: "error",
						error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 },
					},
					{ id: urls[2], status: "success" },
				],
			});
		}),
	);
	assert.deepEqual(result.requestedUrls, urls);
	assert.deepEqual(result.documents, [
		{
			url: urls[0],
			title: "First",
			text: "First body",
			format: "markdown",
			extractor: "exa",
			truncated: false,
		},
		{
			url: urls[2],
			title: "Third",
			text: "Third body",
			format: "markdown",
			extractor: "exa",
			truncated: false,
			publishedDate: "2026-01-01",
		},
	]);
	assert.deepEqual(result.items[0], { index: 0, status: "ok", value: 0 });
	assert.deepEqual(result.items[2], { index: 2, status: "ok", value: 1 });
	failed(result, 1, "extraction");
});

test("hosted redirected contents uses the requested ID rather than response order", async () => {
	const result = await fetchExaPages(
		[urls[0], urls[1], urls[2]],
		fixture(() =>
			response({
				results: [
					{
						id: urls[1],
						url: "https://example.org/b-canonical",
						text: "Second",
					},
					{
						id: urls[0],
						url: "https://example.org/a-canonical",
						text: "First",
					},
				],
			}),
		),
	);
	assert.deepEqual(result.requestedUrls, urls);
	assert.deepEqual(result.items.slice(0, 2), [
		{ index: 0, status: "ok", value: 0 },
		{ index: 1, status: "ok", value: 1 },
	]);
	failed(result, 2, "extraction");
	assert.equal(result.documents[0]!.url, "https://example.org/a-canonical");
	assert.equal(result.documents[0]!.text, "First");
	assert.equal(result.documents[1]!.url, "https://example.org/b-canonical");
});

test("hosted extraction requires a key without reading ambient configuration", async () => {
	let calls = 0;
	const scope = fixture(() => {
		calls++;
		return response({ results: [] });
	});
	delete scope.settings.exaApiKey;
	const result = await fetchExaPages([urls[0]], scope);
	failed(result, 0, "config");
	assert.equal(calls, 0);
});

test("blocked target URLs are not sent to hosted extraction", async () => {
	for (const url of [
		"http://127.0.0.1/private",
		"http://169.254.169.254/latest/meta-data",
		"file:///etc/passwd",
		"https://user:password@example.org",
	]) {
		let calls = 0;
		const result = await fetchExaPages(
			[url],
			fixture(() => {
				calls++;
				return response({ results: [] });
			}),
		);
		failed(result, 0, "blocked-url");
		assert.equal(calls, 0);
	}
});

test("hosted extraction retains valid targets beside blocked ones", async () => {
	const result = await fetchExaPages(
		["file:///private", urls[0]],
		fixture((req) => {
			assert.deepEqual(JSON.parse(req.body!).urls, [urls[0]]);
			return response({ results: [{ url: urls[0], text: "Body" }] });
		}),
	);
	assert.deepEqual(result.requestedUrls, ["file:///private", urls[0]]);
	failed(result, 0, "blocked-url");
	assert.deepEqual(result.items[1], { index: 1, status: "ok", value: 0 });
});

test("malformed hosted fields and unknown or duplicate returned URLs fail closed", async () => {
	for (const payload of [
		null,
		{},
		{ results: null },
		{ results: [{}] },
		{ results: [{ url: urls[0], text: 42 }] },
		{ results: [{ url: urls[0], text: "Body", title: 42 }] },
		{ results: [{ url: "https://other.example/wrong", text: "Body" }] },
		{
			results: [
				{ url: urls[0], text: "A" },
				{ url: urls[0], text: "B" },
			],
		},
		{ results: [], statuses: {} },
		{ results: [], statuses: [{ id: urls[0], status: 42 }] },
	]) {
		const result = await fetchExaPages(
			[urls[0]],
			fixture(() => response(payload)),
		);
		failed(result, 0, "invalid-response");
		assert.deepEqual(result.documents, []);
	}
});

test("empty or missing hosted content fails only its matching URL", async () => {
	const result = await fetchExaPages(
		urls,
		fixture(() =>
			response({
				results: [
					{ url: urls[1], text: "Good" },
					{ url: urls[0], text: "   " },
				],
			}),
		),
	);
	failed(result, 0, "extraction");
	assert.deepEqual(result.items[1], { index: 1, status: "ok", value: 0 });
	failed(result, 2, "extraction");
	assert.equal(result.documents[0]!.url, urls[1]);
});

test("duplicate input URLs share a correctly attributed document", async () => {
	const result = await fetchExaPages(
		[urls[0], urls[0]],
		fixture((req) => {
			assert.deepEqual(JSON.parse(req.body!).urls, [urls[0]]);
			return response({ results: [{ url: urls[0], text: "Body" }] });
		}),
	);
	assert.deepEqual(result.requestedUrls, [urls[0], urls[0]]);
	assert.equal(result.documents.length, 1);
	assert.deepEqual(result.items, [
		{ index: 0, status: "ok", value: 0 },
		{ index: 1, status: "ok", value: 0 },
	]);
});

test("hosted error statuses never expose raw bodies or status detail echoes", async () => {
	for (const [status, kind] of [
		[401, "authentication"],
		[429, "quota"],
		[500, "network"],
	] as const) {
		const result = await fetchExaPages(
			[urls[0]],
			fixture(() => response("exa-secret exa%2Dsecret", status)),
		);
		failed(result, 0, kind);
		assert.doesNotMatch(JSON.stringify(result), /exa-secret|exa%2Dsecret/);
	}
	const result = await fetchExaPages(
		[urls[0]],
		fixture(() =>
			response({
				results: [],
				statuses: [
					{
						id: urls[0],
						status: "error",
						error: { tag: "exa-secret", httpStatusCode: 404 },
					},
				],
			}),
		),
	);
	failed(result, 0, "extraction");
	assert.doesNotMatch(JSON.stringify(result), /exa-secret/);
});

test("hosted cancellation passes the caller signal and remains distinct from timeout", async () => {
	const controller = new AbortController();
	let signalStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		signalStarted = resolve;
	});
	const scope = fixture(async (_req, signal) => {
		signalStarted();
		await new Promise((_resolve, reject) =>
			signal.addEventListener("abort", () => reject(signal.reason), {
				once: true,
			}),
		);
		return response({ results: [] });
	});
	scope.signal = controller.signal;
	const pending = fetchExaPages([urls[0]], scope);
	await started;
	controller.abort();
	failed(await pending, 0, "cancelled");
	failed(
		await fetchExaPages(
			[urls[0]],
			fixture(() => {
				throw new WebkitError("timeout", "The request timed out.");
			}),
		),
		0,
		"timeout",
	);
});

test("hosted native timeout and abort failures remain distinct", async () => {
	for (const [name, kind] of [
		["TimeoutError", "timeout"],
		["AbortError", "cancelled"],
	] as const) {
		failed(
			await fetchExaPages(
				[urls[0]],
				fixture(() => {
					throw new DOMException("private body echo", name);
				}),
			),
			0,
			kind,
		);
	}
});

test("malformed per-page error fields are invalid responses", async () => {
	for (const error of ["bad", { httpStatusCode: "404" }, { tag: 42 }]) {
		failed(
			await fetchExaPages(
				[urls[0]],
				fixture(() =>
					response({
						results: [],
						statuses: [{ id: urls[0], status: "error", error }],
					}),
				),
			),
			0,
			"invalid-response",
		);
	}
});

test("empty hosted input has no external effects", async () => {
	let calls = 0;
	assert.deepEqual(
		await fetchExaPages(
			[],
			fixture(() => {
				calls++;
				return response({ results: [] });
			}),
		),
		{ kind: "fetch", requestedUrls: [], documents: [], items: [] },
	);
	assert.equal(calls, 0);
});
