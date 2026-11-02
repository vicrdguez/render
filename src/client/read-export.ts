// Standalone portable reader: Node builtins only. Does not import Ledger, exporter, SQLite or test fixtures.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

class Invalid extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}
function requireExport(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Invalid("invalid_export", message);
}
function object(value: unknown): Record<string, unknown> {
	requireExport(value !== null && typeof value === "object" && !Array.isArray(value), "Expected object.");
	return value as Record<string, unknown>;
}
function strings(value: unknown): string[] {
	requireExport(Array.isArray(value) && value.every((s) => typeof s === "string"), "Expected string list.");
	return value as string[];
}

async function main(): Promise<void> {
	const bundle = object(JSON.parse(await readFile(process.argv[2] ?? "", "utf8")));
	const manifest = object(bundle.manifest);
	// Operational declaration is current at export, not evidence at the selected history cutoff.
	const backup = bundle.backup === undefined ? undefined : object(bundle.backup);
	if (bundle.version !== 1 || manifest.version !== 1)
		throw new Invalid("unsupported_version", "Only render-history version 1 is supported.");
	requireExport(manifest.format === "render-history", "Unknown export format.");
	requireExport(Number.isSafeInteger(manifest.cutoff) && Number(manifest.cutoff) >= 0, "Invalid cutoff.");
	const scope = object(manifest.scope);
	const workflows = strings(scope.workflows);
	strings(scope.kinds);
	strings(manifest.exclusions);
	strings(manifest.redactions);
	strings(manifest.omittedKinds);
	requireExport(Array.isArray(manifest.missing), "Missing-data list required.");
	const missing = manifest.missing.map((m) => object(m));
	for (const m of missing) requireExport(typeof m.ref === "string" && typeof m.code === "string", "Invalid missing-data declaration.");
	requireExport(typeof manifest.complete === "boolean" && manifest.complete === (missing.length === 0), "Inconsistent completeness.");
	requireExport(typeof bundle.jsonl === "string" && typeof bundle.text === "string", "JSONL/text required.");
	const content = object(bundle.content);
	const records = bundle.jsonl
		.split("\n")
		.filter((l) => l.length > 0)
		.map((line) => object(JSON.parse(line)));
	requireExport(records.length === manifest.recordCount, "Record count mismatch.");
	const refs = new Set<string>();
	let last = -1;
	for (const r of records) {
		if (r.schema !== 1) throw new Invalid("unsupported_schema", "Unsupported retained record schema.");
		requireExport(typeof r.ref === "string" && !refs.has(r.ref), "Duplicate/invalid record identity.");
		refs.add(r.ref);
		requireExport(
			typeof r.kind === "string" &&
				Number.isSafeInteger(r.sequence) &&
				Number(r.sequence) >= last &&
				Number(r.sequence) <= Number(manifest.cutoff),
			"Invalid record order/cutoff.",
		);
		last = Number(r.sequence);
		requireExport(
			r.workflow === null ? scope.global === true : typeof r.workflow === "string" && workflows.includes(r.workflow),
			"Record outside scope.",
		);
		strings(r.parents);
		strings(r.supersedes);
		object(r.refs);
		requireExport(r.outcome === null, "Unknown version-1 outcome classification; never infer an outcome from text.");
	}
	const external = new Set(manifest.externalRefs === undefined ? [] : strings(manifest.externalRefs));
	const declaredMissing = new Set(missing.map((m) => m.ref));
	const documents: { ref: string; kind: string; text: string }[] = [];
	for (const r of records) {
		for (const ref of [
			...strings(r.parents),
			...strings(r.supersedes),
			...Object.values(object(r.refs)).filter(
				(v): v is string =>
					typeof v === "string" && /^(workflow|revision|packet|fact|message|receipt|policy|policy-binding|runtime-history):/.test(v),
			),
		]) {
			requireExport(refs.has(ref) || external.has(ref) || declaredMissing.has(ref), `Undeclared relationship ${ref}.`);
		}
		if (r.content !== true) continue;
		const ref = r.ref as string;
		const encoded = content[ref];
		if (typeof encoded !== "string") throw new Invalid("missing_content", `Missing ${ref}.`);
		const bytes = Buffer.from(encoded, "base64");
		const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
		if (bytes.toString("base64") !== encoded || bytes.length !== r.byteLength || digest !== r.digest)
			throw new Invalid("content_corrupt", `Digest/length mismatch for ${ref}.`);
		requireExport(r.mediaType === "text/plain" || r.mediaType === "text/markdown", "Unsupported media type.");
		const text = bytes.toString("utf8");
		requireExport(Buffer.from(text, "utf8").equals(bytes), "Content is not UTF-8.");
		documents.push({ ref, kind: String(r.kind), text });
	}
	for (const ref of Object.keys(content))
		requireExport(
			records.some((r) => r.ref === ref && r.content === true),
			"Unreferenced content.",
		);
	process.stdout.write(
		`${JSON.stringify({ version: 1, cutoff: manifest.cutoff, complete: manifest.complete, missing, exclusions: manifest.exclusions, scope, records, documents, ...(backup ? { backup } : {}) })}\n`,
	);
}
main().catch((error: unknown) => {
	process.stdout.write(
		`${JSON.stringify({ status: "refused", code: error instanceof Invalid ? error.code : "invalid_export", reason: error instanceof Error ? error.message : "Invalid export." })}\n`,
	);
	process.exitCode = 1;
});
