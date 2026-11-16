import { basename } from "node:path";
import { type SourceDocument, WebkitError } from "./domain.ts";

const MAX_PDF_PAGES = 100;

export function isPdf(url: string, contentType: string): boolean {
	if (contentType.toLowerCase().includes("application/pdf")) return true;
	try {
		return new URL(url).pathname.toLowerCase().endsWith(".pdf");
	} catch {
		return false;
	}
}

export async function readPdf(
	bytes: Uint8Array,
	url: string,
	signal: AbortSignal,
	maxPages = MAX_PDF_PAGES,
): Promise<SourceDocument> {
	signal.throwIfAborted();
	const { getDocumentProxy } = await import("unpdf");
	const { VerbosityLevel } = await import("unpdf/pdfjs");
	let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
	let metadata: Record<string, unknown> | null;
	const pages: { pageNum: number; text: string }[] = [];
	try {
		// PDF.js may detach the buffer it is given, so it gets a copy.
		pdf = await getDocumentProxy(bytes.slice(), {
			verbosity: VerbosityLevel.ERRORS,
		});
		const info = (await pdf.getMetadata()).info;
		metadata =
			info && typeof info === "object"
				? (info as Record<string, unknown>)
				: null;
		for (
			let pageNum = 1;
			pageNum <= Math.min(pdf.numPages, maxPages);
			pageNum++
		) {
			signal.throwIfAborted();
			const content = await (await pdf.getPage(pageNum)).getTextContent();
			const text = content.items
				.map((item) => (item as { str?: string }).str || "")
				.join(" ")
				.replace(/\s+/g, " ")
				.trim();
			if (text) pages.push({ pageNum, text });
		}
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WebkitError(
			"extraction",
			`PDF extraction failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const title =
		(typeof metadata?.Title === "string" ? metadata.Title.trim() : "") ||
		titleFromUrl(url);
	const author = typeof metadata?.Author === "string" ? metadata.Author : "";
	const pagesToExtract = Math.min(pdf.numPages, maxPages);
	const truncated = pdf.numPages > maxPages;
	const body = pages
		.map((page, index) =>
			index === 0
				? page.text
				: `\n<!-- Page ${page.pageNum} -->\n\n${page.text}`,
		)
		.join("\n");
	const lines = [
		`# ${title}`,
		"",
		`> Source: ${url}`,
		`> Pages: ${pdf.numPages}${truncated ? ` (extracted first ${pagesToExtract})` : ""}`,
	];
	if (author) lines.push(`> Author: ${author}`);
	lines.push("", "---", "");
	if (body) lines.push(body);
	if (truncated)
		lines.push(
			"",
			"---",
			"",
			`*[Truncated: Only first ${pagesToExtract} of ${pdf.numPages} pages extracted]*`,
		);
	return {
		url,
		title,
		text: lines.join("\n"),
		format: "markdown",
		extractor: "pdf",
		truncated,
	};
}

function titleFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		let name = basename(parsed.pathname, ".pdf");
		const arxiv = parsed.hostname.includes("arxiv.org")
			? parsed.pathname.match(/\/(?:pdf|abs)\/(\d+\.\d+)/)
			: null;
		if (arxiv) name = `arxiv-${arxiv[1]}`;
		return (
			name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "document"
		);
	} catch {
		return "document";
	}
}
