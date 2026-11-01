// Executable observations of preimplementation R02/R05/R06/R08 literal outcomes. Owned temp stores only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const base = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const { Engine } = await import(base + "/src/engine/runtime.ts");
const { openLedger } = await import(base + "/src/ledger/startup.ts");
const { mintContext } = await import(base + "/src/ledger/principals.ts");
const { roleFixture, packet, admin, scheduler, recovery } = await import(base + "/test/support/roles.ts");
const { fauxProvider, fauxAssistantMessage, fauxToolCall, Type } = await import(base + "/node_modules/@earendil-works/pi-ai/dist/index.js");
const { configure, defineTool, defineExtension, createRegistry, defineTask } = await import(
	base + "/node_modules/@earendil-works/pi-durable/dist/index.js"
);
const { createModels } = await import(base + "/node_modules/@earendil-works/pi-ai/dist/models.js");
const { BACKGROUND_CONTEXT: ctx } = await import(base + "/node_modules/@earendil-works/chord/dist/context/index.js");
async function until(check) {
	const end = Date.now() + 7000;
	while (!(await check())) {
		assert.ok(Date.now() < end, "owned observation timed out");
		await setTimeout(5);
	}
}
function external() {
	return fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
}

if (process.argv[2] === "unsafe-worker") {
	const p = external();
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	p.setResponses([
		async () => {
			await gate;
			return fauxAssistantMessage(fauxToolCall("uncertain", {}), { stopReason: "toolUse" });
		},
	]);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } }));
	console.log(JSON.stringify({ event: "owned-data", data: f.data }));
	const uncertain = defineTool({
		name: "uncertain",
		description: "Owned uncertain external fixture",
		parameters: Type.Object({}),
		replay: "unsafe",
		execute: async () => {
			console.log(JSON.stringify({ event: "unsafe-admitted", data: f.data }));
			await new Promise(() => {});
		},
	});
	const extension = defineExtension({ name: "owned-unsafe", tools: [uncertain] });
	f.registry.install(extension);
	await f.command({ type: "assignTask", slice: "slice:unsafe", delivery: true, packet: packet() });
	const a = f.ledger.snapshot(admin).assignments[0];
	const conversation = await f.harness.conversation(a.conversation, ctx);
	const agent = await conversation.agent(ctx);
	await f.harness.commit(
		(tx) =>
			configure(tx, a.conversation, {
				extensions: [...agent.extensions, extension],
				tools: [...agent.tools, uncertain],
				modelTools: [...agent.tools, uncertain],
			}),
		ctx,
	);
	release();
	setInterval(() => {}, 1000);
	await new Promise(() => {});
}

if (process.argv[2] === "fence-worker") {
	const p = external();
	p.setResponses(
		Array.from({ length: 4 }, () => async () => {
			await setTimeout(20000);
			return fauxAssistantMessage("late");
		}),
	);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } }));
	console.log(JSON.stringify({ event: "owned-data", data: f.data }));
	for (let i = 1; i <= 3; i++) await f.command({ type: "assignTask", slice: `fence:${i}`, delivery: true, packet: packet() });
	await until(() => p.state.callCount === 3);
	const a = f.ledger.snapshot(admin).assignments[0];
	assert.equal(
		(await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin)).status,
		"accepted",
	);
	console.log(JSON.stringify({ event: "cancel-fenced", data: f.data }));
	await new Promise(() => {});
}

// Observe the real Engine admission boundary, with actual simultaneous provider invocations.
{
	let active = 0,
		maxActive = 0;
	const p = external();
	p.setResponses(
		Array.from({ length: 12 }, () => async (_transcript, options) => {
			active++;
			maxActive = Math.max(maxActive, active);
			try {
				await new Promise((resolve) => {
					if (options?.signal?.aborted) resolve();
					else options?.signal?.addEventListener("abort", resolve, { once: true });
				});
				return fauxAssistantMessage("provider stopped");
			} finally {
				active--;
			}
		}),
	);
	const f = await roleFixture(new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } }));
	try {
		for (let i = 1; i <= 5; i++)
			assert.equal(
				(
					await f.command({
						type: "assignTask",
						slice: `slice:${i}`,
						delivery: true,
						packet: packet(i === 1 ? { requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] } : {}),
					})
				).status,
				"accepted",
			);
		await until(() => p.state.callCount === 4);
		const a = f.ledger.snapshot(admin).assignments[0];
		const own = mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: a.packet.role,
		});
		const first = await f.command({ type: "requestRole", key: "challenge" }, own, "same-invocation");
		assert.equal(first.status, "accepted");
		const duplicate = await f.command({ type: "requestRole", key: "challenge" }, own, "same-invocation");
		assert.equal(duplicate.duplicate, true);
		assert.equal(duplicate.sequence, first.sequence);
		assert.equal(duplicate.result.task, first.result.task);
		const fresh = await f.command({ type: "requestRole", key: "challenge" }, own, "new-model-call");
		assert.equal(fresh.code, "role_already_requested");
		assert.equal(
			(
				await f.command(
					{ type: "recordBlocker", assignment: a.id, generation: a.generation, attempt: a.attempt, reason: "human decision" },
					scheduler,
				)
			).status,
			"accepted",
		);
		await setTimeout(150);
		assert.equal(p.state.callCount, 4);
		assert.equal(active, 4);
		const held = f.ledger.snapshot(admin).assignments[0];
		assert.equal(held.executing, true);
		assert.equal(held.delivery, true);
		assert.equal(held.status, "blocked");
		const canceled = await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin);
		assert.equal(canceled.status, "accepted");
		assert.equal(canceled.result.generation, 2);
		assert.equal((await f.ledger.receipt(own, "same-invocation")).code, "unauthorized");
		const late = await f.command({ type: "submitRoleResult", supports: [], text: "Late evidence, not accepted.\n" }, own, "late");
		assert.equal(late.code, "unauthorized");
		const quarantined = await f.command(
			{
				type: "recordRecoveryState",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				text: "Late evidence, not accepted.\n",
			},
			recovery,
			"trusted-late",
		);
		assert.equal(quarantined.status, "accepted");
		const artifact = await f.ledger.artifact(admin, { read: quarantined.result.quarantined });
		assert.ok("content" in artifact);
		assert.equal(JSON.parse(artifact.content.toString()).text, "Late evidence, not accepted.\n");
		await until(() => p.state.callCount === 5);
		const stopped = f.ledger.snapshot(admin).assignments[0];
		assert.equal(stopped.status, "canceled");
		assert.equal(stopped.executing, false);
		assert.equal(stopped.report, null);
		assert.ok(maxActive <= 4);
		console.log(
			JSON.stringify({
				observation: "engine-capacity-and-late-quarantine",
				maxActive,
				blockedLiveProviders: 4,
				afterQuiescenceCalls: p.state.callCount,
				duplicateReceipt: true,
				newCall: "role_already_requested",
				staleReceipt: "unauthorized",
				quarantined: quarantined.result.quarantined,
				acceptedRoleReport: stopped.report,
			}),
		);
	} finally {
		await f.close();
	}
}

// An actual unsafe Durable tool intent is interrupted by SIGKILL; reopen must refuse before any provider call.
{
	const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "unsafe-worker"], { stdio: ["ignore", "pipe", "pipe"] });
	let output = "",
		error = "",
		data;
	child.stdout.on("data", (bytes) => {
		output += String(bytes);
		for (const line of output.trim().split("\n")) {
			try {
				data = JSON.parse(line).data ?? data;
			} catch {}
		}
	});
	child.stderr.on("data", (bytes) => {
		error += String(bytes);
	});
	try {
		await until(() => {
			assert.equal(child.exitCode, null, error);
			return output.includes("unsafe-admitted");
		});
		child.kill("SIGKILL");
		await new Promise((resolve) => child.once("exit", resolve));
		const p = external();
		await assert.rejects(
			() =>
				openLedger({
					data,
					runtime: (report) =>
						new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } }).options(report),
					onFatal: () => {},
				}),
			(e) => e.code === "uncertain_execution" && e.event === "startup_blocked",
		);
		assert.equal(p.state.callCount, 0);
		console.log(
			JSON.stringify({ observation: "unsafe-intent-startup", outcome: "startup_blocked", code: "uncertain_execution", providerCalls: 0 }),
		);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await new Promise((resolve) => child.once("exit", resolve));
		}
		if (data) await rm(data, { recursive: true, force: true });
	}
}

// Startup must not use conversation.abort (which enables native scheduling) before explicit resume.
{
	const child = spawn(process.execPath, [new URL(import.meta.url).pathname, "fence-worker"], { stdio: ["ignore", "pipe", "pipe"] });
	let output = "",
		error = "",
		data;
	child.stdout.on("data", (bytes) => {
		output += String(bytes);
		for (const line of output.trim().split("\n")) {
			try {
				data = JSON.parse(line).data ?? data;
			} catch {}
		}
	});
	child.stderr.on("data", (bytes) => {
		error += String(bytes);
	});
	let opened;
	try {
		await until(() => {
			assert.equal(child.exitCode, null, error);
			return output.includes("cancel-fenced");
		});
		child.kill("SIGKILL");
		await new Promise((resolve) => child.once("exit", resolve));
		const trace = [];
		const p = external();
		p.setResponses(Array.from({ length: 6 }, () => fauxAssistantMessage("stopped")));
		const engine = new Engine({ provider: p.provider, apiKey: "owned-fixture", families: { "claude-sonnet-4-6": "claude" } });
		opened = await openLedger({
			data,
			onFatal: () => {},
			runtime: (report) => {
				const options = engine.options(report);
				return {
					...options,
					bindLedger: (ledger, harness) => {
						options.bindLedger(ledger, harness);
						const resume = harness.resume.bind(harness);
						harness.resume = () => {
							trace.push("explicit-resume");
							resume();
						};
						const conversation = harness.conversation.bind(harness);
						harness.conversation = async (...args) => {
							const c = await conversation(...args);
							if (c) {
								const abort = c.abort.bind(c);
								c.abort = async (...values) => {
									trace.push("conversation-abort");
									return abort(...values);
								};
							}
							return c;
						};
					},
				};
			},
		});
		await until(() => trace.includes("conversation-abort"));
		console.log(JSON.stringify({ observation: "startup-resume-order", trace }));
		assert.ok(
			trace.indexOf("explicit-resume") >= 0 && trace.indexOf("explicit-resume") < trace.indexOf("conversation-abort"),
			"startup must explicitly resume before provider cancellation may enable scheduling",
		);
	} finally {
		if (opened) await opened.close();
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
			await new Promise((resolve) => child.once("exit", resolve));
		}
		if (data) await rm(data, { recursive: true, force: true });
	}
}

// A retained orphan outcome is real runtime state, not fabricated SQLite bytes.
{
	const data = await mkdtemp(join(tmpdir(), "render-orphan-observation-"));
	const orphan = defineTask({
		name: "owned.orphan",
		version: 1,
		initial: () => ({ phase: "orphan" }),
		phases: {
			orphan: (_task, runtime, context) =>
				runtime.commit(() => ({ status: "terminal", outcome: { status: "orphaned", reason: "cleanup unresolved" } }), context),
		},
		abort: (_task, runtime, context) =>
			runtime.commit(() => ({ status: "terminal", outcome: { status: "orphaned", reason: "cleanup unresolved" } }), context),
	});
	let harness;
	const runtime = () => {
		const registry = createRegistry();
		registry.install(defineExtension({ name: "owned-orphan", tasks: [orphan] }));
		return {
			models: createModels(),
			registry,
			bindLedger: (_ledger, h) => {
				harness = h;
			},
		};
	};
	let opened;
	try {
		opened = await openLedger({ data, runtime, onFatal: () => {} });
		const conversation = await harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
		const id = await conversation.commit((tx) => tx.createTask(orphan, {}, { ownership: { kind: "conversation" } }), ctx);
		assert.equal((await harness.waitForTask(id, ctx)).state.outcome.status, "orphaned");
		await opened.close();
		opened = undefined;
		await assert.rejects(
			() => openLedger({ data, runtime, onFatal: () => {} }),
			(e) => e.code === "uncertain_execution" && e.event === "startup_blocked",
		);
		console.log(JSON.stringify({ observation: "orphan-startup", outcome: "startup_blocked", code: "uncertain_execution" }));
	} finally {
		if (opened) await opened.close();
		await rm(data, { recursive: true, force: true });
	}
}
