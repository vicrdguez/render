import assert from "node:assert/strict";
import { test } from "node:test";
import * as implementation from "../src/kernel/implementation.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { capture } from "./support/implementation.ts";

const owner = { id: "assignment:1", generation: 1, attempt: "attempt:1" } as RoleAssignment;
const valid = () => JSON.parse(JSON.stringify(capture(owner, "executor:1", "contract:1")));

test("implementation source accepts complete evidence, optional absence and retained extension fields", () => {
	const source = valid();
	source.futureRoot = { retained: true };
	source.verification.results[0].futureResult = "preserved";
	source.verification.results[0].steps[0].futureStep = "preserved";
	// The stored observation status is intentionally open; qualification, not decoding, decides whether it proves a pass.
	source.verification.verification.status = "historical-observation";
	assert.deepEqual(implementation.implementationSource(source), source);
	const withoutEvidence = { schema: 1, source: source.source };
	assert.deepEqual(implementation.implementationSource(withoutEvidence), withoutEvidence);
});

const mutations: [string, (value: ReturnType<typeof valid>) => void][] = [
	[
		"invented catalog result status",
		(v) => {
			v.verification.results[0].status = "invented-status";
		},
	],
	[
		"string execution exit code",
		(v) => {
			v.verification.results[0].steps[0].exitCode = "zero";
		},
	],
	[
		"missing execution argv",
		(v) => {
			delete v.verification.results[0].steps[0].argv;
		},
	],
	[
		"non-string execution argument",
		(v) => {
			v.verification.results[0].steps[0].argv = [3];
		},
	],
	[
		"non-Linux execution platform",
		(v) => {
			v.verification.results[0].steps[0].platform.os = "other";
		},
	],
	[
		"malformed sanity execution",
		(v) => {
			v.verification.results[0].sanity = { ...v.verification.results[0].steps[0], timedOut: "no" };
		},
	],
	[
		"invented cleanup status",
		(v) => {
			v.verification.cleanup.status = "invented";
		},
	],
	[
		"malformed cleanup execution",
		(v) => {
			v.verification.cleanup.results = [{ ...v.verification.results[0].steps[0], stderr: 1 }];
		},
	],
	[
		"non-string catalog text",
		(v) => {
			v.verification.catalog.text = null;
		},
	],
	[
		"non-string catalog section",
		(v) => {
			v.verification.catalog.sections = { tests: 1 };
		},
	],
	[
		"invented catalog row kind",
		(v) => {
			v.verification.catalog.rows[0].kind = "invented";
		},
	],
	[
		"missing catalog row expectations",
		(v) => {
			delete v.verification.catalog.rows[0].expectations;
		},
	],
	[
		"malformed journey steps",
		(v) => {
			v.verification.catalog.rows[0].journey = { path: "journey", digest: "digest", text: "", steps: [false], sanity: "true" };
		},
	],
	[
		"malformed maintenance basis",
		(v) => {
			v.verification.catalog.selection.maintenance = { basis: 12 };
		},
	],
	[
		"malformed indexed source entry",
		(v) => {
			v.verification.source = { base: { entries: [{ path: "file", mode: "100644", oid: 123 }] } };
		},
	],
	[
		"different base and captured repositories",
		(v) => {
			v.source.base.repository = "other";
		},
	],
	[
		"unsafe freeze generation",
		(v) => {
			v.source.freeze.scope.generation = Number.MAX_SAFE_INTEGER + 1;
		},
	],
	[
		"negative byte count",
		(v) => {
			v.source.bytes = -1;
		},
	],
];
for (const [label, mutate] of mutations)
	test(`implementation source refuses ${label}`, () => {
		const input = valid();
		mutate(input);
		assert.equal(implementation.implementationSource(input), undefined);
	});

test("implementation source exposes structured paths for independently malformed result fields", async () => {
	const input = valid();
	input.verification.results[0].status = "invented-status";
	input.verification.results[0].steps[0].exitCode = "zero";
	const decoded = implementation.decodeImplementationSource(input);
	assert.equal(decoded._tag, "Failure");
	if (decoded._tag !== "Failure") throw new Error("unreachable");
	const issue = await import("effect/SchemaIssue");
	const paths = issue
		.makeFormatterStandardSchemaV1()(decoded.failure.issue)
		.issues.map((entry) => entry.path);
	assert.deepEqual(paths, [
		["verification", "results", 0, "status"],
		["verification", "results", 0, "steps", 0, "exitCode"],
	]);
});
