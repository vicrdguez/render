import assert from "node:assert/strict";
import { test } from "node:test";
import { Engine } from "../src/engine/runtime.ts";
import { assess, catalogFixture, runCatalog } from "./support/catalog.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

test("catalog Linux results require assessment, retain independent evidence and survive export/reopen", async () => {
	const f = await catalogFixture(true);
	try {
		const { a, read, receipt } = await runCatalog(f, ["discover", "human"], []);
		assert.equal(receipt.kind, "catalog-check");
		assert.equal(receipt.verification.status, "needs_assessment", "exit zero must not decide adequacy");
		assert.equal(receipt.catalog.selection.commit, f.selection.commit);
		assert.equal(receipt.catalog.selection.contract, "revision:3");
		assert.equal(receipt.catalog.selection.digest, f.selection.digest);
		assert.equal(receipt.results[0].steps[0].stdout, "STEP OK");
		assert.equal(receipt.results[0].sanity.exitCode, 0);
		assert.equal(receipt.results[0].sanity.platform.os, "linux");
		assert.equal(receipt.cleanup.status, "complete");
		assert.equal(receipt.source.base.tree, receipt.source.source.tree);
		assert.equal(
			(await assess(f, [a.report!])).status,
			"accepted",
			"weaker static gates and optional advisory rows must not cap behavioral rank",
		);
		const excessive = await assess(f, [a.report!], {}, "live");
		assert.equal(excessive.status, "refused", "rank cannot exceed weakest required evidence");
		const otherRole = await assess(f, [a.report!], {}, "endpoint", "watchdog");
		assert.equal(otherRole.status, "refused", "Watchdog must independently run its checks");
		const tree = git(f.source.repo, ["rev-parse", `${f.selection.commit}^{tree}`])
			.toString()
			.trim();
		const newer = git(f.source.repo, ["commit-tree", tree, "-p", f.selection.commit], "New exact source\n").toString().trim();
		const oldSource = await assess(f, [a.report!], { commit: newer });
		assert.equal(oldSource.status, "refused", "old-source receipts cannot satisfy current completion");
		const oldVerifier = await assess(f, [a.report!], { digest: "2".repeat(64) });
		assert.equal(oldVerifier.status, "blocked", "old-verifier receipts cannot satisfy current completion");
		const policy = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "minimum",
				command: {
					type: "changePolicy",
					expectedRevision: "policy:initial",
					policy: { completedReviewLimit: 2, reviewerDiversity: "different-family", minimumEvidenceRank: "live" },
				},
			},
			admin,
		);
		assert.ok(policy.status === "accepted");
		const adopted = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "adopt-minimum",
				workflow: "workflow:2",
				command: { type: "adoptPolicy", revision: policy.result.policy, expectedBinding: "policy-binding:2" },
			},
			admin,
		);
		assert.equal(adopted.status, "accepted");
		assert.equal((await assess(f, [a.report!])).status, "refused", "below-minimum evidence cannot be demoted into success");
		const exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported);
		assert.equal(Buffer.from(exported.content[a.report!]!, "base64").toString(), read.content.toString());
		const packaged = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "catalog-package",
				command: { type: "createRecoveryPackage" },
			},
			admin,
		);
		assert.equal(packaged.status, "refused");
		await f.reopen(new Engine({ ownedChecks: f.config }));
		const after = await f.ledger.artifact(admin, { read: a.report! });
		assert.ok("content" in after);
		assert.equal(after.content.toString(), read.content.toString());
	} finally {
		await f.close();
	}
});

test("generated discovery and advisory human observation cannot hide failed journey sanity or cleanup", async () => {
	const f = await catalogFixture(true, { sanity: "printf 'SANITY FAILED'; exit 9", cleanup: "printf 'CLEANUP FAILED'; exit 8" });
	try {
		const { a, receipt } = await runCatalog(f, ["discover", "human"]);
		assert.equal(receipt.results.find((r: { name: string }) => r.name === "discover").steps[0].stdout, "INDEX ONLY");
		assert.equal(receipt.results.find((r: { name: string }) => r.name === "human").status, "advisory");
		assert.equal(receipt.results[0].steps[0].exitCode, 0);
		assert.equal(receipt.results[0].sanity.exitCode, 9);
		assert.equal(receipt.results[0].sanity.stdout, "SANITY FAILED");
		assert.equal(receipt.verification.status, "non-pass");
		assert.equal(receipt.cleanup.status, "pending");
		assert.equal(receipt.cleanup.results[0].stdout, "CLEANUP FAILED");
		assert.equal(receipt.source.freeze.running, false);
		const result = await assess(f, [a.report!], {
			rows: [...f.selection.rows, "discover", "human"],
			behavioralRows: ["behavior", "discover", "human"],
		});
		assert.equal(result.status, "refused", "discovery must not count as behavioral evidence");
	} finally {
		await f.close();
	}
});

for (const kind of ["discover", "human"])
	test(`${kind} cannot discharge required behavior despite green executable checks`, async () => {
		const f = await catalogFixture(true);
		try {
			const { a } = await runCatalog(f, [kind]);
			assert.equal(
				(await assess(f, [a.report!], { rows: [...f.selection.rows, kind], behavioralRows: ["behavior", kind] })).status,
				"refused",
				"non-executable evidence must not qualify as behavioral proof",
			);
		} finally {
			await f.close();
		}
	});

for (const [label, text, expected] of [
	["missing command", "render-fixture-command-not-installed", "unrun"],
	["failed expectation", "exit 7", "failed"],
	["changed source", "printf 'changed' > changed", "source_changed"],
] as const)
	test(`catalog preserves ${label} as a non-pass`, async () => {
		const f = await catalogFixture(true, { sanity: text });
		try {
			const { a, receipt } = await runCatalog(f);
			assert.equal(expected === "source_changed" ? receipt.verification.status : receipt.results[0].status, expected);
			assert.equal((await assess(f, [a.report!])).status, "refused", `${label} must not qualify`);
		} finally {
			await f.close();
		}
	});
