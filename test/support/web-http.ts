// Owned HTTP responses are the external variability. Engine, root Webfox, Durable and SQLite stay real.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import type { JsonObject } from "@earendil-works/pi-durable";
import { Engine } from "../../src/engine/runtime.ts";
import { research } from "../../src/engine/web.ts";
import { admin, packet, roleFixture } from "./roles.ts";

export async function webHttpFixture(
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

/** The supported root behind `research`, for classification rows that do not depend on registered-tool wiring. */
export function classify(config: Parameters<typeof research>[0], capability: "search" | "contents", inputs: string[]) {
	return research(
		config,
		capability,
		inputs,
		{ assignment: "assignment:fixture", generation: 1, attempt: "attempt:fixture" },
		new AbortController().signal,
		() => true,
	);
}

export type WebReply = {
	handle?: string;
	status: string;
	omissions: string[];
	inputs: {
		input: string;
		observations: {
			id: string;
			provider: string;
			outcome: string;
			text?: string;
			digest?: string;
			error?: string;
			uncertainty?: string;
			complete: boolean;
		}[];
		primaryNotAttempted?: string;
		fallback: string;
	}[];
};
export async function run(
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

export async function retainedEvidenceRef(f: Awaited<ReturnType<typeof roleFixture>>): Promise<string | undefined> {
	for (let n = 0; n < 200; n++) {
		const exported = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		if ("jsonl" in exported) {
			const ref = exported.jsonl
				.split("\n")
				.filter(Boolean)
				.map((l) => JSON.parse(l))
				.find((r) => String(r.document).startsWith("web-evidence/"))?.ref;
			if (ref) return ref;
		}
		await setTimeout(10);
	}
	return undefined;
}
