// Owned V3 process: no network outside the parent's fixture and no live credentials.

import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import { openLedger, StartupFailure } from "../../src/ledger/startup.ts";
import { packet, roleFixture } from "./roles.ts";

const [mode, data, url] = process.argv.slice(2);
assert.ok(mode && data && url);
const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
p.setResponses([fauxAssistantMessage(fauxToolCall("web_search", { queries: ["crash-boundary"] }), { stopReason: "toolUse" })]);
const engine = new Engine({
	apiKey: "fixture",
	provider: p.provider,
	families: { "claude-sonnet-4-6": "claude" },
	web: {
		exaKey: "fixture",
		tavilyKey: "fixture",
		exaBaseUrl: `${url}/exa`,
		tavilyBaseUrl: `${url}/tavily`,
		overallMs: 60000,
		attemptMs: 60000,
	},
});
if (mode === "crash") {
	const f = await roleFixture(engine);
	process.stdout.write(`${JSON.stringify({ data: f.data })}\n`);
	await f.command({ type: "assignTask", slice: "slice:crash", delivery: true, packet: packet() });
	await setTimeout(60000);
	throw new Error("parent must interrupt this process");
}
try {
	const opened = await Effect.runPromise(openLedger({ data, runtime: (report) => engine.options(report), onFatal: () => {} }));
	await Effect.runPromise(opened.close());
	throw new Error("unsafe interrupted web attempt must block startup");
} catch (error) {
	assert.ok(error instanceof StartupFailure);
	assert.equal(error.code, "uncertain_execution");
	assert.equal(p.state.callCount, 0);
	process.stdout.write(`${JSON.stringify({ recovery: "uncertain_execution", modelCalls: 0 })}\n`);
}
