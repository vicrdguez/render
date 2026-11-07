// V9 host process: the real Ledger/Engine/Pi Durable composition with HTTP and admin listeners on an owned store, 100
// active delivery-owned Slices and four executing role attempts whose scripted provider streams transcript text and
// tool calls without end. Only the provider is scripted; its latency is excluded from what the parent measures.
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import { adminServer, deviceServer } from "../../src/ledger/http.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { packet } from "./roles.ts";

const data = process.argv[2]!;
const WORKFLOWS = Number(process.env.RENDER_V9_WORKFLOWS ?? 20);
const SLICES = Number(process.env.RENDER_V9_SLICES ?? 100);
const INPUT_BYTES = Number(process.env.RENDER_V9_INPUT_BYTES ?? 2048);
const TOKENS_PER_SECOND = Number(process.env.RENDER_V9_TOKENS_PER_SECOND ?? 2000);
const admin = mintContext({ kind: "human", human: "human:owner", route: "local-admin" });
const scheduler = mintContext({ kind: "host", scope: "scheduling" });

const turns: Record<string, number> = {};
const provider = fauxProvider({
	provider: "anthropic",
	api: "anthropic-messages",
	models: [{ id: "claude-sonnet-4-6", contextWindow: 10_000_000 }],
	tokensPerSecond: TOKENS_PER_SECOND,
});
// Every request streams a short transcript segment and one tool call reading the role's retained input, so each turn
// commits an assistant message, a Durable tool task and its tool result, and a runtime-history capture.
const stream = (transcript: { messages: { role: string; sections?: Record<string, string | null> }[] }) => {
	const live = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])?.sections?.["role-packet"];
	const prompt = JSON.parse(live!.slice(live!.indexOf("{"), live!.lastIndexOf("}") + 1)) as { assignment: string; packet: { inputs: string[] } };
	const n = (turns[prompt.assignment] = (turns[prompt.assignment] ?? 0) + 1);
	return fauxAssistantMessage(
		[
			fauxText(`Turn ${n}: re-reading the retained input to continue the delegated analysis. `.repeat(4)),
			fauxToolCall("read_artifact", { ref: prompt.packet.inputs[0]! }),
		],
		{ stopReason: "toolUse" },
	);
};
provider.setResponses(Array(1_000_000).fill(stream));
const engine = new Engine({ provider: provider.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } });
const opened = await openLedger({ data, runtime: (report) => engine.options(report), onFatal: (error) => console.error(error) });
const device = deviceServer(opened.ledger);
await new Promise<void>((resolve) => device.listen(0, "127.0.0.1", () => resolve()));
const socket = join(data, "admin.sock");
const adminListener = await adminServer(opened.ledger, socket);
let n = 0;
const command = async (workflow: string | undefined, command: Record<string, unknown>, context = admin, extra = {}) => {
	const reply = await opened.ledger.command(
		{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: `v9-setup:${++n}`, ...(workflow ? { workflow } : {}), command, ...extra },
		context,
	);
	if (reply.status !== "accepted") throw new Error(`V9 setup refused: ${JSON.stringify(reply)}`);
	return reply.result;
};
const workflows: string[] = [];
const inputs: Record<string, string> = {};
for (let w = 0; w < WORKFLOWS; w++) {
	const workflow = (await command(undefined, { type: "createWorkflow", title: `V9 proposal ${w}` })).workflow as string;
	workflows.push(workflow);
	inputs[workflow] = (await command(
		workflow,
		{ type: "saveDocument", document: "input", mediaType: "text/plain", content: Buffer.from("x".repeat(INPUT_BYTES)).toString("base64") },
		admin,
		{ expected: { document: null } },
	)).revision as string;
}
// 100 active Slices, each with one delivery owner; capacity admits four executing attempts, the rest stay queued.
for (let i = 0; i < SLICES; i++) {
	const workflow = workflows[i % WORKFLOWS]!;
	await command(
		workflow,
		{
			type: "assignTask",
			slice: `slice:${i}`,
			delivery: true,
			packet: (() => {
				const input = inputs[workflow]!;
				return packet({
					inputs: [input],
					principles: input,
					instructions: input,
					policy: input,
					profile: input,
					maxTurns: 1_000_000,
					maxInputBytes: 64 * 1024 * 1024,
					maxOutputTokens: 512,
				});
			})(),
		},
		scheduler,
	);
}
const address = device.address() as AddressInfo;
const status = () => {
	const frame = opened.ledger.snapshot(admin);
	const assignments = ("assignments" in frame ? frame.assignments : []) as RoleAssignment[];
	return {
		executing: assignments.filter((a) => a.executing).map((a) => a.id),
		active: new Set(assignments.filter((a) => a.delivery && a.status !== "submitted" && a.status !== "canceled").map((a) => a.slice + a.workflow))
			.size,
		turns: { ...turns },
		sequence: opened.ledger.status().sequence,
	};
};
process.stdout.write(
	`${JSON.stringify({ event: "ready", url: `http://127.0.0.1:${address.port}`, admin: socket, authorityEpoch: opened.authorityEpoch, persistence: opened.persistence, workflows })}\n`,
);
setInterval(() => process.stdout.write(`${JSON.stringify({ event: "status", ...status() })}\n`), 500);
process.on("SIGTERM", () => {
	device.closeAllConnections();
	device.close();
	adminListener.close();
	void opened.close().then(() => process.exit(0));
});
