// Interpret one repository-owned Markdown asset, never discover a parallel registry.
import { createHash } from "node:crypto";
import { type Source, validatePath } from "../effects/source.ts";
import { type CatalogRow, requiredCatalogRows, type SelectedCatalog, type VerificationSelection } from "../kernel/verification.ts";

function asset(source: Source, path: string): { text: string; digest: string } {
	validatePath(path);
	const entry = source.entries.find((e) => e.path === path);
	if (!entry || entry.mode === "120000") throw new Error(`Verification catalog requires a literal file: ${path}`);
	const bytes = Buffer.from(entry.content, "base64");
	const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	return { text, digest: createHash("sha256").update(bytes).digest("hex") };
}
function sections(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	let current: string | undefined;
	for (const line of text.split(/\r?\n/)) {
		const header = /^## ([A-Za-z][A-Za-z ]*)\s*$/.exec(line);
		if (header) {
			current = header[1]!;
			if (Object.hasOwn(result, current)) throw new Error(`Duplicate catalog section: ${current}`);
			result[current] = "";
		} else if (current) result[current] += `${line}\n`;
	}
	return result;
}
function command(cell: string): string {
	const match = /^`([^`\n]+)`(?:\s.*)?$/.exec(cell.trim());
	if (!match) throw new Error(`Catalog command/path must begin with one inline code span: ${cell}`);
	return match[1]!;
}
export function selectCatalog(source: Source, selection: VerificationSelection): SelectedCatalog {
	if (source.repository !== selection.repository || source.commit !== selection.commit)
		throw new Error("Verification catalog source differs.");
	const selected = asset(source, selection.path);
	if (selected.digest !== selection.digest) throw new Error("Verification catalog digest differs; restore exact verifier bytes.");
	const parts = sections(selected.text);
	for (const required of ["Ranks", "Launch", "Doctor", "Channels", "Catalog", "Cleanup", "Extend", "Traps"])
		if (!Object.hasOwn(parts, required)) throw new Error(`Missing catalog section: ${required}`);
	const ranks = [...parts.Ranks!.matchAll(/^\d+\.\s+`([^`]+)`/gm)].map((m) => m[1]!);
	if (!ranks.length || new Set(ranks).size !== ranks.length) throw new Error("Catalog ranks must be a nonempty unique ordered ladder.");
	const lines = parts.Catalog!.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
	const cells = (line: string) =>
		line
			.trim()
			.slice(1, -1)
			.split(/(?<!\\)\|/)
			.map((cell) => cell.trim().replaceAll("\\|", "|"));
	if (JSON.stringify(cells(lines[0] ?? "")) !== JSON.stringify(["Name", "Channel", "Kind", "Run", "Expectations", "Rank"]))
		throw new Error("Catalog columns must be Name, Channel, Kind, Run, Expectations, Rank.");
	const all: CatalogRow[] = [];
	for (const literal of lines.slice(2)) {
		const c = cells(literal);
		if (c.length !== 6 || c.some((v) => !v) || all.some((row) => row.name === c[0])) throw new Error("Malformed/duplicate catalog row.");
		const [name, channel, kind, run, expectations, rank] = c as [string, string, CatalogRow["kind"], string, string, string];
		if (!["generated", "executed", "journey", "human"].includes(kind)) throw new Error(`Unknown catalog kind: ${kind}`);
		if (kind === "generated" || kind === "human" ? rank !== "-" : !ranks.includes(rank)) throw new Error(`Invalid catalog rank: ${name}`);
		all.push({ name, channel, kind, run, expectations, rank: rank === "-" ? null : rank, literal });
	}
	if (
		!selection.rows.length ||
		new Set(selection.rows).size !== selection.rows.length ||
		new Set(selection.behavioralRows).size !== selection.behavioralRows.length ||
		!requiredCatalogRows(selection).every((name) => selection.rows.includes(name))
	)
		throw new Error("Verification catalog selection requires unique rows including full-suite, typecheck and lint.");
	const rows = selection.rows.map((name) => {
		const row = all.find((r) => r.name === name);
		if (!row) throw new Error(`Missing catalog row: ${name}`);
		if (row.kind === "human") return row;
		const run = command(row.run);
		if (row.kind !== "journey") return { ...row, run };
		const file = asset(source, run);
		const parts = sections(file.text);
		const steps = (parts.Steps ?? "")
			.split(/\r?\n/)
			.filter((line) => /^\d+\. /.test(line))
			.map((line) => command(line.replace(/^\d+\. /, "")));
		if (!steps.length || !parts.Sanity?.trim()) throw new Error(`Catalog journey needs steps and independent sanity: ${run}`);
		return { ...row, run, journey: { path: run, ...file, steps, sanity: command(parts.Sanity.trim()) } };
	});
	const cleanup = [...parts.Cleanup!.matchAll(/```sh\r?\n([\s\S]*?)\r?\n```/g)].map((m) => m[1]!);
	return { selection, text: selected.text, ranks, sections: parts, rows, cleanup };
}
