import {
	type ErrorKind,
	type FetchResult,
	failureOf,
	type HttpResponse,
	type RequestScope,
	type SearchControls,
	type SearchHit,
	type SourceDocument,
	WebkitError,
} from "./domain.ts";

const advancedTool = "web_search_advanced_exa";

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(): never {
	throw new WebkitError(
		"invalid-response",
		"Exa returned an invalid response.",
	);
}

function json(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return invalid();
	}
}

function errorKind(code: unknown, message: unknown): ErrorKind {
	if (code === 401 || code === 403) return "authentication";
	if (code === 402 || code === 429) return "quota";
	if (code === -32601 || code === 404) return "unsupported";
	if (code === -32602 || code === 400 || code === 422) return "config";
	if (code === 408 || code === 504) return "timeout";
	if (typeof code === "number" && code >= 500) return "network";
	const text =
		typeof message === "string" ? message.toLowerCase().replace(/_/g, " ") : "";
	if (
		/unauthorized|forbidden|invalid api key|authentication|permission denied/.test(
			text,
		)
	)
		return "authentication";
	if (/rate limit|quota|too many requests|credits? exhausted/.test(text))
		return "quota";
	if (/unknown tool|unsupported|not supported|tool not found/.test(text))
		return "unsupported";
	if (
		/invalid (?:request|params|config)|bad request|missing (?:key|credential)/.test(
			text,
		)
	)
		return "config";
	if (/timed out|timeout/.test(text)) return "timeout";
	return "invalid-response";
}

function providerError(code: unknown, message?: unknown): WebkitError {
	const kind = errorKind(code, message);
	return new WebkitError(kind, `Exa request failed (${kind}).`);
}

function checkStatus(response: HttpResponse, scope: RequestScope): void {
	if (response.status >= 200 && response.status < 300) return;
	const error = providerError(response.status);
	const retryAfter = response.headers["retry-after"];
	const seconds =
		retryAfter === undefined || retryAfter.trim() === ""
			? NaN
			: Number(retryAfter);
	const milliseconds = Number.isFinite(seconds)
		? seconds * 1000
		: Date.parse(retryAfter ?? "") - scope.now();
	throw new WebkitError(
		error.failure.kind,
		error.message,
		Number.isFinite(milliseconds)
			? { retryAfterMs: Math.max(0, milliseconds) }
			: {},
	);
}

function optionalString(
	item: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = item[key];
	if (value === undefined) return undefined;
	if (typeof value !== "string") return invalid();
	return value.trim() && value.trim() !== "N/A" ? value.trim() : undefined;
}

function resultUrl(value: unknown): string {
	if (typeof value !== "string") return invalid();
	try {
		const url = new URL(value);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password
		)
			return invalid();
		return value;
	} catch {
		return invalid();
	}
}

function results(value: unknown): Record<string, unknown>[] {
	if (!record(value)) return invalid();
	if (value.error !== undefined) {
		if (!record(value.error)) return invalid();
		throw providerError(value.error.code, value.error.message);
	}
	if (!Array.isArray(value.results) || !value.results.every(record))
		return invalid();
	return value.results;
}

function metadata(
	item: Record<string, unknown>,
): Pick<SearchHit, "publishedDate" | "author" | "citationCount" | "doi"> {
	let publishedDate = optionalString(item, "publishedDate");
	let author = optionalString(item, "author");
	let citationCount: number | undefined;
	let doi: string | undefined;
	if (item.entities !== undefined) {
		if (!Array.isArray(item.entities) || !item.entities.every(record))
			return invalid();
		const entity = item.entities.find((entry) => entry.type === "publication");
		if (entity !== undefined) {
			if (!record(entity.properties)) return invalid();
			const paper = entity.properties;
			const date = optionalString(paper, "date");
			if (
				paper.year !== undefined &&
				(typeof paper.year !== "number" || !Number.isFinite(paper.year))
			)
				return invalid();
			publishedDate ??=
				date ??
				(typeof paper.year === "number" ? String(paper.year) : undefined);
			if (paper.authors !== undefined) {
				if (!Array.isArray(paper.authors) || !paper.authors.every(record))
					return invalid();
				const names = paper.authors.flatMap(
					(entry) => optionalString(entry, "name") ?? [],
				);
				if (names.length) author = names.join(", ");
			}
			if (paper.citationCount !== undefined) {
				if (
					typeof paper.citationCount !== "number" ||
					!Number.isFinite(paper.citationCount) ||
					paper.citationCount < 0
				)
					return invalid();
				citationCount = paper.citationCount;
			}
			doi = optionalString(paper, "doi");
		}
	}
	if (author) {
		const names = author
			.split(", ")
			.map((name) => name.trim())
			.filter(Boolean);
		author = names.slice(0, 3).join(", ") + (names.length > 3 ? " et al." : "");
	}
	return {
		...(publishedDate ? { publishedDate } : {}),
		...(author ? { author } : {}),
		...(citationCount !== undefined ? { citationCount } : {}),
		...(doi ? { doi } : {}),
	};
}

function mapHit(item: Record<string, unknown>): SearchHit {
	const url = resultUrl(item.url);
	const title = optionalString(item, "title") ?? new URL(url).hostname;
	const text = optionalString(item, "text") ?? "";
	if (
		item.highlights !== undefined &&
		(!Array.isArray(item.highlights) ||
			!item.highlights.every((value) => typeof value === "string"))
	)
		return invalid();
	const highlights = (item.highlights as string[] | undefined)
		?.filter((value) => value.trim())
		.join(" ");
	return {
		url,
		title,
		snippet: highlights || text.slice(0, 1000),
		...metadata(item),
	};
}

function mcpPayload(body: string): unknown {
	let envelope: unknown;
	if (body.trimStart().startsWith("{")) envelope = json(body);
	else {
		for (const event of body.replace(/\r\n/g, "\n").split(/\n\n+/)) {
			const data = event
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice(5).replace(/^ /, ""))
				.join("\n");
			if (!data || data === "[DONE]") continue;
			const candidate = json(data);
			if (
				record(candidate) &&
				("result" in candidate || "error" in candidate)
			) {
				envelope = candidate;
				break;
			}
		}
	}
	if (!record(envelope)) return invalid();
	if (envelope.jsonrpc !== undefined && envelope.jsonrpc !== "2.0")
		return invalid();
	if (envelope.id !== undefined && envelope.id !== 1) return invalid();
	if (envelope.error !== undefined) {
		if (!record(envelope.error)) return invalid();
		throw providerError(envelope.error.code, envelope.error.message);
	}
	const result = envelope.result;
	if (!record(result)) return invalid();
	if (result._meta !== undefined && !record(result._meta)) return invalid();
	if (record(result._meta)) {
		const limited = result._meta["ai.exa/rateLimited"];
		if (limited !== undefined && typeof limited !== "boolean") return invalid();
		if (limited) throw providerError(429);
	}
	if (result.isError !== undefined && typeof result.isError !== "boolean")
		return invalid();
	if (
		!Array.isArray(result.content) ||
		!result.content.every(
			(part) => record(part) && typeof part.type === "string",
		)
	)
		return invalid();
	const text = result.content
		.filter((part) => part.type === "text")
		.map((part) => {
			if (typeof part.text !== "string") return invalid();
			return part.text;
		})
		.join("\n");
	if (result.isError) throw providerError(undefined, text);
	return json(text);
}

export async function searchExa(
	query: string,
	controls: SearchControls,
	transport: "exa" | "exa-mcp",
	scope: RequestScope,
): Promise<SearchHit[]> {
	const includeDomains = controls.domainFilter.filter(
		(domain) => !domain.startsWith("-"),
	);
	const excludeDomains = controls.domainFilter
		.filter((domain) => domain.startsWith("-"))
		.map((domain) => domain.slice(1));
	const days = { day: 1, week: 7, month: 30, year: 365 };
	const args = {
		query,
		type: "auto",
		numResults: controls.numResults,
		...(includeDomains.length ? { includeDomains } : {}),
		...(excludeDomains.length ? { excludeDomains } : {}),
		...(controls.category ? { category: controls.category } : {}),
		...(controls.recencyFilter
			? {
					startPublishedDate: new Date(
						scope.now() - days[controls.recencyFilter] * 86400000,
					).toISOString(),
				}
			: {}),
	};
	let url: string;
	let headers: Record<string, string>;
	let body: unknown;
	if (transport === "exa") {
		if (!scope.settings.exaApiKey?.trim())
			throw new WebkitError("config", "Exa search requires an API key.");
		url = `${scope.endpoints.exa.replace(/\/$/, "")}/search`;
		headers = {
			"Content-Type": "application/json",
			"x-api-key": scope.settings.exaApiKey,
			"x-exa-integration": "tau-webkit",
		};
		body = { ...args, contents: { highlights: true } };
	} else {
		const endpoint = new URL(scope.endpoints.exaMcp);
		endpoint.searchParams.set("tools", advancedTool);
		url = endpoint.href;
		headers = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			"x-exa-source": "tau-webkit",
		};
		body = {
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: {
				name: advancedTool,
				arguments: { ...args, enableHighlights: true, textMaxCharacters: 3000 },
			},
		};
	}
	const response = await scope.http.request(
		{ url, method: "POST", headers, body: JSON.stringify(body) },
		scope.signal,
	);
	scope.signal.throwIfAborted();
	checkStatus(response, scope);
	const text = new TextDecoder().decode(response.body);
	return results(transport === "exa-mcp" ? mcpPayload(text) : json(text)).map(
		mapHit,
	);
}

export async function fetchExaPages(
	urls: string[],
	scope: RequestScope,
): Promise<FetchResult> {
	const output: FetchResult = {
		kind: "fetch",
		requestedUrls: [...urls],
		documents: [],
		items: [],
	};
	if (!urls.length) return output;
	const { validateUrl } = await import("./net.ts");
	const requested = new Set<string>();
	for (const [index, url] of urls.entries()) {
		try {
			const target = validateUrl(url);
			if (target.username || target.password)
				throw new WebkitError(
					"blocked-url",
					"URLs containing credentials cannot be sent to hosted extraction.",
				);
			requested.add(url);
		} catch (error) {
			output.items[index] = {
				index,
				status: "failed",
				failure: failureOf(error, scope.signal),
			};
		}
	}
	if (!requested.size) return output;
	try {
		scope.signal.throwIfAborted();
		if (!scope.settings.exaApiKey?.trim())
			throw new WebkitError("config", "Exa extraction requires an API key.");
		const response = await scope.http.request(
			{
				url: `${scope.endpoints.exa.replace(/\/$/, "")}/contents`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": scope.settings.exaApiKey,
					"x-exa-integration": "tau-webkit",
				},
				body: JSON.stringify({ urls: [...requested], text: true }),
			},
			scope.signal,
		);
		scope.signal.throwIfAborted();
		checkStatus(response, scope);
		const data = json(new TextDecoder().decode(response.body));
		const pages = new Map<string, SourceDocument>();
		for (const item of results(data)) {
			const url = resultUrl(item.url);
			const requestedUrl = optionalString(item, "id") ?? url;
			if (!requested.has(requestedUrl) || pages.has(requestedUrl))
				return invalid();
			const text = optionalString(item, "text") ?? "";
			const title = optionalString(item, "title") ?? new URL(url).hostname;
			const publishedDate = optionalString(item, "publishedDate");
			pages.set(requestedUrl, {
				url,
				title,
				text,
				format: "markdown",
				extractor: "exa",
				truncated: false,
				...(publishedDate ? { publishedDate } : {}),
			});
		}
		const failures = new Set<string>();
		if (record(data) && data.statuses !== undefined) {
			if (!Array.isArray(data.statuses)) return invalid();
			const seen = new Set<string>();
			for (const status of data.statuses) {
				if (
					!record(status) ||
					typeof status.id !== "string" ||
					!requested.has(status.id) ||
					seen.has(status.id) ||
					!["success", "error"].includes(String(status.status))
				)
					return invalid();
				seen.add(status.id);
				if (status.error !== undefined) {
					if (!record(status.error)) return invalid();
					optionalString(status.error, "tag");
					if (
						status.error.httpStatusCode !== undefined &&
						typeof status.error.httpStatusCode !== "number"
					)
						return invalid();
				}
				if (status.status === "error") failures.add(status.id);
			}
		}
		const documentIndexes = new Map<string, number>();
		for (const [index, url] of urls.entries()) {
			if (output.items[index]) continue;
			const page = pages.get(url);
			if (!page?.text || failures.has(url)) {
				output.items[index] = {
					index,
					status: "failed",
					failure: {
						kind: "extraction",
						message: "Exa could not extract this page.",
					},
				};
				continue;
			}
			let documentIndex = documentIndexes.get(url);
			if (documentIndex === undefined) {
				documentIndex = output.documents.length;
				output.documents.push(page);
				documentIndexes.set(url, documentIndex);
			}
			output.items[index] = { index, status: "ok", value: documentIndex };
		}
	} catch (error) {
		if (!scope.signal.aborted && error instanceof Error) {
			if (error.name === "TimeoutError")
				error = new WebkitError(
					"timeout",
					"The Exa extraction request timed out.",
				);
			else if (error.name === "AbortError")
				error = new WebkitError(
					"cancelled",
					"The Exa extraction request was cancelled.",
				);
		}
		const failure = failureOf(error, scope.signal);
		for (const [index] of urls.entries())
			if (!output.items[index])
				output.items[index] = { index, status: "failed", failure };
	}
	return output;
}
