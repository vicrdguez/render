// Passage selection and hashing are adapted from pi-web-access 0.46 source-check.ts (MIT, see LICENSE).
import { createHash } from "node:crypto";
import {
	type EvidenceRequest,
	type EvidenceResult,
	type Failure,
	failureOf,
	type Passage,
	type RequestScope,
	type SearchHit,
	type SourceDocument,
	WebkitError,
} from "./domain.ts";
import { fetchPages } from "./extract.ts";
import { search } from "./search.ts";

const MAX_SOURCES = 20;
const FETCHED_SOURCES = 5;
const PAGE_PASSAGES = 3;
const MAX_SENTENCE = 400;

interface Span {
	text: string;
	start: number;
	end: number;
}

const hash = (text: string) =>
	`sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;

function stopIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	const failure = failureOf(undefined, signal);
	throw new WebkitError(failure.kind, failure.message);
}

function tokenize(value: string): string[] {
	return [
		...new Set(
			value
				.split(/[^A-Za-z0-9]+/)
				.filter(
					(term) =>
						term.length > 3 || (term.length > 1 && /^[A-Z0-9]+$/.test(term)),
				)
				.map((term) => (term.length > 3 ? term.toLowerCase() : term)),
		),
	];
}

function countMatches(terms: string[], text: string): number {
	const lower = text.toLowerCase();
	const words = new Set(text.split(/[^A-Za-z0-9]+/));
	return terms.filter((term) =>
		term.length > 3 ? lower.includes(term) : words.has(term),
	).length;
}

function relevantSpans(
	content: string,
	claim: string,
	snippet: string,
): Span[] {
	const sentences: Span[] = [];
	// or the end, so "example.com" stays inside its sentence. The lookbehind keeps the scan linear on runs like "!!!".
	const boundary = /(?<![.!?])[.!?]+(?:["'”’)\]*_]|\[\d+\])*(?=\s|$)/g;
	let segmentStart = 0;
	const addSentence = (end: number) => {
		const raw = content.slice(segmentStart, end);
		const text = raw.trim();
		if (text.length > 0 && text.length <= MAX_SENTENCE) {
			const start = segmentStart + raw.indexOf(text);
			sentences.push({ text, start, end: start + text.length });
		}
		segmentStart = end;
	};
	for (const match of content.matchAll(boundary))
		addSentence(match.index + match[0].length);
	addSentence(content.length);
	const claimTerms = tokenize(claim);
	const snippetTerms = tokenize(snippet);
	return sentences
		.map((sentence, index) => ({
			sentence,
			index,
			claim: countMatches(claimTerms, sentence.text),
			snippet: countMatches(snippetTerms, sentence.text),
		}))
		.filter((item) => item.claim + item.snippet > 0)
		.sort(
			(a, b) => b.claim - a.claim || b.snippet - a.snippet || a.index - b.index,
		)
		.slice(0, PAGE_PASSAGES)
		.map(({ sentence }) => sentence);
}

export async function collectEvidence(
	request: EvidenceRequest,
	scope: RequestScope,
): Promise<EvidenceResult> {
	const searched = await search(
		{
			queries: request.queries,
			...(request.provider ? { provider: request.provider } : {}),
			controls: request.controls,
			includeContent: false,
		},
		scope,
	);
	stopIfAborted(scope.signal);
	const hits = searched.queries.flatMap((outcome) =>
		outcome.status === "ok" ? outcome.value.hits : [],
	);
	const sources: SearchHit[] = [];
	for (const hit of hits)
		if (
			sources.length < MAX_SOURCES &&
			!sources.some((source) => source.url === hit.url)
		)
			sources.push(hit);

	let documents: SourceDocument[] = [];
	const fetchFailures: Failure[] = [];
	const pages = new Map<string, number>();
	if (request.fetchContent && sources.length > 0) {
		const urls = sources.slice(0, FETCHED_SOURCES).map((source) => source.url);
		try {
			const fetched = await fetchPages(
				{ urls, mode: "readable", forceClone: false, redirects: "follow" },
				scope,
			);
			documents = fetched.documents;
			for (const item of fetched.items) {
				if (item.status === "ok") pages.set(urls[item.index]!, item.value);
				else fetchFailures.push(item.failure);
			}
		} catch (error) {
			stopIfAborted(scope.signal);
			fetchFailures.push(failureOf(error, scope.signal));
		}
		stopIfAborted(scope.signal);
		for (const hit of hits) {
			const documentIndex = pages.get(hit.url);
			if (documentIndex !== undefined) hit.documentIndex = documentIndex;
		}
	}

	const passages: Passage[] = [];
	for (const source of sources) {
		if (source.snippet.trim())
			passages.push({
				url: source.url,
				text: source.snippet,
				contentHash: hash(source.snippet),
				origin: "snippet",
			});
		const documentIndex = pages.get(source.url);
		const body =
			documentIndex === undefined ? "" : (documents[documentIndex]?.text ?? "");
		if (!body) continue;
		const bodyHash = hash(body);
		for (const span of relevantSpans(body, request.claim, source.snippet))
			passages.push({
				url: source.url,
				text: span.text,
				start: span.start,
				end: span.end,
				contentHash: bodyHash,
				origin: "page",
			});
	}
	return {
		kind: "evidence",
		claim: request.claim,
		assessment: "unassessed",
		documents,
		queries: searched.queries,
		passages,
		fetchFailures,
	};
}
