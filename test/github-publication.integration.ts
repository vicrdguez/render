// GP-E1 as a real journey: Engine, SQLite, Effects Git, Docker Linux checks and the GitHub adapter against an owned fake
// GitHub. Verdicts are fixture data; this establishes autonomous publication, one draft PR across an unknown create,
// and that a forge outage blocks neither integration nor the same-proposal dependent (design gap G5).
import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { accepted, effectsStore, fixture, proposalRef } from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Publication = {
	status: string;
	canonical: string | null;
	published: string | null;
	association: { pr: string; by: string } | null;
	main: { source: string; commit: string } | null;
	operations: { kind: string; status: string; canonical: string; attempts: unknown[] }[];
	readiness: { eligible: boolean; gaps: string[]; observed: string | null };
};
const publication = (t: Fixture) => ((t.f.ledger.snapshot(admin) as Frame).workflows as { publication: Publication }[])[0]!.publication;
const passes = (t: Fixture) => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
const qualified = (t: Fixture, slice: string) =>
	passes(t).some((p) => p.slice === slice && p.handoff?.integrations?.some((i) => i.status === "qualified"));
async function until(predicate: () => boolean, label: string, ms = 180000) {
	const deadline = Date.now() + ms;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, label);
		await delay(50);
	}
}
/** Each implementer edits its own file once; reviewers report no findings and every Watchdog round passes. */
function scripted(t: Fixture) {
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
			const p = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
				assignment: string;
				auditReview?: object;
				watchdogReview?: Record<string, unknown>;
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

test("GP-E1/AR-E1 one draft PR across a lost create reply; a forge outage blocks neither integration nor the dependent; recovery updates the same PR and promotes it ready; HM-E1 the human merge is observed", async () => {
	const gh = await fakeGitHub();
	const forge = { ...gh.config, retryMs: 200, repositories: { owned: { owner: gh.owner, name: gh.name, base: "main" } } };
	const t = await fixture({ watchdog: ["pass", "pass"], dependent: true, forge });
	try {
		const checks = t.f.config.checks as Record<string, (typeof t.f.config.checks)["revision:3"]>;
		checks[t.nextContract!] = checks[t.contract]!;
		scripted(t);
		const store = effectsStore(t);
		const branch = "render/workflow-2";
		gh.faults.dropCreateReply = true;
		gh.faults.lagListing = true;
		accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		await until(() => qualified(t, "value"), "the first Slice integrates");
		const R1 = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		await until(
			() => gh.posts() === 1 && publication(t).operations.some((o) => o.kind === "create-proposal" && o.status === "unknown"),
			"the create's reply is lost",
		);
		assert.equal(gh.branch(branch), R1, "the exact canonical R1 is published");
		await delay(1500);
		assert.equal(gh.posts(), 1, "lagging empty listings never trigger another create");
		assert.equal(publication(t).association, null);
		gh.faults.dropCreateReply = false;
		gh.reveal();
		await until(
			() =>
				publication(t).association?.by === "reconciled" &&
				publication(t).operations.some((o) => o.kind === "update-summary" && o.status === "applied"),
			"the one verified PR associates and receives its summary",
		);
		assert.equal(gh.pulls[0]!.draft, true);
		assert.deepEqual(publication(t).readiness.gaps, ["next: not yet integrated"], "no promotion while a Slice is unfinished");
		assert.equal(gh.readyRequests().length, 0);

		await gh.down();
		const next = { ...t.writer, inputs: [t.nextContract!], verification: { ...t.writer.verification!, contract: t.nextContract! } };
		accepted(await t.f.command({ type: "assignTask", slice: "next", delivery: true, packet: next }));
		await until(() => qualified(t, "next"), "the dependent integrates during the outage");
		const R2 = git(store, ["rev-parse", proposalRef("workflow:2")])
			.toString()
			.trim();
		assert.deepEqual([publication(t).status, publication(t).canonical, publication(t).published], ["lagging", R2, R1]);

		gh.faults.dropReadyReply = true;
		await gh.up();
		await until(
			() =>
				publication(t).published === R2 &&
				publication(t).operations.some((o) => o.kind === "update-summary" && o.status === "applied" && o.canonical === R2),
			"recovery publishes R2 and updates the summary",
		);
		assert.equal(gh.branch(branch), R2);
		assert.equal(gh.posts(), 1, "still exactly one create");
		assert.equal(gh.pulls.length, 1);
		assert.ok(
			gh.requests.some((r) => r.method === "PATCH" && r.path.endsWith("/pulls/1")),
			"the same PR's summary is updated",
		);
		assert.match(gh.pulls[0]!.body, new RegExp(`Canonical source: ${R2}`));
		await until(
			() => publication(t).operations.some((o) => o.kind === "mark-ready" && o.status === "satisfied"),
			"the Engine promotes the eligible PR and reconciles the lost reply",
		);
		assert.deepEqual(
			publication(t)
				.operations.filter((o) => o.kind === "mark-ready")
				.map((o) => [o.status, o.canonical, o.attempts.length]),
			[["satisfied", R2, 1]],
		);
		assert.equal(gh.readyRequests().length, 1, "one ready request, no blind resend");
		assert.equal(gh.pulls[0]!.draft, false, "the PR is ready on GitHub");
		assert.deepEqual([publication(t).readiness.eligible, publication(t).readiness.observed], [true, "ready"]);
		assert.equal(gh.posts(), 1, "promotion creates no PR");
		assert.ok(!gh.requests.some((r) => r.path.includes("/merge")), "no merge request");

		assert.equal(publication(t).main, null);
		const operations = publication(t).operations.length;
		const main = gh.merge(1);
		git(gh.repo, ["update-ref", "-d", `refs/heads/${branch}`]);
		await until(() => publication(t).main !== null, "HM-E1 the human merge is observed");
		await delay(1500);
		assert.equal(gh.branch(branch), null, "HM08 a delivered proposal's deleted branch is never recreated");
		assert.equal(publication(t).operations.length, operations, "HM08 no forge operation after the merge");
		const [reads, sequence] = [gh.requests.length, t.f.ledger.status().sequence];
		await delay(1500);
		assert.equal(gh.requests.length, reads, "HM09 reconciles after the observed merge send no further GitHub request");
		assert.equal(t.f.ledger.status().sequence, sequence, "HM09 and record no further forge observation");
		assert.deepEqual([publication(t).main!.source, publication(t).main!.commit], [R2, main]);
		assert.ok(!gh.requests.some((r) => r.path.endsWith("/merge")), "Render never sends a merge");
		const exported = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exported);
		assert.ok(!JSON.stringify(exported).includes(TOKEN), "the forge token never reaches Render records");
	} finally {
		await t.close();
		await gh.close();
	}
});

test("GP-E2 after a human reissue the host keeps listing candidates under sticky risk; only the human's resolution clears it", async () => {
	const gh = await fakeGitHub();
	const forge = { ...gh.config, retryMs: 200, repositories: { owned: { owner: gh.owner, name: gh.name, base: "main" } } };
	const t = await fixture({ watchdog: ["pass"], forge });
	try {
		scripted(t);
		gh.faults.dropCreateReply = true;
		gh.faults.lagListing = true;
		accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const create = () =>
			publication(t).operations.find((o) => o.kind === "create-proposal") as
				| (Publication["operations"][number] & { operation: string; candidates?: { id: string }[] })
				| undefined;
		await until(() => gh.posts() === 1 && create()?.status === "unknown", "the first create's reply is lost");
		accepted(await t.f.command({ type: "authorizeForgeReissue", operation: create()!.operation }, admin));
		await until(() => gh.posts() === 2 && create()?.status === "unknown", "the reissued create's reply is lost too");
		gh.reveal();
		await until(() => create()?.candidates?.length === 2, "the host keeps listing candidates under sticky risk", 20000);
		const risk = () => (publication(t) as unknown as { risk: { attempts: string[]; resolved: unknown } | null }).risk;
		assert.equal(publication(t).association, null, "a listing never clears sticky risk");
		assert.equal(risk()?.resolved, null);
		assert.equal(risk()?.attempts.length, 2, "the risk spans both attempts");
		const [keep, other] = create()!.candidates!.map((c) => c.id);
		const resolved = await t.f.command(
			{ type: "resolveForgeRisk", operation: create()!.operation, pr: keep!, text: "Keep the first PR; I close the other." },
			admin,
		);
		accepted(resolved);
		assert.deepEqual(publication(t).association, { pr: keep, by: "resolved", draft: true, state: "open" });
		assert.deepEqual((publication(t) as unknown as { duplicates: string[] }).duplicates, [other]);
		assert.notEqual(risk()?.resolved, null, "the human's resolution, and only it, clears the risk");
		assert.equal(gh.posts(), 2, "no create beyond the human-authorized reissue");
	} finally {
		await t.close();
		await gh.close();
	}
});
