export type Provider = "auto" | "exa-mcp" | "exa" | "tavily";
export type Transport = Exclude<Provider, "auto">;
export type ErrorKind =
	| "cancelled"
	| "timeout"
	| "quota"
	| "authentication"
	| "invalid-response"
	| "blocked-url"
	| "network"
	| "extraction"
	| "unsupported"
	| "not-found"
	| "config";
export interface Failure {
	kind: ErrorKind;
	message: string;
	retryAfterMs?: number;
}
export class WebkitError extends Error {
	readonly failure: Failure;
	constructor(
		kind: ErrorKind,
		message: string,
		details: { retryAfterMs?: number } = {},
	) {
		super(message);
		this.name = "WebkitError";
		this.failure = { kind, message, ...details };
	}
}
export function failureOf(error: unknown, signal?: AbortSignal): Failure {
	if (signal?.aborted) {
		if (
			signal.reason instanceof WebkitError &&
			signal.reason.failure.kind === "timeout"
		)
			return signal.reason.failure;
		return { kind: "cancelled", message: "The web request was cancelled." };
	}
	if (error instanceof WebkitError) return error.failure;
	return { kind: "network", message: "The web request failed." };
}
export function redact(text: string, secrets: readonly string[]): string {
	const decode = (value: string) =>
		value.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
			try {
				return decodeURIComponent(encoded);
			} catch {
				return encoded;
			}
		});
	const decoded = decode(text);
	let result = decoded;
	for (const secret of secrets) {
		if (!secret) continue;
		const key = decode(secret);
		const minimum = /^[a-z][a-z0-9+.-]*:\/\//i.test(key)
			? key.length
			: Math.min(4, key.length);
		const prefix = key.slice(0, minimum);
		let cursor = 0;
		let next = "";
		for (
			let start = result.indexOf(prefix);
			start >= 0;
			start = result.indexOf(prefix, cursor)
		) {
			let length = minimum;
			while (length < key.length && result[start + length] === key[length])
				length++;
			const end = start + length;
			const partialWord =
				length < key.length && /[\p{L}\p{N}_-]/u.test(result[end] ?? "");
			next +=
				result.slice(cursor, start) +
				(partialWord ? result.slice(start, end) : "[redacted]");
			cursor = end;
		}
		result = next + result.slice(cursor);
	}
	return result === decoded ? text : result;
}
export interface Settings {
	provider: Provider;
	fallbackProviders: string;
	exaApiKey?: string;
	tavilyApiKey?: string;
	proxy?: string;
	curlCommand?: string;
	hostedExtraction: boolean;
	timeoutMs: number;
	maxResponseBytes: number;
}
export interface HttpRequest {
	url: string;
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: string;
	maxBytes?: number;
	pdfMaxBytes?: number;
	redirects?: "follow" | "same-origin";
}
export interface HttpResponse {
	url: string;
	status: number;
	headers: Record<string, string>;
	body: Uint8Array;
}
export interface HttpClient {
	request(request: HttpRequest, signal: AbortSignal): Promise<HttpResponse>;
}
export interface Endpoints {
	exaMcp: string;
	exa: string;
	tavily: string;
	github: string;
}
export interface RequestScope {
	settings: Settings;
	signal: AbortSignal;
	http: HttpClient;
	endpoints: Endpoints;
	now: () => number;
	tempRoot?: string;
}
export interface SearchControls {
	numResults: number;
	domainFilter: string[];
	recencyFilter?: "day" | "week" | "month" | "year";
	category?: string;
}
export interface SearchRequest {
	queries: string[];
	provider?: Provider;
	controls: SearchControls;
	includeContent: boolean;
}
export interface SearchHit {
	url: string;
	title: string;
	snippet: string;
	publishedDate?: string;
	author?: string;
	citationCount?: number;
	doi?: string;
	documentIndex?: number;
}
export interface QueryResults {
	query: string;
	transport: Transport;
	hits: SearchHit[];
}
export type ItemOutcome<T> =
	| { index: number; status: "ok"; value: T }
	| { index: number; status: "failed"; failure: Failure };
export interface SourceDocument {
	url: string;
	title: string;
	text: string;
	format: "markdown" | "text" | "raw";
	extractor:
		| "readability"
		| "rsc"
		| "defuddle"
		| "pdf"
		| "github-api"
		| "github-clone"
		| "http"
		| "exa";
	truncated: boolean;
	publishedDate?: string;
	localPath?: string;
}
export interface FetchRequest {
	urls: string[];
	mode: "readable" | "raw";
	forceClone: boolean;
	redirects: "follow" | "same-origin";
}
export interface SearchResult {
	kind: "search";
	documents: SourceDocument[];
	queries: ItemOutcome<QueryResults>[];
	fetchFailures: { url: string; failure: Failure }[];
}
export interface FetchResult {
	kind: "fetch";
	requestedUrls: string[];
	documents: SourceDocument[];
	items: ItemOutcome<number>[];
}
export interface Passage {
	url: string;
	text: string;
	start?: number;
	end?: number;
	contentHash: string;
	origin: "page" | "snippet";
}
export interface EvidenceRequest {
	claim: string;
	queries: string[];
	provider?: Provider;
	controls: SearchControls;
	fetchContent: boolean;
}
export interface EvidenceResult {
	kind: "evidence";
	claim: string;
	assessment: "unassessed";
	documents: SourceDocument[];
	queries: ItemOutcome<QueryResults>[];
	passages: Passage[];
	fetchFailures: Failure[];
}
export type ResearchResult = SearchResult | FetchResult | EvidenceResult;
export interface Snapshot {
	id: string;
	createdAt: string;
	result: ResearchResult;
}
export interface RetrievalRequest {
	responseId: string;
	query?: string;
	queryIndex?: number;
	url?: string;
	urlIndex?: number;
	offset: number;
	limit: number;
	findText?: string[];
	findMode: "exact" | "case-insensitive" | "fuzzy";
}
export interface Retrieval {
	text: string;
	truncated: boolean;
	nextOffset?: number;
}
