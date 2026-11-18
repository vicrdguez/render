// Tool names, parameters, descriptions and result wording follow pi-web-access 0.46 index.ts and
// web-tool-core.ts (MIT, see LICENSE).
import type { Context } from "tau/chord";
import {
	defineDoc,
	defineExtension,
	defineTool,
	type JsonObject,
	type ToolExecutionApi,
	type ToolExecutionResult,
	type Tx,
} from "tau/durable";
import { arr, int, obj, oneOf, opt, str } from "tau/schema";
import {
	admit,
	formatQuery,
	MAX_PAGE_CHARS,
	retrieve,
	type StoredResults,
	UNTRUSTED,
} from "./content.ts";
import {
	type Endpoints,
	type Failure,
	failureOf,
	type HttpClient,
	type ItemOutcome,
	type Provider,
	type QueryResults,
	type RequestScope,
	type ResearchResult,
	redact,
	type SearchControls,
	type SearchHit,
	type Settings,
	type Snapshot,
	type SourceDocument,
} from "./domain.ts";
import { collectEvidence } from "./evidence.ts";
import { cleanupClones, fetchPages } from "./extract.ts";
import { createHttpClient } from "./net.ts";
import { bool, readSettings } from "./options.ts";
import { search } from "./search.ts";

export interface ToolDependencies {
	http?: (settings: Settings) => HttpClient;
	endpoints?: Partial<Endpoints>;
	tempRoot?: string;
}

const PRODUCTION: Endpoints = {
	exaMcp: "https://mcp.exa.ai/mcp",
	exa: "https://api.exa.ai",
	tavily: "https://api.tavily.com",
	github: "https://api.github.com",
};
const OUTPUT_LIMITS = { maxBytes: 128 * 1024, maxLines: 10_000 };
const SNIPPET_CHARS = 300;
const PASSAGE_CHARS = 400;
const PASSAGE_BUDGET = 4_000;

const Results = defineDoc<JsonObject>({
	kind: "webkit.results",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "current",
	initial: () => ({ order: [], entries: {} }),
	checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= 16,
});
const storedResults = async (
	tx: Tx,
	conversationId: ToolExecutionApi["conversationId"],
) => (await tx.doc(Results, conversationId)) as unknown as StoredResults;

type Output = ToolExecutionResult;
const text = (value: string, isError = false): Output => ({
	output: [{ type: "text", text: value }],
	...(isError ? { isError: true } : {}),
});
const describe = (failure: Failure) => `${failure.kind}: ${failure.message}`;
const flat = (value: string, limit: number) => {
	const single = value.replace(/\s+/g, " ").trim();
	return single.length > limit
		? `${single.slice(0, limit).replace(/[\uD800-\uDBFF]$/, "")}…`
		: single;
};

function scrub(result: ResearchResult, secrets: string[]): ResearchResult {
	const r = (value: string) => redact(value, secrets);
	const maybe = <K extends string>(key: K, value: string | undefined) =>
		(value === undefined ? {} : { [key]: r(value) }) as Partial<
			Record<K, string>
		>;
	const failure = (value: Failure): Failure => ({
		...value,
		message: r(value.message),
	});
	const document = (value: SourceDocument): SourceDocument => ({
		...value,
		url: r(value.url),
		title: r(value.title),
		text: r(value.text),
		...maybe("publishedDate", value.publishedDate),
		...maybe("localPath", value.localPath),
	});
	const hit = (value: SearchHit): SearchHit => ({
		...value,
		url: r(value.url),
		title: r(value.title),
		snippet: r(value.snippet),
		...maybe("publishedDate", value.publishedDate),
		...maybe("author", value.author),
		...maybe("doi", value.doi),
	});
	const queries = (outcomes: ItemOutcome<QueryResults>[]) =>
		outcomes.map(
			(outcome): ItemOutcome<QueryResults> =>
				outcome.status === "ok"
					? {
							...outcome,
							value: {
								...outcome.value,
								query: r(outcome.value.query),
								hits: outcome.value.hits.map(hit),
							},
						}
					: { ...outcome, failure: failure(outcome.failure) },
		);
	switch (result.kind) {
		case "search":
			return {
				...result,
				documents: result.documents.map(document),
				queries: queries(result.queries),
				fetchFailures: result.fetchFailures.map((value) => ({
					url: r(value.url),
					failure: failure(value.failure),
				})),
			};
		case "fetch":
			return {
				...result,
				requestedUrls: result.requestedUrls.map(r),
				documents: result.documents.map(document),
				items: result.items.map((item) =>
					item.status === "ok"
						? item
						: { ...item, failure: failure(item.failure) },
				),
			};
		case "evidence":
			return {
				...result,
				claim: r(result.claim),
				documents: result.documents.map(document),
				queries: queries(result.queries),
				passages: result.passages.map((passage) => ({
					...passage,
					url: r(passage.url),
					text: r(passage.text),
				})),
				fetchFailures: result.fetchFailures.map(failure),
			};
	}
}

function unreferenced(
	stored: StoredResults,
	documents: SourceDocument[],
): SourceDocument[] {
	const retained = new Set(
		Object.values(stored.entries).flatMap((entry) =>
			entry.snapshot.result.documents.map((document) => document.localPath),
		),
	);
	return documents
		.filter(
			(document) =>
				document.localPath !== undefined && !retained.has(document.localPath),
		)
		.map((document) => ({ ...document }));
}

function failedEverything(result: ResearchResult): boolean {
	const outcomes = result.kind === "fetch" ? result.items : result.queries;
	return (
		outcomes.length > 0 &&
		outcomes.every((outcome) => outcome.status === "failed")
	);
}

function bounded(body: string, guidance: string): string {
	if (body.length + guidance.length <= MAX_PAGE_CHARS)
		return `${body}${guidance}`;
	const marker = "\n\n[Output truncated.]";
	return `${body.slice(0, MAX_PAGE_CHARS - guidance.length - marker.length).replace(/[\uD800-\uDBFF]$/, "")}${marker}${guidance}`;
}

const stored = (id: string | undefined) =>
	id === undefined ? "" : ` · stored as responseId "${id}"`;
const documentLine = (document: SourceDocument, index: number) =>
	`urlIndex ${index}: ${document.title || document.url} · ${document.url} · ${document.text.length} chars${document.truncated ? " · truncated to fit storage" : ""}`;

function queryLines(
	outcomes: ItemOutcome<QueryResults>[],
	queries: string[],
): string {
	return outcomes
		.map((outcome, index) => {
			if (outcome.status === "failed")
				return `## Query: "${queries[index] ?? index}"\nFailed (${describe(outcome.failure)})`;
			const hits = outcome.value.hits.map(
				(hit, rank) =>
					`${rank + 1}. ${hit.title}\n   ${hit.url}${hit.snippet ? `\n   ${flat(hit.snippet, SNIPPET_CHARS)}` : ""}`,
			);
			return `## Query: "${outcome.value.query}" (${outcome.value.transport})\n${hits.join("\n") || "No results found."}`;
		})
		.join("\n\n");
}

function renderSearch(
	result: Extract<ResearchResult, { kind: "search" }>,
	queries: string[],
	id?: string,
): string {
	const pages = result.documents.length
		? `\n\nFetched pages:\n${result.documents.map(documentLine).join("\n")}`
		: "";
	const failures = result.fetchFailures.length
		? `\n\nPage fetch failures:\n${result.fetchFailures.map(({ url, failure }) => `- ${url}: failed (${describe(failure)})`).join("\n")}`
		: "";
	const guidance =
		id === undefined
			? ""
			: `\n\n---\nUse get_search_content({ responseId: "${id}", queryIndex: 0 }) for full results${result.queries.length > 1 ? `; repeat with queryIndex 1 through ${result.queries.length - 1}` : ""}.${result.documents.length ? ` Use urlIndex for fetched pages.` : ""}`;
	return bounded(
		`Search results${stored(id)}\n${UNTRUSTED}\n\n${queryLines(result.queries, queries)}${pages}${failures}`,
		guidance,
	);
}

function renderFetch(
	result: Extract<ResearchResult, { kind: "fetch" }>,
	id?: string,
): string {
	const failures = result.items.flatMap((item) =>
		item.status === "failed"
			? [
					`- ${result.requestedUrls[item.index]}: failed (${describe(item.failure)})`,
				]
			: [],
	);
	const single =
		result.items.length === 1 && result.items[0]?.status === "ok"
			? result.documents[result.items[0].value]
			: undefined;
	if (single && id !== undefined) {
		const head = `Fetched ${single.url}${stored(id)}\nExtracted by ${single.extractor} as ${single.format}.${single.truncated ? " Stored text was truncated to fit storage." : ""}${single.localPath ? ` Local copy: ${single.localPath}` : ""}\n${UNTRUSTED}\n\n# ${single.title || single.url}\n\n`;
		const room = MAX_PAGE_CHARS - head.length;
		let end = Math.min(room, single.text.length);
		if (
			end < single.text.length &&
			/[\uD800-\uDBFF]/.test(single.text[end - 1] ?? "")
		)
			end--;
		const more =
			end < single.text.length
				? `\n\n---\nShowing chars 0-${end} of ${single.text.length}. Use get_search_content({ responseId: "${id}", urlIndex: 0, offset: ${end} }) for the next slice.`
				: "";
		return `${head}${single.text.slice(0, end)}${more}`;
	}
	const pages = result.items.flatMap((item) =>
		item.status === "ok"
			? [`- ${documentLine(result.documents[item.value]!, item.value)}`]
			: [],
	);
	const guidance =
		id === undefined
			? ""
			: `\n\n---\nUse get_search_content({ responseId: "${id}", urlIndex: 0 }) to read a page; urlIndex follows the list above.`;
	return bounded(
		`Fetched ${pages.length} of ${result.items.length} URLs${stored(id)}\n${UNTRUSTED}\n\n${[...pages, ...failures].join("\n")}`,
		guidance,
	);
}

function renderEvidence(
	result: Extract<ResearchResult, { kind: "evidence" }>,
	queries: string[],
	id?: string,
): string {
	const lines = [
		`Source check${stored(id)}`,
		`Claim: ${result.claim}`,
		"Assessment: unassessed. These passages are retrieved text for manual review. webkit does not judge whether they back or refute the claim.",
		UNTRUSTED,
		"",
	];
	const sources = [...new Set(result.passages.map((passage) => passage.url))];
	const titles = new Map(
		result.queries.flatMap((outcome) =>
			outcome.status === "ok"
				? outcome.value.hits.map((hit) => [hit.url, hit.title] as const)
				: [],
		),
	);
	let budget = PASSAGE_BUDGET;
	let omitted = 0;
	let label = 0;
	if (sources.length) lines.push("## Sources");
	else if (!failedEverything(result))
		lines.push("No passages were retrieved for the claim.");
	for (const [rank, url] of sources.entries()) {
		lines.push(`${rank + 1}. ${titles.get(url) ?? url}\n   ${url}`);
		for (const passage of result.passages.filter(
			(candidate) => candidate.url === url,
		)) {
			label++;
			const quoted = flat(passage.text, PASSAGE_CHARS);
			if (quoted.length > budget) {
				omitted++;
				continue;
			}
			budget -= quoted.length;
			const origin =
				passage.origin === "page"
					? `page chars ${passage.start}-${passage.end}, body ${passage.contentHash}`
					: `search snippet, ${passage.contentHash}`;
			lines.push(`   - P${label} (${origin}): ${quoted}`);
		}
	}
	if (omitted > 0)
		lines.push(
			`${omitted} more passage${omitted === 1 ? " is" : "s are"} stored.`,
		);
	const searchFailures = result.queries.flatMap((outcome, index) =>
		outcome.status === "failed"
			? [`"${queries[index] ?? index}" (${describe(outcome.failure)})`]
			: [],
	);
	if (searchFailures.length)
		lines.push("", `Search failures: ${searchFailures.join("; ")}`);
	if (result.fetchFailures.length)
		lines.push(
			"",
			`Fetch failures: ${result.fetchFailures.map(describe).join("; ")}`,
		);
	const guidance =
		id === undefined
			? ""
			: `\n\n---\nUse get_search_content({ responseId: "${id}" }) for the stored passages and sources, or add urlIndex for a fetched page.`;
	return bounded(lines.join("\n"), guidance);
}

const providerSchema = opt(
	oneOf(["auto", "exa-mcp", "exa", "tavily"], {
		description: "Omit to use the project setting",
	}),
);
const recencySchema = opt(oneOf(["day", "week", "month", "year"]));
const domainSchema = opt(
	arr(str({ minLength: 1 }), {
		maxItems: 20,
		description: "Prefix - to exclude",
	}),
);
const numResultsSchema = opt(
	int({ minimum: 1, maximum: 20, description: "Default 5" }),
);

/** Repairs array arguments some models send as JSON strings, and a single findText string. Pure. */
function repairArrays(keys: readonly string[]) {
	return (args: unknown): never => {
		if (!args || typeof args !== "object" || Array.isArray(args))
			return args as never;
		const input = args as Record<string, unknown>;
		let output: Record<string, unknown> | undefined;
		for (const key of keys) {
			const value = input[key];
			if (typeof value !== "string") continue;
			let parsed: unknown;
			try {
				parsed = value.trim().startsWith("[") ? JSON.parse(value) : undefined;
			} catch {}
			const list =
				Array.isArray(parsed) &&
				parsed.every((item) => typeof item === "string")
					? parsed
					: key === "findText"
						? [value]
						: undefined;
			if (list) {
				output ??= { ...input };
				output[key] = list;
			}
		}
		return (output ?? args) as never;
	};
}

/** A model sometimes puts a JSON array of queries into `query`; search each element instead of the literal text. */
function expandQuery(query: string): string[] {
	const trimmed = query.trim();
	if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
		try {
			const parsed: unknown = JSON.parse(trimmed);
			if (
				Array.isArray(parsed) &&
				parsed.every((entry) => typeof entry === "string")
			)
				return parsed;
		} catch {}
	}
	return [query];
}

const cleanList = (values: readonly string[]) => [
	...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
const controlsOf = (args: {
	numResults?: number;
	domainFilter?: string[];
	recencyFilter?: SearchControls["recencyFilter"];
	category?: string;
}): SearchControls => ({
	numResults: args.numResults ?? 5,
	domainFilter: args.domainFilter ?? [],
	...(args.recencyFilter ? { recencyFilter: args.recencyFilter } : {}),
	...(args.category ? { category: args.category } : {}),
});

export function createWebkitExtension(dependencies: ToolDependencies = {}) {
	const endpoints: Endpoints = { ...PRODUCTION, ...dependencies.endpoints };
	const transport =
		dependencies.http ?? ((settings: Settings) => createHttpClient(settings));

	async function research(
		api: ToolExecutionApi,
		context: Context,
		run: (scope: RequestScope) => Promise<ResearchResult>,
		render: (result: ResearchResult, id?: string) => string,
	): Promise<Output> {
		let settings: Settings;
		try {
			settings = await api.commit(readSettings, context);
		} catch {
			return text(
				"webkit options are invalid or incomplete. Check provider, the API key it needs, fallbackProviders, proxy, hostedExtraction, timeoutMs and maxResponseBytes in the project options.",
				true,
			);
		}
		const signal = context.abortSignal ?? new AbortController().signal;
		const secrets = [
			settings.exaApiKey,
			settings.tavilyApiKey,
			settings.proxy,
		].filter((value): value is string => Boolean(value));
		const cancelled = text(
			"The web request was cancelled. Nothing was stored.",
			true,
		);
		const scope: RequestScope = {
			settings,
			signal,
			http: transport(settings),
			endpoints,
			now: () => api.now(),
			...(dependencies.tempRoot === undefined
				? {}
				: { tempRoot: dependencies.tempRoot }),
		};
		let raw: ResearchResult;
		try {
			raw = await run(scope);
		} catch (error) {
			if (signal.aborted) return cancelled;
			return text(
				`The web request failed (${redact(describe(failureOf(error, signal)), secrets)}).`,
				true,
			);
		}
		const release = (documents: SourceDocument[]) =>
			cleanupClones(documents, scope.tempRoot).catch(() => {});
		const result = scrub(raw, secrets);
		if (signal.aborted || failedEverything(result)) {
			await release(raw.documents);
			return signal.aborted ? cancelled : text(render(result), true);
		}
		const id = `w${api.taskId}`;
		let admitted: { kept: Snapshot; released: SourceDocument[] };
		try {
			admitted = await api.commit(async (tx) => {
				const stored = await storedResults(tx, api.conversationId);
				const { snapshot, evicted } = admit(stored, {
					id,
					createdAt: new Date(api.now()).toISOString(),
					result,
				});
				return {
					kept: snapshot,
					released: unreferenced(stored, [
						...evicted.flatMap((value) => value.result.documents),
						...raw.documents,
					]),
				};
			}, context);
		} catch (error) {
			await release(raw.documents);
			return text(
				`The result could not be stored (${describe(failureOf(error))}). Nothing was stored.`,
				true,
			);
		}
		await release(admitted.released);
		return text(render(admitted.kept.result, id));
	}

	const webSearch = defineTool({
		name: "web_search",
		description: `Search the web for sources. Results are stored in this conversation for get_search_content by responseId. Prefer 2-4 varied queries. ${UNTRUSTED}`,
		parameters: obj({
			query: opt(str({ description: "One query; use queries for several" })),
			queries: opt(
				arr(str({ minLength: 1 }), {
					maxItems: 8,
					description:
						"Run concurrently (up to three at a time); vary the angle",
				}),
			),
			numResults: numResultsSchema,
			includeContent: opt(
				bool({ description: "Also fetch full page content" }),
			),
			recencyFilter: recencySchema,
			domainFilter: domainSchema,
			category: opt(str({ minLength: 1, description: "Exa only, e.g. news" })),
			provider: providerSchema,
		}),
		prepareArguments: repairArrays(["queries", "domainFilter"]),
		replay: "unsafe",
		outputLimits: OUTPUT_LIMITS,
		async execute(args, api, context) {
			const queries = cleanList(
				args.queries ??
					(args.query === undefined ? [] : expandQuery(args.query)),
			);
			if (queries.length === 0)
				return text("No query provided. Use query or queries.", true);
			const provider: Provider | undefined = args.provider;
			return research(
				api,
				context,
				(scope) =>
					search(
						{
							queries,
							...(provider ? { provider } : {}),
							controls: controlsOf(args),
							includeContent: args.includeContent === true,
						},
						scope,
					),
				(result, id) =>
					renderSearch(
						result as Extract<ResearchResult, { kind: "search" }>,
						queries,
						id,
					),
			);
		},
	});

	const fetchContent = defineTool({
		name: "fetch_content",
		description: `Fetch web pages, PDFs and public GitHub repositories as readable Markdown or raw text. Content is stored in this conversation for get_search_content by responseId. ${UNTRUSTED}`,
		parameters: obj({
			url: opt(str()),
			urls: opt(arr(str({ minLength: 1 }), { maxItems: 20 })),
			mode: opt(
				oneOf(["readable", "raw"], {
					description:
						"readable (default) extracts the main content; raw returns the response body",
				}),
			),
			forceClone: opt(
				bool({ description: "Clone GitHub repos over the size limit" }),
			),
			redirects: opt(
				oneOf(["same-origin"], {
					description: "Refuse cross-origin redirects",
				}),
			),
		}),
		prepareArguments: repairArrays(["urls"]),
		replay: "unsafe",
		outputLimits: OUTPUT_LIMITS,
		async execute(args, api, context) {
			const urls = cleanList(
				args.urls ?? (args.url === undefined ? [] : [args.url]),
			);
			if (urls.length === 0)
				return text(
					"No URL provided. Use url, or urls for several pages.",
					true,
				);
			if (args.mode === "raw" && args.forceClone === true)
				return text("mode raw cannot be combined with forceClone.", true);
			return research(
				api,
				context,
				(scope) =>
					fetchPages(
						{
							urls,
							mode: args.mode ?? "readable",
							forceClone: args.forceClone === true,
							redirects: args.redirects ?? "follow",
						},
						scope,
					),
				(result, id) =>
					renderFetch(result as Extract<ResearchResult, { kind: "fetch" }>, id),
			);
		},
	});

	const sourceCheck = defineTool({
		name: "source_check",
		description: `Gather cited web passages about a claim for manual review. It does not judge the claim. ${UNTRUSTED}`,
		parameters: obj({
			claim: str({ minLength: 1, description: "Assertion to check" }),
			queries: opt(
				arr(str({ minLength: 1 }), {
					maxItems: 8,
					description: "Default: the claim",
				}),
			),
			numResults: numResultsSchema,
			fetchContent: opt(
				bool({ description: "Fetch the top 5 pages for exact passages" }),
			),
			recencyFilter: recencySchema,
			domainFilter: domainSchema,
			provider: providerSchema,
		}),
		prepareArguments: repairArrays(["queries", "domainFilter"]),
		replay: "unsafe",
		outputLimits: OUTPUT_LIMITS,
		async execute(args, api, context) {
			const claim = args.claim.trim();
			if (!claim) return text("claim is required.", true);
			const requested = cleanList(args.queries ?? []);
			const queries = requested.length ? requested : [claim];
			const provider: Provider | undefined = args.provider;
			return research(
				api,
				context,
				(scope) =>
					collectEvidence(
						{
							claim,
							queries,
							...(provider ? { provider } : {}),
							controls: controlsOf(args),
							fetchContent: args.fetchContent === true,
						},
						scope,
					),
				(result, id) =>
					renderEvidence(
						result as Extract<ResearchResult, { kind: "evidence" }>,
						queries,
						id,
					),
			);
		},
	});

	const getSearchContent = defineTool({
		name: "get_search_content",
		description:
			"Page through or search stored results from web_search, fetch_content or source_check by responseId, without fetching again. Results belong to the conversation that produced them.",
		parameters: obj({
			responseId: str({ minLength: 1 }),
			query: opt(str()),
			queryIndex: opt(int({ minimum: 0 })),
			url: opt(str()),
			urlIndex: opt(int({ minimum: 0 })),
			offset: opt(int({ minimum: 0 })),
			limit: opt(
				int({
					minimum: 1,
					maximum: MAX_PAGE_CHARS,
					description: "Characters, default the maximum",
				}),
			),
			findText: opt(
				arr(str({ minLength: 1, maxLength: 500 }), {
					minItems: 1,
					maxItems: 10,
					description: "Find passages instead of paging",
				}),
			),
			findMode: opt(oneOf(["exact", "case-insensitive", "fuzzy"])),
		}),
		prepareArguments: repairArrays(["findText"]),
		replay: "safe",
		outputLimits: OUTPUT_LIMITS,
		async execute(args, api, context) {
			if (args.findMode !== undefined && args.findText === undefined)
				return text(
					"findMode requires findText. Provide findText or omit findMode.",
					true,
				);
			const findText =
				args.findText === undefined ? undefined : cleanList(args.findText);
			if (findText?.length === 0)
				return text(
					"findText must contain at least one non-empty string.",
					true,
				);
			try {
				const page = await api.commit(
					async (tx) =>
						retrieve(await storedResults(tx, api.conversationId), {
							responseId: args.responseId.trim(),
							...(args.query?.trim() ? { query: args.query } : {}),
							...(args.queryIndex === undefined
								? {}
								: { queryIndex: args.queryIndex }),
							...(args.url?.trim() ? { url: args.url } : {}),
							...(args.urlIndex === undefined
								? {}
								: { urlIndex: args.urlIndex }),
							offset: args.offset ?? 0,
							limit: args.limit ?? MAX_PAGE_CHARS,
							...(findText ? { findText } : {}),
							findMode: args.findMode ?? "case-insensitive",
						}),
					context,
				);
				return text(page.text);
			} catch (error) {
				return text(`Error: ${failureOf(error).message}`, true);
			}
		},
	});

	return defineExtension({
		name: "webkit",
		tools: [webSearch, fetchContent, getSearchContent, sourceCheck],
	});
}
