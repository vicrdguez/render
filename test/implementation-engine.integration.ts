import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { ImplementationSource } from "../src/kernel/implementation.ts";
import type { IntakeManifest, Intakes } from "../src/kernel/intake.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { rows } from "./support/catalog.ts";
import {
	accepted,
	advanceTarget,
	advanceVerifier,
	captureFile,
	captureValue,
	clearBarrier,
	effectsStore,
	fixture,
	holdAt,
	parked,
	proposalRef,
	releaseBarrier,
} from "./support/implementation-engine.ts";
import { admin, claudeFixture, PROJECT } from "./support/roles.ts";
import { git } from "./support/source.ts";

// Written independently of the product's record type: these are the fields the Contract requires a reader to find.
type Prepared = {
	schema: 1;
	passRef: string;
	handoff: string;
	source: string;
	attempt: number;
	target: { proposal: string; ref: string; commit: string };
	outcome: "checked" | "check-failure" | "conflict" | "operational" | "verifier-defect";
	reason: string | null;
	preparation: null | {
		kind: string;
		algorithm: string;
		profile: string;
		git: string;
		base: string;
		source: string;
		target: string;
		result: string;
		tree: string;
		conflicts: string[];
		stdout: string;
	};
	checks: null | {
		verifierRevision: string;
		results: { name: string; status: string; steps: { exitCode: number; platform: { os: string }; verifierRevision: string }[] }[];
		verification: { status: string; inputCommit: string; resultTree: string };
		failed: { name: string; exitCode: number }[];
	};
	/** The workflow policy the attempt qualified X against. */
	policy: { binding: string; revision: string; minimumEvidenceRank: string | null };
};
type Policy = {
	defaultRevision: string;
	revisions: Record<string, { minimumEvidenceRank: string | null }>;
	bindings: Record<string, { revision: string; policy: string }>;
};
const policyOf = (t: { f: { ledger: { snapshot(context: typeof admin): unknown } } }) =>
	(t.f.ledger.snapshot(admin) as { policy: Policy }).policy;
test("two-pass journey: one fresh paired Audit of frozen A, same-pass B, atomic preparation, then a real conflict opens P2 from T1 with its own fresh Audit, surviving export/reopen", async () => {
	const t = await fixture();
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => {
			const a = t.assignments().find((x) => x.id === opening.assignment);
			return !!a && !a.executing && (a.status === "submitted" || (a.status === "blocked" && a.blocker !== "awaiting_role_results"));
		}, "implementation completion");
		const writer = t.assignments().find((a) => a.id === opening.assignment)!;
		assert.equal(writer.status, "submitted", `expected full lifecycle, got ${writer.blocker}`);
		const reviews = t.assignments().filter((a) => a.parent === writer.id && ["audit-standards", "audit-contracts"].includes(a.packet.role));
		assert.equal(reviews.length, 2);
		assert.deepEqual(new Set(reviews.map((a) => a.packet.role)), new Set(["audit-standards", "audit-contracts"]));
		assert.equal(new Set([writer.conversation, ...reviews.map((a) => a.conversation)]).size, 3);
		assert.ok(reviews.every((a) => a.status === "submitted" && a.report));
		const auditPrompts = t.prompts.filter((p) => p.auditReview);
		assert.equal(auditPrompts.length, 2);
		assert.ok(auditPrompts.every((p) => p.auditReview?.passRef === opening.passRef));
		const resumed = t.prompts.filter((p) => p.packet.role === "implementer" && p.implementation?.audit?.reports);
		assert.ok(resumed.length, "same implementer resumes with both retained Audit reports");
		const frame = t.f.ledger.snapshot(admin) as Frame;
		const pass = (frame.implementationPasses as ImplementationPass[]).find((p) => p.ref === opening.passRef);
		assert.ok(pass?.handoff, "handoff and its preparation are committed on the pass");
		assert.ok(pass.handoff.preparationTask, "preparation task is staged atomically with handoff");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [opening.passRecord, pass.handoff.record, ...reviews.map((a) => a.report)])
			assert.ok(exported.content[ref as string], `export retains ${ref}`);
		const A = auditPrompts[0]!.auditReview!.source;
		assert.ok(auditPrompts.every((p) => p.auditReview!.source === A && p.auditReview!.contract === t.contract));
		assert.equal(pass.captureA, A);
		assert.ok(pass.captureB, "final B has a named retained source revision");
		assert.notEqual(pass.captureA, pass.captureB);
		const encodedA = exported.content[A];
		const encodedB = exported.content[pass.captureB];
		assert.ok(encodedA && encodedB, "both source revisions are exported");
		assert.equal(captureValue(Buffer.from(encodedA, "base64").toString()), "A\n");
		assert.equal(captureValue(Buffer.from(encodedB, "base64").toString()), "B\n");
		assert.ok(
			auditPrompts.every((p) => p.auditReview!.source !== pass.captureB),
			"both Audit bindings point only to A",
		);
		const settled = (id: unknown) => () => {
			const a = t.assignments().find((x) => x.id === id);
			return !!a && !a.executing && (a.status === "submitted" || (a.status === "blocked" && a.blocker !== "awaiting_role_results"));
		};
		const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const read = async (ref: string) => {
			const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in value, `read ${ref}`);
			return value.content.toString();
		};
		const prepared = async (ref: string) => JSON.parse(await read(ref)) as Prepared;
		// TP21: production preparation after the real handoff. B already contains the newly bound canonical T0.
		await t.wait(() => /^awaiting_watchdog/.test(passes()[0]?.handoff?.blocker ?? ""), "P1 prepared and checked");
		const first = structuredClone(passes()[0]!);
		assert.equal(first.ordinal, 1);
		const receipt = (JSON.parse(await read(first.handoff!.source)) as ImplementationSource).source;
		const base = t.writer.verification!.commit;
		const store = effectsStore(t);
		assert.equal(
			git(store, ["rev-parse", proposalRef("workflow:3")])
				.toString()
				.trim(),
			base,
			"canonical ref bound to T0",
		);
		assert.equal(first.handoff!.preparations?.length, 1);
		const x1 = await prepared(first.handoff!.preparations![0]!);
		assert.equal(x1.outcome, "checked");
		assert.deepEqual(x1.target, { proposal: "workflow:3", ref: proposalRef("workflow:3"), commit: base });
		assert.equal(x1.preparation?.kind, "clean");
		assert.equal(x1.preparation?.base, base, "recorded assignment base, not the sealed capture parent");
		assert.equal(x1.preparation?.source, receipt.source.commit);
		assert.equal(x1.preparation?.result, receipt.source.commit, "validated fast path keeps B as X");
		assert.equal(x1.preparation?.tree, receipt.source.tree);
		assert.equal(x1.preparation?.algorithm, "git-merge-tree-write-tree-z/v1");
		assert.match(x1.preparation?.profile ?? "", /^render-trusted-git\/v1/);
		assert.equal(x1.checks?.verification.status, "passed");
		assert.equal(x1.checks?.verification.inputCommit, receipt.source.commit);
		assert.equal(x1.checks?.verification.resultTree, receipt.source.tree);
		assert.ok(
			x1.checks?.results.every((r) =>
				r.steps.every((s) => s.platform.os === "linux" && s.verifierRevision === x1.checks?.verifierRevision),
			),
			"checks ran in Linux against X's own verifier",
		);
		assert.match(first.handoff!.blocker!, new RegExp(`prepared ${receipt.source.commit} checked on current target ${base}`));
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "no Watchdog is invented");
		// Another Slice integrates a conflicting change; an explicit retry prepares the current target.
		const T1 = advanceTarget(store, base, { value: "T\n" }, base);
		const owner = t.assignments().find((a) => a.id === opening.assignment)!;
		accepted(
			await t.f.command({ type: "retryPreparation", assignment: owner.id, generation: owner.generation, attempt: owner.attempt }, admin),
		);
		await t.wait(() => passes().length === 2, "real conflict opens P2");
		const returned = structuredClone(passes()[0]!);
		const conflict = await prepared(returned.handoff!.preparations![1]!);
		assert.equal(conflict.outcome, "conflict");
		assert.equal(conflict.attempt, 2);
		assert.equal(conflict.target.commit, T1);
		assert.deepEqual(conflict.preparation?.conflicts, ["value"]);
		assert.equal(conflict.checks, null, "conflicts are never checked or reviewed");
		const opened = { assignment: passes()[1]!.assignment, observation: passes()[1]!.opening!.observation };
		const text = await read(opened.observation);
		assert.deepEqual(JSON.parse(text), {
			schema: 1,
			cause: "preparation-conflict",
			repository: receipt.source.repository,
			source: first.handoff!.source,
			sourceCommit: receipt.source.commit,
			baseCommit: base,
			targetCommit: T1,
			algorithm: "git-merge-tree-write-tree-z/v1",
			resultTree: conflict.preparation!.tree,
			conflicts: ["value"],
		});
		assert.notEqual(receipt.base.commit, base, "B's capture parent A is not the recorded original base T0");
		await t.wait(settled(opened.assignment), "second pass handoff");
		const p2Writer = t.assignments().find((a) => a.id === opened.assignment)!;
		assert.equal(p2Writer.status, "submitted", `expected second handoff, got ${p2Writer.blocker}`);
		const [p1, p2] = passes();
		assert.ok(p1 && p2);
		assert.deepEqual({ ...p1 }, returned, "P1 keeps its exact Audit, A, B and preparation outcomes");
		assert.equal(p2.predecessor, p1.ref);
		assert.equal(p2.opening?.base, T1);
		assert.ok(p2.handoff);
		const a1 = captureValue(await read(p1.captureA!));
		const a2 = captureValue(await read(p2.captureA!));
		assert.deepEqual(
			[a1, captureValue(await read(p1.captureB!)), a2, captureValue(await read(p2.captureB!))],
			["A\n", "B\n", "T\n", "C\n"],
		);
		const a2Commit = (JSON.parse(await read(p2.captureA!)) as ImplementationSource).source.source.commit;
		const retained = join(t.f.source.root, "catalog-owned", "effects", "projects", `${receipt.source.repository}.git`);
		assert.doesNotThrow(() => git(retained, ["merge-base", "--is-ancestor", T1, a2Commit]), "host-sealed A2 descends from T1");
		const audits = t.prompts.filter((p) => p.auditReview);
		assert.equal(audits.length, 4, "each pass has exactly its own two reviewers");
		assert.deepEqual(audits.map((p) => p.auditReview!.passRef).sort(), [p1.ref, p1.ref, p2.ref, p2.ref]);
		for (const p of audits) assert.equal(p.auditReview!.source, p.auditReview!.passRef === p2.ref ? p2.captureA : p1.captureA);
		const reviewers = t.assignments().filter((a) => a.auditReview);
		assert.equal(new Set(reviewers.map((a) => a.conversation)).size, 4, "P2 reviewers are fresh contexts");
		const successorPrompts = t.prompts.filter((p) => p.implementation?.ordinal === 2);
		assert.ok(successorPrompts.length);
		assert.ok(
			successorPrompts[0]!.inputs?.some((input) => input.ref === opened.observation && input.text === text),
			"the writer sees the exact conflict",
		);
		// TP24: Git's exact conflict output and the B/T0/T1 identities arrive as a scoped input, not just paths.
		const conflictRef = returned.handoff!.preparations![1]!;
		assert.ok(
			successorPrompts[0]!.inputs?.some((input) => input.ref === conflictRef && input.text === JSON.stringify(conflict)),
			"the writer receives the exact retained conflict record",
		);
		assert.match(
			Buffer.from(conflict.preparation!.stdout, "base64").toString(),
			/CONFLICT \(content\): Merge conflict in value/,
			"the record keeps Git's exact conflict output bytes",
		);
		assert.deepEqual(
			[conflict.preparation!.source, conflict.preparation!.base, conflict.preparation!.target],
			[receipt.source.commit, base, T1],
		);
		// Read-only original B, T0 and T1 are mounted beside the writable T1 workspace.
		assert.equal(t.originals(), "B\nA\nT\nORIGINALS_READ_ONLY\n", "the successor reads B, T0 and T1 but cannot change them");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "conflict starts no Watchdog");
		await t.wait(() => /^awaiting_watchdog/.test(passes()[1]?.handoff?.blocker ?? ""), "P2 prepared and checked");
		const x2 = await prepared(passes()[1]!.handoff!.preparations![0]!);
		const b2 = (JSON.parse(await read(p2.handoff.source)) as ImplementationSource).source.source;
		assert.equal(x2.outcome, "checked");
		assert.equal(x2.preparation?.base, T1, "P2's recorded base is T1");
		assert.equal(x2.target.commit, T1);
		assert.equal(x2.preparation?.result, b2.commit, "B2 already includes T1");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0);
		const twoPass = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in twoPass && twoPass.manifest.complete);
		for (const ref of [
			p1.record,
			p2.record,
			p1.handoff!.record,
			p2.handoff.record,
			p2.captureA!,
			p2.captureB!,
			opened.observation as string,
			...p1.handoff!.preparations!,
			...passes()[1]!.handoff!.preparations!,
		])
			assert.ok(twoPass.content[ref], `export retains ${ref}`);
		// A well-formed result whose base never resolves leaves visible blockage, not a silently stalled writer.
		const sealedP2 = (JSON.parse(await read(p2.handoff.source)) as ImplementationSource).source;
		const unavailable = accepted(
			await t.f.command(
				{
					type: "openSuccessorPass",
					assignment: p2Writer.id,
					generation: p2Writer.generation,
					attempt: p2Writer.attempt,
					text: JSON.stringify({
						schema: 1,
						cause: "preparation-conflict",
						repository: sealedP2.source.repository,
						source: p2.handoff.source,
						sourceCommit: sealedP2.source.commit,
						baseCommit: T1,
						targetCommit: "f".repeat(40),
						algorithm: "merge-tree-write-tree",
						resultTree: conflict.preparation!.tree,
						conflicts: ["value"],
					}),
				},
				mintContext({ kind: "host", scope: "effects" }),
			),
		);
		await t.wait(settled(unavailable.assignment), "unavailable successor source");
		const stalled = t.assignments().find((a) => a.id === unavailable.assignment)!;
		assert.equal(stalled.status, "blocked");
		assert.match(stalled.blocker ?? "", /^implementation_opening_source_unavailable/);
		assert.equal(t.prompts.filter((p) => p.implementation?.ordinal === 3).length, 0, "no writer turn starts without its base");
		assert.equal(passes()[2]?.workspace, undefined);
		const settledExport = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in settledExport);
		const page = await Effect.runPromise(t.f.ledger.observe(admin, { history: { workflow: "workflow:3", limit: "1" } }));
		assert.ok("next" in page && page.next);
		assert.equal(page.cutoff, settledExport.manifest.cutoff);
		t.gate.resolve();
		await t.f.reopen();
		assert.equal(passes().length, 3);
		assert.equal(passes()[0]!.handoff!.record, p1.handoff!.record);
		const after = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { cursor: page.next } }));
		assert.ok("manifest" in after && after.manifest.complete);
		assert.equal(after.manifest.cutoff, settledExport.manifest.cutoff);
		for (const ref of [opening.passRecord, pass.handoff.record, ...reviews.map((a) => a.report), A, pass.captureB])
			assert.equal(after.content[ref as string], exported.content[ref as string]);
	} finally {
		await t.close();
	}
});

async function preparedHarness(t: Awaited<ReturnType<typeof fixture>>) {
	const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
	const read = async (ref: string) => {
		const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
		assert.ok("content" in value, `read ${ref}`);
		return value.content.toString();
	};
	const prepared = async (ref: string) => JSON.parse(await read(ref)) as Prepared;
	const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
	const P1 = opening.passRef as string;
	// Park the host at its first canonical observation so another Slice's integration lands first.
	holdAt("before-target-observe", `preparation-observe:${P1}:0`);
	await parked("first canonical observation");
	const B = (JSON.parse(await read(passes()[0]!.handoff!.source)) as ImplementationSource).source.source;
	return { passes, read, prepared, opening, P1, B, base: t.writer.verification!.commit, store: effectsStore(t) };
}

test("TP01/TP11/TP13: clean merge, drift after combined checks and a failing X check return a new pass without Watchdog or Audit", async () => {
	const t = await fixture({ successorStops: true });
	try {
		const h = await preparedHarness(t);
		const T1 = advanceTarget(h.store, h.base, { target: "T1\n" }, null);
		releaseBarrier(["before-target-observe", `preparation-observe:${h.P1}:1`]);
		await parked("reobservation after X1 checks");
		const x1 = await h.prepared(h.passes()[0]!.handoff!.preparations![0]!);
		assert.equal(x1.outcome, "checked");
		assert.equal(x1.target.commit, T1);
		assert.equal(x1.preparation?.kind, "clean");
		assert.notEqual(x1.preparation?.result, h.B.commit, "a real combined commit, not B");
		assert.equal(git(h.store, ["show", `${x1.preparation!.result}:value`]).toString(), "B\n");
		assert.equal(git(h.store, ["show", `${x1.preparation!.result}:target`]).toString(), "T1\n");
		assert.equal(x1.checks?.verification.inputCommit, x1.preparation?.result, "checks name actual X");
		const audited = t.assignments().filter((a) => a.auditReview).length;
		assert.equal(audited, 2);
		// T2 lands after X1/T1 checks and before any review launch. Combined with B it fails the required suite.
		const T2 = advanceTarget(h.store, T1, { "verify-suite": 'test "$(cat value)" = A\n' }, T1);
		releaseBarrier();
		await t.wait(() => h.passes().length === 2, "failed combined check opens P2");
		const [p1, p2] = h.passes();
		assert.ok(p1?.handoff && p2);
		assert.equal(p1.handoff.preparations?.length, 2, "drift re-prepared under the same handed-off pass");
		const x2 = await h.prepared(p1.handoff.preparations![1]!);
		assert.equal(x2.attempt, 2);
		assert.equal(x2.outcome, "check-failure");
		assert.equal(x2.target.commit, T2);
		assert.equal(x2.preparation?.base, h.base);
		assert.deepEqual(x2.checks?.failed, [{ name: "full-suite", exitCode: 1 }]);
		assert.equal(x2.checks?.verification.status, "failed");
		assert.equal(git(h.store, ["show", `${x2.preparation!.result}:value`]).toString(), "B\n");
		assert.equal(p2.cause, "prepared-check-failure");
		assert.equal(p2.predecessor, p1.ref);
		assert.equal(p2.opening?.base, x2.preparation?.result, "repair starts from actual X2");
		assert.equal(p2.opening?.target, T2);
		assert.deepEqual(JSON.parse(await h.read(p2.opening!.observation)), {
			schema: 1,
			cause: "prepared-check-failure",
			repository: PROJECT,
			source: p1.handoff.source,
			sourceCommit: h.B.commit,
			baseCommit: h.base,
			targetCommit: T2,
			preparedCommit: x2.preparation!.result,
			verifierRevision: x2.checks!.verifierRevision,
			failed: [{ name: "full-suite", exitCode: 1 }],
		});
		assert.equal(t.assignments().filter((a) => a.auditReview).length, audited, "no Audit for drift or X");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "no Watchdog launch or count");
	} finally {
		clearBarrier();
		await t.close();
	}
});

/** A target verifier defect on clean X: one non-pass record, then a verifier-repair pass from X with no check, Audit or Watchdog. */
async function verifierDefect(verifier: (text: string) => string, defect: RegExp, suite = "exit 17\n") {
	const t = await fixture({ successorStops: true });
	try {
		const h = await preparedHarness(t);
		const suiteLine = /^\| full-suite \| Process \| executed \| `sh verify-suite` \| SUITE OK \| tests \|$/m;
		assert.match(t.f.text, suiteLine, "fixture verifier defines an executable full-suite row");
		// `suite` is X's actual suite: failing in TP22/TP23, so a defective row standing in for it must never let X pass.
		const T1 = advanceVerifier(h.store, h.base, verifier(t.f.text), suite);
		releaseBarrier();
		const settled = () => h.passes().length === 2 || /^awaiting_watchdog/.test(h.passes()[0]?.handoff?.blocker ?? "");
		await t.wait(settled, "preparation settles on X");
		assert.doesNotMatch(h.passes()[0]?.handoff?.blocker ?? "", /^awaiting_watchdog/, "X must not be checked ready for Watchdog");
		assert.equal(h.passes().length, 2, "verifier defect opens a repair pass");
		const [p1, p2] = h.passes();
		assert.ok(p1?.handoff && p2);
		const records = await Promise.all(p1.handoff.preparations!.map((ref) => h.prepared(ref)));
		assert.equal(records.length, 1, "one attempt, not a retry loop");
		const x = records[0]!;
		assert.equal(x.outcome, "verifier-defect");
		assert.equal(x.target.commit, T1);
		assert.equal(x.preparation?.kind, "clean");
		assert.equal(x.checks, null, "no check result is fabricated for a definition defect");
		assert.match(x.reason ?? "", defect);
		assert.equal(git(h.store, ["show", `${x.preparation!.result}:verify-suite`]).toString(), suite);
		assert.equal(p1.handoff.blocker, undefined, "a lawful return, not a stranded operational blocker");
		assert.equal(p2.cause, "prepared-verifier-defect");
		assert.equal(p2.predecessor, p1.ref);
		assert.equal(p2.opening?.base, x.preparation?.result, "repair starts from actual X");
		assert.equal(p2.opening?.target, T1);
		assert.deepEqual(JSON.parse(await h.read(p2.opening!.observation)), {
			schema: 1,
			cause: "prepared-verifier-defect",
			repository: PROJECT,
			source: p1.handoff.source,
			sourceCommit: h.B.commit,
			baseCommit: h.base,
			targetCommit: T1,
			preparedCommit: x.preparation!.result,
			defect: x.reason,
		});
		assert.equal(t.assignments().filter((a) => a.auditReview).length, 2, "the repair pass's Audit is its own, later");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "no Watchdog launch or count");
	} finally {
		clearBarrier();
		await t.close();
	}
}
test("TP22: a target verifier that makes a required row discovery-only is a verifier defect, never a pass on X", () =>
	verifierDefect(
		(text) =>
			text.replace(/^\| full-suite \|.*$/m, "| full-suite | Process | generated | `printf 'DISCOVERY ONLY'` | Discovery only | - |"),
		/full-suite.*(generated|cannot prove)/,
	));
test("TP23: a target verifier that renames a required row opens a verifier-repair pass instead of stranding the handoff", () =>
	verifierDefect((text) => text.replace(/^\| full-suite \|/m, "| suite-renamed |"), /Missing catalog row: full-suite/));

test("TP27: a target verifier that lowers the behavioral journey below the policy minimum is a verifier defect, never a pass on X", () =>
	verifierDefect(
		(text) => {
			const journey = "| behavior | Process | journey | `.skl/journey.md` | STEP OK and independent sanity |";
			assert.ok(text.includes(`${journey} tests |`), "fixture behavioral journey starts at the workflow's minimum rank tests");
			return text.replace(`${journey} tests |`, `${journey} static |`);
		},
		/behavior.*static.*below.*minimum.*tests/,
		// Every check still succeeds: only the rank, not an execution failure, separates X from a pass.
		"printf 'SUITE OK'\n",
	));

test("TP28: a policy adopted while X's checks run never leaves X qualified under the superseded binding", async () => {
	const t = await fixture({ successorStops: true });
	try {
		const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		holdAt("before-prepared-check", `prepared-check:${opening.passRef}:1`);
		await parked("X checks under the handoff-time binding");
		const old = policyOf(t).bindings["workflow:3"]!;
		assert.equal(policyOf(t).revisions[old.policy]!.minimumEvidenceRank, "tests", "X's checks started under minimum tests");
		const published = accepted(
			await Effect.runPromise(
				t.f.ledger.command(
					{
						version: 1,
						authorityEpoch: t.f.ledger.status().authorityEpoch,
						commandId: "tp28-stricter-policy",
						command: {
							type: "changePolicy",
							expectedRevision: policyOf(t).defaultRevision,
							policy: { completedReviewLimit: 2, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "live" },
						},
					},
					admin,
				),
			),
		);
		const adopted = accepted(await t.f.command({ type: "adoptPolicy", revision: published.policy, expectedBinding: old.revision }, admin));
		releaseBarrier();
		const blocker = () => passes()[0]?.handoff?.blocker ?? "";
		await t.wait(() => passes().length === 2 || /^awaiting_watchdog/.test(blocker()), "preparation settles after adoption");
		assert.doesNotMatch(blocker(), /^awaiting_watchdog/, "X must not be checked ready for Watchdog under a superseded policy");
		const [p1, p2] = passes();
		assert.ok(p1?.handoff && p2, "the stricter policy's verifier defect opens a repair pass");
		const records = await Promise.all(
			p1.handoff.preparations!.map(async (ref) => {
				const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
				assert.ok("content" in value);
				return JSON.parse(value.content.toString()) as Prepared;
			}),
		);
		assert.equal(records.length, 1, "nothing qualified under the superseded binding is retained");
		const x = records[0]!;
		assert.deepEqual(x.policy, { binding: adopted.binding, revision: published.policy, minimumEvidenceRank: "live" });
		assert.equal(x.outcome, "verifier-defect");
		assert.equal(x.checks, null, "no check result is qualified for a definition below the adopted minimum");
		assert.match(x.reason ?? "", /behavior.*tests.*below.*minimum.*live/);
		assert.equal(p2.cause, "prepared-verifier-defect");
		assert.equal(p2.opening?.base, x.preparation?.result, "repair starts from actual X");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "no Watchdog launch or count");
	} finally {
		clearBarrier();
		await t.close();
	}
});

test("TP29: missing retained policy bytes block preparation instead of qualifying X with the cached policy; restored bytes and a retry check X", async () => {
	const t = await fixture();
	try {
		const h = await preparedHarness(t);
		const binding = policyOf(t).bindings["workflow:3"]!;
		assert.equal(policyOf(t).revisions[binding.policy]!.minimumEvidenceRank, "tests", "the cached policy still says tests");
		const db = new DatabaseSync(join(t.f.data, "render.db"));
		const removed: Record<string, SQLInputValue>[] = [];
		try {
			for (const row of db.prepare("SELECT * FROM entries").all()) {
				const entry = JSON.parse(String(row.record)) as { kind: string; data: { ref?: string } };
				if (entry.kind !== "render.policy" || entry.data.ref !== binding.policy) continue;
				removed.push(row as Record<string, SQLInputValue>);
				db.prepare("DELETE FROM entries WHERE id = ?").run(row.id as number);
			}
		} finally {
			db.close();
		}
		assert.equal(removed.length, 1, "the current immutable policy revision is actually removed");
		const control = await t.f.command({ type: "adoptPolicy", revision: binding.policy, expectedBinding: binding.revision }, admin);
		assert.ok(control.status === "refused" && control.code === "missing_content", "the store really lacks those policy bytes");
		releaseBarrier();
		await t.wait(() => !!h.passes()[0]?.handoff?.blocker, "preparation settles without its policy bytes");
		const blocked = structuredClone(h.passes());
		assert.doesNotMatch(blocked[0]!.handoff!.blocker!, /^awaiting_watchdog/, "X must not be checked ready for Watchdog on a cached policy");
		assert.match(blocked[0]!.handoff!.blocker!, /missing_content.*policy/);
		assert.equal(blocked[0]!.handoff!.preparations, undefined, "no record qualified on a cached policy is retained");
		assert.equal(blocked.length, 1, "no successor pass");
		const restore = new DatabaseSync(join(t.f.data, "render.db"));
		try {
			for (const row of removed) {
				const columns = Object.keys(row);
				restore
					.prepare(`INSERT INTO entries (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
					.run(...columns.map((c) => row[c]!));
			}
		} finally {
			restore.close();
		}
		const owner = t.assignments().find((a) => a.id === h.opening.assignment)!;
		accepted(
			await t.f.command({ type: "retryPreparation", assignment: owner.id, generation: owner.generation, attempt: owner.attempt }, admin),
		);
		await t.wait(() => /^awaiting_watchdog/.test(h.passes()[0]?.handoff?.blocker ?? ""), "retried preparation checked");
		const [p1, ...others] = h.passes();
		assert.equal(others.length, 0, "the retry keeps the handed-off pass");
		assert.deepEqual({ ...p1, handoff: undefined }, { ...blocked[0], handoff: undefined }, "same pass, B and Audit");
		assert.equal(p1!.handoff!.preparations?.length, 1);
		const x = await h.prepared(p1!.handoff!.preparations![0]!);
		assert.equal(x.outcome, "checked");
		assert.deepEqual(x.policy, { binding: binding.revision, revision: binding.policy, minimumEvidenceRank: "tests" });
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "no Watchdog launch or count");
	} finally {
		clearBarrier();
		await t.close();
	}
});

test("TP30: each explicit retry of a checked handoff settles visibly and stays retryable, even when its result repeats the last one", async () => {
	const t = await fixture();
	try {
		const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const blocker = () => passes()[0]?.handoff?.blocker ?? "";
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => /^awaiting_watchdog/.test(blocker()), "first preparation checked");
		const first = blocker();
		const old = policyOf(t).bindings["workflow:3"]!;
		const current = policyOf(t).revisions[old.policy] as { minimumEvidenceRank: string | null } & Record<string, unknown>;
		assert.equal(current.minimumEvidenceRank, "tests");
		// A new binding that keeps minimum tests: X and T are unchanged, so the rechecked readiness reads exactly as before.
		const published = accepted(
			await Effect.runPromise(
				t.f.ledger.command(
					{
						version: 1,
						authorityEpoch: t.f.ledger.status().authorityEpoch,
						commandId: "tp30-review-limit",
						command: {
							type: "changePolicy",
							expectedRevision: policyOf(t).defaultRevision,
							policy: { completedReviewLimit: 3, reviewerDiversity: "human-directed-same-family", minimumEvidenceRank: "tests" },
						},
					},
					admin,
				),
			),
		);
		const adopted = accepted(await t.f.command({ type: "adoptPolicy", revision: published.policy, expectedBinding: old.revision }, admin));
		const retry = async () => {
			const owner = t.assignments().find((a) => a.id === opening.assignment)!;
			return t.f.command({ type: "retryPreparation", assignment: owner.id, generation: owner.generation, attempt: owner.attempt }, admin);
		};
		accepted(await retry());
		assert.equal(blocker(), "", "the retry clears the settled result");
		await t.wait(() => passes()[0]?.handoff?.preparations?.length === 2, "retried preparation records X under the adopted binding");
		await t.wait(() => blocker() !== "", "a settled retry must leave a visible result, not a cleared blocker");
		assert.equal(blocker(), first, "same X on the same target: the readiness reads as before");
		const [p1, ...others] = passes();
		assert.equal(others.length, 0, "the retry keeps the handed-off pass");
		const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: p1!.handoff!.preparations![1]! }));
		assert.ok("content" in value);
		const x = JSON.parse(value.content.toString()) as Prepared;
		assert.equal(x.outcome, "checked");
		assert.deepEqual(x.policy, { binding: adopted.binding, revision: published.policy, minimumEvidenceRank: "tests" });
		// Nothing changed since: a further retry is still actionable and settles to the same visible result again.
		accepted(await retry());
		await t.wait(() => blocker() !== "", "a repeated retry must also leave a visible result");
		assert.equal(blocker(), first);
		assert.equal(passes().length, 1, "still the same handed-off pass");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "no Watchdog launch or count");
	} finally {
		await t.close();
	}
});

test("TP08/TP12/TP14: an aborted merge stays operational across restart until an explicit retry, which keeps the pass and Audit", async () => {
	const t = await fixture();
	const path = process.env.PATH;
	try {
		const h = await preparedHarness(t);
		const T1 = advanceTarget(h.store, h.base, { target: "T1\n" }, null);
		const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
		const bin = join(t.f.source.root, "bin");
		await mkdir(bin);
		await writeFile(
			join(bin, "git"),
			`#!/bin/sh\nfor arg do\n if [ "$arg" = merge-tree ]; then\n printf 'abort diagnostic' >&2; kill -ABRT $$\n fi\ndone\nexec '${realGit}' "$@"\n`,
			{ mode: 0o700 },
		);
		process.env.PATH = `${bin}:${path}`;
		releaseBarrier();
		await t.wait(() => /SIGABRT/.test(h.passes()[0]?.handoff?.blocker ?? ""), "operational blockage");
		process.env.PATH = path;
		const blocked = structuredClone(h.passes());
		assert.equal(blocked.length, 1, "no successor pass");
		const operational = await h.prepared(blocked[0]!.handoff!.preparations![0]!);
		assert.equal(operational.outcome, "operational");
		assert.match(operational.reason ?? "", /SIGABRT.*abort diagnostic/s);
		assert.equal(operational.target.commit, T1);
		assert.equal(operational.checks, null);
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0);
		t.gate.resolve(); // let the parked design coordinator settle so the store can close
		await t.f.reopen(
			new Engine({
				ownedChecks: t.f.config,
				provider: t.f.provider.provider,
				...claudeFixture,
			}),
		);
		await setTimeout(500);
		assert.deepEqual(h.passes(), blocked, "restart neither retries nor duplicates an operational outcome");
		const owner = t.assignments().find((a) => a.id === h.opening.assignment)!;
		accepted(
			await t.f.command({ type: "retryPreparation", assignment: owner.id, generation: owner.generation, attempt: owner.attempt }, admin),
		);
		await t.wait(() => /^awaiting_watchdog/.test(h.passes()[0]?.handoff?.blocker ?? ""), "retried preparation checked");
		const [p1, ...others] = h.passes();
		assert.equal(others.length, 0, "the retry keeps the handed-off pass");
		assert.deepEqual({ ...p1, handoff: undefined }, { ...blocked[0], handoff: undefined }, "same pass, B and Audit");
		assert.equal(p1!.handoff!.preparations?.length, 2);
		const retried = await h.prepared(p1!.handoff!.preparations![1]!);
		assert.equal(retried.outcome, "checked");
		assert.equal(retried.target.commit, T1);
		assert.equal(t.assignments().filter((a) => a.auditReview).length, 2, "no new Audit");
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0);
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of p1!.handoff!.preparations!) assert.ok(exported.content[ref], `export retains ${ref}`);
	} finally {
		process.env.PATH = path;
		clearBarrier();
		await t.close();
	}
});

test("absent selected verifier is bootstrapped in Linux and retained in both checked captures", async () => {
	const t = await fixture({ bootstrap: true });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => {
			const a = t.assignments().find((x) => x.id === opening.assignment);
			return !!a && !a.executing && (a.status === "submitted" || (a.status === "blocked" && a.blocker !== "awaiting_role_results"));
		}, "bootstrap handoff");
		const owner = t.assignments().find((a) => a.id === opening.assignment)!;
		assert.equal(owner.status, "submitted", owner.blocker ?? "bootstrap handoff");
		const pass = ((t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[]).find(
			(p) => p.ref === opening.passRef,
		);
		assert.ok(pass?.captureA && pass.captureB && pass.audit && pass.handoff);
		const reviews = t.assignments().filter((a) => a.parent === owner.id && ["audit-standards", "audit-contracts"].includes(a.packet.role));
		assert.equal(reviews.length, 2);
		assert.ok(reviews.every((a) => a.status === "submitted"));
		for (const [ref, value] of [
			[pass.captureA, "A\n"],
			[pass.captureB, "B\n"],
		] as const) {
			const retained = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in retained);
			const text = retained.content.toString();
			assert.equal(captureValue(text), value);
			assert.equal(captureFile(text, ".skl/verify.md"), t.f.text);
			const source = JSON.parse(text) as ImplementationSource;
			const results = source.verification?.results;
			for (const name of rows) {
				const result = results?.find((r) => r.name === name);
				assert.equal(result?.status, "completed", `selected ${name} ran`);
				assert.ok(result.steps.length > 0, `${name} has executed steps`);
			}
			assert.ok(results?.find((r) => r.name === "full-suite")?.steps.some((s) => s.stdout.includes("SUITE OK")));
		}
	} finally {
		await t.close();
	}
});

test("raw checkpoint cannot hand off checked B after writer changes workspace to C", async () => {
	const t = await fixture({ finding: true, staleFinal: true });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => {
			const owner = t.assignments().find((a) => a.id === opening.assignment);
			return !!owner && !owner.executing && !!owner.runtimeTaskCaptured;
		}, "raw stale handoff outcome retained");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in exported && exported.manifest.complete, "terminal tool results are retained");
		const history =
			exported.jsonl +
			Object.values(exported.content)
				.map((bytes) => Buffer.from(bytes, "base64").toString())
				.join("\n");
		assert.equal(t.rawHandoffAttempted(), true, "provider invoked raw handoff after Linux wrote C");
		const pass = ((t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[]).find(
			(p) => p.ref === opening.passRef,
		);
		assert.ok(pass?.captureA && pass.audit, "original A and Audit remain retained");
		assert.equal(pass.handoff, undefined, "stale checked B must not create a handoff or preparation");
		assert.match(
			history,
			/missing_content|final_verification_required|current.*capture/i,
			"raw handoff explains missing current checked source",
		);
	} finally {
		await t.close();
	}
});

test("failed final catalog blocks handoff and does not initiate another Audit", async () => {
	const t = await fixture({ failFinal: true });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => {
			const a = t.assignments().find((x) => x.id === opening.assignment);
			return !!a && !a.executing && ((a.status === "blocked" && a.blocker !== "awaiting_role_results") || a.status === "submitted");
		}, "failed final checks");
		const writer = t.assignments().find((a) => a.id === opening.assignment)!;
		assert.equal(writer.status, "blocked", "failed final checks cannot submit handoff");
		const frame = t.f.ledger.snapshot(admin) as Frame;
		const pass = (frame.implementationPasses as ImplementationPass[]).find((p) => p.ref === opening.passRef);
		assert.ok(pass?.captureB, "final source and its check evidence are retained even when non-pass");
		assert.equal(pass.handoff, undefined, "failed evidence never commits a handoff or preparation task");
		const retained = await Effect.runPromise(t.f.ledger.artifact(admin, { read: pass.captureB }));
		assert.ok("content" in retained);
		const capture = JSON.parse(retained.content.toString()) as ImplementationSource;
		assert.equal(captureValue(retained.content.toString()), "B\n");
		assert.equal(capture.verification?.verification.status, "non-pass");
		const suite = capture.verification?.results.find((result) => result.name === "full-suite");
		assert.equal(suite?.status, "failed");
		assert.ok(
			suite.steps.some((step) => step.exitCode === 7),
			"actual selected suite exited 7",
		);
		const reviews = t.assignments().filter((a) => a.parent === writer.id && ["audit-standards", "audit-contracts"].includes(a.packet.role));
		assert.equal(reviews.length, 2, "one Audit only");
		assert.ok(reviews.every((a) => a.status === "submitted"));
		assert.equal(writer.report, null);
		assert.ok(!t.assignments().some((a) => a.packet.role === "watchdog" && a.status === "submitted"));
	} finally {
		await t.close();
	}
});

test("fixed Audit finding references prechecked exact B and handoff reuses that capture", async () => {
	const t = await fixture({ finding: true });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => {
			const a = t.assignments().find((x) => x.id === opening.assignment);
			return !!a && !a.executing && (a.status === "submitted" || (a.status === "blocked" && a.blocker !== "awaiting_role_results"));
		}, "fixed finding handoff");
		const owner = t.assignments().find((a) => a.id === opening.assignment);
		assert.equal(owner?.status, "submitted", owner?.blocker ?? "handoff requires prechecked B");
		const pass = ((t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[]).find(
			(p) => p.ref === opening.passRef,
		);
		assert.ok(pass?.captureA && pass.captureB && pass.handoff && pass.audit);
		assert.notEqual(pass.captureA, pass.captureB);
		const handed = await Effect.runPromise(t.f.ledger.artifact(admin, { read: pass.handoff.record }));
		assert.ok("content" in handed);
		const handoff = JSON.parse(handed.content.toString()) as {
			captureB: string;
			dispositions: { report: string; finding: string; disposition: string; changes: string[]; rechecks: string[] }[];
		};
		assert.equal(handoff.captureB, pass.captureB, "handoff must reuse the model-visible sealed B");
		assert.deepEqual(handoff.dispositions, [
			{
				report: pass.audit.results.standards?.report,
				finding: "F1",
				disposition: "fixed",
				reason: "Changed value to B",
				changes: [pass.captureB],
				rechecks: ["full-suite"],
			},
		]);
		const report = await Effect.runPromise(t.f.ledger.artifact(admin, { read: pass.audit.results.standards!.report }));
		assert.ok("content" in report);
		assert.match(report.content.toString(), /Replace A with B/);
		const source = await Effect.runPromise(t.f.ledger.artifact(admin, { read: pass.captureB }));
		assert.ok("content" in source);
		assert.equal(captureValue(source.content.toString()), "B\n");
	} finally {
		await t.close();
	}
});

test("cancel accepted writer stops its Docker runtime and aborts the active provider before releasing execution", async () => {
	const t = await fixture({ hold: "writer" });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(t.held, "writer provider active after real workspace execution");
		const writer = t.assignments().find((a) => a.id === opening.assignment);
		assert.ok(writer?.executing);
		const root = join(t.f.config.root, "sandboxes");
		const ids = await readdir(root);
		const runtimes: string[] = [];
		for (const id of ids) {
			const state = JSON.parse(await readFile(join(root, id, "state.json"), "utf8")) as { handle: { runtime: string } };
			runtimes.push(state.handle.runtime);
		}
		assert.ok(runtimes.length, "actual allocated Docker runtime exists");
		for (const runtime of runtimes)
			assert.equal(execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", runtime], { encoding: "utf8" }).trim(), "true");
		accepted(
			await t.f.command({ type: "cancelWork", assignment: writer.id, generation: writer.generation, attempt: writer.attempt }, admin),
		);
		await t.wait(() => !t.assignments().find((a) => a.id === writer.id)?.executing, "writer quiescence");
		assert.ok(t.aborted(), "provider must have observed abort before execution is released");
		for (const runtime of runtimes)
			assert.equal(execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", runtime], { encoding: "utf8" }).trim(), "false");
		assert.equal(t.assignments().find((a) => a.id === writer.id)?.status, "canceled");
	} finally {
		await t.close();
	}
});

test("lost Docker create response for accepted writer never proves environment absent", async () => {
	const t = await fixture();
	const tools = join(t.f.source.root, "fault-tools");
	await mkdir(tools);
	const docker = execFileSync("sh", ["-c", "command -v docker"], { encoding: "utf8" }).trim();
	await writeFile(
		join(tools, "docker"),
		`#!/bin/sh\nif [ "$1" = create ]; then "${docker}" "$@" >/dev/null 2>&1; echo 'lost create response' >&2; exit 1; fi\nexec "${docker}" "$@"\n`,
		{ mode: 0o755 },
	);
	const path = process.env.PATH;
	process.env.PATH = `${tools}:${path}`;
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(() => t.assignments().find((a) => a.id === opening.assignment)?.status === "blocked", "lost Docker create response");
		const a = t.assignments().find((a) => a.id === opening.assignment);
		assert.ok(a);
		assert.equal(a.executing, true, "unknown allocated runtime must retain execution ownership");
		const root = join(t.f.config.root, "sandboxes");
		const ids = await readdir(root);
		assert.ok(ids.length);
		const state = JSON.parse(await readFile(join(root, ids[0]!, "state.json"), "utf8")) as { handle: { runtime: string } };
		assert.notEqual(
			execFileSync(docker, ["ps", "-aq", "--filter", `name=^${state.handle.runtime}$`], { encoding: "utf8" }).trim(),
			"",
			"real runtime was allocated despite lost response",
		);
		await setTimeout(1000);
		assert.equal(t.assignments().find((x) => x.id === a.id)?.executing, true, "quiescence must not later mark the unknown runtime absent");
	} finally {
		process.env.PATH = path;
		await t.close();
	}
});

test("reopen after one Audit report continues same pass and incomplete original reviewer invocation", async () => {
	const t = await fixture({ hold: "contracts" });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(
			() => t.held() && t.assignments().some((a) => a.packet.role === "audit-standards" && a.status === "submitted"),
			"one completed and one active Audit reviewer",
		);
		const before = (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const pass = before.find((p) => p.ref === opening.passRef);
		assert.ok(pass?.audit && pass.captureA);
		const standards = t.assignments().find((a) => a.packet.role === "audit-standards");
		const contracts = t.assignments().find((a) => a.packet.role === "audit-contracts");
		assert.ok(standards?.report && contracts);
		const report = standards.report;
		t.gate.resolve();
		await t.f.reopen(
			new Engine({
				ownedChecks: t.f.config,
				provider: t.f.provider.provider,
				...claudeFixture,
			}),
		);
		t.release();
		await t.wait(() => {
			const a = t.assignments().find((x) => x.id === opening.assignment);
			return !!a && !a.executing && (a.status === "submitted" || (a.status === "blocked" && a.blocker !== "awaiting_role_results"));
		}, "resumed pass");
		const after = (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		assert.equal(after.length, 1, "recovery must not open a new pass");
		assert.equal(after[0]?.ref, pass.ref);
		assert.equal(after[0]?.captureA, pass.captureA);
		assert.equal(after[0]?.audit?.ref, pass.audit.ref);
		assert.equal(t.assignments().find((a) => a.id === standards.id)?.report, report);
		const recovered = t.assignments().find((a) => a.id === contracts.id);
		assert.equal(recovered?.status, "submitted", "original incomplete reviewer resumes and submits");
		assert.equal(
			t.assignments().filter((a) => a.parent === opening.assignment && ["audit-standards", "audit-contracts"].includes(a.packet.role))
				.length,
			2,
		);
		assert.equal(t.assignments().find((a) => a.id === opening.assignment)?.status, "submitted", "same writer continues to handoff");
	} finally {
		await t.close();
	}
});

test("missing Audit family blocks rather than silently falling back to another provider", async () => {
	const t = await fixture({ missingFamily: true });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await t.wait(
			() => t.assignments().some((a) => a.status === "blocked" && (a.id === opening.assignment || a.parent === opening.assignment)),
			"missing audit family",
		);
		const blocked = t
			.assignments()
			.filter((a) => a.status === "blocked" && (a.id === opening.assignment || a.parent === opening.assignment));
		assert.ok(
			blocked.some((a) => /family|model|capability/i.test(a.blocker ?? "")),
			JSON.stringify(blocked),
		);
		assert.equal(t.prompts.filter((p) => p.auditReview).length, 0);
	} finally {
		await t.close();
	}
});
