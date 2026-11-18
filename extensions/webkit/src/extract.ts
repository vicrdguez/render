import { createHash } from "node:crypto";
import pLimit from "p-limit";
import type TurndownService from "turndown";
import {
	type ErrorKind,
	type Failure,
	type FetchRequest,
	type FetchResult,
	failureOf,
	type HttpResponse,
	type ItemOutcome,
	type RequestScope,
	type SourceDocument,
	WebkitError,
} from "./domain.ts";
import { fetchExaPages } from "./exa.ts";
import {
	type Clones,
	discardClones,
	gitHubRoute,
	readGitHub,
} from "./github.ts";
import { isPdf, readPdf } from "./pdf.ts";
import { extractRSCContent } from "./rsc-extract.ts";

export { cleanupClones } from "./github.ts";

const CONCURRENT_LIMIT = 3;
const MIN_USEFUL_CONTENT = 500;
const COMPATIBLE_USER_AGENT = "OpenAI File Downloader, XaiImageApiFetch/1.0";
const BROWSER_ACCEPT =
	"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
// Servers with Markdown negotiation (Cloudflare Markdown for Agents, Mintlify, Vercel) answer this
// with Markdown; others see the same relative preferences as BROWSER_ACCEPT.
const MARKDOWN_FIRST_ACCEPT =
	"text/markdown,text/html;q=0.9,application/xhtml+xml;q=0.9,application/xml;q=0.8,image/avif;q=0.9,image/webp;q=0.9,image/apng;q=0.9,*/*;q=0.7";
const RECOVERABLE = new Set<ErrorKind>([
	"network",
	"timeout",
	"extraction",
	"not-found",
	"quota",
]);
const BINARY_TYPES = [
	"application/octet-stream",
	"image/",
	"audio/",
	"video/",
	"application/zip",
];
// The HTML spec's JavaScript MIME essences; other script types are data blocks that never run.
const JAVASCRIPT_MIME_TYPES = new Set([
	"application/ecmascript",
	"application/javascript",
	"application/x-ecmascript",
	"application/x-javascript",
	"text/ecmascript",
	"text/javascript",
	"text/javascript1.0",
	"text/javascript1.1",
	"text/javascript1.2",
	"text/javascript1.3",
	"text/javascript1.4",
	"text/javascript1.5",
	"text/jscript",
	"text/livescript",
	"text/x-ecmascript",
	"text/x-javascript",
]);

type Page =
	| {
			status: "read";
			document: SourceDocument;
			body: boolean;
			linked: boolean;
			warning?: Failure;
	  }
	| { status: "failed"; failure: Failure };

export async function fetchPages(
	request: FetchRequest,
	scope: RequestScope,
): Promise<FetchResult> {
	const limit = pLimit(CONCURRENT_LIMIT);
	const clones: Clones = new Map();
	const outcomes = await Promise.all(
		request.urls.map((url) =>
			limit(async (): Promise<SourceDocument | Failure> => {
				try {
					return await readPage(url, request, scope, clones);
				} catch (error) {
					return failureOf(error, scope.signal);
				}
			}),
		),
	);
	if (scope.signal.aborted) {
		await discardClones(clones, scope.tempRoot);
		throw new WebkitError("cancelled", "The web request was cancelled.");
	}
	const documents: SourceDocument[] = [];
	const items = outcomes.map((outcome, index): ItemOutcome<number> => {
		if ("kind" in outcome) return { index, status: "failed", failure: outcome };
		documents.push(
			request.mode === "raw"
				? outcome
				: { ...outcome, text: omitInlineDataUris(outcome.text) },
		);
		return { index, status: "ok", value: documents.length - 1 };
	});
	return { kind: "fetch", requestedUrls: [...request.urls], documents, items };
}

export async function extractHtml(
	html: string,
	url: string,
): Promise<SourceDocument> {
	return settle(
		await extractHtmlPage(html, url, url, null, new AbortController().signal),
	);
}

async function readPage(
	url: string,
	request: FetchRequest,
	scope: RequestScope,
	clones: Clones,
): Promise<SourceDocument> {
	scope.signal.throwIfAborted();
	if (request.mode === "raw")
		return settle(await readDirect(url, request, scope, false));

	const route = gitHubRoute(url);
	if (route && request.redirects === "same-origin") {
		throw new WebkitError(
			"unsupported",
			`Extraction path ${route} is disabled by the same-origin redirect constraint because its redirect chain cannot be observed.`,
		);
	}
	if (route) {
		const document = await readGitHub(url, scope, request.forceClone, clones);
		if (document) return document;
	}

	const page = await readDirect(url, request, scope, true);
	const recoverable =
		page.status === "read"
			? page.warning !== undefined
			: RECOVERABLE.has(page.failure.kind);
	if (
		!recoverable ||
		!scope.settings.hostedExtraction ||
		request.redirects !== "follow"
	)
		return settle(page);
	let hosted: string;
	try {
		const result = await fetchExaPages([url], scope);
		const item = result.items[0];
		const document =
			item?.status === "ok" ? result.documents[item.value] : undefined;
		if (document) return document;
		hosted =
			item?.status === "failed" ? item.failure.message : "no content returned";
	} catch (error) {
		if (scope.signal.aborted) throw error;
		hosted = failureOf(error).message;
	}
	if (page.status === "read") return settle(page);
	throw new WebkitError(
		page.failure.kind,
		`${page.failure.message}\nHosted extraction failed: ${hosted}`,
		page.failure.retryAfterMs === undefined
			? {}
			: { retryAfterMs: page.failure.retryAfterMs },
	);
}

function settle(page: Page): SourceDocument {
	if (page.status === "failed")
		throw new WebkitError(
			page.failure.kind,
			page.failure.message,
			page.failure.retryAfterMs === undefined
				? {}
				: { retryAfterMs: page.failure.retryAfterMs },
		);
	if (!page.warning || page.linked) return page.document;
	return {
		...page.document,
		text: `[Extraction warning: ${page.warning.message}]\n\n${page.document.text}`,
	};
}

async function readDirect(
	url: string,
	request: FetchRequest,
	scope: RequestScope,
	preferMarkdown: boolean,
): Promise<Page> {
	const { timeoutMs } = scope.settings;
	const deadline = AbortSignal.any([
		scope.signal,
		AbortSignal.timeout(timeoutMs),
	]);
	const startedAt = Date.now();
	let page: Page;
	try {
		page = await readResponse(url, request, scope, deadline, preferMarkdown);
	} catch (error) {
		if (scope.signal.aborted) throw error;
		page = {
			status: "failed",
			failure: deadline.aborted
				? timeoutFailure(url, timeoutMs)
				: failureOf(error),
		};
	}
	scope.signal.throwIfAborted();
	if (deadline.aborted || Date.now() - startedAt >= timeoutMs)
		return { status: "failed", failure: timeoutFailure(url, timeoutMs) };
	return page;
}

function timeoutFailure(url: string, timeoutMs: number): Failure {
	return {
		kind: "timeout",
		message: `Fetching ${url} timed out after ${timeoutMs} ms.`,
	};
}

async function readResponse(
	url: string,
	request: FetchRequest,
	scope: RequestScope,
	signal: AbortSignal,
	preferMarkdown: boolean,
): Promise<Page> {
	const raw = request.mode === "raw";
	const response = await scope.http.request(
		{
			url,
			headers: {
				...(scope.settings.curlCommand
					? {}
					: { "User-Agent": COMPATIBLE_USER_AGENT }),
				Accept: preferMarkdown ? MARKDOWN_FIRST_ACCEPT : BROWSER_ACCEPT,
				"Accept-Language": "en-US,en;q=0.9",
				"Cache-Control": "no-cache",
				"Sec-Fetch-Dest": "document",
				"Sec-Fetch-Mode": "navigate",
				"Sec-Fetch-Site": "none",
				"Sec-Fetch-User": "?1",
				"Upgrade-Insecure-Requests": "1",
			},
			maxBytes: scope.settings.maxResponseBytes,
			...(!raw ? { pdfMaxBytes: 20 * 1024 * 1024 } : {}),
			redirects: request.redirects,
		},
		signal,
	);
	const contentType = (response.headers["content-type"] ?? "").toLowerCase();
	const mimeType = contentType.split(";", 1)[0]?.trim() ?? "";
	const pdf = isPdf(url, contentType);

	if (raw) {
		if (!isTextContentType(mimeType)) {
			return failed(
				"unsupported",
				`Unsupported content type in raw mode: ${mimeType || "missing"}${pdf ? "; retry in readable mode for PDF text" : ""}`,
			);
		}
		const text = decodeText(response);
		return {
			status: "read",
			document: {
				url,
				title: extractTextTitle(text, url),
				text,
				format: "raw",
				extractor: "http",
				truncated: false,
			},
			body: text.trim() !== "",
			linked: false,
		};
	}

	if (response.status < 200 || response.status >= 300)
		return { status: "failed", failure: httpFailure(response) };
	if (pdf)
		return read(await readPdf(response.body, url, signal), [], undefined);
	if (BINARY_TYPES.some((type) => contentType.includes(type)))
		return failed("unsupported", `Unsupported content type: ${mimeType}`);

	const text = decodeText(response);
	const isHtml =
		contentType.includes("text/html") ||
		contentType.includes("application/xhtml+xml");
	if (isCloudflareChallenge(response, text, isHtml))
		return failed(
			"extraction",
			`HTTP ${response.status}: Blocked by Cloudflare challenge page`,
		);
	const baseUrl = response.url || url;
	if (isHtml)
		return extractHtmlPage(
			text,
			url,
			baseUrl,
			response.headers.link ?? null,
			signal,
		);

	const title = extractTextTitle(text, url);
	if (mimeType !== "text/markdown" && mimeType !== "text/x-markdown") {
		return {
			status: "read",
			document: {
				url,
				title,
				text,
				format: "text",
				extractor: "http",
				truncated: false,
			},
			body: text.trim() !== "",
			linked: false,
		};
	}
	const links = discoverDeclaredWebLinks(
		null,
		response.headers.link ?? null,
		baseUrl,
	);
	const markdown: SourceDocument = {
		url,
		title,
		text,
		format: "markdown",
		extractor: "http",
		truncated: false,
	};
	if (!preferMarkdown || text.trim().length >= MIN_USEFUL_CONTENT)
		return read(markdown, links, undefined);
	// for refusals, not-found, and any content it has; the Markdown only fills an empty reply.
	const normal = await readResponse(url, request, scope, signal, false);
	if (
		normal.status === "failed" &&
		(!RECOVERABLE.has(normal.failure.kind) ||
			normal.failure.kind === "not-found" ||
			normal.failure.kind === "timeout")
	)
		return normal;
	if ((normal.status === "read" && normal.body) || !text.trim()) return normal;
	const retryError =
		normal.status === "failed"
			? normal.failure.message
			: normal.warning?.message;
	return read(markdown, links, {
		kind: "extraction",
		message: `Extracted content appears incomplete${retryError ? `\nBrowser retry failed: ${retryError}` : ""}`,
	});
}

function failed(kind: ErrorKind, message: string): Page {
	return { status: "failed", failure: { kind, message } };
}

function read(
	document: SourceDocument,
	links: DeclaredWebLink[],
	warning: Failure | undefined,
): Page {
	const body = document.text.trim() !== "";
	if (!body && links.length === 0 && warning)
		return { status: "failed", failure: warning };
	return {
		status: "read",
		document: {
			...document,
			text: appendDeclaredWebLinks(document.text, links),
		},
		body,
		linked: links.length > 0,
		...(warning ? { warning } : {}),
	};
}

function httpFailure(response: HttpResponse): Failure {
	const { status } = response;
	if (status === 404 || status === 410) {
		return {
			kind: "not-found",
			message: `HTTP ${status}. The origin server says this page does not exist, so extraction cannot retrieve it. The page may have moved or been renamed. Use web_search to find the current URL, then retry fetch_content with it.`,
		};
	}
	if (status === 429) {
		const seconds = Number(response.headers["retry-after"]);
		return {
			kind: "quota",
			message: `HTTP ${status}`,
			...(Number.isFinite(seconds) && seconds >= 0
				? { retryAfterMs: seconds * 1000 }
				: {}),
		};
	}
	return { kind: "network", message: `HTTP ${status}` };
}

function decodeText(response: HttpResponse): string {
	const charset = response.headers["content-type"]?.match(
		/charset\s*=\s*["']?([^;"'\s]+)/i,
	)?.[1];
	try {
		return new TextDecoder(charset || "utf-8").decode(response.body);
	} catch {
		return new TextDecoder("utf-8").decode(response.body);
	}
}

function isTextContentType(mimeType: string): boolean {
	return (
		mimeType.startsWith("text/") ||
		mimeType === "application/json" ||
		mimeType === "application/ld+json" ||
		mimeType === "application/xml" ||
		mimeType === "application/xhtml+xml" ||
		mimeType === "application/javascript" ||
		mimeType === "application/x-javascript" ||
		mimeType.endsWith("+json") ||
		mimeType.endsWith("+xml")
	);
}

// Cloudflare interstitials are served with HTTP 200. The header is authoritative for any text
// response; the body check is HTML-only and needs both challenge-platform markers.
function isCloudflareChallenge(
	response: HttpResponse,
	text: string,
	isHtml: boolean,
): boolean {
	if (response.status !== 200) return false;
	if (response.headers["cf-mitigated"] === "challenge") return true;
	return (
		isHtml &&
		/<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(text) &&
		text.includes("window._cf_chl_opt") &&
		text.includes("/cdn-cgi/challenge-platform/")
	);
}

function isExecutableScriptType(type: string | null): boolean {
	const mime = (type ?? "").split(";")[0]!.trim().toLowerCase();
	return mime === "" || mime === "module" || JAVASCRIPT_MIME_TYPES.has(mime);
}

function isLikelyJSRendered(html: string): boolean {
	const bodyStart = html.search(/<body/i);
	if (bodyStart < 0) return false;
	const bodyOpenEnd = html.indexOf(">", bodyStart + 5);
	if (bodyOpenEnd < 0) return false;
	const closingTag = /<\/body>/gi;
	closingTag.lastIndex = bodyOpenEnd + 1;
	const bodyEnd = closingTag.exec(html)?.index;
	if (bodyEnd === undefined) return false;
	let bodyHtml = html.slice(bodyOpenEnd + 1, bodyEnd);
	for (const [openingTag, closingTag] of [
		[/<script/gi, /<\/script>/gi],
		[/<style/gi, /<\/style>/gi],
	] as const) {
		const parts: string[] = [];
		let cursor = 0;
		for (
			let opening = openingTag.exec(bodyHtml);
			opening;
			opening = openingTag.exec(bodyHtml)
		) {
			closingTag.lastIndex = opening.index + opening[0].length;
			if (!closingTag.exec(bodyHtml)) break;
			parts.push(bodyHtml.slice(cursor, opening.index));
			cursor = closingTag.lastIndex;
			openingTag.lastIndex = cursor;
		}
		parts.push(bodyHtml.slice(cursor));
		bodyHtml = parts.join("");
	}
	const parts: string[] = [];
	const openingTag = /<[^>]/g;
	let cursor = 0;
	for (
		let opening = openingTag.exec(bodyHtml);
		opening;
		opening = openingTag.exec(bodyHtml)
	) {
		const end = bodyHtml.indexOf(">", opening.index + 2);
		if (end < 0) break;
		parts.push(bodyHtml.slice(cursor, opening.index));
		cursor = end + 1;
		openingTag.lastIndex = cursor;
	}
	parts.push(bodyHtml.slice(cursor));
	const textContent = parts.join("").replace(/\s+/g, " ").trim();
	let scriptCount = 0;
	const scripts = /<script\b/gi;
	for (
		let opening = scripts.exec(html);
		opening;
		opening = scripts.exec(html)
	) {
		const start = scripts.lastIndex;
		const end = html.indexOf(">", start);
		if (end < 0) break;
		const attrs = html.slice(start, end);
		if (
			isExecutableScriptType(
				attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? null,
			)
		)
			scriptCount++;
		scripts.lastIndex = end + 1;
	}
	return textContent.length < 500 && scriptCount > 3;
}

async function extractHtmlPage(
	html: string,
	url: string,
	baseUrl: string,
	linkHeader: string | null,
	signal: AbortSignal,
): Promise<Page> {
	try {
		const { parseHTML } = await import("linkedom");
		const { document } = parseHTML(html);
		const documentTitle = document.title?.trim() ?? "";
		const links = discoverDeclaredWebLinks(
			document as unknown as Document,
			linkHeader,
			baseUrl,
		);
		const markdownPage = (
			title: string,
			text: string,
			extractor: SourceDocument["extractor"],
			warning?: Failure,
		) =>
			read(
				{ url, title, text, format: "markdown", extractor, truncated: false },
				links,
				warning,
			);
		const { Readability } = await import("@mozilla/readability");
		const article = new Readability(document as unknown as Document).parse();

		if (!article) {
			const rsc = extractRSCContent(html);
			if (rsc && rsc.content.length >= MIN_USEFUL_CONTENT)
				return markdownPage(rsc.title, rsc.content, "rsc");
			signal.throwIfAborted();
			const defuddled = await extractWithDefuddle(html, baseUrl);
			signal.throwIfAborted();
			if (defuddled && defuddled.content.length >= MIN_USEFUL_CONTENT)
				return markdownPage(
					documentTitle || defuddled.title,
					defuddled.content,
					"defuddle",
				);
			return markdownPage(documentTitle, "", "readability", {
				kind: "extraction",
				message: isLikelyJSRendered(html)
					? "Page appears to be JavaScript-rendered (content loads dynamically)"
					: "Could not extract readable content from HTML structure",
			});
		}

		if (typeof article.content !== "string")
			throw new Error("Readability returned invalid article content");
		const markdown = (await turndown()).turndown(article.content);
		const title = article.title || documentTitle;
		if (markdown.length >= MIN_USEFUL_CONTENT)
			return markdownPage(title, markdown, "readability");

		const rsc = extractRSCContent(html);
		if (rsc && rsc.content.length >= MIN_USEFUL_CONTENT)
			return markdownPage(rsc.title, rsc.content, "rsc");
		signal.throwIfAborted();
		const defuddled = await extractWithDefuddle(html, baseUrl);
		signal.throwIfAborted();
		if (defuddled && defuddled.content.length >= MIN_USEFUL_CONTENT)
			return markdownPage(
				title || defuddled.title,
				defuddled.content,
				"defuddle",
			);
		return markdownPage(
			title,
			markdown,
			"readability",
			incompleteWarning(html, markdown, parseHTML),
		);
	} catch (error) {
		if (signal.aborted || error instanceof WebkitError) throw error;
		return failed(
			"extraction",
			error instanceof Error ? error.message : String(error),
		);
	}
}

function incompleteWarning(
	html: string,
	markdown: string,
	parseHTML: typeof import("linkedom").parseHTML,
): Failure | undefined {
	const warning = (message: string): Failure => ({
		kind: "extraction",
		message,
	});
	if (isLikelyJSRendered(html))
		return warning(
			"Page appears to be JavaScript-rendered (content loads dynamically)",
		);
	// whose whole body is under the floor is complete; an executable script may mean a client-rendered placeholder.
	const { document } = parseHTML(html);
	const hasExecutableScript = [...document.querySelectorAll("script")].some(
		(script) => isExecutableScriptType(script.getAttribute("type")),
	);
	for (const node of document.querySelectorAll(
		"script, style, noscript, template",
	))
		node.remove();
	const visibleChars = (document.body?.textContent ?? "")
		.replace(/\s+/g, " ")
		.trim().length;
	const extractedChars = markdown.trim().length;
	const counts = `Extracted content appears incomplete: extracted ${extractedChars} characters from a page with ${visibleChars} characters of visible text`;
	if (visibleChars >= MIN_USEFUL_CONTENT) return warning(counts);
	if (hasExecutableScript)
		return warning(
			`Extracted content appears incomplete: the page has only ${visibleChars} characters of visible text and runs scripts, so content may load dynamically`,
		);
	return extractedChars > 0 ? undefined : warning(counts);
}

let turndownInstance: Promise<TurndownService> | undefined;
function turndown(): Promise<TurndownService> {
	turndownInstance ??= import("turndown").then(
		({ default: TurndownService }) =>
			new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" }),
	);
	return turndownInstance;
}

function isDefuddleConsoleError(args: unknown[]): boolean {
	const prefix = args[0];
	return (
		prefix === "Defuddle" ||
		(typeof prefix === "string" && /^Defuddle(?:\s|:)/.test(prefix))
	);
}

async function extractWithDefuddle(
	html: string,
	url: string,
): Promise<{ title: string; content: string } | null> {
	const { Defuddle } = await import("defuddle/node");
	const { parseHTML } = await import("linkedom");
	const { document } = parseHTML(html);
	Object.defineProperty(document, "location", {
		value: new URL(url),
		configurable: true,
	});
	let processingError: unknown;
	const originalConsoleError = console.error;
	console.error = (...args: unknown[]) => {
		if (isDefuddleConsoleError(args)) {
			if (args[0] === "Defuddle" && args[1] === "Error processing document:")
				processingError = args[2];
			return;
		}
		originalConsoleError(...args);
	};
	let resultPromise: ReturnType<typeof Defuddle>;
	try {
		// With useAsync false, Defuddle parses synchronously before returning its promise, so the console
		// interception covers only this call and no unrelated output.
		resultPromise = Defuddle(document as unknown as Document, url, {
			markdown: true,
			useAsync: false,
		});
	} finally {
		console.error = originalConsoleError;
	}
	const result = await resultPromise;
	if (processingError !== undefined) {
		throw new Error(
			`Defuddle failed to process document: ${processingError instanceof Error ? processingError.message : String(processingError)}`,
		);
	}
	return typeof result.content === "string"
		? { title: result.title, content: result.content }
		: null;
}

function extractTextTitle(text: string, url: string): string {
	const heading = text
		.match(/^#{1,2}\s+(.+)/m)?.[1]
		?.replace(/\*+/g, "")
		.trim();
	if (heading) return heading;
	try {
		return new URL(url).pathname.split("/").pop() || url;
	} catch {
		return url;
	}
}

const MAX_DECLARED_LINKS = 20;
const MAX_DECLARED_URL_LENGTH = 4096;
const RELATION_LABELS: Record<string, string> = {
	"api-catalog": "API catalog",
	describedby: "Description",
	"service-desc": "Service description",
	"service-doc": "Service documentation",
	"service-meta": "Service metadata",
};

interface DeclaredWebLink {
	url: string;
	relations: string[];
	type?: string;
}

/** Machine-readable descriptions a page declares through RFC 8288 Link headers or link/anchor rel attributes. */
function discoverDeclaredWebLinks(
	document: Document | null,
	linkHeader: string | null,
	responseUrl: string,
): DeclaredWebLink[] {
	const links = new Map<string, DeclaredWebLink>();
	for (const value of splitOutsideSyntax(linkHeader ?? "", ",", true)
		?.map((part) => part.trim())
		.filter(Boolean) ?? []) {
		const target = /^\s*<([^>]*)>/.exec(value);
		if (!target) continue;
		const parameters = parseLinkParameters(value.slice(target[0].length));
		if (!parameters || parameters.has("anchor")) continue;
		addDeclaredLink(links, {
			url: resolveHttpUrl(target[1], responseUrl),
			relations: declaredRelations(parameters.get("rel")),
			type: parameters.get("type"),
		});
		if (links.size >= MAX_DECLARED_LINKS) break;
	}
	if (document && links.size < MAX_DECLARED_LINKS) {
		const documentBase =
			resolveHttpUrl(
				document.querySelector("base[href]")?.getAttribute("href"),
				responseUrl,
			) ?? responseUrl;
		for (const element of document.querySelectorAll(
			"link[rel][href], a[rel][href]",
		)) {
			addDeclaredLink(links, {
				url: resolveHttpUrl(element.getAttribute("href"), documentBase),
				relations: declaredRelations(element.getAttribute("rel")),
				type: element.getAttribute("type"),
			});
			if (links.size >= MAX_DECLARED_LINKS) break;
		}
	}
	return [...links.values()];
}

function appendDeclaredWebLinks(
	content: string,
	links: DeclaredWebLink[],
): string {
	if (links.length === 0) return content;
	const section = [
		"## Declared links",
		"",
		...links.map(formatDeclaredLink),
	].join("\n");
	return content.trim() ? `${content.trim()}\n\n${section}` : section;
}

function addDeclaredLink(
	links: Map<string, DeclaredWebLink>,
	candidate: {
		url: string | null;
		relations: string[];
		type?: string | null | undefined;
	},
): void {
	if (!candidate.url || candidate.relations.length === 0) return;
	const type = normalizeMetadata(candidate.type);
	const existing = links.get(candidate.url);
	if (existing) {
		for (const relation of candidate.relations)
			if (!existing.relations.includes(relation))
				existing.relations.push(relation);
		if (!existing.type && type) existing.type = type;
		return;
	}
	if (links.size >= MAX_DECLARED_LINKS) return;
	links.set(candidate.url, {
		url: candidate.url,
		relations: candidate.relations,
		...(type ? { type } : {}),
	});
}

function declaredRelations(value: string | null | undefined): string[] {
	if (!value) return [];
	return [
		...new Set(
			value
				.trim()
				.toLowerCase()
				.split(/\s+/)
				.filter((relation) => relation in RELATION_LABELS),
		),
	];
}

function resolveHttpUrl(
	value: string | null | undefined,
	baseUrl: string,
): string | null {
	if (!value || value.length > MAX_DECLARED_URL_LENGTH) return null;
	try {
		const url = new URL(value, baseUrl);
		if (url.href.length > MAX_DECLARED_URL_LENGTH) return null;
		return url.protocol === "http:" || url.protocol === "https:"
			? url.href
			: null;
	} catch {
		return null;
	}
}

function splitOutsideSyntax(
	input: string,
	separator: string,
	protectTargets: boolean,
): string[] | null {
	const parts: string[] = [];
	let start = 0;
	let inTarget = false;
	let inQuotes = false;
	let escaped = false;
	for (let index = 0; index < input.length; index++) {
		const character = input[index];
		if (inQuotes) {
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inQuotes = false;
			continue;
		}
		if (character === '"' && !inTarget) inQuotes = true;
		else if (protectTargets && character === "<") inTarget = true;
		else if (protectTargets && character === ">") inTarget = false;
		else if (character === separator && !inTarget) {
			parts.push(input.slice(start, index));
			start = index + 1;
		}
	}
	if (inQuotes || inTarget) return null;
	parts.push(input.slice(start));
	return parts;
}

function parseLinkParameters(input: string): Map<string, string> | null {
	const parts = splitOutsideSyntax(input, ";", false);
	if (!parts || parts.shift()?.trim()) return null;
	const parameters = new Map<string, string>();
	for (const part of parts) {
		const match =
			/^\s*([!#$%&'*+\-.^_`|~A-Za-z0-9]+)(?:\s*=\s*(?:"((?:\\.|[^"])*)"|(\S+)))?\s*$/.exec(
				part,
			);
		if (!match) return null;
		const name = match[1]!.toLowerCase();
		const value =
			match[2] === undefined
				? (match[3] ?? "")
				: match[2].replace(/\\(.)/g, "$1");
		if (!parameters.has(name)) parameters.set(name, value);
	}
	return parameters;
}

function normalizeMetadata(
	value: string | null | undefined,
): string | undefined {
	const normalized = value?.replace(/\s+/g, " ").trim().slice(0, 160);
	return normalized || undefined;
}

function formatDeclaredLink(link: DeclaredWebLink): string {
	const relation = link.relations.map(inlineCode).join(", ");
	const type = link.type ? `; ${inlineCode(link.type)}` : "";
	return `- ${RELATION_LABELS[link.relations[0]!] ?? "Declared link"} (${relation}${type}): <${link.url}>`;
}

function inlineCode(value: string): string {
	return `\`${value.replace(/`/g, "'")}\``;
}

const MAX_DATA_URI_HEADER_CHARS = 1024;
const MAX_MIME_CHARS = 127;

/** Replaces inline RFC 2397 data URIs with bounded markers so opaque payloads never reach stored snapshots. */
function omitInlineDataUris(text: string): string {
	const pieces: string[] = [];
	let retainedFrom = 0;
	let scanFrom = 0;
	while (scanFrom < text.length) {
		const start = findNextDataScheme(text, scanFrom);
		if (start < 0) break;
		const { end, comma, enclosed } = scanDataUriCandidate(text, start);
		const headerStart = start + 5;
		if (comma < 0 && end === headerStart && !enclosed) {
			scanFrom = end;
			continue;
		}
		const headerEnd = comma < 0 ? end : comma;
		const payload = text.slice(comma < 0 ? headerStart : comma + 1, end);
		const mime =
			comma < 0
				? "unknown"
				: headerEnd - headerStart > MAX_DATA_URI_HEADER_CHARS
					? "application/octet-stream"
					: normalizeMimeType(text.slice(headerStart, headerEnd));
		const encoding = /;\s*base64\s*$/i.test(text.slice(headerStart, headerEnd))
			? "base64"
			: "percent-encoded";
		pieces.push(
			text.slice(retainedFrom, start),
			`[inline data URI omitted; mime=${mime}; encoding=${encoding}; encodedBytes=${Buffer.byteLength(payload, "utf8")}; sha256=${createHash("sha256").update(payload).digest("hex")}]`,
		);
		retainedFrom = end;
		scanFrom = end;
	}
	if (retainedFrom === 0) return text;
	pieces.push(text.slice(retainedFrom));
	return pieces.join("");
}

function findNextDataScheme(text: string, from: number): number {
	const pattern = /data:/gi;
	pattern.lastIndex = from;
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		const before = match.index === 0 ? "" : text[match.index - 1]!;
		if (!/[A-Za-z0-9+.-]/.test(before)) return match.index;
	}
	return -1;
}

function scanDataUriCandidate(
	text: string,
	start: number,
): { end: number; comma: number; enclosed: boolean } {
	const quote = start > 0 ? text[start - 1] : undefined;
	const beforeQuote = start > 1 ? text[start - 2]! : "";
	let opener = start - 1;
	while (opener >= 0 && (text[opener] === " " || text[opener] === "\t"))
		opener--;
	const enclosure =
		(quote === '"' || quote === "'" || quote === "`") &&
		(start === 1 || /[=([{:,\s]/.test(beforeQuote))
			? quote
			: text[opener] === "("
				? "("
				: text[opener] === "<"
					? "<"
					: null;
	let depth = 1;
	let comma = -1;
	let index = start + 5;
	for (; index < text.length; index++) {
		const ch = text[index]!;
		if (enclosure === "(") {
			if (ch === "(") depth++;
			else if (ch === ")" && --depth === 0) break;
		} else if (enclosure === "<") {
			if (ch === ">") break;
		} else if (enclosure) {
			if (ch === enclosure) break;
		} else if (
			ch.charCodeAt(0) <= 32 ||
			ch.charCodeAt(0) === 127 ||
			ch === '"' ||
			ch === "`" ||
			ch === "<" ||
			ch === ">"
		) {
			break;
		}
		if (comma < 0 && ch === ",") comma = index;
	}
	return { end: index, comma, enclosed: enclosure !== null };
}

function normalizeMimeType(header: string): string {
	const type = header.split(";", 1)[0]!;
	if (type === "") return "text/plain";
	if (
		type.length > MAX_MIME_CHARS ||
		!/^[!#$%&'*+\-.^_`|~A-Za-z0-9]+\/[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/.test(type)
	)
		return "application/octet-stream";
	return type.toLowerCase();
}
