// One pure parser for selected repository catalog definitions, shared by intake and execution.
import type { CatalogRow } from "./verification.ts";

export function catalogSections(text: string): Record<string, string> {
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
export function catalogDefinition(text: string): { sections: Record<string, string>; ranks: string[]; rows: CatalogRow[] } {
	const sections = catalogSections(text);
	for (const required of ["Ranks", "Launch", "Doctor", "Channels", "Catalog", "Cleanup", "Extend", "Traps"])
		if (!Object.hasOwn(sections, required)) throw new Error(`Missing catalog section: ${required}`);
	const ranks = [...sections.Ranks!.matchAll(/^\d+\.\s+`([^`]+)`/gm)].map((m) => m[1]!);
	if (!ranks.length || new Set(ranks).size !== ranks.length) throw new Error("Catalog ranks must be a nonempty unique ordered ladder.");
	const lines = sections.Catalog!.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
	const cells = (line: string) =>
		line
			.trim()
			.slice(1, -1)
			.split(/(?<!\\)\|/)
			.map((cell) => cell.trim().replaceAll("\\|", "|"));
	if (JSON.stringify(cells(lines[0] ?? "")) !== JSON.stringify(["Name", "Channel", "Kind", "Run", "Expectations", "Rank"]))
		throw new Error("Catalog columns must be Name, Channel, Kind, Run, Expectations, Rank.");
	const rows: CatalogRow[] = [];
	for (const literal of lines.slice(2)) {
		const c = cells(literal);
		if (c.length !== 6 || c.some((v) => !v) || rows.some((row) => row.name === c[0])) throw new Error("Malformed/duplicate catalog row.");
		const [name, channel, kind, run, expectations, rank] = c as [string, string, CatalogRow["kind"], string, string, string];
		if (!["generated", "executed", "journey", "human"].includes(kind)) throw new Error(`Unknown catalog kind: ${kind}`);
		if (kind === "generated" || kind === "human" ? rank !== "-" : !ranks.includes(rank)) throw new Error(`Invalid catalog rank: ${name}`);
		rows.push({ name, channel, kind, run, expectations, rank: rank === "-" ? null : rank, literal });
	}
	return { sections, ranks, rows };
}
