import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type {
	EvidenceRequest,
	EvidenceResult,
	HttpRequest,
	HttpResponse,
	RequestScope,
	SourceDocument,
} from "../src/domain.ts";
import { collectEvidence } from "../src/evidence.ts";

const EXA = "https://api.exa.test";
const sha256 = (text: string) =>
	`sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
const respond = (
	body: string,
	status = 200,
	headers: Record<string, string> = {},
	url = "",
): HttpResponse => ({
	url,
	status,
	headers,
	body: new TextEncoder().encode(body),
});
type Hit = { url: string; title?: string; snippet?: string };

function web(
	results: Record<string, Hit[] | number>,
	pages: Record<string, string | number> = {},
	onSearch?: () => void,
) {
	const requests: HttpRequest[] = [];
	const controller = new AbortController();
	const scope: RequestScope = {
		settings: {
			provider: "auto",
			fallbackProviders: "",
			exaApiKey: "exa-evidence-key",
			hostedExtraction: false,
			timeoutMs: 60_000,
			maxResponseBytes: 5_242_880,
		},
		signal: controller.signal,
		now: () => Date.parse("2026-04-20T12:00:00Z"),
		endpoints: {
			exaMcp: "https://mcp.exa.test/mcp",
			exa: EXA,
			tavily: "https://api.tavily.test",
			github: "https://api.github.test",
		},
		http: {
			async request(request) {
				requests.push(request);
				if (request.url.startsWith(EXA)) {
					onSearch?.();
					const query = (JSON.parse(request.body ?? "{}") as { query: string })
						.query;
					const value = results[query] ?? [];
					if (typeof value === "number")
						return respond(JSON.stringify({ error: "provider body" }), value, {
							"content-type": "application/json",
						});
					return respond(
						JSON.stringify({
							results: value.map((hit) => ({
								url: hit.url,
								title: hit.title ?? "Source",
								...(hit.snippet ? { highlights: [hit.snippet] } : {}),
							})),
						}),
						200,
						{ "content-type": "application/json" },
					);
				}
				const body = pages[request.url];
				if (body === undefined)
					return respond(
						"missing",
						404,
						{ "content-type": "text/plain" },
						request.url,
					);
				if (typeof body === "number")
					return respond(
						"failed",
						body,
						{ "content-type": "text/plain" },
						request.url,
					);
				return respond(
					body,
					200,
					{ "content-type": "text/plain; charset=utf-8" },
					request.url,
				);
			},
		},
	};
	const pageRequests = () =>
		new Set(
			requests
				.filter((request) => !request.url.startsWith(EXA))
				.map((request) => request.url),
		);
	return { scope, controller, requests, pageRequests };
}

const ask = (
	claim: string,
	extra: Partial<EvidenceRequest> = {},
): EvidenceRequest => ({
	claim,
	queries: [claim],
	controls: { numResults: 5, domainFilter: [] },
	fetchContent: false,
	...extra,
});

function documentFor(result: EvidenceResult, url: string): SourceDocument {
	for (const outcome of result.queries) {
		if (outcome.status !== "ok") continue;
		const hit = outcome.value.hits.find(
			(candidate) =>
				candidate.url === url && candidate.documentIndex !== undefined,
		);
		const document =
			hit?.documentIndex === undefined
				? undefined
				: result.documents[hit.documentIndex];
		if (document) return document;
	}
	assert.fail(`no fetched document for ${url}`);
}

test("evidence is unassessed and carries no verdict, confidence or source-authority label", async () => {
	const { scope } = web({
		"API supports streaming": [
			{
				url: "https://docs.example.com/api",
				snippet: "The API supports streaming responses.",
			},
		],
	});
	const result = await collectEvidence(ask("API supports streaming"), scope);
	assert.deepEqual(Object.keys(result).sort(), [
		"assessment",
		"claim",
		"documents",
		"fetchFailures",
		"kind",
		"passages",
		"queries",
	]);
	assert.equal(result.kind, "evidence");
	assert.equal(result.claim, "API supports streaming");
	assert.equal(result.assessment, "unassessed");
	assert.doesNotMatch(
		JSON.stringify(result),
		/supported"|contradicted|confidence|official_docs|quality/i,
	);
});

test("each unique source snippet becomes one cited snippet passage hashed over the snippet", async () => {
	const { scope, pageRequests } = web({
		first: [
			{ url: "https://a.example.com/1", snippet: "Alpha passage." },
			{ url: "https://b.example.com/2", snippet: "Beta passage." },
		],
		second: [
			{ url: "https://b.example.com/2", snippet: "Beta passage." },
			{ url: "https://c.example.com/3" },
		],
	});
	const result = await collectEvidence(
		ask("passage", { queries: ["first", "second"] }),
		scope,
	);
	assert.deepEqual(result.passages, [
		{
			url: "https://a.example.com/1",
			text: "Alpha passage.",
			contentHash: sha256("Alpha passage."),
			origin: "snippet",
		},
		{
			url: "https://b.example.com/2",
			text: "Beta passage.",
			contentHash: sha256("Beta passage."),
			origin: "snippet",
		},
	]);
	assert.deepEqual(result.documents, []);
	assert.equal(
		pageRequests().size,
		0,
		"fetchContent false never fetches pages",
	);
});

test("fetched page passages cite exact offsets and the SHA-256 of the extracted page body", async () => {
	const url = "https://docs.example.com/api";
	const content = "Intro.\n\nThe API\t supports streaming responses.\nTail.";
	const { scope } = web(
		{
			"API supports streaming responses": [
				{ url, snippet: "API supports streaming responses." },
			],
		},
		{ [url]: content },
	);
	const result = await collectEvidence(
		ask("API supports streaming responses", { fetchContent: true }),
		scope,
	);
	const document = documentFor(result, url);
	assert.ok(document.text.includes(content));
	const pagePassages = result.passages.filter(
		(passage) => passage.origin === "page",
	);
	assert.ok(
		pagePassages.some(
			(passage) => passage.text === "The API\t supports streaming responses.",
		),
	);
	for (const passage of pagePassages) {
		assert.equal(passage.url, url);
		assert.equal(document.text.slice(passage.start, passage.end), passage.text);
		assert.equal(passage.contentHash, sha256(document.text));
	}
	assert.equal(
		sha256("abc"),
		"sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	);
});

test("page sentences stay whole across internal periods such as domain names", async () => {
	const url = "https://www.iana.org/domains/reserved";
	const content =
		'He said "intro." A number of domains such as example.com and example.org are maintained for documentation purposes. Tail.';
	const expected =
		"A number of domains such as example.com and example.org are maintained for documentation purposes.";
	const claim = "example.com and example.org documentation";
	const { scope } = web({ [claim]: [{ url }] }, { [url]: content });
	const result = await collectEvidence(
		ask(claim, { fetchContent: true }),
		scope,
	);
	assert.deepEqual(
		result.passages.map((passage) => [passage.origin, passage.text]),
		[["page", expected]],
	);
});

test("at most three page passages are chosen by claim terms, short acronyms included, before snippet terms", async () => {
	const url = "https://docs.example.com/api";
	const content =
		"Tell us about the tls setup. Pricing starts at five dollars a month. Every request requires a token. Connections to the API use TLS only. Rapid capital growth requires patience.";
	const { scope } = web(
		{
			"API requires TLS": [{ url, snippet: "Pricing starts at five dollars." }],
		},
		{ [url]: content },
	);
	const result = await collectEvidence(
		ask("API requires TLS", { fetchContent: true }),
		scope,
	);
	assert.deepEqual(
		result.passages
			.filter((passage) => passage.origin === "page")
			.map((passage) => passage.text),
		[
			"Connections to the API use TLS only.",
			"Every request requires a token.",
			"Rapid capital growth requires patience.",
		],
	);
	assert.deepEqual(
		result.passages
			.filter((passage) => passage.origin === "snippet")
			.map((passage) => passage.text),
		["Pricing starts at five dollars."],
	);
});

test("a fetched page without claim or snippet terms yields its document but no page passage", async () => {
	const url = "https://example.com/unrelated";
	const { scope } = web(
		{ "quantum entanglement": [{ url }] },
		{ [url]: "Gardening tips for spring. Water the roses daily." },
	);
	const result = await collectEvidence(
		ask("quantum entanglement", { fetchContent: true }),
		scope,
	);
	assert.equal(result.documents.length, 1);
	assert.deepEqual(result.passages, []);
});

test("only the top five unique sources across queries are fetched, in rank order", async () => {
	const urls = Array.from(
		{ length: 6 },
		(_, index) => `https://site${index + 1}.example.com/page`,
	);
	const pages = Object.fromEntries(
		urls.map((url) => [url, "The claim term appears here."]),
	);
	const { scope, pageRequests } = web(
		{
			first: urls.slice(0, 4).map((url) => ({ url })),
			second: [
				{ url: urls[2] ?? "" },
				{ url: urls[4] ?? "" },
				{ url: urls[5] ?? "" },
			],
		},
		pages,
	);
	const result = await collectEvidence(
		ask("claim term", { queries: ["first", "second"], fetchContent: true }),
		scope,
	);
	assert.deepEqual([...pageRequests()].sort(), urls.slice(0, 5).sort());
	assert.equal(result.documents.length, 5);
	assert.deepEqual(
		[...new Set(result.passages.map((passage) => passage.url))],
		urls.slice(0, 5),
	);
});

test("a failed page fetch is recorded while other pages and every snippet stay cited", async () => {
	const good = "https://good.example.com/a";
	const gone = "https://gone.example.com/b";
	const { scope } = web(
		{
			"streaming API": [
				{ url: good, snippet: "streaming API one" },
				{ url: gone, snippet: "streaming API two" },
			],
		},
		{ [good]: "The streaming API is stable." },
	);
	const result = await collectEvidence(
		ask("streaming API", { fetchContent: true }),
		scope,
	);
	assert.equal(result.fetchFailures.length, 1);
	assert.equal(result.fetchFailures[0]?.kind, "not-found");
	assert.ok(
		result.passages.some(
			(passage) => passage.url === good && passage.origin === "page",
		),
	);
	assert.deepEqual(
		result.passages
			.filter((passage) => passage.origin === "snippet")
			.map((passage) => passage.url),
		[good, gone],
	);
});

test("search failures keep their classified kind and stop page fetching", async () => {
	const { scope, pageRequests } = web({ "rate limited": 429 });
	const result = await collectEvidence(
		ask("rate limited", { fetchContent: true }),
		scope,
	);
	assert.deepEqual(
		result.queries.map(
			(outcome) => outcome.status === "failed" && outcome.failure.kind,
		),
		["quota"],
	);
	assert.deepEqual(result.passages, []);
	assert.equal(pageRequests().size, 0);
	assert.doesNotMatch(JSON.stringify(result), /provider body/);
});

test("search controls and every query reach the provider", async () => {
	const { scope, requests } = web({});
	await collectEvidence(
		ask("claim", {
			queries: ["one", "two"],
			controls: { numResults: 3, domainFilter: ["docs.example.com"] },
		}),
		scope,
	);
	const bodies = requests.map(
		(request) =>
			JSON.parse(request.body ?? "{}") as {
				query: string;
				numResults: number;
				includeDomains?: string[];
			},
	);
	assert.deepEqual(bodies.map((body) => body.query).sort(), ["one", "two"]);
	for (const body of bodies) {
		assert.equal(body.numResults, 3);
		assert.deepEqual(body.includeDomains, ["docs.example.com"]);
	}
});

test("caller cancellation rejects the collection and starts no page fetch", async () => {
	const fixture = web(
		{
			cancelled: [{ url: "https://example.com/a", snippet: "cancelled claim" }],
		},
		{ "https://example.com/a": "cancelled claim text." },
		() => fixture.controller.abort(),
	);
	await assert.rejects(
		collectEvidence(ask("cancelled", { fetchContent: true }), fixture.scope),
	);
	assert.equal(fixture.pageRequests().size, 0);
});
