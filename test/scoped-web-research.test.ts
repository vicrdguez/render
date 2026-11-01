import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";

// Owned HTTP responses are the external variability. Engine, root Webfox, Durable and SQLite stay real.
async function fixture(handler: (path: string, body: Record<string, unknown>) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>) {
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
		close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
	};
}

type WebReply = {
	handle?: string;
	inputs: { input: string; observations: { id: string; provider: string; outcome: string; text?: string; digest?: string; error?: string }[]; fallback: string }[];
};
async function run(web: Record<string, unknown>, name: string, args: Record<string, unknown>, follow?: (value: WebReply) => ReturnType<typeof fauxAssistantMessage>) {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let reply!: WebReply;
	let output = "";
	p.setResponses([
		fauxAssistantMessage(fauxToolCall(name, args), { stopReason: "toolUse" }),
		(ctx) => {
			output = ctx.messages.filter((m) => m.role === "toolResult").map((m) => m.content.filter((c) => c.type === "text").map((c) => c.text).join("")).at(-1)!;
			try { reply = JSON.parse(output); } catch { reply = { inputs: [] }; }
			return follow?.(reply) ?? fauxAssistantMessage(fauxToolCall("submit_role_result", { text: "No web reliance." }), { stopReason: "toolUse" });
		},
		fauxAssistantMessage("done"),
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
		return { body: { results: [{ title: "Negative finding", url: "https://example.org/negative", content: "No support for the claim." }] } };
	});
	const web = { exaKey: "fixture-exa-secret", tavilyKey: "fixture-tavily-secret", exaBaseUrl: `${http.url}/exa`, tavilyBaseUrl: `${http.url}/tavily` };
	try {
		const { f, reply, output } = await run(web, "web_search", { queries: ["empty", "bounded"] });
		try {
			assert.deepEqual(http.calls.map((c) => c.path), ["/exa/search", "/exa/search", "/tavily/search"], "no provider fanout or retry");
			assert.deepEqual(reply.inputs.map((x) => x.input), ["empty", "bounded"]);
			assert.deepEqual(reply.inputs[0]!.observations.map((o) => o.provider), ["exa"]);
			assert.deepEqual(reply.inputs[1]!.observations.map((o) => [o.provider, o.outcome]), [["exa", "error"], ["tavily", "success"]]);
			assert.match(output, /No support for the claim/);
			assert.doesNotMatch(output, /fixture-exa-secret|fixture-tavily-secret|\/tmp\//);
		} finally { await f.close(); }
	} finally { await http.close(); }
});

test("B1 unknown/page/invalid failures do not qualify, and missing fallback provisioning is explicit", async () => {
	for (const status of [400, 403, 404, 418, 503]) {
		const http = await fixture(() => ({ status, body: { error: "failure" } }));
		try {
			const { f, reply } = await run({ exaKey: "fixture", exaBaseUrl: http.url }, "web_search", { queries: ["failure"] });
			try {
				assert.equal(http.calls.length, 1, "no transport retries");
				assert.equal(reply.inputs[0]!.observations.length, 1);
				assert.equal(reply.inputs[0]!.fallback, status === 503 ? "credentials_missing" : "ineligible");
			} finally { await f.close(); }
		} finally { await http.close(); }
	}
});

test("B3/B5 identical bytes remain distinct observations; own tail paging is scoped and network-free", async () => {
	const tail = "TAIL-CANARY-9281";
	const http = await fixture(() => ({ body: { results: [{ url: "https://example.org/page", title: "Page", text: `${"x".repeat(40000)}${tail}` }] } }));
	try {
		const web = { exaKey: "fixture", exaBaseUrl: http.url };
		const first = await run(web, "web_contents", { urls: ["https://example.org/page"] });
		const second = await run(web, "web_contents", { urls: ["https://example.org/page"] });
		try {
			const a = first.reply.inputs[0]!.observations[0]!;
			const b = second.reply.inputs[0]!.observations[0]!;
			assert.notEqual(a.id, b.id, "observation identity must not be a digest");
			assert.equal(a.digest, b.digest);
			assert.match(first.output, /omissions/);
			const assignment = (first.f.ledger.snapshot(admin) as unknown as { assignments: { id: string; generation: number; attempt: string; packet: { role: string } }[] }).assignments[0]!;
			const { mintContext } = await import("../src/ledger/principals.ts");
			const own = mintContext({ kind: "assignment-agent", assignment: assignment.id, generation: assignment.generation, attempt: assignment.attempt, role: assignment.packet.role });
			const page = await first.f.ledger.artifact(own, { read: first.reply.handle! });
			assert.ok("content" in page);
			assert.match(page.content.toString(), /TAIL-CANARY-9281/);
			const foreign = await second.f.ledger.artifact(own, { read: first.reply.handle! });
			assert.equal("code" in foreign ? foreign.code : "disclosed", "working_result_unavailable");
			assert.equal(http.calls.length, 2, "reading must never contact provider");
		} finally { await first.f.close(); await second.f.close(); }
	} finally { await http.close(); }
});

test("B5 model cannot select host paths, configuration or arbitrary provider semantics", async () => {
	const http = await fixture(() => ({ body: { results: [] } }));
	try {
		for (const args of [{ queries: ["safe"], configPath: "/etc/passwd" }, { queries: ["safe"], provider: "custom" }, { queries: ["safe"], cwd: "/" }]) {
			const { f } = await run({ exaKey: "fixture", exaBaseUrl: http.url }, "web_search", args);
			await f.close();
		}
		assert.equal(http.calls.length, 0);
	} finally { await http.close(); }
});
