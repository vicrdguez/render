import assert from "node:assert/strict";
import { test } from "node:test";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { assess, catalogFixture } from "./support/catalog.ts";
import { admin, packet } from "./support/roles.ts";

test("selected legacy catalog renders its exact source, rows, prerequisites and replacement ranks", async () => {
	const f = await catalogFixture();
	try {
		const reply = await f.command({
			type: "assignTask",
			slice: "catalog:render",
			delivery: false,
			packet: packet({ verification: f.selection }),
		});
		assert.equal(reply.status, "accepted", "selected catalog packet must be admitted");
		const frame = f.ledger.snapshot(admin);
		assert.ok("assignments" in frame);
		const rendered = JSON.parse(await f.engine.render((frame.assignments as RoleAssignment[])[0]!));
		assert.equal(rendered.verification.selection.path, ".skl/verify.md");
		assert.equal(rendered.verification.selection.commit, f.selection.commit);
		assert.equal(rendered.verification.selection.digest, f.selection.digest);
		assert.equal(rendered.verification.text, f.text);
		assert.deepEqual(rendered.verification.ranks, ["endpoint", "static"]);
		assert.match(rendered.verification.sections.Doctor, /Linux with sh; no host fallback/);
		assert.deepEqual(
			rendered.verification.rows.map((r: { name: string }) => r.name),
			["behavior", "full-suite", "typecheck", "lint"],
		);
		assert.equal(rendered.verification.rows[0].rank, "endpoint");
		assert.equal(rendered.verification.rows[0].journey.sanity, "exit 0");
		assert.ok(!JSON.stringify(rendered.verification).includes("NOT THE SELECTED CATALOG"));
	} finally {
		await f.close();
	}
});

for (const [label, override] of [
	["old verifier", { digest: "0".repeat(64) }],
	["missing selected asset", { path: ".render/missing.md" }],
	["unknown row", { rows: ["absent", "full-suite", "typecheck", "lint"] }],
	["missing full suite", { rows: ["behavior", "typecheck", "lint"] }],
] as const)
	test(`catalog refuses ${label} without fallback`, async () => {
		const f = await catalogFixture();
		try {
			const reply = await f.command({
				type: "assignTask",
				slice: "catalog:invalid",
				delivery: false,
				packet: packet({
					verification: { ...f.selection, ...override, rows: [...("rows" in override ? override.rows : f.selection.rows)] },
				}),
			});
			assert.equal(reply.status, "accepted");
			const frame = f.ledger.snapshot(admin);
			assert.ok("assignments" in frame);
			await assert.rejects(f.engine.render((frame.assignments as RoleAssignment[])[0]!), /catalog|Catalog|verification/);
		} finally {
			await f.close();
		}
	});

test("current catalog completion refuses missing evidence even with an explicit passing assessment", async () => {
	const f = await catalogFixture();
	try {
		const result = await assess(f, []);
		assert.equal(result.status, "refused", "missing required current-source checks cannot pass");
		assert.ok(result.status === "refused");
		assert.equal(result.code, "missing_content");
	} finally {
		await f.close();
	}
});

test("human policy accepts a project-named rank without merging the built-in ladder", async () => {
	const f = await catalogFixture();
	try {
		const result = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "custom-rank",
				command: {
					type: "changePolicy",
					expectedRevision: "policy:initial",
					policy: { completedReviewLimit: 2, reviewerDiversity: "different-family", minimumEvidenceRank: "endpoint" },
				},
			},
			admin,
		);
		assert.equal(result.status, "accepted", "project rank must not be rejected by a second built-in registry");
	} finally {
		await f.close();
	}
});
