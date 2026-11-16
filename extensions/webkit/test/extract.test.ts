import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
	type FetchRequest,
	type FetchResult,
	type HttpRequest,
	type SourceDocument,
	WebkitError,
} from "../src/domain.ts";
import { extractHtml, fetchPages } from "../src/extract.ts";
import {
	documentAt,
	failureAt,
	fixture,
	type Handler,
	header,
	html,
	isFailure,
	json,
	prefersMarkdown,
	reply,
	untilAborted,
} from "./fixtures/http.ts";

const readable = (...urls: string[]): FetchRequest => ({
	urls,
	mode: "readable",
	forceClone: false,
	redirects: "follow",
});
const raw = (...urls: string[]): FetchRequest => ({
	urls,
	mode: "raw",
	forceClone: false,
	redirects: "follow",
});
const article = (
	body = "<p>The full guide explains every <strong>configuration</strong> option in detail.</p>".repeat(
		20,
	),
) =>
	`<html><head><title>Guide</title></head><body><article><h1>Guide</h1>${body}</article></body></html>`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const exaRequests = (requests: HttpRequest[]) =>
	requests.filter((request) => new URL(request.url).host === "api.exa.ai");

function extractInChild(html: string): SourceDocument {
	const child = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
			import { readFileSync } from 'node:fs';
			import { extractHtml } from ${JSON.stringify(new URL("../src/extract.ts", import.meta.url).href)};
			console.log(JSON.stringify(await extractHtml(readFileSync(0, 'utf8'), 'https://example.com/bounded')));
			`,
		],
		{ input: html, encoding: "utf8", timeout: 3000 },
	);
	assert.equal(child.status, 0, child.stderr || String(child.error));
	return JSON.parse(child.stdout) as SourceDocument;
}

test("readable fetch prefers server Markdown and keeps declared links while raw mode keeps the normal representation", async () => {
	const markdown = `# Install Guide\n\n${"Run `npm install` and configure the project. ".repeat(15)}\n`;
	const { scope, requests } = fixture((request) =>
		prefersMarkdown(request)
			? reply(
					markdown,
					{
						"content-type": "text/markdown; charset=utf-8",
						link: '</openapi.json>; rel="service-desc"',
					},
					200,
					"https://docs.example.com/install",
				)
			: html("<html><body><p>html</p></body></html>"),
	);

	const document = documentAt(
		await fetchPages(readable("https://docs.example.com/install"), scope),
	);
	assert.equal(document.title, "Install Guide");
	assert.equal(document.format, "markdown");
	assert.ok(document.text.startsWith(markdown.trim()));
	assert.match(
		document.text,
		/## Declared links\n\n- Service description \(`service-desc`\): <https:\/\/docs\.example\.com\/openapi\.json>/,
	);

	const rawDocument = documentAt(
		await fetchPages(raw("https://docs.example.com/install"), scope),
	);
	assert.equal(rawDocument.format, "raw");
	assert.match(rawDocument.text, /<p>html<\/p>/);
	assert.equal(requests.length, 2);
	assert.match(header(requests[1], "accept") ?? "", /^text\/html/);
	assert.doesNotMatch(header(requests[1], "accept") ?? "", /text\/markdown/);
});

test("fetch retains ordered original URLs for redirected, failed and duplicate inputs", async () => {
	const urls = [
		"https://example.com/denied",
		"https://example.com/original",
		"https://example.com/original",
	];
	const { scope } = fixture((request) =>
		request.url.endsWith("/denied")
			? reply("Denied", {}, 403, request.url)
			: reply(
					"Canonical page body",
					{ "content-type": "text/plain" },
					200,
					"https://example.com/canonical",
				),
	);
	const result = await fetchPages(readable(...urls), scope);
	assert.deepEqual(result.requestedUrls, urls);
	assert.deepEqual(
		result.items.map((item) => item.index),
		[0, 1, 2],
	);
	assert.match(failureAt(result, "network", 0).message, /HTTP 403/);
	assert.equal(documentAt(result, 1).text, "Canonical page body");
	assert.equal(documentAt(result, 2).text, "Canonical page body");
});

test("direct fetch sends the compatible User-Agent unless an operator curl transport supplies its own", async () => {
	const { scope, requests } = fixture(() =>
		reply("body", { "content-type": "text/plain" }),
	);
	await fetchPages(raw("https://example.com/a"), scope);
	assert.equal(
		header(requests[0], "user-agent"),
		"OpenAI File Downloader, XaiImageApiFetch/1.0",
	);

	const curl = fixture(() => reply("body", { "content-type": "text/plain" }), {
		curlCommand: "/opt/curl-impersonate",
	});
	await fetchPages(raw("https://example.com/a"), curl.scope);
	assert.equal(header(curl.requests[0], "user-agent"), undefined);
});

test("readable mode converts a mixed-case HTML article to Markdown through Readability and Turndown", async () => {
	const { scope } = fixture(() =>
		reply(article(), { "content-type": "Text/HTML; charset=UTF-8" }),
	);
	const document = documentAt(
		await fetchPages(readable("https://example.com/guide"), scope),
	);
	assert.equal(document.title, "Guide");
	assert.equal(document.extractor, "readability");
	assert.equal(document.format, "markdown");
	assert.match(document.text, /explains every \*\*configuration\*\* option/);
	assert.doesNotMatch(document.text, /<(?:html|article|p|strong)\b/i);
});

test("readable requests retain a 20 MiB PDF budget without changing the page or raw budget", async () => {
	const { scope, requests } = fixture(() =>
		reply("%PDF-1.4 invalid", { "content-type": "application/pdf" }),
	);
	await fetchPages(
		readable("https://example.com/download", "https://example.com/manual.pdf"),
		scope,
	);
	await fetchPages(raw("https://example.com/download"), scope);
	assert.equal(requests.length, 3);
	assert.deepEqual(
		requests.map((request) => request.pdfMaxBytes),
		[20 * 1024 * 1024, 20 * 1024 * 1024, undefined],
	);
	assert.ok(requests.every((request) => request.maxBytes === 5_242_880));
});

test("binary content is unsupported in readable mode and never reaches hosted extraction", async () => {
	for (const contentType of [
		"application/zip",
		"Application/ZIP",
		"image/png",
	]) {
		const { scope, requests } = fixture(
			(request) =>
				reply(
					new Uint8Array([80, 75, 3, 4]),
					{ "content-type": contentType },
					200,
					request.url,
				),
			{ hostedExtraction: true, exaApiKey: "exa-key-123456" },
		);
		const failure = failureAt(
			await fetchPages(readable("https://example.com/archive"), scope),
			"unsupported",
		);
		assert.match(
			failure.message,
			new RegExp(
				`Unsupported content type: ${contentType.toLowerCase().replace("/", "\\/")}`,
			),
		);
		assert.deepEqual(exaRequests(requests), []);
	}
});

test("a near-empty negotiated Markdown reply falls back to the page HTML", async () => {
	const { scope } = fixture((request) =>
		prefersMarkdown(request)
			? reply("# Loading", { "content-type": "text/markdown" })
			: html(article()),
	);
	const document = documentAt(
		await fetchPages(readable("https://spa.example.com/guide"), scope),
	);
	assert.match(document.text, /explains every \*\*configuration\*\* option/);
	assert.doesNotMatch(document.text, /Extraction warning/);
});

const shortMarkdown = "# Changelog\n\n- 1.0 released";
async function negotiate(
	normal: Handler,
	markdown: Handler = () =>
		reply(shortMarkdown, { "content-type": "text/markdown" }),
) {
	const { scope, requests } = fixture((request, signal) =>
		prefersMarkdown(request)
			? markdown(request, signal)
			: normal(request, signal),
	);
	return {
		result: await fetchPages(
			readable("https://docs.example.com/changelog"),
			scope,
		),
		requests,
	};
}

test("short negotiated Markdown is kept, marked incomplete, only when the browser retry has no content", async () => {
	const plain = documentAt(
		(
			await negotiate(() =>
				reply("Plain changelog text", { "content-type": "text/plain" }),
			)
		).result,
	);
	assert.equal(plain.text, "Plain changelog text");
	assert.equal(plain.format, "text");

	for (const [normal, retryError] of [
		[() => reply("", { "content-type": "text/plain" }), null],
		[
			() =>
				reply("", {
					"content-type": "text/markdown",
					link: '</openapi.json>; rel="service-desc"',
				}),
			null,
		],
		[() => reply("unavailable", {}, 503), "HTTP 503"],
	] as const) {
		const document = documentAt((await negotiate(normal)).result);
		assert.match(document.text, /1\.0 released/);
		assert.ok(
			document.text.startsWith(
				`[Extraction warning: Extracted content appears incomplete${retryError ? `\nBrowser retry failed: ${retryError}` : ""}`,
			),
			document.text,
		);
	}

	const empty = documentAt(
		(
			await negotiate(
				() => reply("", { "content-type": "text/plain" }),
				() => reply("", { "content-type": "text/markdown" }),
			)
		).result,
	);
	assert.equal(empty.text, "");
});

test("authoritative browser retry failures replace short negotiated Markdown", async () => {
	const zip = await negotiate(() =>
		reply(new Uint8Array([80, 75, 3, 4]), {
			"content-type": "application/zip",
		}),
	);
	assert.match(
		failureAt(zip.result, "unsupported").message,
		/^Unsupported content type: application\/zip/,
	);
	assert.equal(zip.requests.length, 2);

	const policy = await negotiate(() => {
		throw new WebkitError("blocked-url", "Blocked internal address 127.0.0.1.");
	});
	assert.match(
		failureAt(policy.result, "blocked-url").message,
		/Blocked internal/,
	);

	const gone = await negotiate(() => reply("gone", {}, 404));
	const failure = failureAt(gone.result, "not-found");
	assert.match(failure.message, /HTTP 404/);
	assert.match(failure.message, /web_search/);
	assert.doesNotMatch(failure.message, /1\.0 released/);
});

test("caller cancellation during the browser retry rejects the whole fetch as cancelled", async () => {
	const controller = new AbortController();
	const { scope } = fixture(
		(request) => {
			if (prefersMarkdown(request))
				return reply(shortMarkdown, { "content-type": "text/markdown" });
			controller.abort();
			throw new DOMException("This operation was aborted", "AbortError");
		},
		{},
		{ signal: controller.signal },
	);
	await assert.rejects(
		fetchPages(readable("https://docs.example.com/changelog"), scope),
		isFailure("cancelled"),
	);
});

test("raw mode returns exact textual bodies, including non-2xx bodies and data URIs, but rejects binary and PDF bodies", async () => {
	const body = "exact data:text/plain,hello%20world body";
	const { scope, requests } = fixture(
		(request) => {
			if (request.url.endsWith(".png"))
				return reply(new Uint8Array([137, 80, 78, 71]), {
					"content-type": "image/png",
				});
			if (request.url.endsWith(".pdf"))
				return reply("%PDF-1.4 junk", { "content-type": "application/pdf" });
			if (request.url.endsWith("/data"))
				return reply(body, { "content-type": "text/plain" });
			return reply(
				'{"error":"missing"}',
				{ "content-type": "application/json; charset=utf-8" },
				404,
			);
		},
		{ hostedExtraction: true, exaApiKey: "exa-key-123456" },
	);

	const result = await fetchPages(
		raw(
			"https://example.com/missing",
			"https://example.com/pixel.png",
			"https://example.com/list.pdf",
			"https://example.com/data",
		),
		scope,
	);
	assert.equal(documentAt(result, 0).text, '{"error":"missing"}');
	assert.match(
		failureAt(result, "unsupported", 1).message,
		/Unsupported content type in raw mode: image\/png$/,
	);
	assert.match(
		failureAt(result, "unsupported", 2).message,
		/Unsupported content type in raw mode: application\/pdf; retry in readable mode/,
	);
	assert.equal(documentAt(result, 3).text, body);
	assert.deepEqual(exaRequests(requests), []);
});

test("readable mode replaces inline data URIs with bounded omission markers", async () => {
	const pixel =
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
	const { scope } = fixture(() =>
		reply(
			`Intro data:text/plain,hello%20world and ![pixel](data:image/png;base64,${pixel}) end`,
			{ "content-type": "text/plain" },
		),
	);
	const document = documentAt(
		await fetchPages(readable("https://example.com/data"), scope),
	);
	assert.doesNotMatch(document.text, /hello%20world|iVBORw0K/);
	assert.match(
		document.text,
		/^Intro \[inline data URI omitted; mime=text\/plain; encoding=percent-encoded; encodedBytes=13; sha256=[0-9a-f]{64}\] and !\[pixel\]\(\[inline data URI omitted; mime=image\/png; encoding=base64; encodedBytes=\d+; sha256=[0-9a-f]{64}\]\) end$/,
	);
});

test("a complete short static page is accepted while short scripted or teaser pages are reported incomplete with counts", async () => {
	const page = async (body: string) => {
		const { scope } = fixture(() => html(body));
		return documentAt(
			await fetchPages(readable("https://example.com/page"), scope),
		);
	};
	const dataBlocks =
		'<script type="application/ld+json">{"@type":"Article"}</script>'.repeat(
			4,
		) + '<script type="text/template"><p>row</p></script>';
	const short = await page(
		`<html><head><title>Short Note</title>${dataBlocks}</head><body><h1>Short Note</h1><p>This page is intentionally short and complete.</p></body></html>`,
	);
	assert.equal(short.title, "Short Note");
	assert.match(short.text, /^[^[]*intentionally short and complete/);

	for (const script of [
		'<script src="/app.js"></script>',
		'<script type="text/jscript" src="/app.js"></script>',
	]) {
		const scripted = await page(
			`<html><head><title>Short Note</title>${script}</head><body><h1>Short Note</h1><p>This page is intentionally short and complete.</p></body></html>`,
		);
		assert.match(
			scripted.text,
			/^\[Extraction warning: Extracted content appears incomplete: the page has only \d+ characters of visible text and runs scripts/,
		);
		assert.match(scripted.text, /intentionally short and complete/);
	}

	const links = Array.from(
		{ length: 40 },
		(_, i) =>
			`<li><a href="/section-${i}">Navigation section number ${i}</a></li>`,
	).join("");
	const teaser = await page(
		`<html><head><title>Teaser</title></head><body><nav><ul>${links}</ul></nav><article><h1>Teaser</h1><p>Only the first paragraph of this story is shown here.</p></article><footer><ul>${links}</ul></footer></body></html>`,
	);
	assert.match(
		teaser.text,
		/^\[Extraction warning: Extracted content appears incomplete: extracted 53 characters from a page with \d{4} characters of visible text/,
	);
});

test("weak Readability output falls back to useful RSC content and keeps the RSC title and declared links", async () => {
	const body = "RSC article content survives the loading shell. ".repeat(20);
	const payload = `23:${JSON.stringify(["$", "article", null, { children: ["$", "p", null, { children: body }] }])}\n`;
	const { scope } = fixture(() =>
		html(
			`<!doctype html><html><head><title>RSC article</title></head><body><article>Loading...</article><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`,
			{ link: '</openapi.json>; rel="service-desc"' },
		),
	);
	const document = documentAt(
		await fetchPages(readable("https://example.com/rsc"), scope),
	);
	assert.equal(document.extractor, "rsc");
	assert.equal(document.title, "RSC article");
	assert.match(document.text, /RSC article content survives the loading shell/);
	assert.match(document.text, /https:\/\/example\.com\/openapi\.json/);
});

test("RSC budget exhaustion leaves useful local Defuddle recovery available", () => {
	const chunks = ['23:["$L100"]'];
	for (let i = 0; i < 26; i++) {
		const id = (0x100 + i).toString(16);
		const next = `$L${(0x101 + i).toString(16)}`;
		chunks.push(`${id}:${JSON.stringify([next, next])}`);
	}
	chunks.push('11a:["x"]');
	const body =
		"Useful Defuddle content after declining excessive RSC expansion. ".repeat(
			20,
		);
	const document = extractInChild(
		`<!doctype html><html><head><title>Bounded fallback</title></head><body><article>Loading...</article><aside><main>${body}</main></aside><script>self.__next_f.push([1,${JSON.stringify(chunks.join("\n"))}])</script></body></html>`,
	);
	assert.equal(document.extractor, "defuddle");
	assert.equal(document.title, "Bounded fallback");
	assert.match(
		document.text,
		/Useful Defuddle content after declining excessive RSC expansion/,
	);
});

test("unclosed body tags do not stall the incomplete-content check", () => {
	const document = extractInChild(
		`<html><head><title>Bounded body scan</title></head><body><article>Loading...</article><!--${"<body>".repeat(100_000)}--></html>`,
	);
	assert.equal(document.extractor, "readability");
	assert.equal(document.title, "Bounded body scan");
	assert.equal(document.text, "Loading...");
});

for (const tag of ["script", "style"]) {
	test(`unclosed ${tag} tags do not stall the incomplete-content check`, () => {
		const document = extractInChild(
			`<html><head><title>Bounded scan</title></head><body><article>Loading...</article><!--${`<${tag}>`.repeat(100_000)}--></body></html>`,
		);
		assert.equal(document.extractor, "readability");
		assert.equal(document.title, "Bounded scan");
		assert.ok(document.text.endsWith("Loading..."));
		if (tag === "script") assert.match(document.text, /JavaScript-rendered/);
		else assert.equal(document.text, "Loading...");
	});
}

test("unclosed generic tags do not stall the incomplete-content check", () => {
	const document = extractInChild(
		`<html><head><title>Bounded tag scan</title></head><body><article>Loading...</article><!--${"<".repeat(100_000)}</body></html>`,
	);
	assert.equal(document.extractor, "readability");
	assert.equal(document.title, "Bounded tag scan");
	assert.equal(document.text, "Loading...");
});

test("unterminated script opening tags do not stall script counting", () => {
	const document = extractInChild(
		`<html><head><title>Script count</title></head><body><article>Loading...</article></body></html><!--${"<script ".repeat(100_000)}`,
	);
	assert.equal(document.title, "Script count");
	assert.equal(document.text, "Loading...");
});

test("mixed-case script and style contents do not count as visible text", () => {
	const hidden = "Not visible article content. ".repeat(30);
	const document = extractInChild(
		`<html><head><title>Hidden contents</title></head><body><article><p>Loading...</p></article><ScRiPt>${hidden}</sCrIpT><StYlE>${hidden}</sTyLe>${'<script src="/app.js"></script>'.repeat(3)}</body></html>`,
	);
	assert.equal(document.extractor, "readability");
	assert.equal(document.title, "Hidden contents");
	assert.equal(
		document.text,
		"[Extraction warning: Page appears to be JavaScript-rendered (content loads dynamically)]\n\nLoading...",
	);
});

test("null or short Readability output falls back to local Defuddle without another request or console noise", async (t) => {
	const warn = console.warn;
	const warnings: unknown[] = [];
	console.warn = (...args) => {
		warnings.push(args);
	};
	t.after(() => {
		console.warn = warn;
	});

	const body =
		"Useful local Defuddle fallback content with enough detail. ".repeat(20);
	const { scope, requests } = fixture(() =>
		html(
			`<!doctype html><html><head><title>Defuddle article</title><link rel="canonical" href="/relative-canonical"></head><body><aside><main>${body}</main></aside></body></html>`,
			{ link: '</openapi.json>; rel="service-desc"' },
		),
	);
	const document = documentAt(
		await fetchPages(readable("https://example.com/defuddle-null"), scope),
	);
	assert.equal(requests.length, 1);
	assert.equal(document.extractor, "defuddle");
	assert.equal(document.title, "Defuddle article");
	assert.match(document.text, /Useful local Defuddle fallback content/);
	assert.match(document.text, /https:\/\/example\.com\/openapi\.json/);
	assert.deepEqual(warnings, []);

	const after =
		"Useful Defuddle content after the short Readability article. ".repeat(20);
	const short = fixture(() =>
		html(
			`<!doctype html><html><head><title>Short article fallback</title></head><body><article>Loading...</article><aside><main>${after}</main></aside></body></html>`,
		),
	);
	const shortDocument = documentAt(
		await fetchPages(
			readable("https://example.com/defuddle-short"),
			short.scope,
		),
	);
	assert.equal(shortDocument.extractor, "defuddle");
	assert.equal(shortDocument.title, "Short article fallback");
	assert.match(
		shortDocument.text,
		/Useful Defuddle content after the short Readability article/,
	);
});

test("Defuddle processing failures stay contained and never return the fallback body", async (t) => {
	const error = console.error;
	const errors: unknown[] = [];
	console.error = (...args) => {
		errors.push(args);
	};
	t.after(() => {
		console.error = error;
	});
	const paragraph =
		"This is substantial article text that should be extracted as the page's main content. ";
	const { scope } = fixture(() =>
		html(
			`<!doctype html><html><head><title>Defuddle selector failure</title></head><body><nav><a href="/">Home</a></nav><template id="B:0"></template><div hidden id="S:a"><h1>Defuddle selector failure</h1><p>${paragraph.repeat(20)}</p></div><template id="P:a"></template><footer><p>Copyright 2026 Example Inc. All rights reserved.</p></footer></body></html>`,
		),
	);
	const failure = failureAt(
		await fetchPages(
			readable("https://example.com/defuddle-selector-failure"),
			scope,
		),
		"extraction",
	);
	assert.deepEqual(errors, []);
	assert.match(
		failure.message,
		/Defuddle failed to process document: Unknown pseudo-class :a/,
	);
	assert.doesNotMatch(failure.message, /Copyright 2026/);
});

test("short client-rendered placeholders and short RSC payloads do not pass as complete pages", async () => {
	const notComplete = (result: FetchResult) => {
		const item = result.items[0];
		assert.ok(
			item?.status === "failed" ||
				result.documents[item!.value]?.text.startsWith("[Extraction warning:"),
			JSON.stringify(result),
		);
	};
	const placeholder = fixture(() =>
		html(
			'<!doctype html><html><head><title>Short</title></head><body><article>Loading...</article><script src="/app.js"></script></body></html>',
		),
	);
	notComplete(
		await fetchPages(readable("https://example.com/short"), placeholder.scope),
	);

	const payload = `23:${JSON.stringify(["$", "article", null, { children: "Short RSC content" }])}\n`;
	const rsc = fixture(() =>
		html(
			`<!doctype html><html><head><title>Short RSC</title></head><body><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></body></html>`,
		),
	);
	notComplete(
		await fetchPages(readable("https://example.com/short-rsc"), rsc.scope),
	);
});

test("a page with little text and many executable scripts is reported as JavaScript-rendered", async () => {
	const scripts = '<script src="/a.js"></script>'.repeat(4);
	const { scope } = fixture(() =>
		html(
			`<html><head><title>App</title></head><BoDy class="app"><div id="root"></div>${scripts}</bOdY></html>`,
		),
	);
	const failure = failureAt(
		await fetchPages(readable("https://example.com/app"), scope),
		"extraction",
	);
	assert.match(failure.message, /JavaScript-rendered/);
});

test("Cloudflare challenges fail readable extraction, while lookalikes and raw bodies stay content", async () => {
	const challenge =
		'<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script><script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script></body></html>';
	const header = fixture(() =>
		reply("checking", {
			"content-type": "text/plain",
			"cf-mitigated": "challenge",
		}),
	);
	assert.match(
		failureAt(
			await fetchPages(readable("https://example.com/a"), header.scope),
			"extraction",
		).message,
		/Cloudflare challenge/,
	);
	const body = fixture(() => html(challenge));
	assert.match(
		failureAt(
			await fetchPages(readable("https://example.com/a"), body.scope),
			"extraction",
		).message,
		/Cloudflare challenge/,
	);

	const text = fixture(() =>
		reply(challenge, { "content-type": "text/plain" }),
	);
	assert.equal(
		documentAt(await fetchPages(readable("https://example.com/a"), text.scope))
			.text,
		challenge,
	);
	const generic = fixture(() =>
		html(
			article().replace(
				"<title>Guide</title>",
				"<title>Just a moment...</title>",
			),
		),
	);
	assert.equal(
		documentAt(
			await fetchPages(readable("https://example.com/a"), generic.scope),
		).extractor,
		"readability",
	);
	const rawChallenge = fixture(() =>
		html(challenge, { "cf-mitigated": "challenge" }),
	);
	assert.equal(
		documentAt(
			await fetchPages(raw("https://example.com/a"), rawChallenge.scope),
		).text,
		challenge,
	);
});

test("hosted Exa extraction runs only after a recoverable readable failure when the operator enabled it", async () => {
	const challenge: Handler = (request) =>
		new URL(request.url).host === "api.exa.ai"
			? json({
					results: [
						{
							url: "https://example.com/a",
							title: "Hosted",
							text: "Hosted page text from Exa.",
						},
					],
				})
			: reply("checking", {
					"content-type": "text/plain",
					"cf-mitigated": "challenge",
				});

	const off = fixture(challenge, { exaApiKey: "exa-key-123456" });
	failureAt(
		await fetchPages(readable("https://example.com/a"), off.scope),
		"extraction",
	);
	assert.deepEqual(exaRequests(off.requests), []);

	const on = fixture(challenge, {
		hostedExtraction: true,
		exaApiKey: "exa-key-123456",
	});
	const document = documentAt(
		await fetchPages(readable("https://example.com/a"), on.scope),
	);
	assert.equal(document.extractor, "exa");
	assert.match(document.text, /Hosted page text from Exa/);
	assert.equal(exaRequests(on.requests).length, 1);

	const rawOn = fixture(challenge, {
		hostedExtraction: true,
		exaApiKey: "exa-key-123456",
	});
	documentAt(await fetchPages(raw("https://example.com/a"), rawOn.scope));
	assert.deepEqual(exaRequests(rawOn.requests), []);

	const sameOrigin = fixture(challenge, {
		hostedExtraction: true,
		exaApiKey: "exa-key-123456",
	});
	failureAt(
		await fetchPages(
			{ ...readable("https://example.com/a"), redirects: "same-origin" },
			sameOrigin.scope,
		),
		"extraction",
	);
	assert.deepEqual(exaRequests(sameOrigin.requests), []);
});

test("a failed hosted fallback keeps the direct failure", async () => {
	const { scope, requests } = fixture(
		(request) =>
			new URL(request.url).host === "api.exa.ai"
				? json({ error: "nope" }, 500)
				: reply("down", {}, 502),
		{ hostedExtraction: true, exaApiKey: "exa-key-123456" },
	);
	const failure = failureAt(
		await fetchPages(readable("https://example.com/a"), scope),
		"network",
	);
	assert.match(failure.message, /HTTP 502/);
	assert.equal(exaRequests(requests).length, 1);
});

test("HTTP 429 is a quota failure that carries Retry-After", async () => {
	const { scope } = fixture(() =>
		reply("slow down", { "retry-after": "7" }, 429),
	);
	const failure = failureAt(
		await fetchPages(readable("https://example.com/a"), scope),
		"quota",
	);
	assert.equal(failure.retryAfterMs, 7000);
});

test("the same-origin redirect constraint reaches every direct request", async () => {
	const { scope, requests } = fixture(() => html(article()));
	await fetchPages(
		{ ...readable("https://example.com/a"), redirects: "same-origin" },
		scope,
	);
	await fetchPages(
		{ ...raw("https://example.com/a"), redirects: "same-origin" },
		scope,
	);
	assert.deepEqual(
		requests.map((request) => request.redirects),
		["same-origin", "same-origin"],
	);
	assert.ok(
		requests.every(
			(request) => request.maxBytes === scope.settings.maxResponseBytes,
		),
	);
});

test("batches keep per-URL outcomes in request order and run at most three pages at once", async () => {
	let active = 0;
	let peak = 0;
	const { scope } = fixture(async (request) => {
		active++;
		peak = Math.max(peak, active);
		await sleep(15);
		active--;
		return request.url.endsWith("/bad")
			? reply("missing", {}, 404)
			: reply(`page ${request.url}`, { "content-type": "text/plain" });
	});
	const urls = [
		"https://example.com/1",
		"https://example.com/bad",
		"https://example.com/3",
		"https://example.com/4",
		"https://example.com/5",
		"https://example.com/6",
	];
	const result = await fetchPages(readable(...urls), scope);
	assert.equal(peak, 3);
	assert.equal(result.kind, "fetch");
	assert.deepEqual(
		result.items.map((item) => item.index),
		[0, 1, 2, 3, 4, 5],
	);
	failureAt(result, "not-found", 1);
	for (const index of [0, 2, 3, 4, 5])
		assert.equal(documentAt(result, index).text, `page ${urls[index]}`);
	assert.equal(result.documents.length, 5);
});

test("the request deadline turns a hung or late page into a timeout without cancelling the caller", async () => {
	const hung = fixture((_request, signal) => untilAborted(signal), {
		timeoutMs: 40,
	});
	assert.match(
		failureAt(
			await fetchPages(readable("https://example.com/a"), hung.scope),
			"timeout",
		).message,
		/timed out/i,
	);
	assert.equal(hung.scope.signal.aborted, false);

	const late = fixture(
		async () => {
			await sleep(80);
			return html(article());
		},
		{ timeoutMs: 30 },
	);
	failureAt(
		await fetchPages(readable("https://example.com/a"), late.scope),
		"timeout",
	);
});

test("declared text charsets decode before extraction", async () => {
	const { scope } = fixture(() =>
		reply(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), {
			"content-type": "text/plain; charset=iso-8859-1",
		}),
	);
	assert.equal(
		documentAt(await fetchPages(readable("https://example.com/a"), scope)).text,
		"café",
	);
});

test("the pure HTML seam extracts a document or throws a classified extraction failure", async () => {
	const document = await extractHtml(article(), "https://example.com/guide");
	assert.deepEqual(
		{
			url: document.url,
			title: document.title,
			format: document.format,
			extractor: document.extractor,
			truncated: document.truncated,
		},
		{
			url: "https://example.com/guide",
			title: "Guide",
			format: "markdown",
			extractor: "readability",
			truncated: false,
		},
	);
	assert.match(document.text, /explains every \*\*configuration\*\* option/);
	await assert.rejects(
		extractHtml("<html><body></body></html>", "https://example.com/empty"),
		isFailure("extraction"),
	);
});
