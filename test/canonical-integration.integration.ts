// CI18/CI16 as a real journey: Engine, SQLite, Effects Git and Docker Linux checks with a scripted provider. Verdicts
// are fixture data; this establishes autonomous admission, exact CAS/readback and dependency clearance, not review
// quality. CI19 (target moving before the CAS) is the WR20/WR15/CI19 journey in watchdog-rework.integration.ts.
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import {
	accepted,
	clearBarrier,
	effectsStore,
	fixture,
	holdAt,
	parked,
	proposalRef,
	releaseBarrier,
} from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Packet = { role: string; assignment: string; auditReview?: object; watchdogReview?: Record<string, unknown> };
/** Each implementer edits its own file once; reviewers report no findings and every Watchdog round passes. */
function independentSlices(t: Fixture) {
	const turns = new Map<string, number>();
	const submit = (args: object, verification?: Record<string, string>) =>
		fauxAssistantMessage(
			fauxToolCall("submit_role_result", {
				text: JSON.stringify({ schema: 1, ...args }),
				supports: [],
				...(verification ? { verification } : {}),
			}),
			{ stopReason: "toolUse" },
		);
	t.f.provider.setResponses(
		Array.from({ length: 60 }, () => async (transcript: { messages: { role: string; sections?: Record<string, string | null> }[] }) => {
			const text = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])!.sections!["role-packet"]!;
			const p = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Packet & {
				packet: { role: string; inputs: string[] };
			};
			if (p.packet.role === "coordinator") {
				await t.gate.promise;
				return fauxAssistantMessage("paused");
			}
			if (p.auditReview) return submit({ ...p.auditReview, findings: [] });
			if (p.watchdogReview) {
				const { passRef, handoff, source, prepared, target } = p.watchdogReview;
				return submit(
					{ verdict: "pass", passRef, handoff, source, prepared, target, findings: [], directions: [] },
					{ outcome: "pass", rank: "tests", reason: "Own checks on exact X passed" },
				);
			}
			const file = p.packet.inputs.includes(t.contract) ? "value" : "next";
			const calls = [
				["implementation_execute", { argv: ["sh", "-c", 'test "$(cat value)" = A'] }],
				["implementation_audit", {}],
				["implementation_execute", { argv: ["sh", "-c", `printf 'B\\n' > ${file}`] }],
				[
					"implementation_handoff",
					{ text: `Changed ${file}`, dispositions: [], verification: { outcome: "pass", rank: "tests", reason: "Checks passed" } },
				],
			] as const;
			const n = turns.get(p.assignment) ?? 0;
			turns.set(p.assignment, n + 1);
			assert.ok(calls[n], "an implementer stops after its handoff");
			return fauxAssistantMessage(fauxToolCall(calls[n][0], calls[n][1]), { stopReason: "toolUse" });
		}),
	);
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
const passes = (t: Fixture) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
const viewBlocker = (t: Fixture) => ((t.f.ledger.snapshot(admin) as Frame).workflows as { blocker: { code: string } | null }[])[0]!.blocker;
async function read(t: Fixture, ref: string) {
	const value = await t.f.ledger.artifact(admin, { read: ref });
	assert.ok("content" in value, `read ${ref}`);
	return value.content.toString();
}

test("CI18/CI16 a passing current review integrates with no human step: exact R on T, readback, one qualification, then the dependent", async () => {
	const t = await fixture({ watchdog: ["pass"], dependent: true });
	try {
		const store = effectsStore(t);
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const P1 = opening.passRef as string;
		// From here on the test issues no human command: preparation, review, admission and CAS are automatic.
		holdAt("before-integration-cas", `integration:${P1}`);
		await parked("admitted integration before its CAS");
		const T = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		assert.equal(T, t.writer.verification!.commit, "the canonical ref is still the bound base T");
		const next = { ...t.writer, inputs: [t.nextContract!], verification: { ...t.writer.verification!, contract: t.nextContract! } };
		const early = await t.f.command({ type: "assignTask", slice: "next", delivery: true, packet: next });
		assert.equal(early.status === "refused" && early.code, "dependency_blocked", "a passing review and an admission clear nothing");
		assert.equal(viewBlocker(t)?.code, "dependency_blocked");
		releaseBarrier();
		const pass = () => passes(t)[0]!;
		await t.wait(
			() =>
				pass().handoff?.integrations?.at(-1)?.status === "qualified" ||
				/^(needs_human|watchdog_|preparation_|integration_)/.test(pass().handoff?.blocker ?? ""),
			"integration settles",
		);
		const [operation, ...others] = pass().handoff!.integrations!;
		assert.equal(others.length, 0);
		assert.equal(operation!.status, "qualified", pass().handoff?.blocker);
		assert.equal(operation!.attempts.length, 1, "one admission, one dispatch");
		assert.equal(operation!.attempts[0]!.outcome, "applied");
		assert.equal(operation!.attempts[0]!.executorEpoch, t.f.ledger.status().executorEpoch);
		assert.equal(operation!.qualification, operation!.attempts[0]!.observations.at(-1));
		const review = t.assignments().find((a) => a.packet.role === "watchdog")!.watchdogReview!;
		const R = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		assert.equal(R, operation!.result, "the canonical ref reads back exactly R");
		assert.equal(git(store, ["rev-list", "--parents", "-n", "1", R]).toString().trim(), `${R} ${T}`, "R's only parent is T");
		assert.equal(
			git(store, ["rev-parse", `${R}^{tree}`])
				.toString()
				.trim(),
			review.tree,
			"R's tree is exactly reviewed X's tree",
		);
		assert.equal(
			git(store, ["rev-parse", `refs/render/sources/${R}`])
				.toString()
				.trim(),
			R,
			"R is rooted",
		);
		const intent = JSON.parse(await read(t, operation!.operation));
		assert.deepEqual(
			[intent.prepared, intent.target, intent.review, intent.result.commit, intent.passRef],
			[review.prepared, T, t.assignments().find((a) => a.packet.role === "watchdog")!.id, R, P1],
		);
		const observation = JSON.parse(await read(t, operation!.qualification!));
		assert.deepEqual(observation.observed, { commit: R, tree: review.tree, parents: [T] });
		assert.equal(observation.mode, "dispatch");
		assert.equal(pass().handoff!.blocker, undefined, "nothing left blocked");
		assert.notEqual(viewBlocker(t)?.code, "dependency_blocked", "qualification clears the same-proposal edge");
		// CI16: this host has no Forge capability; nothing waited on publication.
		accepted(await t.f.command({ type: "assignTask", slice: "next", delivery: true, packet: next }));
	} finally {
		clearBarrier();
		await t.close();
	}
});

test("CI24 two passing Slices of one proposal contend for integration: the second waits for the first and then integrates with no human step", async () => {
	const t = await fixture({ dependent: true, watchdog: [] });
	const command = t.f.ledger.command.bind(t.f.ledger);
	const until = async (predicate: () => boolean, label: string) => {
		const deadline = Date.now() + 180000;
		while (!predicate()) {
			assert.ok(Date.now() < deadline, label);
			await delay(50);
		}
	};
	try {
		const store = effectsStore(t);
		const intakes = ((t.f.ledger.snapshot(admin) as Frame).workflows as { intakes: { revision: string } }[])[0]!.intakes;
		accepted(
			await t.f.command(
				{
					type: "amendDependencies",
					expected: intakes.revision,
					dependencies: [],
					reason: "Independent Slices for concurrent integration.",
				},
				admin,
			),
		);
		const checks = t.f.config.checks as Record<string, (typeof t.f.config.checks)["revision:3"]>;
		checks[t.nextContract!] = checks[t.contract]!;
		independentSlices(t);
		let contended = false;
		t.f.ledger.command = async (...args: Parameters<typeof command>) => {
			const reply = await command(...args);
			if (reply.status === "refused" && reply.code === "ownership_conflict") contended = true;
			return reply;
		};
		const first = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer })).passRef as string;
		holdAt("before-integration-cas", `integration:${first}`);
		await parked("the first Slice admitted before its CAS");
		const next = { ...t.writer, inputs: [t.nextContract!], verification: { ...t.writer.verification!, contract: t.nextContract! } };
		const second = accepted(await t.f.command({ type: "assignTask", slice: "next", delivery: true, packet: next })).passRef as string;
		const ref = proposalRef("workflow:2");
		const T = git(store, ["rev-parse", ref]).toString().trim();
		// A live writer's ref lock makes the first CAS divergent, so its integration stays unresolved until a human acts.
		await writeFile(join(store, `${ref}.lock`), `${T}\n`);
		releaseBarrier();
		const pass = (passRef: string) => passes(t).find((p) => p.ref === passRef)!;
		const status = (passRef: string) => pass(passRef).handoff?.integrations?.at(-1)?.status;
		await until(() => status(first) === "divergent", "the first integration is divergent");
		await until(() => contended, "the second Slice passes review and requests integration while the first is unresolved");
		await rm(join(store, `${ref}.lock`));
		const owner = t.assignments().find((a) => a.id === pass(first).assignment)!;
		accepted(
			await t.f.command({ type: "retryPreparation", assignment: owner.id, generation: owner.generation, attempt: owner.attempt }, admin),
		);
		const settled = (passRef: string) =>
			status(passRef) === "qualified" || /^(needs_human|watchdog_|preparation_|integration_)/.test(pass(passRef).handoff?.blocker ?? "");
		await until(() => settled(first) && settled(second), "both integrations settle");
		assert.equal(status(first), "qualified", pass(first).handoff?.blocker);
		assert.equal(status(second), "qualified", pass(second).handoff?.blocker);
		assert.equal(pass(second).handoff!.blocker, undefined, "the waiting Slice never needed a human step");
		const [early, late] = [first, second]
			.map((p) => pass(p).handoff!.integrations!.find((i) => i.status === "qualified")!)
			.sort((x, y) => Number(x.attempts.at(-1)!.sequence) - Number(y.attempts.at(-1)!.sequence));
		assert.equal(early!.target, T);
		assert.equal(late!.target, early!.result, "the later Slice integrates onto the earlier one's R, prepared and reviewed again");
		const R = git(store, ["rev-parse", ref]).toString().trim();
		assert.equal(R, late!.result);
		assert.deepEqual(
			["value", "next"].map((file) => git(store, ["show", `${R}:${file}`]).toString()),
			["B\n", "B\n"],
			"both Slices' changes are integrated",
		);
	} finally {
		t.f.ledger.command = command;
		clearBarrier();
		await t.close();
	}
});
