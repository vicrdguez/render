// GP01–GP16 at the Ledger/Kernel interface over real SQLite. Forge observations are literal host results here: they
// establish authority, ordering, association, risk and retention, not that the GitHub adapter produced them (see
// github-publication-forge.test.ts and the Engine journey in github-publication.integration.ts).

import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import type { CommandReply, Frame } from "../src/ledger/ledger.ts";
import { accepted, LedgerOnlyEngine } from "./support/implementation.ts";
import {
	admitted,
	effects,
	handedOff,
	handOffNext,
	type Lifecycle,
	lineage,
	observation,
	passedRound,
	R1,
	R2,
	record,
	refused,
	W,
	X2,
} from "./support/integration.ts";
import { admin, recovery, scheduler } from "./support/roles.ts";

type Item = {
	id: string;
	state: "open" | "closed" | "merged";
	draft: boolean;
	head: string | null;
	marker: string | null;
	actor: boolean;
	merge: { main: boolean; commit: string } | null;
};
type Op = { operation: string; kind: string; status: string; attempts: { id: string; executorEpoch: string }[] };
type Publication = {
	status: string;
	canonical: string | null;
	published: string | null;
	divergence: { head: string; canonical: string } | null;
	association: { pr: string; by: string } | null;
	duplicates: string[];
	risk: { attempts: string[]; resolved: { statement: string; attempts: string[] } | null } | null;
	unsupported: string[];
	operations: Op[];
	blocked: string[];
	choices: string[];
};
const FOREIGN = "f00d".repeat(10);
const AT = "2026-11-01T00:00:00.000Z";
const view = (t: Lifecycle) => ((t.f.ledger.snapshot(admin) as Frame).workflows as { publication: Publication }[])[0]!.publication;
const op = (t: Lifecycle, operation: string) => view(t).operations.find((o) => o.operation === operation)!;
const stageF = (t: Lifecycle, kind: string, context = effects) => t.f.command({ type: "stageForgeOperation", kind }, context);
const admitF = (t: Lifecycle, operation: string, context = effects) => t.f.command({ type: "admitForgeOperation", operation }, context);
function observe(t: Lifecycle, over: Record<string, unknown> = {}, context = effects): Promise<CommandReply> {
	const text = JSON.stringify({
		schema: 1,
		operation: null,
		attempt: null,
		mode: "reconcile",
		outcome: null,
		reason: null,
		created: null,
		head: null,
		proposals: null,
		capabilities: null,
		observedAt: AT,
		...over,
	});
	return t.f.command({ type: "recordForgeObservation", text }, context);
}
const dispatch = (t: Lifecycle, operation: string, attempt: string, outcome: string, over: Record<string, unknown> = {}) =>
	observe(t, { operation, attempt, mode: "dispatch", outcome, ...over });
const item = (id: string, marker: string | null, over: Partial<Item> = {}): Item => ({
	id,
	state: "open",
	draft: true,
	head: R1,
	marker,
	actor: true,
	merge: null,
	...over,
});
const listing = (items: Item[], complete = true) => ({ proposals: { complete, items } });
const marker = (operation: string) => `render-proposal:${W}:${operation}`;
async function read(t: Lifecycle, ref: string) {
	const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
	assert.ok("content" in value, `read ${ref}`);
	return value.content.toString();
}

/** read-fix integrated as R1 on T0 through the real integration commands; read-next requires it. */
async function qualified() {
	const t = await handedOff("integration");
	const r = await passedRound(t);
	const { operation, attempt } = await admitted(t, t.id, r);
	accepted(await record(t, t.id, operation, observation(operation, attempt)));
	return t;
}
/** read-next handed off, reviewed and qualified as R2 on R1: later local work, independent of any forge outcome. */
async function integrateNext(t: Lifecycle) {
	const id = await handOffNext(t);
	const l = lineage(R1, X2);
	const r = await passedRound(t, id, "read-next", l);
	const { operation, attempt } = await admitted(t, id, r, l, R2);
	const outcome = accepted(await record(t, id, operation, observation(operation, attempt, {}, l, R2))).outcome;
	assert.equal(outcome, "applied", "the next Slice qualifies");
}
/** R1 published, then the one create admitted after an empty complete pre-create listing. */
async function publishedAndCreating(t: Lifecycle) {
	accepted(await observe(t, { head: { commit: null } }));
	const publish = accepted(await stageF(t, "publish-source")).operation as string;
	const a = accepted(await admitF(t, publish)).forgeAttempt as string;
	accepted(await dispatch(t, publish, a, "applied", { head: { commit: R1 } }));
	const create = accepted(await stageF(t, "create-proposal")).operation as string;
	accepted(await observe(t, { operation: create, ...listing([]) }));
	const attempt = accepted(await admitF(t, create)).forgeAttempt as string;
	return { create, attempt };
}

test("GP01 only host Effects stages, admits and records forge work; only a human reissues or resolves", async () => {
	const t = await qualified();
	try {
		for (const [label, context] of [
			["local admin", admin],
			["scheduling", scheduler],
			["recovery", recovery],
			["implementer agent", t.actor],
		] as const) {
			refused(await stageF(t, "publish-source", context), "forbidden_principal", `${label} stage`);
			refused(await admitF(t, "revision:1", context), "forbidden_principal", `${label} admit`);
			refused(await observe(t, {}, context), "forbidden_principal", `${label} observation`);
		}
		for (const [label, context] of [
			["host Effects", effects],
			["implementer agent", t.actor],
		] as const) {
			refused(
				await t.f.command({ type: "authorizeForgeReissue", operation: "revision:1" }, context),
				"forbidden_principal",
				`${label} reissue`,
			);
			refused(
				await t.f.command({ type: "resolveForgeRisk", operation: "revision:1", pr: "github:pr:1:x", text: "keep" }, context),
				"forbidden_principal",
				`${label} resolve`,
			);
		}
		assert.deepEqual(view(t).operations, [], "nothing retained");
	} finally {
		await t.close();
	}
});

test("GP02 nothing publishes before the first qualifying integration", async () => {
	const t = await handedOff("integration");
	try {
		refused(await stageF(t, "publish-source"), "stale_basis", "no qualified integration");
		assert.equal(view(t).status, "awaiting-integration");
		assert.equal(view(t).canonical, null);
	} finally {
		await t.close();
	}
});

test("GP03 publication pins the canonical R and the observed expected-old head, and records the published mapping", async () => {
	const t = await qualified();
	try {
		assert.equal(view(t).canonical, R1);
		assert.equal(view(t).status, "lagging");
		accepted(await observe(t, { head: { commit: null } }));
		const publish = accepted(await stageF(t, "publish-source")).operation as string;
		assert.deepEqual(JSON.parse(await read(t, publish)), { schema: 1, kind: "publish-source", proposal: W, canonical: R1, expected: null });
		assert.equal(op(t, publish).status, "planned");
		const admission = accepted(await admitF(t, publish));
		assert.match(String(admission.forgeAttempt), /^forge-attempt:\d+$/);
		assert.equal(admission.executorEpoch, t.f.ledger.status().executorEpoch);
		accepted(await dispatch(t, publish, admission.forgeAttempt as string, "applied", { head: { commit: R1 } }));
		assert.equal(op(t, publish).status, "applied");
		assert.equal(view(t).published, R1);
		assert.equal(view(t).status, "published");
		refused(await stageF(t, "publish-source"), "stale_basis", "already published");
	} finally {
		await t.close();
	}
});

test("GP04 a foreign remote head is divergence: publication blocks, local integration and dependents continue", async () => {
	const t = await qualified();
	try {
		accepted(await observe(t, { head: { commit: FOREIGN } }));
		assert.deepEqual(view(t).divergence, { head: FOREIGN, canonical: R1 });
		assert.equal(view(t).status, "blocked");
		assert.ok(view(t).blocked.includes("publish-source"));
		refused(await stageF(t, "publish-source"), "stale_basis", "divergent remote");
		await integrateNext(t);
		assert.equal(view(t).canonical, R2, "eligible local work integrated during divergence");
		assert.deepEqual(view(t).divergence, { head: FOREIGN, canonical: R2 }, "divergence stays visible, never imported");
		accepted(await observe(t, { head: { commit: R1 } }));
		assert.equal(view(t).divergence, null, "a remote back on canonical lineage clears divergence");
		assert.equal(JSON.parse(await read(t, accepted(await stageF(t, "publish-source")).operation as string)).expected, R1);
	} finally {
		await t.close();
	}
});

test("GP05/GP06 one create, only after the head is published, with the marker and a truthful summary", async () => {
	const t = await qualified();
	try {
		refused(await stageF(t, "create-proposal"), "stale_basis", "head not yet published");
		accepted(await observe(t, { head: { commit: R1 } }));
		const create = accepted(await stageF(t, "create-proposal")).operation as string;
		const intent = JSON.parse(await read(t, create));
		assert.deepEqual(Object.keys(intent), ["schema", "kind", "proposal", "marker", "title", "head", "body"]);
		assert.equal(intent.marker, marker(create));
		assert.equal(intent.head, R1);
		assert.equal(intent.title, "Render: Roles");
		assert.ok(intent.body.startsWith(`<!-- render:proposal-pr ${marker(create)} -->\n<!-- render:summary:start -->\n`));
		for (const line of [
			"- Intended outcome: Roles",
			"- Integrated scope: read-fix",
			`- Canonical source: ${R1}`,
			`- Published head: ${R1}`,
			"- Evidence: read-fix: Watchdog ",
			"- Remaining blocking work: read-next: not yet integrated",
			"- Advisory human checks: local verification prompts are advisory and gate neither readiness nor merge.",
			"- Main merge: the human only.",
		])
			assert.ok(intent.body.includes(line), `summary names: ${line}`);
		refused(await stageF(t, "create-proposal"), "role_already_requested", "one logical create per proposal");
	} finally {
		await t.close();
	}
});

test("GP07 before creating, an open PR on the branch is reused and two are shown for the human", async () => {
	const t = await qualified();
	try {
		accepted(await observe(t, { head: { commit: R1 } }));
		const create = accepted(await stageF(t, "create-proposal")).operation as string;
		refused(await admitF(t, create), "stale_basis", "no pre-create listing yet");
		accepted(await observe(t, { operation: create, ...listing([item("github:pr:1:a", null), item("github:pr:2:b", null)]) }));
		assert.deepEqual(view(t).duplicates, ["github:pr:1:a", "github:pr:2:b"]);
		refused(await admitF(t, create), "stale_basis", "duplicates await the human");
		accepted(await observe(t, { operation: create, ...listing([item("github:pr:2:b", null)]) }));
		assert.deepEqual(view(t).association, { pr: "github:pr:2:b", by: "reused", draft: true, state: "open" });
		assert.deepEqual(view(t).duplicates, []);
		assert.equal(op(t, create).status, "applied");
		assert.equal(op(t, create).attempts.length, 0, "reuse sends nothing");
	} finally {
		await t.close();
	}
});

test("GP08 later heads update the same PR; superseded summaries coalesce", async () => {
	const t = await qualified();
	try {
		const { create, attempt } = await publishedAndCreating(t);
		accepted(await dispatch(t, create, attempt, "applied", { created: "github:pr:7:n" }));
		assert.deepEqual(view(t).association, { pr: "github:pr:7:n", by: "created", draft: true, state: "open" });
		await integrateNext(t);
		assert.equal(view(t).status, "lagging");
		const publish = accepted(await stageF(t, "publish-source")).operation as string;
		assert.equal(JSON.parse(await read(t, publish)).expected, R1);
		accepted(await dispatch(t, publish, accepted(await admitF(t, publish)).forgeAttempt as string, "applied", { head: { commit: R2 } }));
		const first = accepted(await stageF(t, "update-summary")).operation as string;
		const second = accepted(await stageF(t, "update-summary")).operation as string;
		assert.equal(op(t, first).status, "superseded");
		assert.equal(op(t, second).status, "planned");
		const intent = JSON.parse(await read(t, second));
		assert.deepEqual([intent.pr, intent.canonical, intent.published], ["github:pr:7:n", R2, R2]);
		assert.ok(intent.summary.includes("- Integrated scope: read-fix, read-next"));
		refused(await stageF(t, "create-proposal"), "role_already_requested", "a new head never creates another PR");
		assert.equal(view(t).operations.filter((o) => o.kind === "create-proposal").length, 1);
		refused(await admitF(t, first), "stale_basis", "a superseded summary is never sent");
	} finally {
		await t.close();
	}
});

test("GP09/GP10 an unknown create is never readmitted and negative or incomplete listings keep it unknown across reopen", async () => {
	const t = await qualified();
	try {
		const { create, attempt } = await publishedAndCreating(t);
		accepted(await dispatch(t, create, attempt, "unknown", { reason: "reply lost" }));
		assert.equal(op(t, create).status, "unknown");
		refused(await admitF(t, create), "stale_basis", "no automatic recreation");
		await t.f.reopen(new LedgerOnlyEngine());
		refused(
			await dispatch(t, create, attempt, "applied", { created: "github:pr:1:a" }),
			"stale_executor",
			"another epoch reports no dispatch",
		);
		for (const seen of [
			listing([]),
			listing([item("github:pr:1:a", marker(create))], false),
			listing([item("github:pr:3:c", "render-proposal:other")]),
		]) {
			accepted(await observe(t, { operation: create, ...seen }));
			assert.equal(op(t, create).status, "unknown", "a negative or incomplete listing is not absence");
			assert.equal(view(t).association, null);
		}
		assert.deepEqual(
			op(t, create).attempts.map((a) => a.id),
			[attempt],
			"one attempt",
		);
		assert.deepEqual(view(t).choices, ["inspect", "recheck", "authorizeForgeReissue"]);
		assert.equal(view(t).status, "uncertain");
	} finally {
		await t.close();
	}
});

test("GP11/GP12 a unique verified candidate associates; two verified candidates stay unknown and are shown", async () => {
	const t = await qualified();
	try {
		const { create, attempt } = await publishedAndCreating(t);
		accepted(await dispatch(t, create, attempt, "unknown"));
		const two = [item("github:pr:1:a", marker(create)), item("github:pr:2:b", marker(create))];
		accepted(await observe(t, { operation: create, ...listing(two) }));
		assert.equal(op(t, create).status, "unknown");
		assert.deepEqual(view(t).duplicates, ["github:pr:1:a", "github:pr:2:b"]);
		assert.ok(view(t).choices.includes("resolveForgeRisk"));
		accepted(await observe(t, { operation: create, ...listing([two[0]!, item("github:pr:4:d", marker(create), { actor: false })]) }));
		assert.deepEqual(view(t).association, { pr: "github:pr:1:a", by: "reconciled", draft: true, state: "open" });
		assert.equal(op(t, create).status, "applied");
	} finally {
		await t.close();
	}
});

test("GP13/GP14 a human reissue makes risk sticky across attempts until an explicit scoped resolution", async () => {
	const t = await qualified();
	try {
		const { create, attempt } = await publishedAndCreating(t);
		accepted(await dispatch(t, create, attempt, "unknown"));
		accepted(await t.f.command({ type: "authorizeForgeReissue", operation: create }, admin));
		const second = accepted(await admitF(t, create)).forgeAttempt as string;
		assert.deepEqual(view(t).risk, { attempts: [attempt, second], resolved: null });
		accepted(await dispatch(t, create, second, "applied", { created: "github:pr:2:b" }));
		assert.equal(view(t).association, null, "a verified response does not clear risk");
		accepted(await observe(t, { operation: create, ...listing([item("github:pr:2:b", marker(create))]) }));
		assert.equal(view(t).association, null, "a transient unique listing does not clear risk");
		assert.equal(view(t).status, "blocked");
		refused(await stageF(t, "update-summary"), "stale_basis", "association-dependent publication waits");
		await integrateNext(t);
		refused(
			await t.f.command({ type: "resolveForgeRisk", operation: create, pr: "github:pr:9:z", text: "Keep it." }, admin),
			"stale_basis",
			"an unseen PR cannot be associated",
		);
		accepted(
			await observe(t, { operation: create, ...listing([item("github:pr:1:a", marker(create)), item("github:pr:2:b", marker(create))]) }),
		);
		const resolved = accepted(
			await t.f.command(
				{ type: "resolveForgeRisk", operation: create, pr: "github:pr:2:b", text: "Keep #2; I close #1 on GitHub." },
				admin,
			),
		);
		assert.deepEqual(view(t).association, { pr: "github:pr:2:b", by: "resolved", draft: true, state: "open" });
		assert.deepEqual(view(t).duplicates, ["github:pr:1:a"]);
		assert.deepEqual(view(t).risk, {
			attempts: [attempt, second],
			resolved: { statement: resolved.statement, attempts: [attempt, second] },
		});
		assert.equal(await read(t, resolved.statement as string), "Keep #2; I close #1 on GitHub.");
		accepted(await stageF(t, "update-summary"));
	} finally {
		await t.close();
	}
});

test("GP15 a lost summary reply shows local facts and uncertainty; every intent and observation survives reopen and export", async () => {
	const t = await qualified();
	try {
		const { create, attempt } = await publishedAndCreating(t);
		accepted(await dispatch(t, create, attempt, "applied", { created: "github:pr:7:n" }));
		const summary = accepted(await stageF(t, "update-summary")).operation as string;
		const sent = accepted(await admitF(t, summary)).forgeAttempt as string;
		const lost = accepted(await dispatch(t, summary, sent, "unknown", { reason: "reply lost" })).observation as string;
		assert.equal(op(t, summary).status, "unknown");
		assert.deepEqual([view(t).status, view(t).canonical, view(t).published], ["uncertain", R1, R1]);
		const before = JSON.stringify(view(t));
		await t.f.reopen(new LedgerOnlyEngine());
		assert.equal(JSON.stringify(view(t)), before, "state survives reopen");
		const exported = await Effect.runPromise(t.f.ledger.artifact(admin, { export: { workflow: W } }));
		assert.ok("manifest" in exported && exported.manifest.complete);
		for (const ref of [create, summary, lost]) assert.ok(exported.content[ref], `export contains ${ref}`);
	} finally {
		await t.close();
	}
});

test("GP16 missing draft support refuses the create visibly; a draft-unsupported rejection never becomes a non-draft", async () => {
	const t = await qualified();
	try {
		const caps = (draft: boolean) => ({
			draftProposalPR: draft,
			markProposalReady: true,
			guardedSourceUpdate: true,
			createIdempotency: false,
			stableObjectIdentity: true,
			mergeObservation: false,
			observationCompleteness: true,
		});
		accepted(await observe(t, { head: { commit: R1 }, capabilities: caps(false) }));
		assert.deepEqual(view(t).unsupported, ["draftProposalPR"]);
		refused(await stageF(t, "create-proposal"), "capability_unavailable", "no draft support");
		accepted(await observe(t, { capabilities: caps(true) }));
		const create = accepted(await stageF(t, "create-proposal")).operation as string;
		accepted(await observe(t, { operation: create, ...listing([]) }));
		const attempt = accepted(await admitF(t, create)).forgeAttempt as string;
		accepted(await dispatch(t, create, attempt, "rejected", { reason: "draft-unsupported" }));
		assert.equal(op(t, create).status, "rejected");
		assert.deepEqual(view(t).unsupported, ["draftProposalPR"]);
		refused(await admitF(t, create), "stale_basis", "no retry, no non-draft substitute");
	} finally {
		await t.close();
	}
});

test("G5 an unresolved forge operation never blocks qualifying integration or the same-proposal dependent", async () => {
	const t = await qualified();
	try {
		accepted(await observe(t, { head: { commit: null } }));
		const publish = accepted(await stageF(t, "publish-source")).operation as string;
		accepted(
			await dispatch(t, publish, accepted(await admitF(t, publish)).forgeAttempt as string, "unknown", { reason: "forge unreachable" }),
		);
		assert.equal(op(t, publish).status, "unknown");
		assert.equal(view(t).published, null);
		await integrateNext(t);
		assert.equal(view(t).canonical, R2, "the dependent was assigned and integrated while the forge outcome is unknown");
		assert.equal(op(t, publish).status, "unknown", "the forge uncertainty stays visible");
	} finally {
		await t.close();
	}
});
