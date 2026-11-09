// Standalone verify-create as an ordinary accepted change (spec §8.1): Engine, SQLite, Effects Git and Docker Linux
// with a scripted author. Authored bytes are fixture data; this establishes rendering, execution, retention and
// delivery, not authoring quality. Cases: docs/verification/verification-authoring-failure-cases.md.

import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import type { Intakes } from "../src/kernel/intake.ts";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { accepted, effectsStore, fixture, proposalRef } from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Packet = {
	packet: { role: string };
	assignment: string;
	auditReview?: object;
	watchdogReview?: Record<string, string>;
	implementation?: { configuration: { verification: { path: string } } };
};
type Message = { role: string; content: unknown; sections?: Record<string, string | null> };

const asset = (rows: string, sanity: string) => ({
	verify: `# Fixture repository verification
## Ranks
1. \`process\`: repository commands and journeys run in owned Linux
2. \`tests\`: the repository's own suite
3. \`static\`: structural scaffolding only
## Launch
Owned Linux workspace from exact source; nothing to start.
## Doctor
Linux with sh. Docker is unavailable in the owned workspace: unknown prerequisite, not supplied.
## Channels
Process and Tests are used. Live runtime introspection: unknown, no supported interface found.
## Catalog
| Name | Channel | Kind | Run | Expectations | Rank |
|---|---|---|---|---|---|
| discover | Process | generated | \`ls -a\` | Index only | - |
${rows}| full-suite | Tests | executed | \`sh verify-suite\` | Prints SUITE OK | tests |
| typecheck | Static | executed | \`true\` | No type checker exists; scaffolding only | static |
| lint | Static | executed | \`true\` | No linter exists; scaffolding only | static |
| feel | Human-observed | human | Read the value | Advisory only | - |
## Cleanup
\`\`\`sh
rm -f observed
\`\`\`
## Extend
Add a row for each new observable behavior.
## Traps
Never borrow a live service.
`,
	journey: `# Observe value
## Steps
1. \`cat value > observed\`
## Sanity
\`${sanity}\`
`,
});
const write = (a: { verify: string; journey: string }): Call => [
	"implementation_execute",
	{
		argv: [
			"sh",
			"-c",
			`mkdir -p .skl/journeys && printf '%s' '${Buffer.from(a.verify).toString("base64")}' | base64 -d > .skl/verify.md && printf '%s' '${Buffer.from(a.journey).toString("base64")}' | base64 -d > .skl/journeys/observe.md`,
		],
	},
];
const handoff: Call = [
	"implementation_handoff",
	{ text: "Authored the selected asset", dispositions: [], verification: { outcome: "pass", rank: "tests", reason: "Authored rows ran" } },
];

/** Reviewers find nothing and every Watchdog round passes; the author runs `calls` once each, then stops. */
type Call = [string, Parameters<typeof fauxToolCall>[1]];
function author(t: Fixture, calls: Call[]) {
	const seen = { prompts: [] as Packet[], toolResults: [] as string[] };
	let turn = 0;
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
		Array.from({ length: 40 }, () => async (transcript: { messages: Message[] }) => {
			const text = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])!.sections!["role-packet"]!;
			const p = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Packet;
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
			seen.prompts.push(p);
			const last = transcript.messages.findLast((m) => m.role === "toolResult");
			if (last) seen.toolResults.push((last.content as { text: string }[])[0]!.text);
			const call = calls[turn++];
			if (!call) return fauxAssistantMessage("Stopped: the authored asset is not proven; see retained checks.");
			return fauxAssistantMessage(fauxToolCall(call[0], call[1]), { stopReason: "toolUse" });
		}),
	);
	return seen;
}
const passes = (t: Fixture) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
async function record(t: Fixture, ref: string) {
	const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
	assert.ok("content" in value, `read ${ref}`);
	return JSON.parse(value.content.toString());
}
const selected = (t: Fixture, rows: string[], behavioralRows: string[]) => ({
	...t.writer,
	verification: { ...t.writer.verification!, path: ".skl/verify.md", rows, behavioralRows },
});

test("VA1-VA3 verify-create authors the selected legacy asset from the actual repository, proves a journey and delivers it normally", async () => {
	const t = await fixture({ bootstrap: true, watchdog: [] });
	try {
		const store = effectsStore(t);
		const T = t.writer.verification!.commit;
		const authored = asset(
			"| observe | Process | journey | `.skl/journeys/observe.md` | The value file reads A | process |\n",
			'test "$(cat observed)" = A',
		);
		const seen = author(t, [
			["implementation_execute", { argv: ["sh", "-c", 'cat verify-suite; ls -a .skl; command -v docker || echo "docker: unavailable"'] }],
			write(authored),
			["implementation_audit", {}],
			handoff,
		]);
		const opening = accepted(
			await t.f.command({
				type: "assignTask",
				slice: "value",
				delivery: true,
				packet: selected(t, ["observe", "full-suite", "typecheck", "lint"], ["observe"]),
			}),
		);
		const intake = ((t.f.ledger.snapshot(admin) as Frame).workflows as { intakes: Intakes }[])[0]!.intakes;
		assert.equal(intake.drafts[0]!.manifest.catalog, null, "a repository with no asset needs no placeholder catalog");
		assert.equal(intake.slices[0]!.everAssigned, true, "the author starts on the accepted change");
		const pass = () => passes(t).find((p) => p.ref === opening.passRef)!;
		await t.wait(() => !!pass().captureA, "authored legacy asset checked at A");
		const first = seen.prompts[0]!;
		assert.equal(
			first.implementation?.configuration.verification.path,
			".skl/verify.md",
			"the explicitly selected legacy path stays selected",
		);
		assert.match(seen.toolResults[0]!, /printf 'SUITE OK'/, "the interview reads the repository's actual command");
		const A = await record(t, pass().captureA!);
		assert.equal(A.verification.catalog.selection.path, ".skl/verify.md");
		assert.deepEqual(A.verification.catalog.ranks, ["process", "tests", "static"], "the authored ladder replaces the fallback");
		const observe = A.verification.results.find((r: { name: string }) => r.name === "observe");
		assert.equal(observe.status, "completed");
		assert.equal(observe.steps[0].exitCode, 0);
		assert.equal(observe.sanity.exitCode, 0, "independent sanity proves the journey's observable result");
		assert.equal(A.verification.results.find((r: { name: string }) => r.name === "full-suite").steps[0].stdout, "SUITE OK");
		assert.equal(A.verification.cleanup.status, "complete");
		assert.equal(A.verification.verification.status, "needs_assessment");
		await t.wait(
			() =>
				pass().handoff?.integrations?.at(-1)?.status === "qualified" ||
				/^(needs_human|watchdog_|preparation_|integration_)/.test(pass().handoff?.blocker ?? ""),
			"authored asset integrates",
		);
		assert.equal(pass().handoff!.integrations!.at(-1)!.status, "qualified", pass().handoff?.blocker);
		const round = t.assignments().find((a) => a.packet.role === "watchdog")!;
		assert.equal(round.status, "submitted", "an independent Watchdog round reviewed the authored asset");
		const R = git(store, ["rev-parse", proposalRef("workflow:3")])
			.toString()
			.trim();
		assert.equal(git(store, ["rev-list", "--parents", "-n", "1", R]).toString().trim(), `${R} ${T}`, "integrated only on top of T");
		assert.equal(git(store, ["show", `${R}:.skl/verify.md`]).toString(), authored.verify);
		assert.equal(git(store, ["show", `${R}:.skl/journeys/observe.md`]).toString(), authored.journey);
		assert.equal(git(store, ["show", `${R}:.render/verify.md`]).toString(), "NOT THE SELECTED CATALOG", "no parallel asset copy");
	} finally {
		await t.close();
	}
});

test("VA4-VA5 an unproven authored asset keeps discovery, a missing prerequisite and a failed journey visible and delivers nothing", async () => {
	const t = await fixture({ bootstrap: true, watchdog: [] });
	try {
		const store = effectsStore(t);
		const T = t.writer.verification!.commit;
		const seen = author(t, [
			write(
				asset(
					"| observe | Process | journey | `.skl/journeys/observe.md` | The value file reads Z | process |\n| smoke | Process | executed | `render-fixture-smoke-not-installed` | Prints SMOKE OK | process |\n",
					'test "$(cat observed)" = Z',
				),
			),
			["implementation_audit", {}],
			handoff,
		]);
		const opening = accepted(
			await t.f.command({
				type: "assignTask",
				slice: "value",
				delivery: true,
				packet: selected(t, ["observe", "smoke", "full-suite", "typecheck", "lint", "discover"], ["observe", "smoke"]),
			}),
		);
		const owner = () => t.assignments().find((a) => a.id === opening.assignment)!;
		await t.wait(
			() => owner().status === "blocked" && !owner().executing && owner().blocker !== "awaiting_role_results",
			"stopped author settles",
		);
		assert.match(seen.toolResults.at(-1)!, /"code":"missing_content"/, "discovery and setup cannot hand off as proof");
		assert.equal(
			owner().blocker,
			"verification_unproven: failed observe; unrun smoke; cleanup complete",
			"missing prerequisite and failed journey are visible",
		);
		const pass = passes(t).find((p) => p.ref === opening.passRef)!;
		assert.equal(pass.handoff, undefined);
		const checks = (await record(t, pass.workspace!)).verification;
		const result = (name: string) => checks.results.find((r: { name: string }) => r.name === name);
		assert.equal(result("discover").status, "completed");
		assert.equal(checks.catalog.rows.find((r: { name: string }) => r.name === "discover").rank, null, "discovery has no proof rank");
		assert.equal(result("smoke").status, "unrun");
		assert.equal(result("smoke").steps[0].exitCode, 127);
		assert.equal(result("observe").status, "failed");
		assert.equal(result("observe").steps[0].exitCode, 0, "setup succeeded");
		assert.equal(result("observe").sanity.exitCode, 1);
		assert.equal(checks.cleanup.status, "complete");
		assert.equal(checks.verification.status, "non-pass");
		let canonical = "";
		try {
			canonical = git(store, ["rev-parse", "--verify", "-q", proposalRef("workflow:3")])
				.toString()
				.trim();
		} catch {}
		assert.ok(canonical === "" || canonical === T, "no baseline write");
	} finally {
		await t.close();
	}
});
