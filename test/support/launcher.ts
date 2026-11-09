import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import type { RoleTemplate } from "../../src/kernel/engine-settings.ts";
import type { IntakeManifest, Intakes } from "../../src/kernel/intake.ts";
import type { WorkflowView } from "../../src/kernel/kernel.ts";
import { ROLES, type RoleAssignment } from "../../src/kernel/roles.ts";
import type { CommandReply, Frame } from "../../src/ledger/ledger.ts";
import { catalog, catalogFixture } from "./catalog.ts";
import { admin, allowSameFamily, editEngineSettings } from "./roles.ts";
import { git } from "./source.ts";

export const WORKFLOW = "workflow:3";
/** Every role on the fixture's scripted Claude model, so no request leaves the test. */
const SCRIPTED: RoleTemplate = {
	model: { provider: "anthropic", id: "claude-sonnet-4-6" },
	thinking: "low",
	maxInputBytes: 4 * 1048576,
	maxOutputTokens: 1024,
	maxTurns: 30,
};
type Slice = { id: string; requires?: string };
type Packet = {
	assignment: string;
	packet: { role: string; inputs: string[] };
	intakeReview?: Record<string, unknown>;
	auditReview?: Record<string, unknown>;
	watchdogReview?: Record<string, string>;
};
type Message = { role: string; content: unknown; sections?: Record<string, string | null> };

function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result;
}

/**
 * A project whose default branch holds a catalog, `value` = A and a suite script; nothing assigns work by hand. The
 * scripted coordinator reads sources, drafts Ground, waits for the human to confirm it, stages the intake for `slices`
 * and requests its fidelity review. Implementers either run the scripted delivery (`deliver`) or park until close.
 */
export async function launcher(
	options: {
		linux?: boolean;
		scripted?: boolean;
		sameFamilyDirection?: boolean;
		slices?: Slice[];
		deliver?: boolean;
		/** Paths the coordinator reads first; each tool result lands in `toolResults`. */
		reads?: string[];
		/** Runs in the coordinator's first turn, before it reads anything. */
		firstTurn?: () => Promise<void>;
		/** Runs while the coordinator is still in its turn, after the human saved Ground and before it stages the intake. */
		beforeStage?: (coordinator: RoleAssignment) => Promise<void>;
	} = {},
) {
	const scripted = options.scripted ?? true;
	const slices = options.slices ?? [{ id: "value" }];
	const text = catalog().replaceAll("endpoint", "tests").replace("printf 'SUITE OK'", "sh verify-suite");
	const f = await catalogFixture(options.linux ?? false, { text });
	const repo = f.source.repo;
	const base = git(repo, ["rev-parse", "refs/heads/fixture"]).toString().trim();
	let entries = git(repo, ["ls-tree", base]).toString();
	const blob = (content: string) => git(repo, ["hash-object", "-w", "--stdin"], content).toString().trim();
	entries += `100644 blob ${blob("A\n")}\tvalue\n100644 blob ${blob("printf 'SUITE OK'\n")}\tverify-suite\n120000 blob ${blob("value")}\tlink\n`;
	const tree = git(repo, ["mktree"], entries).toString().trim();
	const pinned = git(repo, ["commit-tree", tree, "-p", base], "Implementation base\n").toString().trim();
	git(repo, ["update-ref", "refs/heads/fixture", pinned]);
	if (scripted) {
		await editEngineSettings(f.ledger, (s) => ({ ...s, roles: Object.fromEntries(ROLES.map((r) => [r, SCRIPTED])) as typeof s.roles }));
		if (options.sameFamilyDirection ?? true) await allowSameFamily(f.ledger);
	}
	const frame = () => f.ledger.snapshot(admin) as Frame;
	const assignments = () => frame().assignments as RoleAssignment[];
	const view = () => (frame().workflows as WorkflowView[]).find((w) => w.workflow === WORKFLOW)!;
	const intakes = () => (view() as unknown as { intakes: Intakes }).intakes;
	let closed = false;
	const until = async (predicate: () => boolean, label: string, ms = 30000) => {
		const deadline = Date.now() + ms;
		while (!predicate()) {
			assert.ok(!closed, `${label}: closed`);
			assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(assignments().map((a) => [a.id, a.packet.role, a.status, a.blocker]))}`);
			await setTimeout(20);
		}
	};
	const coordinators = () => assignments().filter((a) => a.packet.role === "coordinator");
	const toolResults: unknown[] = [];
	/** The user messages of the coordinator's first provider request. */
	let firstCoordinatorRequest: string[] | undefined;
	const turns = new Map<string, number>();
	const next = (assignment: string) => {
		const n = turns.get(assignment) ?? 0;
		turns.set(assignment, n + 1);
		return n;
	};
	const call = (name: string, args: Parameters<typeof fauxToolCall>[1]) =>
		fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" });
	const command = (body: object) => call("checkpoint", { command: JSON.stringify(body) });
	const groundRef = () => view().ground?.revision;
	const manifest = (ground: string, value: string, catalogRef: string): IntakeManifest => ({
		schema: 1,
		shape: "change",
		ground,
		sources: [value],
		decisions: [],
		catalog: catalogRef,
		breakdown: "Change value.",
		slices: slices.map((s) => ({
			id: s.id,
			title: `Change ${s.id}`,
			record: false,
			delegated: [],
			forbidden: [],
			obligations: [{ id: "B1", kind: "behavior" as const, text: `Change ${s.id}`, sources: [] }],
		})),
		checks: [
			{ id: "suite", row: "full-suite", kind: "executed", rank: "tests", new: false, run: "sh verify-suite", expectations: "SUITE OK" },
		],
		mapping: slices.map((s) => ({ slice: s.id, obligation: "B1", checks: ["suite"] })),
		dependencies: slices.flatMap((s) => (s.requires ? [{ slice: s.id, requires: s.requires, kind: "integration" as const }] : [])),
		responses: [],
		unresolved: [],
	});
	const sources = new Map<string, string>();
	const reads = [...(options.reads ?? []), ".skl/verify.md", "value"];
	const coordinatorTurn = async (p: Packet, transcript: { messages: Message[] }) => {
		const last = transcript.messages.findLast((m) => m.role === "toolResult");
		const n = next(p.assignment);
		if (last && n > 0) {
			const result = JSON.parse((last.content as { text: string }[])[0]!.text) as { status?: string; source?: string; path?: string };
			toolResults.push(result);
			if (result.status === "accepted" && result.source && result.path) sources.set(result.path, result.source);
		}
		if (n === 0) await options.firstTurn?.();
		if (n < reads.length) return call("read_source", { path: reads[n] as string });
		switch (n - reads.length) {
			case 0:
				return command({
					type: "saveDraft",
					document: "ground",
					content: JSON.stringify({
						schema: 1,
						shape: { value: "change", origin: "classifier", confirmed: false },
						goal: "Change value",
						constraints: [],
						clarifications: [],
						donePredicate: "Value B",
						facts: [],
						approvedSources: [sources.get("value")],
					}),
				});
			case 1: {
				await until(() => view().ground !== null, "human saves Ground", 120000);
				await options.beforeStage?.(assignments().find((a) => a.id === p.assignment)!);
				const stage = manifest(groundRef()!, sources.get("value")!, sources.get(".skl/verify.md")!);
				return command({ type: "stageIntake", expected: null, text: "# Contract\nChange A to B.\n", manifest: stage });
			}
			case 2: {
				const draft = intakes().drafts.at(-1);
				return draft
					? command({ type: "requestIntakeReview", intake: draft.id, key: "fidelity" })
					: fauxAssistantMessage("No intake staged.");
			}
			default:
				return fauxAssistantMessage("Intake staged for human acceptance.");
		}
	};
	const submit = (body: Record<string, unknown>, verification?: Record<string, string>) =>
		call("submit_role_result", { text: JSON.stringify({ schema: 1, ...body }), supports: [], ...(verification ? { verification } : {}) });
	const implementerTurn = async (p: Packet) => {
		if (!options.deliver) {
			await until(() => closed, "parked implementer", 600000).catch(() => {});
			return fauxAssistantMessage("Parked.");
		}
		const calls = [
			["implementation_execute", { argv: ["sh", "-c", 'test "$(cat value)" = A'] }],
			["implementation_audit", {}],
			["implementation_execute", { argv: ["sh", "-c", "printf 'B\\n' > value"] }],
			[
				"implementation_handoff",
				{ text: "Changed value", dispositions: [], verification: { outcome: "pass", rank: "tests", reason: "Checks passed" } },
			],
		] as const;
		const step = calls[next(p.assignment)];
		assert.ok(step, "an implementer stops after its handoff");
		return call(step[0], step[1]);
	};
	f.provider.setResponses(
		Array.from({ length: 300 }, () => async (transcript: { messages: Message[] }) => {
			const section = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])?.sections?.["role-packet"];
			const text = section ?? (transcript.messages.findLast((m) => m.role === "user")!.content as string);
			const p = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Packet;
			if (p.packet.role === "coordinator") {
				firstCoordinatorRequest ??= transcript.messages
					.filter((m) => m.role === "user")
					.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)));
				return coordinatorTurn(p, transcript);
			}
			if (p.intakeReview)
				return submit({
					...p.intakeReview,
					checks: { omitted: "Compared", weakened: "Compared", strengthened: "Compared", contradictory: "Compared", invented: "Compared" },
					findings: [],
				});
			if (p.auditReview) return submit({ ...p.auditReview, findings: [] });
			if (p.watchdogReview) {
				const { passRef, handoff, source, prepared, target } = p.watchdogReview;
				return submit(
					{ verdict: "pass", passRef, handoff, source, prepared, target, findings: [], directions: [] },
					{ outcome: "pass", rank: "tests", reason: "Own checks on exact X passed" },
				);
			}
			return implementerTurn(p);
		}),
	);
	let commands = 0;
	const human = async (body: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
		Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: `human:${++commands}`,
					workflow: WORKFLOW,
					...extra,
					command: body,
				},
				admin,
			),
		);
	return {
		f,
		pinned,
		assignments,
		coordinators,
		view,
		intakes,
		until,
		toolResults,
		firstCoordinatorRequest: () => firstCoordinatorRequest,
		/** The operator's prompt: an ordinary coordinator message. */
		prompt: async (text = "Change value from A to B") =>
			accepted(await human({ type: "postCoordinatorMessage", text, whenBusy: "followUp" })),
		/** Confirm Ground exactly as the host proposes it. */
		confirmGround: async () => {
			await until(() => view().nextHumanAction.type === "confirmGround", "confirmGround offered", 120000);
			const action = view().nextHumanAction as { type: "confirmGround"; expected: string | null; content: string };
			return accepted(
				await human(
					{ type: "saveDocument", document: "ground", mediaType: "text/plain", content: Buffer.from(action.content).toString("base64") },
					{ expected: { document: action.expected } },
				),
			);
		},
		/** Accept the reviewed intake on its host-visible basis. */
		acceptIntake: async () => {
			await until(
				() => {
					const d = intakes().drafts.at(-1);
					return !!d && assignments().some((a) => a.intakeReview?.intake === d.id && a.status === "submitted");
				},
				"fidelity review submitted",
				120000,
			);
			const d = intakes().drafts.at(-1)!;
			const review = assignments().find((a) => a.intakeReview?.intake === d.id && a.status === "submitted")!;
			return accepted(
				await human({
					type: "acceptIntake",
					intake: d.id,
					review: review.report,
					annotations: d.annotations,
					policyBinding: d.policyBinding,
					decisions: d.manifest.decisions,
				}),
			);
		},
		close: async () => {
			closed = true;
			await f.close();
		},
	};
}
