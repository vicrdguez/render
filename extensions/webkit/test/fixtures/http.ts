import assert from "node:assert/strict";
import type {
	FetchResult,
	HttpRequest,
	HttpResponse,
	RequestScope,
	Settings,
	SourceDocument,
} from "../../src/domain.ts";
import { WebkitError } from "../../src/domain.ts";

export const defaults: Settings = {
	provider: "auto",
	fallbackProviders: "",
	hostedExtraction: false,
	timeoutMs: 5000,
	maxResponseBytes: 5_242_880,
};

export function reply(
	body: string | Uint8Array | ArrayBuffer,
	headers: Record<string, string> = {},
	status = 200,
	url = "https://example.com/",
): HttpResponse {
	const bytes =
		typeof body === "string"
			? new TextEncoder().encode(body)
			: body instanceof Uint8Array
				? body
				: new Uint8Array(body);
	return { url, status, headers, body: bytes };
}

export const html = (
	body: string,
	headers: Record<string, string> = {},
	status = 200,
) => reply(body, { "content-type": "text/html", ...headers }, status);
export const json = (
	value: unknown,
	status = 200,
	headers: Record<string, string> = {},
) =>
	reply(
		JSON.stringify(value),
		{ "content-type": "application/json", ...headers },
		status,
	);

export type Handler = (
	request: HttpRequest,
	signal: AbortSignal,
) => HttpResponse | Promise<HttpResponse>;

export function fixture(
	handler: Handler,
	settings: Partial<Settings> = {},
	extra: Partial<RequestScope> = {},
) {
	const requests: HttpRequest[] = [];
	const scope: RequestScope = {
		settings: { ...defaults, ...settings },
		signal: new AbortController().signal,
		now: () => Date.parse("2026-04-20T12:00:00Z"),
		endpoints: {
			exaMcp: "https://mcp.exa.ai/mcp",
			exa: "https://api.exa.ai",
			tavily: "https://api.tavily.com",
			github: "https://api.github.com",
		},
		http: {
			request: async (request, signal) => {
				requests.push(request);
				return handler(request, signal);
			},
		},
		...extra,
	};
	return { scope, requests };
}

export function header(
	request: HttpRequest | undefined,
	name: string,
): string | undefined {
	const entry = Object.entries(request?.headers ?? {}).find(
		([key]) => key.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}

export const prefersMarkdown = (request: HttpRequest) =>
	(header(request, "accept") ?? "").startsWith("text/markdown");

export function documentAt(result: FetchResult, index = 0): SourceDocument {
	const item = result.items[index];
	assert.ok(item, `item ${index} exists`);
	assert.equal(
		item.status,
		"ok",
		item.status === "failed" ? item.failure.message : "",
	);
	if (item.status !== "ok") throw new Error("expected a document");
	const document = result.documents[item.value];
	assert.ok(document, "item points at a stored document");
	return document;
}

export function failureAt(result: FetchResult, kind: string, index = 0) {
	const item = result.items[index];
	assert.ok(item, `item ${index} exists`);
	assert.equal(item.status, "failed");
	if (item.status !== "failed") throw new Error("expected a failure");
	assert.equal(item.failure.kind, kind, item.failure.message);
	return item.failure;
}

export function isFailure(kind: string) {
	return (error: unknown) =>
		error instanceof WebkitError && error.failure.kind === kind;
}

export function untilAborted(signal: AbortSignal): Promise<never> {
	return new Promise((_, reject) => {
		if (signal.aborted) reject(signal.reason);
		signal.addEventListener("abort", () => reject(signal.reason), {
			once: true,
		});
	});
}
