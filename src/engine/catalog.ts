// Interpret one repository-owned Markdown asset, never discover a parallel registry.
import { createHash } from "node:crypto";
import type { Source } from "../effects/source.ts";
import { catalogDefinition, catalogSections as sections } from "../kernel/catalog.ts";
import { validatePath } from "../kernel/source-path.ts";
import { type SelectedCatalog, selectionRowsComplete, type VerificationSelection } from "../kernel/verification.ts";

function asset(source: Source, path: string): { text: string; digest: string } {
	validatePath(path);
	const entry = source.entries.find((e) => e.path === path);
	if (!entry || entry.mode === "120000") throw new Error(`Verification catalog requires a literal file: ${path}`);
	const bytes = Buffer.from(entry.content, "base64");
	const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	return { text, digest: createHash("sha256").update(bytes).digest("hex") };
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
	const { sections: parts, ranks, rows: all } = catalogDefinition(selected.text);
	if (!selectionRowsComplete(selection))
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
