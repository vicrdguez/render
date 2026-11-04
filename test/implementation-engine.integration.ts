import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import type { ImplementationSource } from "../src/kernel/implementation.ts";
import type { IntakeManifest, Intakes } from "../src/kernel/intake.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { catalog, catalogFixture, rows } from "./support/catalog.ts";
import { admin, allowSameFamily, packet } from "./support/roles.ts";
import { git } from "./support/source.ts";

function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}

type Prompt = {
	packet: { role: string };
	intakeReview?: Record<string, unknown>;
	auditReview?: { passRef: string; audit: string; source: string; contract: string };
	implementation?: { ordinal?: number; captureB?: string; audit?: { reports?: unknown; results?: { standards?: { report: string } } } };
	inputs?: { ref: string; text: string }[];
};
type RetainedCapture = { source: { source: { entries: { path: string; content: string }[] } } };
function captureFile(text: string, path: string): string {
	const capture = JSON.parse(text) as RetainedCapture;
	const entry = capture.source.source.entries.find((item) => item.path === path);
	assert.ok(entry, `retained source includes ${path}`);
	return Buffer.from(entry.content, "base64").toString();
}
function captureValue(text: string): string {
	return captureFile(text, "value");
}

// These scripted checks exercise lifecycle and literal bytes, not semantic adequacy.
// Real acceptance, not a fabricated accepted Slice or a test-file import.
async function fixture(
	options: {
		exclusions?: string[];
		missingFamily?: boolean;
		failFinal?: boolean;
		hold?: "writer" | "contracts";
		finding?: boolean;
		bootstrap?: boolean;
		staleFinal?: boolean;
	} = {},
) {
	const f = await catalogFixture(true, { text: catalog().replaceAll("endpoint", "tests").replace("printf 'SUITE OK'", "sh verify-suite") });
	const originalTree = git(f.source.repo, ["rev-parse", `${f.selection.commit}^{tree}`])
		.toString()
		.trim();
	const value = git(f.source.repo, ["hash-object", "-w", "--stdin"], "A\n").toString().trim();
	let entries = git(f.source.repo, ["ls-tree", originalTree]).toString();
	if (options.bootstrap) {
		const journey = git(f.source.repo, ["ls-tree", `${f.selection.commit}:.skl`, "journey.md"]).toString();
		const skl = git(f.source.repo, ["mktree"], journey).toString().trim();
		entries = entries.replace(/^040000 tree [^\n]+\t\.skl$/m, `040000 tree ${skl}\t.skl`);
	}
	const suite = git(f.source.repo, ["hash-object", "-w", "--stdin"], "printf 'SUITE OK'\n").toString().trim();
	const tree = git(f.source.repo, ["mktree"], `${entries}100644 blob ${value}\tvalue\n100644 blob ${suite}\tverify-suite\n`)
		.toString()
		.trim();
	const commit = git(f.source.repo, ["commit-tree", tree], "Initial implementation source\n").toString().trim();
	f.selection.commit = commit;
	f.config.checks["revision:3"].commit = commit;
	if (options.bootstrap) {
		assert.equal(git(f.source.repo, ["ls-tree", commit, ".skl/verify.md"]).toString(), "");
		assert.notEqual(git(f.source.repo, ["ls-tree", commit, ".skl/journey.md"]).toString(), "");
		assert.equal(git(f.source.repo, ["show", `${commit}:value`]).toString(), "A\n");
		assert.equal(git(f.source.repo, ["show", `${commit}:verify-suite`]).toString(), "printf 'SUITE OK'\n");
	}
	if (options.exclusions) f.config.checks["revision:3"].profile.exclusions = options.exclusions;
	await allowSameFamily(f.ledger);
	const gate = Promise.withResolvers<void>();
	const prompts: Prompt[] = [];
	let writerTurn = 0;
	let successorTurn = 0;
	let rawHandoffAttempted = false;
	let checkedBeforeEdit: { B: string; report: string } | undefined;
	let held = false;
	let aborted = false;
	const release = Promise.withResolvers<void>();
	f.provider.setResponses(
		Array.from(
			{ length: 50 },
			() =>
				async (
					transcript: { messages: { role: string; content: unknown; sections?: Record<string, string | null> }[] },
					stream?: { signal?: AbortSignal },
				) => {
					const live = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])?.sections?.["role-packet"];
					const text = live
						? live.slice(live.indexOf("{"), live.lastIndexOf("}") + 1)
						: (transcript.messages.filter((m) => m.role === "user").at(-1)!.content as string);
					const prompt = JSON.parse(text) as Prompt;
					prompts.push(prompt);
					if (
						!held &&
						((options.hold === "writer" && prompt.packet.role === "implementer" && writerTurn === 1) ||
							(options.hold === "contracts" && prompt.packet.role === "audit-contracts"))
					) {
						held = true;
						assert.ok(stream?.signal, "provider request carries abort signal");
						await Promise.race([
							release.promise,
							new Promise<void>((resolve) => {
								const stop = () => {
									aborted = true;
									resolve();
								};
								if (stream.signal!.aborted) stop();
								else stream.signal!.addEventListener("abort", stop, { once: true });
							}),
						]);
						if (aborted) return fauxAssistantMessage("aborted");
					}
					if (prompt.packet.role === "coordinator") {
						await gate.promise;
						return fauxAssistantMessage("paused");
					}
					if (prompt.intakeReview)
						return fauxAssistantMessage(
							fauxToolCall("submit_role_result", {
								text: JSON.stringify({
									schema: 1,
									...prompt.intakeReview,
									checks: {
										omitted: "Compared",
										weakened: "Compared",
										strengthened: "Compared",
										contradictory: "Compared",
										invented: "Compared",
									},
									findings: [],
								}),
								supports: [],
							}),
							{ stopReason: "toolUse" },
						);
					if (prompt.auditReview) {
						const reviewer = ((f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[]).find(
							(a) => a.packet.role === prompt.packet.role && a.status === "running",
						);
						assert.ok(reviewer, "reviewer owns an active independent assignment");
						const principal = mintContext({
							kind: "assignment-agent",
							assignment: reviewer.id,
							generation: reviewer.generation,
							attempt: reviewer.attempt,
							role: reviewer.packet.role,
						});
						assert.ok(reviewer.packet.inputs.includes(prompt.auditReview.source), "reviewer input includes exact frozen A");
						const source = await f.ledger.artifact(principal, { read: prompt.auditReview.source });
						assert.ok("content" in source, "reviewer can read its actual bound source before reporting");
						assert.equal(captureValue(source.content.toString()), prompt.auditReview.passRef.endsWith(":2") ? "T\n" : "A\n");
						return fauxAssistantMessage(
							fauxToolCall("submit_role_result", {
								text: JSON.stringify({
									schema: 1,
									...prompt.auditReview,
									findings:
										options.finding && prompt.packet.role === "audit-standards"
											? [{ id: "F1", text: "Replace A with B", needsHuman: false }]
											: [],
								}),
								supports: [],
							}),
							{ stopReason: "toolUse" },
						);
					}
					assert.equal(prompt.packet.role, "implementer");
					if (prompt.implementation?.ordinal === 2) {
						const calls = [
							["implementation_execute", { argv: ["sh", "-c", "test \"$(cat value)\" = T && printf 'writer saw T\\n'"] }],
							["implementation_audit", {}],
							["implementation_execute", { argv: ["sh", "-c", "printf 'C\\n' > value"] }],
							[
								"implementation_handoff",
								{
									text: "Reapplied onto the current target",
									dispositions: [],
									verification: { outcome: "pass", rank: "tests", reason: "Selected checks pass on final source" },
								},
							],
						] as const;
						const call = calls[successorTurn++];
						assert.ok(call, "successor writer must not continue after its handoff");
						return fauxAssistantMessage(fauxToolCall(call[0], call[1]), { stopReason: "toolUse" });
					}
					if (options.finding && writerTurn === 3) {
						writerTurn++;
						return fauxAssistantMessage(fauxToolCall("implementation_check", {}), { stopReason: "toolUse" });
					}
					if (options.staleFinal && writerTurn === 4) {
						const B = prompt.implementation?.captureB;
						const report = prompt.implementation?.audit?.results?.standards?.report;
						assert.ok(B && report, "checked B and Audit report were presented before the later edit");
						checkedBeforeEdit = { B, report };
						writerTurn++;
						return fauxAssistantMessage(
							fauxToolCall("implementation_execute", {
								argv: ["sh", "-c", "printf 'C\\n' > value && test \"$(cat value)\" = C && printf C_WRITTEN"],
							}),
							{
								stopReason: "toolUse",
							},
						);
					}
					if (options.staleFinal && writerTurn === 5) {
						assert.match(
							JSON.stringify(transcript.messages.filter((m) => m.role === "tool" || m.role === "toolResult")),
							/C_WRITTEN/,
							"Linux command actually wrote C",
						);
						writerTurn++;
						assert.ok(checkedBeforeEdit);
						const { B, report } = checkedBeforeEdit;
						rawHandoffAttempted = true;
						return fauxAssistantMessage(
							fauxToolCall("checkpoint", {
								command: JSON.stringify({
									type: "submitImplementationHandoff",
									text: "Fixed A to B",
									dispositions: [
										{ report, finding: "F1", disposition: "fixed", reason: "Changed value to B", changes: [B], rechecks: ["full-suite"] },
									],
									verification: { outcome: "pass", rank: "tests", reason: "Selected checks pass on B" },
								}),
							}),
							{ stopReason: "toolUse" },
						);
					}
					if (options.staleFinal && writerTurn === 6) {
						writerTurn++;
						return fauxAssistantMessage("Stopped after raw handoff attempt.");
					}
					if (options.finding && writerTurn === 4) {
						writerTurn++;
						const B = prompt.implementation?.captureB;
						const report = prompt.implementation?.audit?.results?.standards?.report;
						assert.ok(B && report, "writer receives host-retained B and Audit report identities before handoff");
						return fauxAssistantMessage(
							fauxToolCall("implementation_handoff", {
								text: "Fixed A to B",
								dispositions: [
									{ report, finding: "F1", disposition: "fixed", reason: "Changed value to B", changes: [B], rechecks: ["full-suite"] },
								],
								verification: { outcome: "pass", rank: "tests", reason: "Selected checks pass on B" },
							}),
							{ stopReason: "toolUse" },
						);
					}
					const calls = [
						[
							"implementation_execute",
							{
								argv: [
									"sh",
									"-c",
									options.bootstrap
										? `test ! -e .skl/verify.md && test "$(cat value)" = A && printf '%s' '${Buffer.from(f.text).toString("base64")}' | base64 -d > .skl/verify.md`
										: "test \"$(cat value)\" = A && printf 'writer saw A\\n'",
								],
							},
						],
						["implementation_audit", {}],
						[
							"implementation_execute",
							{
								argv: [
									"sh",
									"-c",
									options.failFinal ? "printf 'B\\n' > value; printf 'exit 7\\n' > verify-suite" : "printf 'B\\n' > value",
								],
							},
						],
						[
							"implementation_handoff",
							{
								text: "Implemented exact value",
								dispositions: [],
								verification: { outcome: "pass", rank: "tests", reason: "Selected checks pass on final source" },
							},
						],
					] as const;
					const call = calls[writerTurn++];
					assert.ok(call, "writer must not continue after handoff");
					return fauxAssistantMessage(fauxToolCall(call[0], call[1]), { stopReason: "toolUse" });
				},
		),
	);
	const save = async (document: string, text: string) =>
		accepted(
			await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: `save:${document}`,
					workflow: "workflow:2",
					expected: { document: null },
					command: { type: "saveDocument", document, mediaType: "text/plain", content: Buffer.from(text).toString("base64") },
				},
				admin,
			),
		).revision as string;
	const source = await save("source", "Keep the existing value interface.");
	const catalogRef = await save("catalog", f.text);
	const ground = await save(
		"ground",
		JSON.stringify({
			schema: 1,
			shape: { value: "bug", origin: "human", confirmed: true },
			goal: "Change value",
			constraints: [],
			clarifications: [],
			donePredicate: "Value B",
			approvedSources: [source],
		}),
	);
	const manifest: IntakeManifest = {
		schema: 1,
		shape: "bug",
		ground,
		sources: [source],
		decisions: [],
		catalog: catalogRef,
		breakdown: null,
		slices: [
			{
				id: "value",
				title: "Change value",
				record: false,
				delegated: [],
				forbidden: [],
				obligations: [{ id: "B1", kind: "behavior", text: "Change A to B", sources: [] }],
			},
		],
		checks: [
			{ id: "suite", row: "full-suite", kind: "executed", rank: "tests", new: false, run: "sh verify-suite", expectations: "SUITE OK" },
		],
		mapping: [{ slice: "value", obligation: "B1", checks: ["suite"] }],
		dependencies: [],
		responses: [],
		unresolved: [],
	};
	const coordinator = accepted(
		await f.command({
			type: "assignTask",
			slice: "design",
			delivery: false,
			packet: packet({
				inputs: [ground, source, catalogRef],
				requests: [{ key: "fidelity", packet: packet({ role: "challenger" }) }],
				maxTurns: 20,
			}),
		}),
	).assignment;
	const assignments = () => (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
	const wait = async (predicate: () => boolean, label: string) => {
		const deadline = Date.now() + 30000;
		while (!predicate()) {
			assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(assignments())}`);
			await setTimeout(20);
		}
	};
	await wait(() => assignments().find((a) => a.id === coordinator)?.status === "running", "coordinator");
	const owner = assignments().find((a) => a.id === coordinator)!;
	const actor = mintContext({
		kind: "assignment-agent",
		assignment: owner.id,
		generation: owner.generation,
		attempt: owner.attempt,
		role: "coordinator",
	});
	const state = () => ((f.ledger.snapshot(admin) as Frame).workflows as { intakes: Intakes }[])[0]!.intakes;
	const draft = accepted(await f.command({ type: "stageIntake", expected: null, text: "# Contract\nChange A to B.\n", manifest }, actor))
		.intake as string;
	const review = accepted(await f.command({ type: "requestIntakeReview", intake: draft, key: "fidelity" }, actor));
	await wait(() => assignments().find((a) => a.id === review.assignment)?.status === "submitted", "fidelity");
	const d = state().drafts.find((x) => x.id === draft)!;
	accepted(
		await f.command(
			{
				type: "acceptIntake",
				intake: draft,
				review: assignments().find((a) => a.id === review.assignment)!.report,
				annotations: d.annotations,
				policyBinding: d.policyBinding,
				decisions: d.manifest.decisions,
			},
			admin,
		),
	);
	const contract = state().slices[0]!.contract;
	const selection = { ...f.selection, contract, rows, behavioralRows: ["behavior"] };
	// Engine's owned-check configuration is keyed by the accepted exact contract.
	(f.config.checks as Record<string, (typeof f.config.checks)["revision:3"]>)[contract] = f.config.checks["revision:3"];
	const reviewer = (role: "audit-standards" | "audit-contracts") =>
		packet({
			role,
			maxTurns: 20,
			maxInputBytes: 1048576,
			...(options.missingFamily ? { model: "missing-model", family: "missing", requiredFamily: "missing" } : {}),
		});
	const writer = packet({
		role: "implementer",
		execution: "linux-writer",
		inputs: [contract],
		verification: selection,
		maxTurns: 30,
		maxInputBytes: 1048576,
		requests: [
			{ key: "standards", packet: reviewer("audit-standards") },
			{ key: "contracts", packet: reviewer("audit-contracts") },
		],
	});
	return {
		f,
		gate,
		prompts,
		assignments,
		wait,
		writer,
		contract,
		rawHandoffAttempted: () => rawHandoffAttempted,
		held: () => held,
		aborted: () => aborted,
		release: () => release.resolve(),
		close: async () => {
			release.resolve();
			gate.resolve();
			await f.close();
		},
	};
}

test("accepted implementation: one fresh paired Audit of frozen A, same-pass B and atomic preparation survive export/reopen", async () => {
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
		assert.match(pass.handoff.blocker ?? "", /preparation.*unavailable/i);
		assert.ok(!t.assignments().some((a) => a.packet.role === "watchdog" && a.status === "submitted"));
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
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
		const page = await t.f.ledger.observe(admin, { history: { workflow: "workflow:2", limit: "1" } });
		assert.ok("next" in page && page.next);
		assert.equal(page.cutoff, exported.manifest.cutoff);
		t.gate.resolve();
		await t.f.reopen();
		const after = await t.f.ledger.artifact(admin, { export: { cursor: page.next } });
		assert.ok("manifest" in after && after.manifest.complete);
		assert.equal(after.manifest.cutoff, exported.manifest.cutoff);
		for (const ref of [opening.passRecord, pass.handoff.record, ...reviews.map((a) => a.report), A, pass.captureB])
			assert.equal(after.content[ref as string], exported.content[ref as string]);
	} finally {
		await t.close();
	}
});

test("two-pass journey: real conflict against T1 opens P2 from T1 with its own fresh Audit on A2 and own handoff", async () => {
	const t = await fixture();
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const settled = (id: unknown) => () => {
			const a = t.assignments().find((x) => x.id === id);
			return !!a && !a.executing && (a.status === "submitted" || (a.status === "blocked" && a.blocker !== "awaiting_role_results"));
		};
		await t.wait(settled(opening.assignment), "first pass handoff");
		const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		await t.wait(() => !!passes()[0]?.handoff?.blocker, "preparation blockage");
		const first = structuredClone(passes()[0]!);
		assert.equal(first.ordinal, 1);
		const read = async (ref: string) => {
			const value = await t.f.ledger.artifact(admin, { read: ref });
			assert.ok("content" in value, `read ${ref}`);
			return value.content.toString();
		};
		const receipt = (JSON.parse(await read(first.handoff!.source)) as ImplementationSource).source;
		const base = t.writer.verification!.commit;
		const repo = t.f.source.repo;
		const T = git(repo, ["hash-object", "-w", "--stdin"], "T\n").toString().trim();
		const entries = git(repo, ["ls-tree", base])
			.toString()
			.replace(/^100644 blob [0-9a-f]+\tvalue$/m, `100644 blob ${T}\tvalue`);
		const tree = git(repo, ["mktree"], entries).toString().trim();
		const T1 = git(repo, ["commit-tree", tree, "-p", base], "Concurrent target change\n").toString().trim();
		const text = JSON.stringify({
			schema: 1,
			cause: "preparation-conflict",
			repository: receipt.source.repository,
			source: first.handoff!.source,
			sourceCommit: receipt.source.commit,
			baseCommit: receipt.base.commit,
			targetCommit: T1,
			algorithm: "merge-tree-write-tree",
			resultTree: tree,
			conflicts: ["value"],
		});
		const owner = t.assignments().find((a) => a.id === opening.assignment)!;
		const opened = accepted(
			await t.f.command(
				{ type: "openSuccessorPass", assignment: owner.id, generation: owner.generation, attempt: owner.attempt, text },
				mintContext({ kind: "host", scope: "effects" }),
			),
		);
		assert.equal(opened.passOrdinal, 2);
		await t.wait(settled(opened.assignment), "second pass handoff");
		const writer = t.assignments().find((a) => a.id === opened.assignment)!;
		assert.equal(writer.status, "submitted", `expected second handoff, got ${writer.blocker}`);
		const [p1, p2] = passes();
		assert.ok(p1 && p2);
		assert.deepEqual({ ...p1 }, first, "P1 keeps its exact Audit, A, B and preparation outcome");
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
		const retained = join(
			t.f.source.root,
			"catalog-owned",
			"effects",
			createHash("sha256").update(receipt.source.repository).digest("hex"),
			"source.git",
		);
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
		assert.equal(t.assignments().filter((a) => a.packet.role === "watchdog").length, 0, "conflict starts no Watchdog");
		await t.wait(() => !!passes()[1]?.handoff?.blocker, "P2 preparation blockage");
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [
			p1.record,
			p2.record,
			p1.handoff!.record,
			p2.handoff.record,
			p2.captureA!,
			p2.captureB!,
			opened.observation as string,
		])
			assert.ok(exported.content[ref], `export retains ${ref}`);
		t.gate.resolve();
		await t.f.reopen();
		assert.equal(passes().length, 2);
		assert.equal(passes()[0]!.handoff!.record, p1.handoff!.record);
	} finally {
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
			const retained = await t.f.ledger.artifact(admin, { read: ref });
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
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
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
		const retained = await t.f.ledger.artifact(admin, { read: pass.captureB });
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
		const handed = await t.f.ledger.artifact(admin, { read: pass.handoff.record });
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
		const report = await t.f.ledger.artifact(admin, { read: pass.audit.results.standards!.report });
		assert.ok("content" in report);
		assert.match(report.content.toString(), /Replace A with B/);
		const source = await t.f.ledger.artifact(admin, { read: pass.captureB });
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
				apiKey: "fixture",
				families: { "claude-sonnet-4-6": "claude" },
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

test("accepted writer refuses profile exclusions beyond .git", async () => {
	const t = await fixture({ exclusions: [".git", "hidden"] });
	try {
		const reply = await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer });
		if (reply.status === "accepted") {
			await t.wait(() => t.assignments().find((a) => a.id === reply.result.assignment)?.status === "blocked", "exclusion refusal");
			assert.match(t.assignments().find((a) => a.id === reply.result.assignment)!.blocker!, /exclusion|profile/i);
		} else assert.match(`${reply.code} ${reply.reason}`, /exclusion|profile/i);
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
