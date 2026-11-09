// Schemas for the source and verification evidence the Kernel relies on. The enclosing Ledger retains
// the original bytes and separately verifies provenance, source identities and transaction authority.
import * as S from "effect/Schema";

const open = <const Fields extends S.Struct.Fields>(fields: Fields) => S.StructWithRest(S.Struct(fields), [S.Record(S.String, S.Unknown)]);
const nonblank = S.String.check(S.makeFilter((value) => value.trim().length > 0));
const safeInteger = S.Number.check(S.makeFilter(Number.isSafeInteger));
const count = safeInteger.check(S.isGreaterThanOrEqualTo(0));
const nonblankStrings = S.mutable(S.Array(nonblank));
const strings = S.mutable(S.Array(S.String));

export const ExecutionScopeSchema = open({
	assignment: nonblank,
	generation: safeInteger,
	attempt: nonblank,
	executorEpoch: nonblank,
});
export const ExecutionResultSchema = open({
	argv: strings,
	exitCode: S.NullOr(S.Number),
	stdout: S.String,
	stderr: S.String,
	platform: open({ os: S.Literal("linux"), cpu: S.String }),
	image: S.String,
	timedOut: S.Boolean,
	verifierRevision: S.optional(S.String),
});
export const VerificationSelectionSchema = open({
	repository: nonblank,
	commit: nonblank,
	path: nonblank,
	digest: nonblank,
	contract: nonblank,
	rows: nonblankStrings,
	behavioralRows: nonblankStrings,
	receipts: nonblankStrings,
	maintenance: S.optional(open({ basis: S.NullOr(S.String) })),
});
export const CatalogRowSchema = open({
	name: nonblank,
	channel: S.String,
	kind: S.Literals(["generated", "executed", "journey", "human"]),
	run: S.String,
	expectations: S.String,
	rank: S.NullOr(nonblank),
	literal: S.String,
	gap: S.optional(S.String),
	journey: S.optional(open({ path: S.String, digest: S.String, text: S.String, steps: strings, sanity: S.String })),
});
export const SelectedCatalogSchema = open({
	selection: VerificationSelectionSchema,
	text: S.String,
	ranks: nonblankStrings,
	sections: S.Record(S.String, S.String),
	rows: S.mutable(S.Array(CatalogRowSchema)),
	cleanup: strings,
});
export const CatalogResultSchema = open({
	name: nonblank,
	status: S.Literals(["completed", "failed", "unrun", "advisory", "invalid"]),
	steps: S.mutable(S.Array(ExecutionResultSchema)),
	sanity: S.optional(ExecutionResultSchema),
});
export const CatalogEvidenceSchema = open({
	kind: S.Literal("catalog-check"),
	role: nonblank,
	catalog: SelectedCatalogSchema,
	results: S.mutable(S.Array(CatalogResultSchema)),
	// Stored observations remain open to historical statuses; qualification recognizes only its own passing status.
	verification: open({ status: nonblank, inputCommit: nonblank, inputTree: nonblank, resultTree: nonblank }),
	cleanup: open({ status: S.Literals(["complete", "pending"]), results: S.mutable(S.Array(ExecutionResultSchema)) }),
	source: S.optional(open({ base: open({ entries: S.mutable(S.Array(open({ path: S.String, mode: S.String, oid: S.String }))) }) })),
});
export const LiteralEntrySchema = open({
	path: nonblank,
	mode: S.Literals(["100644", "100755", "120000"]),
	oid: nonblank,
	content: S.String,
});
export const SourceSchema = open({
	repository: nonblank,
	objectFormat: S.Literals(["sha1", "sha256"]),
	commit: S.String,
	tree: S.String,
	root: nonblank,
	entries: S.mutable(S.Array(LiteralEntrySchema)),
}).check(
	S.makeFilter((source) => {
		const objectId = source.objectFormat === "sha1" ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/;
		return objectId.test(source.commit) && objectId.test(source.tree);
	}),
);
export const SourceReceiptSchema = open({
	base: SourceSchema,
	source: SourceSchema,
	freeze: open({ scope: ExecutionScopeSchema, runtime: nonblank, running: S.Literal(false) }),
	exclusions: nonblankStrings,
	bytes: count,
	entries: count,
	deleted: nonblankStrings,
	configurationChanges: nonblankStrings,
	durability: open({ git: nonblank, fsync: S.Literal("all"), method: S.Literal("fsync") }),
}).check(
	S.makeFilter(
		(receipt) => receipt.base.repository === receipt.source.repository && receipt.base.objectFormat === receipt.source.objectFormat,
	),
);
export const ImplementationSourceSchema = open({
	schema: S.Literal(1),
	source: SourceReceiptSchema,
	verification: S.optional(CatalogEvidenceSchema),
});

// Kernel transitions mutate owned clones and the host builds receipts incrementally. The schemas own the
// shape; these aliases keep the existing mutable interfaces rather than imposing readonly on their callers.
type Mutable<T> = T extends readonly (infer Element)[]
	? Mutable<Element>[]
	: T extends object
		? {
				-readonly [Key in keyof T as string extends Key
					? unknown extends T[Key]
						? never
						: Key
					: number extends Key
						? unknown extends T[Key]
							? never
							: Key
						: Key]: Mutable<T[Key]>;
			}
		: T;
export type ExecutionResult = Mutable<typeof ExecutionResultSchema.Type>;
export type VerificationSelection = Mutable<typeof VerificationSelectionSchema.Type>;
export type CatalogRow = Mutable<typeof CatalogRowSchema.Type>;
export type SelectedCatalog = Mutable<typeof SelectedCatalogSchema.Type>;
export type CatalogResult = Mutable<typeof CatalogResultSchema.Type>;
export type CatalogEvidence = Mutable<typeof CatalogEvidenceSchema.Type>;
export type LiteralEntry = Mutable<typeof LiteralEntrySchema.Type>;
export type Source = Mutable<typeof SourceSchema.Type>;
export type SourceReceipt = Mutable<typeof SourceReceiptSchema.Type>;
export type ImplementationSource = Mutable<typeof ImplementationSourceSchema.Type>;
