import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { IntakeManifest, Intakes } from "../../src/kernel/intake.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { catalog, catalogFixture, rows } from "./catalog.ts";
import { admin, allowSameFamily, packet } from "./roles.ts";
import { git } from "./source.ts";

export function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}

export type Prompt = {
	packet: { role: string; verification?: unknown };
	auditInstructions?: string;
	intakeReview?: Record<string, unknown>;
	auditReview?: { passRef: string; audit: string; source: string; contract: string };
	implementation?: { ordinal?: number; captureB?: string; audit?: { reports?: unknown; results?: { standards?: { report: string } } } };
	inputs?: { ref: string; text: string }[];
};
type RetainedCapture = { source: { source: { entries: { path: string; content: string }[] } } };
export function captureFile(text: string, path: string): string {
	const capture = JSON.parse(text) as RetainedCapture;
	const entry = capture.source.source.entries.find((item) => item.path === path);
	assert.ok(entry, `retained source includes ${path}`);
	return Buffer.from(entry.content, "base64").toString();
}
export function captureValue(text: string): string {
	return captureFile(text, "value");
}

// These scripted checks exercise lifecycle and literal bytes, not semantic adequacy.
// Real acceptance, not a fabricated accepted Slice or a test-file import.
export async function fixture(
	options: {
		exclusions?: string[];
		missingFamily?: boolean;
		failFinal?: boolean;
		hold?: "writer" | "contracts";
		finding?: boolean;
		bootstrap?: boolean;
		staleFinal?: boolean;
		successorStops?: boolean;
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
	let originals = "";
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
						const retained = JSON.parse(source.content.toString()).verification;
						assert.equal(retained.role, "implementer", "A's checks stay attributed to the implementer that ran them");
						assert.equal(retained.catalog.selection.contract, prompt.auditReview.contract);
						assert.ok(retained.catalog.text.length > 0 && retained.results.length > 0, "A retains its verifier and results");
						assert.equal(prompt.packet.verification, undefined, "no separate pre-A verifier is frozen for a reviewer");
						assert.match(prompt.auditInstructions ?? "", /verification.*implementer ran.*not checks you ran/);
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
					if (prompt.implementation?.ordinal === 2 && options.successorStops) return fauxAssistantMessage("Successor inspected.");
					if (prompt.implementation?.ordinal === 2) {
						if (successorTurn === 1)
							originals = JSON.parse(
								(transcript.messages.findLast((m) => m.role === "toolResult")!.content as { text: string }[])[0]!.text,
							).stdout;
						const calls = [
							[
								"implementation_execute",
								{
									argv: [
										"sh",
										"-c",
										'test "$(cat value)" = T && cat /candidates/implementation/value /candidates/base/value /candidates/target/value && { touch /candidates/base/value 2>/dev/null && echo ORIGINALS_WRITABLE || echo ORIGINALS_READ_ONLY; }',
									],
								},
							],
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
		/** What the conflict successor's first Linux command printed about its read-only originals. */
		originals: () => originals,
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
