import {
	type Failure,
	failureOf,
	type QueryResults,
	type RequestScope,
	redact,
	type SearchControls,
	type SearchHit,
	type SearchRequest,
	type SearchResult,
	type Transport,
	WebkitError,
} from "./domain.ts";
import { searchExa } from "./exa.ts";

function normalizeControls(controls: SearchControls): SearchControls {
	const numResults = Number.isFinite(controls.numResults)
		? Math.max(1, Math.min(Math.floor(controls.numResults), 20))
		: 5;
	const domains = new Set<string>();
	for (const raw of controls.domainFilter) {
		let input = raw.trim().toLowerCase();
		const excluded = input.startsWith("-");
		if (excluded) input = input.slice(1).trim();
		try {
			input = new URL(input.includes("://") ? input : `https://${input}`)
				.hostname;
		} catch {
			throw new WebkitError("config", "A domain filter is invalid.");
		}
		input = input.replace(/^\.+|\.+$/g, "");
		if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(input))
			throw new WebkitError("config", "A domain filter is invalid.");
		domains.add(`${excluded ? "-" : ""}${input}`);
	}
	return { ...controls, numResults, domainFilter: [...domains] };
}

function routes(request: SearchRequest, scope: RequestScope): Transport[] {
	const { settings } = scope;
	if (
		settings.provider !== "auto" &&
		request.provider &&
		request.provider !== "auto" &&
		request.provider !== settings.provider
	) {
		throw new WebkitError(
			"config",
			"The requested provider conflicts with the project provider.",
		);
	}
	const selected =
		settings.provider !== "auto"
			? settings.provider
			: (request.provider ?? "auto");
	if (selected !== "auto") return [selected];
	const first: Transport = settings.exaApiKey?.trim()
		? "exa"
		: settings.tavilyApiKey?.trim()
			? "tavily"
			: "exa-mcp";
	const fallbacks = settings.fallbackProviders.trim()
		? settings.fallbackProviders.split(",").map((value) => value.trim())
		: [];
	if (
		fallbacks.some(
			(value) => value !== "exa" && value !== "exa-mcp" && value !== "tavily",
		)
	)
		throw new WebkitError("config", "The fallback provider list is invalid.");
	return [...new Set([first, ...(fallbacks as Transport[])])];
}

function allowsDomain(hit: SearchHit, filters: string[]): boolean {
	const hostname = new URL(hit.url).hostname.toLowerCase().replace(/\.$/, "");
	const matches = (domain: string) =>
		hostname === domain || hostname.endsWith(`.${domain}`);
	const included = filters.filter((domain) => !domain.startsWith("-"));
	const excluded = filters
		.filter((domain) => domain.startsWith("-"))
		.map((domain) => domain.slice(1));
	return (
		(!included.length || included.some(matches)) && !excluded.some(matches)
	);
}

function failure(error: unknown, scope: RequestScope): Failure {
	if (!scope.signal.aborted && error instanceof Error) {
		if (error.name === "TimeoutError")
			return { kind: "timeout", message: "The search request timed out." };
		if (error.name === "AbortError")
			return {
				kind: "cancelled",
				message: "The search request was cancelled.",
			};
	}
	return failureOf(error, scope.signal);
}

function invalidTavily(): never {
	throw new WebkitError(
		"invalid-response",
		"Tavily returned an invalid response.",
	);
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tavilyFailure(status: number): WebkitError {
	const kind =
		status === 401 || status === 403
			? "authentication"
			: status === 402 || status === 429 || status === 432
				? "quota"
				: status === 400 || status === 422
					? "config"
					: status === 404
						? "unsupported"
						: status === 408 || status === 504
							? "timeout"
							: status >= 500
								? "network"
								: "invalid-response";
	return new WebkitError(kind, `Tavily request failed (${kind}).`);
}

async function searchTavily(
	query: string,
	controls: SearchControls,
	scope: RequestScope,
): Promise<SearchHit[]> {
	if (controls.category)
		throw new WebkitError(
			"unsupported",
			"Tavily does not support Exa categories.",
		);
	if (!scope.settings.tavilyApiKey?.trim())
		throw new WebkitError("config", "Tavily search requires an API key.");
	const include = controls.domainFilter.filter(
		(domain) => !domain.startsWith("-"),
	);
	const exclude = controls.domainFilter
		.filter((domain) => domain.startsWith("-"))
		.map((domain) => domain.slice(1));
	const response = await scope.http.request(
		{
			url: `${scope.endpoints.tavily.replace(/\/$/, "")}/search`,
			method: "POST",
			headers: {
				Authorization: `Bearer ${scope.settings.tavilyApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query,
				search_depth: "basic",
				max_results: controls.numResults,
				include_answer: false,
				include_raw_content: false,
				...(controls.recencyFilter
					? { time_range: controls.recencyFilter }
					: {}),
				...(include.length ? { include_domains: include } : {}),
				...(exclude.length ? { exclude_domains: exclude } : {}),
			}),
		},
		scope.signal,
	);
	scope.signal.throwIfAborted();
	if (response.status < 200 || response.status >= 300) {
		const error = tavilyFailure(response.status);
		const value = response.headers["retry-after"];
		const seconds =
			value === undefined || value.trim() === "" ? NaN : Number(value);
		const retryAfterMs = Number.isFinite(seconds)
			? seconds * 1000
			: Date.parse(value ?? "") - scope.now();
		throw new WebkitError(
			error.failure.kind,
			error.message,
			Number.isFinite(retryAfterMs)
				? { retryAfterMs: Math.max(0, retryAfterMs) }
				: {},
		);
	}
	let data: unknown;
	try {
		data = JSON.parse(new TextDecoder().decode(response.body));
	} catch {
		return invalidTavily();
	}
	if (!record(data) || !Array.isArray(data.results) || data.error !== undefined)
		return invalidTavily();
	return data.results.map((item: unknown) => {
		if (!record(item) || typeof item.url !== "string") return invalidTavily();
		let url: URL;
		try {
			url = new URL(item.url);
		} catch {
			return invalidTavily();
		}
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password
		)
			return invalidTavily();
		for (const key of ["title", "content", "published_date", "author"])
			if (item[key] !== undefined && typeof item[key] !== "string")
				return invalidTavily();
		if (
			item.raw_content !== undefined &&
			item.raw_content !== null &&
			typeof item.raw_content !== "string"
		)
			return invalidTavily();
		return {
			url: item.url,
			title:
				typeof item.title === "string" && item.title.trim()
					? item.title
					: url.hostname,
			snippet:
				typeof item.content === "string"
					? item.content.replace(/\s+/g, " ").trim()
					: "",
			...(typeof item.published_date === "string"
				? { publishedDate: item.published_date }
				: {}),
			...(typeof item.author === "string" ? { author: item.author } : {}),
		};
	});
}

export async function search(
	request: SearchRequest,
	scope: RequestScope,
): Promise<SearchResult> {
	if (
		!request.queries.length ||
		request.queries.length > 8 ||
		request.queries.some((query) => !query.trim())
	)
		throw new WebkitError(
			"config",
			"Search requires between one and eight nonempty queries.",
		);
	const result: SearchResult = {
		kind: "search",
		queries: [],
		documents: [],
		fetchFailures: [],
	};
	let controls: SearchControls;
	let providers: Transport[];
	try {
		controls = normalizeControls(request.controls);
		providers = routes(request, scope);
	} catch (error) {
		result.queries = request.queries.map((_query, index) => ({
			index,
			status: "failed",
			failure: failure(error, scope),
		}));
		return result;
	}
	let next = 0;
	async function work(): Promise<void> {
		while (next < request.queries.length) {
			const index = next++;
			const query = request.queries[index]!;
			for (const transport of providers) {
				try {
					scope.signal.throwIfAborted();
					const hits =
						transport === "tavily"
							? await searchTavily(query, controls, scope)
							: await searchExa(query, controls, transport, scope);
					const value: QueryResults = {
						query,
						transport,
						hits: hits
							.filter((hit) => allowsDomain(hit, controls.domainFilter))
							.slice(0, controls.numResults),
					};
					result.queries[index] = { index, status: "ok", value };
					break;
				} catch (error) {
					const reason = failure(error, scope);
					result.queries[index] = { index, status: "failed", failure: reason };
					if (
						!["quota", "timeout", "network", "invalid-response"].includes(
							reason.kind,
						)
					)
						break;
				}
			}
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(3, request.queries.length) }, work),
	);
	if (request.includeContent && !scope.signal.aborted) {
		const hits = result.queries.flatMap((item) =>
			item.status === "ok" ? item.value.hits : [],
		);
		const secrets = [
			scope.settings.exaApiKey ?? "",
			scope.settings.tavilyApiKey ?? "",
		];
		const urls = [...new Set(hits.map((hit) => hit.url))].filter((url) => {
			const safeUrl = redact(url, secrets);
			if (safeUrl === url) return true;
			result.fetchFailures.push({
				url: safeUrl,
				failure: {
					kind: "blocked-url",
					message: "Search result URL contains a configured provider key.",
				},
			});
			return false;
		});
		if (urls.length) {
			const { fetchPages } = await import("./extract.ts");
			const fetched = await fetchPages(
				{ urls, mode: "readable", forceClone: false, redirects: "follow" },
				scope,
			);
			result.documents = fetched.documents;
			const documentIndexes = new Map<string, number>();
			for (const item of fetched.items) {
				const url = fetched.requestedUrls[item.index]!;
				if (item.status === "ok") documentIndexes.set(url, item.value);
				else result.fetchFailures.push({ url, failure: item.failure });
			}
			for (const hit of hits) {
				const documentIndex = documentIndexes.get(hit.url);
				if (documentIndex !== undefined) hit.documentIndex = documentIndex;
			}
		}
	}
	return result;
}
