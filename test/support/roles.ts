import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "../../src/engine/runtime.ts";
import type { RolePacket } from "../../src/kernel/roles.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { openLedger } from "../../src/ledger/startup.ts";

export function packet(overrides: Partial<RolePacket> = {}): RolePacket {
	return { role: "coordinator", inputs: [], principles: "revision:3", instructions: "revision:3", policy: "revision:3", profile: "revision:3", execution: "read-only", provider: "anthropic", model: "claude-sonnet-4-6", family: "claude", requiredFamily: "claude", thinking: "low", maxInputBytes: 32768, maxOutputTokens: 1024, maxTurns: 3, expectedOutput: "Own bounded report", submission: "submit_role_result", requests: [], ...overrides };
}
export const admin = mintContext({ kind: "human", human: "human:owner", route: "local-admin" });
export const scheduler = mintContext({ kind: "host", scope: "scheduling" });
export const recovery = mintContext({ kind: "host", scope: "recovery" });
export async function roleFixture(engine = new Engine()) {
	const data = await mkdtemp(join(tmpdir(), "render-role-"));
	let opened = await openLedger({ data, runtime: (report) => engine.options(report), onFatal: () => {} });
	let n = 0;
	const command = (c: Record<string, unknown>, context = scheduler, id = `role:${++n}`) => opened.ledger.command({ version: 1, authorityEpoch: opened.authorityEpoch, commandId: id, workflow: "workflow:2", command: c }, context);
	const created = await opened.ledger.command({ version: 1, authorityEpoch: opened.authorityEpoch, commandId: "create", command: { type: "createWorkflow", title: "Roles" } }, admin);
	if (created.status !== "accepted" || created.result.workflow !== "workflow:2") throw new Error(JSON.stringify(created));
	const input = await opened.ledger.command({ version: 1, authorityEpoch: opened.authorityEpoch, commandId: "input", workflow: "workflow:2", expected: { document: null }, command: { type: "saveDocument", document: "principles", mediaType: "text/plain", content: Buffer.from("Keep exact constraints.\n").toString("base64") } }, admin);
	if (input.status !== "accepted") throw new Error(JSON.stringify(input));
	return { data, command, get ledger() { return opened.ledger; }, engine, async reopen(next = new Engine()) { await opened.close(); opened = await openLedger({ data, runtime: (report) => next.options(report), onFatal: () => {} }); return next; }, async close() { await opened.close(); await rm(data, { recursive: true, force: true }); } };
}
