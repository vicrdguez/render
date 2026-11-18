const MAX_WORK = 20_000;
const MAX_DEPTH = 128;
const MAX_OUTPUT_CHARS = 1_000_000;
const BUDGET_EXHAUSTED = Symbol("RSC extraction budget exhausted");

export interface RSCExtractResult {
	title: string;
	content: string;
}

export function extractRSCContent(html: string): RSCExtractResult | null {
	if (!html.includes("self.__next_f.push")) {
		return null;
	}

	const chunkMap = new Map<string, string>();
	const scriptStart = '<script>self.__next_f.push([1,"';
	let cursor = 0;
	while (cursor < html.length) {
		const start = html.indexOf(scriptStart, cursor);
		if (start < 0) break;
		const end = html.indexOf("</script>", start + scriptStart.length);
		if (end < 0) break;
		cursor = end + "</script>".length;
		if (html.slice(end - 3, end) !== '"])') continue;

		let content: string;
		try {
			content = JSON.parse(
				'"' + html.slice(start + scriptStart.length, end - 3) + '"',
			);
		} catch {
			continue;
		}

		// Flight lines are "id:payload" with hex chunk IDs of at most four characters.
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;

			const colonIdx = line.indexOf(":");
			if (colonIdx <= 0 || colonIdx > 4) continue;

			const id = line.slice(0, colonIdx);
			if (!/^[0-9a-f]+$/i.test(id)) continue;

			const payload = line.slice(colonIdx + 1);
			if (!payload) continue;

			const existing = chunkMap.get(id);
			if (!existing || payload.length > existing.length) {
				chunkMap.set(id, payload);
			}
		}
	}

	if (chunkMap.size === 0) return null;

	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
	const title = titleMatch?.[1]?.split("|")[0]?.trim() || "";

	const parsedCache = new Map<string, unknown>();

	function getParsedChunk(id: string): unknown | null {
		if (parsedCache.has(id)) return parsedCache.get(id);

		const chunk = chunkMap.get(id);
		if (!chunk || !chunk.startsWith("[")) {
			parsedCache.set(id, null);
			return null;
		}

		try {
			const parsed = JSON.parse(chunk);
			parsedCache.set(id, parsed);
			return parsed;
		} catch {
			parsedCache.set(id, null);
			return null;
		}
	}

	type Node = unknown;
	type Context = { inTable: boolean; inCode: boolean };
	const visitedRefs = new Set<string>();
	const budget = { work: MAX_WORK, output: MAX_OUTPUT_CHARS };

	function visit(depth: number): void {
		if (--budget.work < 0 || depth > MAX_DEPTH) throw BUDGET_EXHAUSTED;
	}

	function spendOutput(length: number): void {
		budget.output -= length;
		if (budget.output < 0) throw BUDGET_EXHAUSTED;
	}

	function extractNode(
		node: Node,
		ctx: Context = { inTable: false, inCode: false },
		depth = 0,
	): string {
		visit(depth);
		const text = renderNode(node, ctx, depth);
		spendOutput(text.length);
		return text;
	}

	function renderNode(node: Node, ctx: Context, depth: number): string {
		if (node === null || node === undefined) return "";

		if (typeof node === "string") {
			const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
			if (refMatch) {
				const refId = refMatch[1]!;
				if (visitedRefs.has(refId)) return "";
				visitedRefs.add(refId);
				const refNode = getParsedChunk(refId);
				const result = refNode ? extractNode(refNode, ctx, depth + 1) : "";
				visitedRefs.delete(refId);
				return result;
			}
			// Strings such as "$undefined" and "$Sreact.suspense" are flight markers, except inside code.
			if (
				!ctx.inCode &&
				(node === "$undefined" || node === "$" || /^\$[A-Z]/.test(node))
			)
				return "";
			return node.trim() ? node : "";
		}

		if (typeof node === "number") return String(node);
		if (typeof node === "boolean") return "";
		if (!Array.isArray(node)) return "";

		// Flight elements are ["$", tag, key, props].
		if (node[0] === "$" && typeof node[1] === "string") {
			const tag = node[1] as string;
			const props = (node[3] || {}) as Record<string, unknown>;

			const skipTags = [
				"script",
				"style",
				"svg",
				"path",
				"circle",
				"link",
				"meta",
				"template",
				"button",
				"input",
				"nav",
				"footer",
				"aside",
			];
			if (skipTags.includes(tag)) return "";

			if (tag.startsWith("$L")) {
				const refId = tag.slice(2);
				if (visitedRefs.has(refId)) return "";

				if (props.baseId && props.children) {
					return `## ${String(props.children)}\n\n`;
				}

				visitedRefs.add(refId);
				const refNode = getParsedChunk(refId);
				let result = "";
				if (refNode) {
					result = extractNode(refNode, ctx, depth + 1);
				} else if (props.children) {
					result = extractNode(props.children as Node, ctx, depth + 1);
				}
				visitedRefs.delete(refId);
				return result;
			}

			const children = props.children;
			const content = children
				? extractNode(children as Node, ctx, depth + 1)
				: "";

			switch (tag) {
				case "h1":
					return `# ${content.trim()}\n\n`;
				case "h2":
					return `## ${content.trim()}\n\n`;
				case "h3":
					return `### ${content.trim()}\n\n`;
				case "h4":
					return `#### ${content.trim()}\n\n`;
				case "h5":
					return `##### ${content.trim()}\n\n`;
				case "h6":
					return `###### ${content.trim()}\n\n`;
				case "p":
					return ctx.inTable ? content : `${content.trim()}\n\n`;
				case "code": {
					const codeContent = children
						? extractNode(children as Node, { ...ctx, inCode: true }, depth + 1)
						: "";
					return ctx.inCode ? codeContent : `\`${codeContent}\``;
				}
				case "pre": {
					const preContent = children
						? extractNode(children as Node, { ...ctx, inCode: true }, depth + 1)
						: "";
					return "```\n" + preContent + "\n```\n\n";
				}
				case "strong":
				case "b":
					return `**${content}**`;
				case "em":
				case "i":
					return `*${content}*`;
				case "li":
					return `- ${content.trim()}\n`;
				case "ul":
				case "ol":
					return content + "\n";
				case "blockquote":
					return `> ${content.trim()}\n\n`;
				case "table":
					return extractTable(node as unknown[], depth) + "\n";
				case "thead":
				case "tbody":
				case "tr":
				case "th":
				case "td":
					return content;
				case "div":
					if (props.role === "alert" || props["data-slot"] === "alert") {
						return `> ${content.trim()}\n\n`;
					}
					return content;
				case "a": {
					const href = props.href as string | undefined;
					return href && !href.startsWith("#")
						? `[${content}](${href})`
						: content;
				}
				default:
					return content;
			}
		}

		return (node as Node[]).map((n) => extractNode(n, ctx, depth + 1)).join("");
	}

	function extractTable(tableNode: unknown[], depth: number): string {
		const props = (tableNode[3] || {}) as Record<string, unknown>;
		const rows: string[][] = [];
		let headerRowCount = 0;

		function walkTable(node: unknown, isHeader: boolean, depth: number): void {
			visit(depth);
			if (node === null || node === undefined) return;

			if (typeof node === "string") {
				const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
				if (refMatch && !visitedRefs.has(refMatch[1]!)) {
					visitedRefs.add(refMatch[1]!);
					const refNode = getParsedChunk(refMatch[1]!);
					if (refNode) walkTable(refNode, isHeader, depth + 1);
					visitedRefs.delete(refMatch[1]!);
				}
				return;
			}

			if (!Array.isArray(node)) return;

			if (node[0] === "$") {
				const tag = node[1] as string;
				const nodeProps = (node[3] || {}) as Record<string, unknown>;

				if (tag.startsWith("$L")) {
					const refId = tag.slice(2);
					if (!visitedRefs.has(refId)) {
						visitedRefs.add(refId);
						const refNode = getParsedChunk(refId);
						if (refNode) walkTable(refNode, isHeader, depth + 1);
						visitedRefs.delete(refId);
					}
					return;
				}

				if (tag === "thead") walkTable(nodeProps.children, true, depth + 1);
				else if (tag === "tbody")
					walkTable(nodeProps.children, false, depth + 1);
				else if (tag === "tr") {
					const cells: string[] = [];
					walkCells(nodeProps.children, cells, depth + 1);
					if (cells.length > 0) {
						rows.push(cells);
						if (isHeader) headerRowCount++;
					}
				} else walkTable(nodeProps.children, isHeader, depth + 1);
			} else {
				for (const child of node) walkTable(child, isHeader, depth + 1);
			}
		}

		function walkCells(node: unknown, cells: string[], depth: number): void {
			visit(depth);
			if (node === null || node === undefined) return;

			if (typeof node === "string") {
				const refMatch = node.match(/^\$L([0-9a-f]+)$/i);
				if (refMatch && !visitedRefs.has(refMatch[1]!)) {
					visitedRefs.add(refMatch[1]!);
					const refNode = getParsedChunk(refMatch[1]!);
					if (refNode) walkCells(refNode, cells, depth + 1);
					visitedRefs.delete(refMatch[1]!);
				}
				return;
			}

			if (!Array.isArray(node)) return;

			if (node[0] === "$" && (node[1] === "td" || node[1] === "th")) {
				const cellProps = (node[3] || {}) as Record<string, unknown>;
				const text = extractNode(
					cellProps.children,
					{
						inTable: true,
						inCode: false,
					},
					depth + 1,
				)
					.trim()
					.replace(/\n/g, " ")
					.replace(/\\/g, "\\\\")
					.replace(/\|/g, "\\|");
				spendOutput(text.length);
				cells.push(text);
			} else if (
				node[0] === "$" &&
				typeof node[1] === "string" &&
				(node[1] as string).startsWith("$L")
			) {
				const refId = (node[1] as string).slice(2);
				if (!visitedRefs.has(refId)) {
					visitedRefs.add(refId);
					const refNode = getParsedChunk(refId);
					if (refNode) walkCells(refNode, cells, depth + 1);
					visitedRefs.delete(refId);
				}
			} else {
				for (const child of node) walkCells(child, cells, depth + 1);
			}
		}

		walkTable(props.children, false, depth + 1);
		if (rows.length === 0) return "";

		const colCount = Math.max(...rows.map((r) => r.length));
		let md = "";
		for (let i = 0; i < rows.length; i++) {
			spendOutput(
				rows[i]!.reduce((length, cell) => length + cell.length, 0) +
					3 * colCount +
					2,
			);
			const row = rows[i]!.concat(Array(colCount - rows[i]!.length).fill(""));
			md += "| " + row.join(" | ") + " |\n";
			if (i === headerRowCount - 1 || (headerRowCount === 0 && i === 0)) {
				spendOutput(6 * colCount + 2);
				md += "| " + Array(colCount).fill("---").join(" | ") + " |\n";
			}
		}
		return md;
	}

	try {
		// Next.js usually places the page body in flight chunk 23.
		const mainChunk = getParsedChunk("23");

		if (mainChunk) {
			const content = extractNode(mainChunk);
			if (content.trim().length > 100) {
				const cleaned = content.replace(/\n{3,}/g, "\n\n").trim();
				return { title, content: cleaned };
			}
		}

		const contentParts: { order: number; text: string }[] = [];

		for (const [id] of chunkMap) {
			if (id === "23") continue;
			const parsed = getParsedChunk(id);
			if (!parsed) continue;

			visitedRefs.clear();
			const text = extractNode(parsed);

			if (
				text.trim().length > 50 &&
				!text.includes("page was not found") &&
				!text.includes("404")
			) {
				contentParts.push({ order: parseInt(id, 16), text: text.trim() });
			}
		}

		if (contentParts.length === 0) return null;

		contentParts.sort((a, b) => a.order - b.order);

		const seen = new Set<string>();
		const uniqueParts: string[] = [];
		for (const part of contentParts) {
			const key = part.text.slice(0, 150);
			if (!seen.has(key)) {
				seen.add(key);
				uniqueParts.push(part.text);
			}
		}

		spendOutput(
			uniqueParts.reduce((length, part) => length + part.length, 0) +
				Math.max(0, uniqueParts.length - 1) * 2,
		);
		const content = uniqueParts
			.join("\n\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
		return content.length > 100 ? { title, content } : null;
	} catch (error) {
		if (error === BUDGET_EXHAUSTED) return null;
		throw error;
	}
}
