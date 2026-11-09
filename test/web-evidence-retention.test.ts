// B3/B4/B5: registered web tools, Durable transcripts and real SQLite retaining what a role observed and relied on.

import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { ConversationId } from "@earendil-works/pi-durable";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, claudeFixture, packet, roleFixture } from "./support/roles.ts";
import { webHttpFixture as fixture, retainedEvidenceRef, roleWebJourney } from "./support/web-http.ts";

test("B3/B4 retained fallback evidence keeps the Exa failure and eligibility uncertainty", async () => {
	const http = await fixture((path) =>
		path.startsWith("/exa")
			? { status: 402, body: { error: "Credits are exhausted", tag: "NO_MORE_CREDITS" } }
			: { body: { results: [{ url: "https://example.org/page", raw_content: "Fallback evidence." }], failed_results: [] } },
	);
	try {
		const { f } = await roleWebJourney(
			{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
			"web_contents",
			{ urls: ["https://example.org/page"] },
			(r) =>
				fauxAssistantMessage(
					fauxToolCall("retain_web_evidence", {
						handle: r.handle!,
						observation: r.inputs[0]!.observations[1]!.id,
						start: 0,
						end: 18,
						claim: "Fallback supports the claim",
						stance: "supporting",
					}),
					{ stopReason: "toolUse" },
				),
		);
		try {
			const ref = await retainedEvidenceRef(f);
			assert.ok(ref, "selected evidence must enter Ledger before reliance");
			const retained = await Effect.runPromise(f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in retained);
			const evidence = JSON.parse(retained.content.toString()) as {
				provider: string;
				text: string;
				failures: { provider: string; error: string; uncertainty?: string }[];
			};
			assert.equal(evidence.provider, "tavily");
			assert.equal(evidence.text, "Fallback evidence.");
			assert.deepEqual(
				evidence.failures.map((o) => [o.provider, o.error]),
				[["exa", "PROVIDER_FAILURE"]],
			);
			assert.match(evidence.failures[0]!.uncertainty ?? "", /Fallback eligibility uncertain/);
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

test("B3/B5 identical bytes remain distinct observations; own tail paging is scoped and network-free", async () => {
	const tail = "TAIL-CANARY-9281";
	const http = await fixture(() => ({
		body: { results: [{ url: "https://example.org/page", title: "Page", text: `${"x".repeat(40000)}${tail}` }] },
	}));
	try {
		const web = { exaKey: "fixture", exaBaseUrl: http.url };
		const first = await roleWebJourney(web, "web_contents", { urls: ["https://example.org/page"] }, (r) =>
			fauxAssistantMessage(fauxToolCall("read_web_result", { handle: r.handle!, offset: 40000, limit: 4096 }), { stopReason: "toolUse" }),
		);
		const second = await roleWebJourney(web, "web_contents", { urls: ["https://example.org/page"] });
		try {
			const a = first.reply.inputs[0]!.observations[0]!;
			const b = second.reply.inputs[0]!.observations[0]!;
			assert.notEqual(a.id, b.id, "observation identity must not be a digest");
			assert.equal(a.digest, b.digest);
			assert.match(first.output, /omissions/);
			const assignment = (
				first.f.ledger.snapshot(admin) as unknown as {
					assignments: { id: string; generation: number; attempt: string; packet: { role: string } }[];
				}
			).assignments[0]!;
			const conversation = await first.f.harness.conversation(
				(first.f.ledger.snapshot(admin) as unknown as { assignments: { conversation: number }[] }).assignments[0]!
					.conversation as ConversationId,
				BACKGROUND_CONTEXT,
			);
			assert.ok(conversation);
			let tailOutput = "";
			for (let n = 0; n < 200 && !tailOutput; n++) {
				const entries = await conversation.entries({ order: "ascending" }, 200, undefined, BACKGROUND_CONTEXT);
				tailOutput = entries.items
					.flatMap((e) => e.model ?? [])
					.filter((m) => m.role === "toolResult" && m.toolName === "read_web_result")
					.flatMap((m) => (m.role === "toolResult" ? m.content : []))
					.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join("");
				if (!tailOutput) await setTimeout(10);
			}
			assert.match(JSON.parse(tailOutput).text, /TAIL-CANARY-9281/, "registered scoped paging must retrieve the exact tail");
			const own = mintContext({
				kind: "assignment-agent",
				assignment: assignment.id,
				generation: assignment.generation,
				attempt: assignment.attempt,
				role: assignment.packet.role,
			});
			const page = await Effect.runPromise(first.f.ledger.artifact(own, { read: first.reply.handle! }));
			assert.ok("content" in page);
			assert.match(page.content.toString(), /TAIL-CANARY-9281/);
			const foreign = await Effect.runPromise(second.f.ledger.artifact(own, { read: first.reply.handle! }));
			assert.equal("code" in foreign ? foreign.code : "disclosed", "working_result_unavailable");
			const other = await first.f.command({ type: "assignTask", slice: "slice:foreign", delivery: true, packet: packet() });
			assert.equal(other.status, "accepted");
			if (other.status === "accepted") {
				const outsider = mintContext({
					kind: "assignment-agent",
					assignment: other.result.assignment as string,
					generation: 1,
					attempt: other.result.attempt as string,
					role: "coordinator",
				});
				const known = await Effect.runPromise(first.f.ledger.artifact(outsider, { read: first.reply.handle! }));
				assert.equal(
					"code" in known ? known.code : "disclosed",
					"working_result_unavailable",
					"known foreign handles must not grant authority",
				);
			}
			assert.equal(http.calls.length, 2, "reading must never contact provider");
		} finally {
			await first.f.close();
			await second.f.close();
		}
	} finally {
		await http.close();
	}
});

test("B4 selected negative evidence is exported by ref and readable after expiry/reopen; old working handle never refetches", async () => {
	const http = await fixture(() => ({
		body: { results: [{ url: "https://example.org/negative", text: "Context: no support for this claim. Conflicting result remains." }] },
	}));
	try {
		const { f, reply } = await roleWebJourney(
			{ exaKey: "fixture", exaBaseUrl: http.url, cacheTtlMs: 1000 },
			"web_contents",
			{ urls: ["https://example.org/negative"] },
			(r) =>
				fauxAssistantMessage(
					fauxToolCall("retain_web_evidence", {
						handle: r.handle!,
						observation: r.inputs[0]!.observations[0]!.id,
						start: 0,
						end: 63,
						claim: "Claim is unsupported",
						stance: "negative",
					}),
					{ stopReason: "toolUse" },
				),
		);
		try {
			const ref = await retainedEvidenceRef(f);
			assert.ok(ref, "selected evidence must enter Ledger before reliance");
			const retained = await Effect.runPromise(f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in retained);
			assert.match(retained.content.toString(), /Context: no support for this claim. Conflicting result remains./);
			assert.match(retained.content.toString(), /negative/);
			assert.match(
				retained.content.toString(),
				/Provider metadata and secondary summary fields are omitted/,
				"retained evidence must preserve working completeness qualifications",
			);
			for (let n = 0; n < 200; n++) {
				const assignment = (f.ledger.snapshot(admin) as unknown as { assignments: { status: string }[] }).assignments[0]!;
				if (assignment.status === "submitted") break;
				await setTimeout(10);
			}
			assert.equal(
				(f.ledger.snapshot(admin) as unknown as { assignments: { status: string }[] }).assignments[0]!.status,
				"submitted",
				"report reliance must link retained support",
			);
			const a = (f.ledger.snapshot(admin) as unknown as { assignments: { id: string; generation: number; attempt: string }[] })
				.assignments[0]!;
			const missing = await f.command(
				{ type: "submitRoleResult", text: "Unsupported reliance", supports: [reply.handle!] },
				mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: "coordinator" }),
			);
			assert.equal("code" in missing ? missing.code : "accepted", "missing_content", "a working handle is not retained report support");
			await setTimeout(1100);
			const expired = await Effect.runPromise(f.ledger.artifact(admin, { read: reply.handle! }));
			assert.equal("code" in expired ? expired.code : "disclosed", "working_result_unavailable");
			const assignment = (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments[0]!;
			const conversation = await f.harness.conversation(assignment.conversation as ConversationId, BACKGROUND_CONTEXT);
			assert.ok(conversation);
			const entries = await conversation.entries({ order: "ascending" }, 200, undefined, BACKGROUND_CONTEXT);
			const native = entries.items.flatMap((e) => e.model ?? []).filter((m) => m.role === "toolResult" && m.toolName === "web_contents");
			assert.match(JSON.stringify(native), /Context: no support for this claim/, "committed output survives working expiry");
			await f.reopen();
			const after = await Effect.runPromise(f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in after, "retained evidence remains available independently of working cache");
			assert.deepEqual(after.content, retained.content, "cache cleanup must not delete retained evidence");
			assert.equal(http.calls.length, 1);
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

test("B3 explicit missing credentials and echoed credentials never become retained text", async () => {
	const http = await fixture(() => ({ body: { images: [], results: [{ url: "https://example.org", content: "fixture-secret" }] } }));
	try {
		for (const provisioned of [false, true]) {
			const { f, reply, output } = await roleWebJourney(
				{ ...(provisioned ? { tavilyKey: "fixture-secret" } : {}), tavilyBaseUrl: http.url },
				"web_search",
				{ queries: ["provision"] },
			);
			try {
				assert.equal(reply.inputs[0]!.primaryNotAttempted, "credentials_missing");
				assert.equal(reply.inputs[0]!.fallback, provisioned ? "completed" : "credentials_missing");
				assert.doesNotMatch(output, /fixture-secret/);
				if (provisioned) assert.match(output, /redacted/i);
			} finally {
				await f.close();
			}
		}
		assert.equal(http.calls.length, 1);
	} finally {
		await http.close();
	}
});

for (const damage of ["missing", "corrupt"])
	test(`B4 required ${damage} support blocks reliance until exact restoration`, async () => {
		const http = await fixture(() => ({ body: { results: [{ url: "https://example.org/negative", text: "Negative context." }] } }));
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		let f!: Awaited<ReturnType<typeof roleFixture>>;
		let checked = false;
		let failure: unknown;
		let evidence = "";
		const last = (ctx: { messages: { role: string; content: unknown }[] }) =>
			JSON.parse(
				(ctx.messages.filter((m) => m.role === "toolResult").at(-1)!.content as { text: string }[]).map((c) => c.text ?? "").join(""),
			);
		p.setResponses([
			fauxAssistantMessage(fauxToolCall("web_contents", { urls: ["https://example.org/negative"] }), { stopReason: "toolUse" }),
			(ctx) => {
				const r = last(ctx);
				return fauxAssistantMessage(
					fauxToolCall("retain_web_evidence", {
						handle: r.handle,
						observation: r.inputs[0].observations[0].id,
						start: 0,
						end: 17,
						claim: "negative",
						stance: "negative",
					}),
					{ stopReason: "toolUse" },
				);
			},
			async (ctx) => {
				try {
					evidence = last(ctx).result.evidence;
					assert.ok(evidence);
					const a = (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments[0]!;
					const own = mintContext({
						kind: "assignment-agent",
						assignment: a.id,
						generation: a.generation,
						attempt: a.attempt,
						role: a.packet.role,
					});
					const unrelated = await f.command({ type: "submitRoleResult", text: "Claim", supports: ["revision:3"] }, own);
					assert.equal("code" in unrelated ? unrelated.code : unrelated.status, "missing_content");
					// Controlled disk fault only. Assertions below use Ledger commands and exported content.
					const db = new DatabaseSync(join(f.data, "render.db"));
					try {
						const row = (
							db.prepare("SELECT id, conversation_id, head, commit_seq, record FROM entries").all() as {
								id: number;
								conversation_id: number;
								head: number | null;
								commit_seq: number;
								record: string;
							}[]
						).find((r) => JSON.parse(r.record).data?.document?.startsWith("web-evidence/"))!;
						assert.ok(row);
						if (damage === "missing") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
						else {
							const record = JSON.parse(row.record);
							record.data.text = "replacement bytes";
							db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
						}
						const denied = await f.command({ type: "submitRoleResult", text: "Claim", supports: [evidence] }, own);
						assert.equal("code" in denied ? denied.code : denied.status, "content_corrupt", "damaged required support must block reliance");
						assert.match("reason" in denied ? denied.reason : "", new RegExp(`Restore exact evidence ${evidence}`));
						// Restore the exact retained record, not new network bytes.
						if (damage === "missing")
							db.prepare("INSERT INTO entries (id, conversation_id, head, commit_seq, record) VALUES (?, ?, ?, ?, ?)").run(
								row.id,
								row.conversation_id,
								row.head,
								row.commit_seq,
								row.record,
							);
						else db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(row.record, row.id);
					} finally {
						db.close();
					}
					checked = true;
				} catch (error) {
					failure = error;
				}
				return fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "Negative conclusion.", supports: [evidence] }), {
					stopReason: "toolUse",
				});
			},
		]);
		try {
			f = await roleFixture(
				new Engine({
					provider: p.provider,
					...claudeFixture,
					web: { exaKey: "fixture", exaBaseUrl: http.url },
				}),
			);
			try {
				await f.command({ type: "assignTask", slice: "slice:damaged", delivery: true, packet: packet({ maxTurns: 4 }) });
				let a!: RoleAssignment;
				for (let n = 0; n < 300; n++) {
					a = (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments[0]!;
					if (!a.executing && ["submitted", "blocked"].includes(a.status)) break;
					await setTimeout(10);
				}
				if (failure) throw failure;
				assert.ok(checked, "required support verification must execute");
				assert.equal(a.status, "submitted");
				const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
				assert.ok("jsonl" in exported);
				assert.match(exported.jsonl, /"webEvidence":"retained"/);
				assert.match(exported.jsonl, new RegExp(`"support0":"${evidence}"`));
				assert.equal(http.calls.length, 1, "restoration must never refetch");
			} finally {
				await f.close();
			}
		} finally {
			await http.close();
		}
	});
