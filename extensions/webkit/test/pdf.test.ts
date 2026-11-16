import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPages } from "../src/extract.ts";
import { isPdf, readPdf } from "../src/pdf.ts";
import { documentAt, failureAt, fixture, reply } from "./fixtures/http.ts";
import { makePdf } from "./fixtures/pdf.ts";

const live = () => new AbortController().signal;

test("a local PDF becomes Markdown text with its source and page count", async () => {
	const document = await readPdf(
		makePdf(["Hello from a generated PDF fixture."]),
		"https://example.com/files/annual_report-2025.pdf",
		live(),
	);
	assert.deepEqual(
		{
			url: document.url,
			title: document.title,
			format: document.format,
			extractor: document.extractor,
			truncated: document.truncated,
		},
		{
			url: "https://example.com/files/annual_report-2025.pdf",
			title: "annual report 2025",
			format: "markdown",
			extractor: "pdf",
			truncated: false,
		},
	);
	assert.equal(
		document.text,
		"# annual report 2025\n\n> Source: https://example.com/files/annual_report-2025.pdf\n> Pages: 1\n\n---\n\nHello from a generated PDF fixture.",
	);
});

test("PDF metadata supplies the title and author, and later pages are marked", async () => {
	const document = await readPdf(
		makePdf(["First page text.", "Second page text."], {
			Title: "Quarterly Results",
			Author: "Ada Lovelace",
		}),
		"https://arxiv.org/pdf/2401.12345",
		live(),
	);
	assert.equal(document.title, "Quarterly Results");
	assert.match(
		document.text,
		/^# Quarterly Results\n\n> Source: https:\/\/arxiv\.org\/pdf\/2401\.12345\n> Pages: 2\n> Author: Ada Lovelace\n/,
	);
	assert.match(
		document.text,
		/First page text\.\n\n<!-- Page 2 -->\n\nSecond page text\.$/,
	);
});

test("arXiv URLs without metadata get an arXiv title", async () => {
	assert.equal(
		(
			await readPdf(
				makePdf(["Body."]),
				"https://arxiv.org/pdf/2401.12345",
				live(),
			)
		).title,
		"arxiv 2401.12345",
	);
});

test("pages beyond the page limit are cut and the document says so", async () => {
	const document = await readPdf(
		makePdf(["one", "two", "three"]),
		"https://example.com/a.pdf",
		live(),
		2,
	);
	assert.equal(document.truncated, true);
	assert.match(document.text, /> Pages: 3 \(extracted first 2\)/);
	assert.doesNotMatch(document.text, /three/);
	assert.match(
		document.text,
		/\*\[Truncated: Only first 2 of 3 pages extracted\]\*$/,
	);
});

test("an unreadable PDF fails as an extraction failure and a cancelled read stops", async () => {
	await assert.rejects(
		readPdf(
			new TextEncoder().encode("%PDF-1.4 junk"),
			"https://example.com/bad.pdf",
			live(),
		),
		(error: unknown) =>
			error instanceof Error &&
			"failure" in error &&
			(error as { failure: { kind: string; message: string } }).failure.kind ===
				"extraction" &&
			/^PDF extraction failed: /.test(
				(error as { failure: { message: string } }).failure.message,
			),
	);
	const controller = new AbortController();
	const reason = new Error("stop");
	controller.abort(reason);
	await assert.rejects(
		readPdf(makePdf(["Body."]), "https://example.com/a.pdf", controller.signal),
		(error) => error === reason,
	);
});

test("PDF detection uses the content type or a .pdf path", () => {
	assert.equal(isPdf("https://example.com/download", "application/pdf"), true);
	assert.equal(isPdf("https://example.com/Paper.PDF", ""), true);
	assert.equal(isPdf("https://example.com/paper.pdf.html", "text/html"), false);
});

test("readable fetch extracts PDF responses locally while raw fetch rejects them", async () => {
	const { scope, requests } = fixture(() =>
		reply(makePdf(["Fetched PDF body text."]), {
			"content-type": "application/pdf",
		}),
	);
	const document = documentAt(
		await fetchPages(
			{
				urls: ["https://example.com/doc.pdf"],
				mode: "readable",
				forceClone: false,
				redirects: "follow",
			},
			scope,
		),
	);
	assert.equal(document.extractor, "pdf");
	assert.match(document.text, /Fetched PDF body text\./);
	assert.match(
		failureAt(
			await fetchPages(
				{
					urls: ["https://example.com/doc.pdf"],
					mode: "raw",
					forceClone: false,
					redirects: "follow",
				},
				scope,
			),
			"unsupported",
		).message,
		/application\/pdf/,
	);
	assert.equal(requests.length, 2);
});
