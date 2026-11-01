import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { ConversationId, JsonObject } from "@earendil-works/pi-durable";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import type { HistoryExport } from "../src/ledger/history.ts";
import type { LedgerRefusal } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

// Owned HTTP responses are the external variability. Engine, root Webfox, Durable and SQLite stay real.
async function fixture(
	handler: (
		path: string,
		body: Record<string, unknown>,
	) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>,
) {
	const calls: { path: string; body: Record<string, unknown> }[] = [];
	const server = createServer(async (req, res) => {
		let text = "";
		for await (const chunk of req) text += String(chunk);
		const call = { path: req.url!, body: JSON.parse(text) as Record<string, unknown> };
		calls.push(call);
		const response = await handler(call.path, call.body);
		res.writeHead(response.status ?? 200, { "content-type": "application/json" });
		res.end(JSON.stringify(response.body));
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	return {
		calls,
		url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
		close: () =>
			new Promise<void>((r) => {
				server.closeAllConnections();
				server.close(() => r());
			}),
	};
}

type WebReply = {
	handle?: string;
	status: string;
	omissions: string[];
	inputs: {
		input: string;
		observations: { id: string; provider: string; outcome: string; text?: string; digest?: string; error?: string; complete: boolean }[];
		primaryNotAttempted?: string;
		fallback: string;
	}[];
};
async function run(
	web: Record<string, unknown>,
	name: string,
	args: Record<string, unknown>,
	follow?: (value: WebReply) => ReturnType<typeof fauxAssistantMessage>,
) {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let reply!: WebReply;
	let output = "";
	p.setResponses([
		fauxAssistantMessage(fauxToolCall(name, args as JsonObject), { stopReason: "toolUse" }),
		(ctx) => {
			output = ctx.messages
				.filter((m) => m.role === "toolResult")
				.map((m) =>
					m.content
						.filter((c) => c.type === "text")
						.map((c) => c.text)
						.join(""),
				)
				.at(-1)!;
			try {
				reply = JSON.parse(output);
			} catch {
				reply = { inputs: [], status: "invalid", omissions: [] };
			}
			return (
				follow?.(reply) ??
				fauxAssistantMessage(fauxToolCall("submit_role_result", { supports: [], text: "No web reliance." }), { stopReason: "toolUse" })
			);
		},
		(ctx) => {
			const text =
				ctx.messages
					.filter((m) => m.role === "toolResult")
					.at(-1)
					?.content.filter((c) => c.type === "text")
					.map((c) => c.text)
					.join("") ?? "{}";
			let value: { result?: { evidence?: string } } = {};
			try {
				value = JSON.parse(text);
			} catch {
				/* Native validation failures are not JSON. */
			}
			return value.result?.evidence
				? fauxAssistantMessage(
						fauxToolCall("submit_role_result", {
							text: "Claim is unsupported; negative evidence retained.",
							supports: [value.result.evidence],
						}),
						{ stopReason: "toolUse" },
					)
				: fauxAssistantMessage("done");
		},
	]);
	const f = await roleFixture(new Engine({ apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" }, provider: p.provider, web }));
	await f.command({ type: "assignTask", slice: "slice:web", delivery: true, packet: packet({ maxInputBytes: 262144, maxTurns: 4 }) });
	for (let n = 0; n < 500 && !output; n++) await setTimeout(10);
	assert.ok(output, "registered web tool must commit substantive output");
	return { f, reply, output };
}

test("B1/B3 empty success is final; provider refusal falls back once with distinct provenance", async () => {
	const http = await fixture((path, body) => {
		if (path.startsWith("/exa")) return body.query === "empty" ? { body: { results: [] } } : { status: 429, body: { error: "allowance" } };
		return {
			body: {
				images: [],
				results: [{ title: "Negative finding", url: "https://example.org/negative", content: "No support for the claim." }],
			},
		};
	});
	const web = {
		exaKey: "fixture-exa-secret",
		tavilyKey: "fixture-tavily-secret",
		exaBaseUrl: `${http.url}/exa`,
		tavilyBaseUrl: `${http.url}/tavily`,
	};
	try {
		const { f, reply, output } = await run(web, "web_search", { queries: ["empty", "bounded"] });
		try {
			assert.deepEqual(
				http.calls.map((c) => c.path),
				["/exa/search", "/exa/search", "/tavily/search"],
				"no provider fanout or retry",
			);
			assert.deepEqual(
				reply.inputs.map((x) => x.input),
				["empty", "bounded"],
			);
			assert.deepEqual(
				reply.inputs[0]!.observations.map((o) => o.provider),
				["exa"],
			);
			assert.deepEqual(
				reply.inputs[1]!.observations.map((o) => [o.provider, o.outcome]),
				[
					["exa", "error"],
					["tavily", "success"],
				],
				"primary failure must survive fallback",
			);
			assert.match(output, /No support for the claim/);
			assert.doesNotMatch(output, /fixture-exa-secret|fixture-tavily-secret|\/tmp\//);
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

test("B1 unknown/page/invalid failures do not qualify, and missing fallback provisioning is explicit", async () => {
	for (const status of [400, 401, 403, 404, 418, 503]) {
		const http = await fixture(() => ({ status, body: { error: "failure" } }));
		try {
			const { f, reply } = await run({ exaKey: "fixture", exaBaseUrl: http.url }, "web_search", { queries: ["failure"] });
			try {
				assert.equal(http.calls.length, 1, "no transport retries");
				assert.equal(reply.inputs[0]!.observations.length, 1);
				assert.equal(reply.inputs[0]!.fallback, status === 503 ? "credentials_missing" : "ineligible");
			} finally {
				await f.close();
			}
		} finally {
			await http.close();
		}
	}
});

for (const capability of ["search", "contents"] as const)
	test(`B1 documented allowance exhaustion admits one sequential fallback for ${capability}`, async () => {
		const http = await fixture((path) => {
			if (path.startsWith("/exa")) return { status: 402, body: { error: "Credits are exhausted", tag: "NO_MORE_CREDITS" } };
			return capability === "search"
				? { body: { images: [], results: [{ url: "https://example.org/page", content: "Fallback evidence." }] } }
				: { body: { results: [{ url: "https://example.org/page", raw_content: "Fallback evidence." }], failed_results: [] } };
		});
		try {
			const { f, reply, output } = await run(
				{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
				capability === "search" ? "web_search" : "web_contents",
				capability === "search" ? { queries: ["allowance"] } : { urls: ["https://example.org/page"] },
			);
			try {
				assert.deepEqual(
					http.calls.map((c) => c.path),
					capability === "search" ? ["/exa/search", "/tavily/search"] : ["/exa/contents", "/tavily/extract"],
					"documented allowance exhaustion must admit exactly one sequential fallback",
				);
				assert.deepEqual(
					reply.inputs[0]!.observations.map((o) => [o.provider, o.outcome]),
					[
						["exa", "error"],
						["tavily", "success"],
					],
				);
				assert.equal(reply.inputs[0]!.fallback, "completed");
				assert.match(output, /Fallback evidence/);
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
		const first = await run(web, "web_contents", { urls: ["https://example.org/page"] }, (r) =>
			fauxAssistantMessage(fauxToolCall("read_web_result", { handle: r.handle!, offset: 40000, limit: 4096 }), { stopReason: "toolUse" }),
		);
		const second = await run(web, "web_contents", { urls: ["https://example.org/page"] });
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
			const { mintContext } = await import("../src/ledger/principals.ts");
			const own = mintContext({
				kind: "assignment-agent",
				assignment: assignment.id,
				generation: assignment.generation,
				attempt: assignment.attempt,
				role: assignment.packet.role,
			});
			const page = await first.f.ledger.artifact(own, { read: first.reply.handle! });
			assert.ok("content" in page);
			assert.match(page.content.toString(), /TAIL-CANARY-9281/);
			const foreign = await second.f.ledger.artifact(own, { read: first.reply.handle! });
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
				const known = await first.f.ledger.artifact(outsider, { read: first.reply.handle! });
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

for (const overallMs of [40, 500])
	test(`B2 unsettled local timeout is uncertain and does not admit fallback (${overallMs}ms overall)`, async () => {
		const http = await fixture(async () => {
			await setTimeout(200);
			return { body: { results: [] } };
		});
		try {
			const { f, reply } = await run(
				{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: http.url, tavilyBaseUrl: http.url, attemptMs: 50, overallMs },
				"web_search",
				{ queries: ["slow", "later"] },
			);
			try {
				assert.equal(http.calls.length, 1, "no overlapping or repeated charged request");
				assert.equal(reply.inputs[0]!.fallback, "primary_unsettled");
				assert.equal(reply.inputs[0]!.observations[0]!.outcome, "uncertain");
				assert.equal(reply.inputs[1]!.observations.length, 0);
				assert.equal(reply.inputs[1]!.fallback, "prior_attempt_unsettled");
			} finally {
				await f.close();
			}
		} finally {
			await http.close();
		}
	});

test("B4 selected negative evidence survives expiry/reopen/export; old working handle never refetches", async () => {
	const http = await fixture(() => ({
		body: { results: [{ url: "https://example.org/negative", text: "Context: no support for this claim. Conflicting result remains." }] },
	}));
	try {
		const { f, reply } = await run(
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
			let exported!: HistoryExport | LedgerRefusal;
			let ref: string | undefined;
			for (let n = 0; n < 200 && !ref; n++) {
				exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
				if ("jsonl" in exported)
					ref = exported.jsonl
						.split("\n")
						.filter(Boolean)
						.map((l) => JSON.parse(l))
						.find((r) => String(r.document).startsWith("web-evidence/"))?.ref;
				if (!ref) await setTimeout(10);
			}
			assert.ok(ref, "selected evidence must enter Ledger before reliance");
			const retained = await f.ledger.artifact(admin, { read: ref });
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
			const { mintContext } = await import("../src/ledger/principals.ts");
			const a = (f.ledger.snapshot(admin) as unknown as { assignments: { id: string; generation: number; attempt: string }[] })
				.assignments[0]!;
			const missing = await f.command(
				{ type: "submitRoleResult", text: "Unsupported reliance", supports: [reply.handle!] },
				mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: "coordinator" }),
			);
			assert.equal("code" in missing ? missing.code : "accepted", "missing_content", "a working handle is not retained report support");
			await setTimeout(1100);
			const expired = await f.ledger.artifact(admin, { read: reply.handle! });
			assert.equal("code" in expired ? expired.code : "disclosed", "working_result_unavailable");
			const assignment = (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments[0]!;
			const conversation = await f.harness.conversation(assignment.conversation as ConversationId, BACKGROUND_CONTEXT);
			assert.ok(conversation);
			const entries = await conversation.entries({ order: "ascending" }, 200, undefined, BACKGROUND_CONTEXT);
			const native = entries.items.flatMap((e) => e.model ?? []).filter((m) => m.role === "toolResult" && m.toolName === "web_contents");
			assert.match(JSON.stringify(native), /Context: no support for this claim/, "committed output survives working expiry");
			await f.reopen();
			const after = await f.ledger.artifact(admin, { read: ref });
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

test("B2 caller cancellation/current revocation before fallback admits no provider request", async () => {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	p.setResponses([fauxAssistantMessage(fauxToolCall("web_search", { queries: ["cancel"] }), { stopReason: "toolUse" })]);
	let f!: Awaited<ReturnType<typeof roleFixture>>;
	let stopped = false;
	const http = await fixture(async () => {
		if (stopped) return { status: 429, body: { error: "allowance" } };
		const assignments = (f.ledger.snapshot(admin) as unknown as { assignments: { id: string; generation: number; attempt: string }[] })
			.assignments;
		const a = assignments[0]!;
		const reply = await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin);
		assert.equal(reply.status, "accepted");
		stopped = true;
		return { status: 429, body: { error: "allowance" } };
	});
	try {
		f = await roleFixture(
			new Engine({
				provider: p.provider,
				apiKey: "fixture",
				families: { "claude-sonnet-4-6": "claude" },
				web: { exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: http.url, tavilyBaseUrl: http.url },
			}),
		);
		try {
			await f.command({ type: "assignTask", slice: "slice:cancel", delivery: true, packet: packet() });
			for (let n = 0; n < 500 && !stopped; n++) await setTimeout(10);
			assert.ok(stopped);
			await setTimeout(200);
			assert.equal(http.calls.length, 1, "fallback after cancellation is forbidden");
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

for (const provider of ["exa", "tavily"])
	for (let repetition = 0; repetition < Number(process.env.RENDER_V3_REPETITIONS ?? 1); repetition++)
		test(`B2 V3 SIGKILL at ${provider} does not replay either charged observation (${repetition + 1})`, { timeout: 20000 }, async () => {
			let reached = false;
			const http = await fixture(async (path) => {
				if (path.startsWith(`/${provider}`)) {
					reached = true;
					await new Promise(() => {});
				}
				return { status: 429, body: { error: "allowance" } };
			});
			const children: ReturnType<typeof spawn>[] = [];
			const start = (mode: string, data: string) => {
				const child = spawn(process.execPath, ["test/support/web-crash-worker.ts", mode, data, http.url], {
					cwd: new URL("../", import.meta.url),
					stdio: ["ignore", "pipe", "pipe"],
				});
				children.push(child);
				return child;
			};
			let data: string | undefined;
			try {
				const first = start("crash", "unused");
				let output = "";
				let errors = "";
				first.stdout.on("data", (s) => {
					output += String(s);
				});
				first.stderr.on("data", (s) => {
					errors += String(s);
				});
				for (let n = 0; n < 1000 && !reached; n++) {
					assert.equal(first.exitCode, null, errors);
					await setTimeout(10);
				}
				assert.ok(reached, errors);
				data = JSON.parse(output.trim()).data;
				assert.ok(data);
				first.kill("SIGKILL");
				await new Promise((r) => first.once("exit", r));
				const second = start("recover", data);
				second.stderr.on("data", (s) => {
					errors += String(s);
				});
				const code = await new Promise((r) => second.once("exit", r));
				assert.equal(code, 0, errors);
				assert.equal(http.calls.length, provider === "exa" ? 1 : 2, "unsafe replay must never start charged work");
			} finally {
				for (const child of children)
					if (child.exitCode === null && child.signalCode === null) {
						child.kill("SIGKILL");
						await new Promise((r) => child.once("exit", r));
					}
				await http.close();
				if (data) await rm(data, { recursive: true, force: true });
			}
		});

test("B1/B3 mixed contents batch keeps partial success final and preserves both failures", async () => {
	const urls = [
		"https://example.org/success",
		"https://example.org/partial",
		"https://example.org/page-error",
		"https://example.org/allowance",
	];
	const http = await fixture((path, body) => {
		if (path.startsWith("/tavily")) return { status: 503, body: { error: "unavailable" } };
		const url = (body.urls as string[])[0]!;
		if (url.endsWith("page-error")) return { status: 404, body: { error: "missing page" } };
		if (url.endsWith("allowance")) return { status: 429, body: { error: "allowance" } };
		return { body: { results: [{ url, text: url.endsWith("partial") ? "x".repeat(262145) : "Exact usable content." }] } };
	});
	try {
		const { f, reply } = await run(
			{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` },
			"web_contents",
			{ urls },
		);
		try {
			assert.deepEqual(
				http.calls.map((c) => c.path),
				["/exa/contents", "/exa/contents", "/exa/contents", "/exa/contents", "/tavily/extract"],
				"usable partial success must not be topped up",
			);
			assert.deepEqual(
				reply.inputs.map((i) => i.input),
				urls,
			);
			assert.equal(reply.status, "partial");
			assert.equal(reply.inputs[0]!.observations[0]!.complete, true);
			assert.equal(reply.inputs[1]!.observations[0]!.complete, false);
			assert.match(reply.omissions.join("\n"), /partial\/truncated/);
			assert.deepEqual(
				reply.inputs[3]!.observations.map((o) => [o.provider, o.outcome]),
				[
					["exa", "error"],
					["tavily", "error"],
				],
			);
			assert.equal(reply.inputs[3]!.fallback, "failed");
		} finally {
			await f.close();
		}
	} finally {
		await http.close();
	}
});

for (const remaining of [true, false])
	test(`B2 overall deadline checks settled primary before fallback (remaining=${remaining})`, async (t) => {
		const epoch = Date.now();
		t.mock.timers.enable({ apis: ["Date"], now: epoch });
		const http = await fixture((path) => {
			if (path.startsWith("/exa")) {
				t.mock.timers.setTime(epoch + (remaining ? 100 : 1000));
				return { status: 429, body: { error: "allowance" } };
			}
			return { body: { images: [], results: [] } };
		});
		try {
			const { f, reply } = await run(
				{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily`, overallMs: 1000 },
				"web_search",
				{ queries: ["deadline"] },
			);
			try {
				assert.equal(http.calls.length, remaining ? 2 : 1, "overall expiry must prohibit fallback admission");
				assert.equal(reply.inputs[0]!.fallback, remaining ? "completed" : "overall_timeout");
			} finally {
				await f.close();
			}
		} finally {
			await http.close();
			t.mock.timers.reset();
		}
	});

test("B3 explicit missing credentials and echoed credentials never become retained text", async () => {
	const http = await fixture(() => ({ body: { images: [], results: [{ url: "https://example.org", content: "fixture-secret" }] } }));
	try {
		for (const provisioned of [false, true]) {
			const { f, reply, output } = await run(
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
					apiKey: "fixture",
					families: { "claude-sonnet-4-6": "claude" },
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
				const exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
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

test("B5 model cannot select host paths, configuration or arbitrary provider semantics", async () => {
	const http = await fixture(() => ({ body: { results: [] } }));
	try {
		for (const args of [
			{ queries: ["safe"], configPath: "/etc/passwd" },
			{ queries: ["safe"], provider: "custom" },
			{ queries: ["safe"], cwd: "/" },
		]) {
			const { f } = await run({ exaKey: "fixture", exaBaseUrl: http.url }, "web_search", args);
			await f.close();
		}
		assert.equal(http.calls.length, 0);
	} finally {
		await http.close();
	}
});
