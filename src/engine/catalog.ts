// Interpret one repository-owned Markdown asset, never discover a parallel registry.
import { createHash } from "node:crypto";
import type { Source } from "../effects/source.ts";
import { catalogDefinition, catalogSections as sections } from "../kernel/catalog.ts";
import { validatePath } from "../kernel/source-path.ts";
import { type CatalogRow, type SelectedCatalog, selectionRowsComplete, type VerificationSelection } from "../kernel/verification.ts";

/** Render-owned reusable craft for authoring or updating a repository's asset; the repository owns its commands. */
export const VERIFICATION_AUTHORING = {
	recommended: { asset: ".render/verify.md", journeys: ".render/journeys/" },
	sections: ["Ranks", "Launch", "Doctor", "Channels", "Catalog", "Cleanup", "Extend", "Traps"],
	columns: ["Name", "Channel", "Kind", "Run", "Expectations", "Rank"],
	kinds: {
		generated: "Discovery/index command; rank -, never proof.",
		executed: "Runnable repository check: Run begins with one inline code-spanned command; rank from this ladder.",
		journey:
			"Run names a repository file whose ## Steps holds numbered code-spanned commands and ## Sanity one independent code-spanned predicate.",
		human: "Advisory observation; rank -, never executed or counted as proof.",
	},
	channels: [
		{
			name: "Executable oracle",
			checks: "Independent corpus/reference/golden/property cases.",
			limits: "Expected results must not come from the code under test.",
		},
		{
			name: "Process",
			checks: "Invoke the real CLI/process; assert status, output and side effects.",
			limits: "Exit status alone is not the expected result.",
		},
		{
			name: "Live runtime introspection",
			checks: "Inspect a running service through its project-supported interface.",
			limits: "Prove the transition; never set internal state to the expected answer.",
		},
		{
			name: "Driven surface",
			checks: "HTTP/UI/TUI interaction via real handlers or supported automation hooks.",
			limits: "Capture the action and resulting state; own the instance.",
		},
		{ name: "Tests", checks: "Existing project suites at their documented seams.", limits: "State substitutes and scope." },
		{ name: "Static", checks: "Build, types, lint, structural inspection.", limits: "No runtime behavior." },
		{ name: "Human-observed", checks: "Suggested usability/experience observations.", limits: "Advisory only." },
	],
	instructions:
		"When the selected asset is absent or needs new rows, interview the repository in your workspace: read its actual tooling, documented commands, prerequisites and observation channels, and reuse those commands. Write one asset at the selected path (legacy paths stay supported); never a parallel copy or registry. Ranks is a project-named ladder, strongest first, replacing tests/build/inspection. Report unknown channels and prerequisites in Doctor/Channels and your handoff text instead of inventing a harness. Every selected row must exist; full-suite, typecheck and lint stay mandatory, and minimal static rows are honest scaffolding. Prove at least one executed row or journey end to end on your owned instance with independent expected results, then Cleanup; setup success or exit zero alone is not proof. Never claim checks for behavior the repository does not have yet.",
} as const;

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
function resolve(source: Source, row: CatalogRow): CatalogRow {
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
}
export function selectCatalog(source: Source, selection: VerificationSelection): SelectedCatalog {
	if (source.repository !== selection.repository || source.commit !== selection.commit)
		throw new Error("Verification catalog source differs.");
	const selected = asset(source, selection.path);
	if (selected.digest !== selection.digest) throw new Error("Verification catalog digest differs; restore exact verifier bytes.");
	const { sections: parts, ranks, rows: all } = catalogDefinition(selected.text);
	if (!selectionRowsComplete(selection))
		throw new Error("Verification catalog selection requires unique rows including full-suite, typecheck and lint.");
	if (selection.maintenance && (selection.rows.length !== all.length || !all.every((r) => selection.rows.includes(r.name))))
		throw new Error("Verification maintenance selects every catalog row.");
	const rows = selection.rows.map((name) => {
		const row = all.find((r) => r.name === name);
		if (!row) throw new Error(`Missing catalog row: ${name}`);
		if (row.kind === "human") return row;
		if (!selection.maintenance) return resolve(source, row);
		try {
			return resolve(source, row);
		} catch (error) {
			return { ...row, gap: (error as Error).message };
		}
	});
	const cleanup = [...parts.Cleanup!.matchAll(/```sh\r?\n([\s\S]*?)\r?\n```/g)].map((m) => m[1]!);
	return { selection, text: selected.text, ranks, sections: parts, rows, cleanup };
}
