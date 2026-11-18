import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { extractRSCContent } from "../src/rsc-extract.ts";

const element = (tag: string, children: unknown, props = {}) => [
	"$",
	tag,
	null,
	{ ...props, children },
];
const flight = (chunks: [string, unknown][]) =>
	`<script>self.__next_f.push([1,${JSON.stringify(chunks.map(([id, node]) => `${id}:${JSON.stringify(node)}\n`).join(""))}])</script>`;
const paragraph =
	"Useful article text with enough detail to preserve ordinary extraction. ".repeat(
		3,
	);

function assertBounded(html: string): void {
	const child = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
			import assert from 'node:assert/strict';
			import { readFileSync } from 'node:fs';
			import { extractRSCContent } from ${JSON.stringify(new URL("../src/rsc-extract.ts", import.meta.url).href)};
			assert.ok(extractRSCContent(readFileSync(0, 'utf8')) === null, 'Excessive RSC must be declined');
			console.log('RSC-DECLINED');
			`,
		],
		{ input: html, encoding: "utf8", timeout: 2000 },
	);
	assert.equal(child.status, 0, child.stderr || String(child.error));
	assert.equal(child.stdout.trim(), "RSC-DECLINED");
}

function graph(
	depth: number,
	leaf: unknown,
	options: { fanout?: boolean; component?: boolean } = {},
): [string, unknown][] {
	const reference = (index: number) => {
		const tag = `$L${(0x100 + index).toString(16)}`;
		return options.component ? element(tag, null) : tag;
	};
	const chunks: [string, unknown][] = [["23", [reference(0)]]];
	for (let i = 0; i < depth; i++) {
		const next = reference(i + 1);
		chunks.push([
			(0x100 + i).toString(16),
			options.fanout ? [next, next] : [next],
		]);
	}
	chunks.push([(0x100 + depth).toString(16), leaf]);
	return chunks;
}

function tableGraph(
	kind: "rows" | "cells",
	depth: number,
	fanout: boolean,
	component: boolean,
): [string, unknown][] {
	const cell = element("td", fanout ? "" : paragraph);
	const chunks = graph(depth, kind === "rows" ? element("tr", cell) : cell, {
		fanout,
		component,
	});
	chunks[0] = [
		"23",
		element(
			"table",
			kind === "rows"
				? element("nav", "$L100")
				: element("tr", element("$L100", "Heading", { baseId: "heading" })),
		),
	];
	return chunks;
}

test("RSC keeps article Markdown, title, links and literal code markers", () => {
	const html = `<title>Guide | Example</title>${flight([
		[
			"23",
			element("article", [
				element("h1", "Guide"),
				element("p", paragraph),
				element("a", "Reference", { href: "/reference" }),
				element("pre", element("code", "$TOKEN")),
				element("nav", "Hidden navigation"),
			]),
		],
	])}`;
	assert.deepEqual(extractRSCContent(html), {
		title: "Guide",
		content: `# Guide\n\n${paragraph.trim()}\n\n[Reference](/reference)\`\`\`\n$TOKEN\n\`\`\``,
	});
});

test("RSC keeps ordinary repeated references and suppresses cycles without deduplicating occurrences", () => {
	const chunks: [string, unknown][] = [
		["23", ["$L100", element("$L100", null), "$L100"]],
		["100", [element("p", paragraph), "$L100"]],
	];
	assert.equal(
		extractRSCContent(flight(chunks))?.content,
		[paragraph.trim(), paragraph.trim(), paragraph.trim()].join("\n\n"),
	);
});

test("RSC tables preserve repeated row and cell references, headers and Markdown escaping", () => {
	const chunks: [string, unknown][] = [
		[
			"23",
			[
				element("p", paragraph),
				element("table", [
					element("thead", element("tr", element("th", "Column"))),
					element("tbody", ["$L100", element("$L100", null)]),
				]),
			],
		],
		["100", element("tr", ["$L101", element("$L101", null)])],
		["101", element("td", "a|b\\c")],
	];
	assert.equal(
		extractRSCContent(flight(chunks))?.content,
		`${paragraph.trim()}\n\n| Column |  |\n| --- | --- |\n| a\\|b\\\\c | a\\|b\\\\c |\n| a\\|b\\\\c | a\\|b\\\\c |`,
	);
});

test("RSC scans multiple scripts, ignores malformed payloads and orders fallback chunks", () => {
	const html =
		'<script>self.__next_f.push([1,"invalid\\q"])</script>' +
		flight([["2", element("p", "Second fallback paragraph. ".repeat(5))]]) +
		flight([["1", element("p", "First fallback paragraph. ".repeat(5))]]);
	assert.equal(
		extractRSCContent(html)?.content,
		`${"First fallback paragraph. ".repeat(5).trim()}\n\n${"Second fallback paragraph. ".repeat(5).trim()}`,
	);
	assert.equal(extractRSCContent("<html>Not an RSC page</html>"), null);
});

for (const component of [false, true]) {
	test(`RSC declines exponential ${component ? "component" : "string"} reference expansion`, () => {
		assertBounded(flight(graph(26, ["x"], { fanout: true, component })));
	});
	for (const kind of ["rows", "cells"] as const) {
		test(`RSC declines exponential table ${kind} through ${component ? "component" : "string"} references`, () => {
			assertBounded(flight(tableGraph(kind, 26, true, component)));
		});
	}
}

test("RSC bounds traversal work even when repeated references emit no text", () => {
	assertBounded(flight(graph(26, [false], { fanout: true })));
});

test("RSC bounds reference depth in article, row and cell walkers", () => {
	assertBounded(flight(graph(512, [paragraph])));
	assertBounded(flight(tableGraph("rows", 512, false, false)));
	assertBounded(flight(tableGraph("cells", 512, false, false)));
});

test("RSC bounds output before joining a small number of large repeated strings", () => {
	assertBounded(
		flight([
			["23", Array(16).fill("$L100")],
			["100", ["x".repeat(200_000)]],
		]),
	);
});

test("RSC bounds rectangular table padding before allocating its Markdown", () => {
	const wide = element(
		"tr",
		Array.from({ length: 1000 }, () => element("td", "")),
	);
	const narrow = Array.from({ length: 1000 }, () =>
		element("tr", element("td", "")),
	);
	assertBounded(
		flight([["23", element("table", element("nav", [wide, ...narrow]))]]),
	);
});

test("RSC shares its output budget across fallback chunks", () => {
	assertBounded(
		flight(
			Array.from({ length: 8000 }, (_, i): [string, unknown] => [
				(i + 0x100).toString(16),
				[`${i} ${"Fallback article text. ".repeat(10)}`],
			]),
		),
	);
});

test("RSC does not rescan an unterminated script for every apparent opening tag", () => {
	assertBounded('<script>self.__next_f.push([1,"'.repeat(80_000));
});
