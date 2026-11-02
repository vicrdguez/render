import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Type } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { type ConversationId, configure, defineExtension, defineTool } from "@earendil-works/pi-durable";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { admin, allowSameFamily, packet, roleFixture } from "./support/roles.ts";

for (const replay of ["safe", "unsafe"] as const)
	test(`R03 ${replay} programmatic ancestor cannot admit a Ledger mutation`, async () => {
		const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		let result = "not run";
		const wrapper = defineTool({
			name: "wrapper",
			description: "Unverified wrapper",
			parameters: Type.Object({}),
			replay,
			execute: async (_args, api, ctx) => {
				const nested = await api.executeTool("submit_role_result", { supports: [], text: "must not commit" }, ctx, { key: "stable" });
				result = JSON.stringify(nested);
				return { output: [{ type: "text", text: "wrapper finished" }] };
			},
		});
		let release!: () => void;
		const gate = new Promise<void>((r) => {
			release = r;
		});
		p.setResponses([
			async () => {
				await gate;
				return fauxAssistantMessage(fauxToolCall("wrapper", {}), { stopReason: "toolUse" });
			},
			fauxAssistantMessage("done"),
		]);
		const engine = new Engine({ provider: p.provider, apiKey: "fixture", families: { "claude-sonnet-4-6": "claude" } });
		const f = await roleFixture(engine);
		await allowSameFamily(f.ledger);
		try {
			f.registry.install(defineExtension({ name: "fixture-wrapper", tools: [wrapper] }));
			await f.command({ type: "assignTask", slice: "slice:1", delivery: true, packet: packet() });
			let a!: RoleAssignment;
			a = ((f.ledger.snapshot(admin) as import("../src/ledger/ledger.ts").Frame).assignments as RoleAssignment[])[0]!;
			// Deliberately widen a raw runtime configuration: handler enforcement must survive visibility mistakes.
			const agent = await (await f.harness.conversation(a.conversation as ConversationId, BACKGROUND_CONTEXT))!.agent(BACKGROUND_CONTEXT);
			await f.harness.commit(async (tx) => {
				await configure(tx, a.conversation as ConversationId, {
					extensions: [...agent.extensions, defineExtension({ name: "fixture-wrapper" })],
					tools: [...agent.tools, wrapper],
					modelTools: [...agent.tools, wrapper],
				});
			}, BACKGROUND_CONTEXT);
			release();
			for (let n = 0; n < 500 && result === "not run"; n++) await setTimeout(10);
			assert.match(
				result,
				/unsafe_ancestor/,
				JSON.stringify({
					state: p.state,
					entries: await (await f.harness.conversation(a.conversation as ConversationId, BACKGROUND_CONTEXT))!.entries(
						{},
						200,
						undefined,
						BACKGROUND_CONTEXT,
					),
				}),
			);
			assert.equal(
				((f.ledger.snapshot(admin) as import("../src/ledger/ledger.ts").Frame).assignments as RoleAssignment[])[0]!.report,
				null,
			);
		} finally {
			release();
			await f.close();
		}
	});

for (const barrier of ["before-commit", "after-commit"])
	for (let repetition = 0; repetition < Number(process.env.RENDER_V3_REPETITIONS ?? 1); repetition++)
		test(`R01/R02 SIGKILL ${barrier} preserves atomic workflow request and host-derived replay (${repetition + 1})`, {
			timeout: 20000,
		}, async () => {
			const data = await mkdtemp(join(tmpdir(), "render-role-crash-"));
			const children: ReturnType<typeof spawn>[] = [];
			const run = (mode: string) => {
				const child = spawn(process.execPath, ["test/support/role-crash-worker.ts", data, mode], {
					cwd: new URL("../", import.meta.url),
					env: { ...process.env, RENDER_ROLE_BARRIER: barrier },
					stdio: ["ignore", "pipe", "pipe"],
				});
				children.push(child);
				return child;
			};
			try {
				const first = run("crash");
				let out = "";
				let err = "";
				first.stdout.on("data", (chunk) => {
					out += String(chunk);
				});
				first.stderr.on("data", (chunk) => {
					err += String(chunk);
				});
				for (let n = 0; n < 1000 && !out.includes('"event":"barrier"'); n++) {
					assert.equal(first.exitCode, null, err);
					await setTimeout(10);
				}
				assert.match(out, /"event":"barrier"/);
				first.kill("SIGKILL");
				await new Promise((r) => first.once("exit", r));
				const second = run("recover");
				let recovered = "";
				second.stdout.on("data", (chunk) => {
					recovered += String(chunk);
				});
				second.stderr.on("data", (chunk) => {
					err += String(chunk);
				});
				const code = await new Promise((r) => second.once("exit", r));
				assert.equal(code, 0, err);
				const value = JSON.parse(recovered.trim().split("\n").at(-1)!);
				assert.equal(value.children, 1);
				assert.equal(value.requests, 1);
				assert.equal(value.duplicate, barrier === "after-commit");
			} finally {
				for (const child of children)
					if (child.exitCode === null && child.signalCode === null) {
						child.kill("SIGKILL");
						await new Promise((resolve) => child.once("exit", resolve));
					}
				await rm(data, { recursive: true, force: true });
			}
		});
