// Crash checks for the workflow walk, on pi-durable 1.5.2 with SQLite. Each child process is killed with SIGKILL, so
// the store is never closed. The parent reopens it in a new process and looks.
// K1. A `replay: "safe"` tool commits an entry and a receipt keyed by `api.taskId`. The process dies before the tool
//     returns. On reopen the tool runs again with the same `api.taskId`, finds the receipt, and appends nothing.
// K2. The same tool with the default `replay`. On reopen it does not run again. The model gets an error result and
//     calls it again, the new call has a new `api.taskId`, and a twin entry is appended.
// K3. A task phase waits in memory, as on `Submission.wait()`. After five kills the task is `faulted` with
//     `restart_limit`, and `onReport` hears `task_faulted`.
// K4. An answer-shaped commit reads the faulted task of K3, creates a replacement, and stores its ID. The new task
//     runs. This is the shape of sending an answer again after its `then` task died.
// K5. The phase of K3 first commits a changed checkpoint. After seven kills the task is still live.
// K6. An answer-shaped commit marks a decision document answered, creates a task, and stores its ID. Killed inside
//     the commit, the store shows an open decision and no task. Killed right after it, the store shows both.
//   PI_MODULES=/path/to/node_modules/@earendil-works node docs/core/spikes/crash.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.PI_MODULES;
assert.ok(base, "set PI_MODULES");
const [mode, scenario, file, flag] = process.argv.slice(2);

if (mode !== "child") {
	const dir = mkdtempSync(join(tmpdir(), "render-crash-"));
	const child = (name, flagValue) => {
		const run = spawnSync(
			process.execPath,
			[fileURLToPath(import.meta.url), "child", name, join(dir, `${name}.sqlite`), flagValue],
			{ encoding: "utf8", timeout: 60_000 },
		);
		const lines = run.stdout.split("\n").filter((line) => line.startsWith("{"));
		const seen = lines.length === 0 ? undefined : JSON.parse(lines.at(-1));
		return { signal: run.signal, status: run.status, seen, stderr: run.stderr };
	};
	const killed = (run, what) => assert.equal(run.signal, "SIGKILL", `${what}: ${run.stderr}`);
	const looked = (run, what) => {
		assert.equal(run.status, 0, `${what}: ${run.stderr}`);
		return run.seen;
	};

	killed(child("safe", "kill"), "K1 first run");
	const k1 = looked(child("safe", "look"), "K1 reopen");
	assert.equal(k1.designs, 1, "K1: one design entry");
	assert.deepEqual(k1.runs, [k1.runs[0], k1.runs[0]], "K1: the tool ran twice with one api.taskId");
	assert.equal(k1.modelCalls, 0, "K1: no model request after reopen");
	console.log(`K1 ok: replay-safe tool ran again as task ${k1.runs[0]}, found its receipt, one entry`);

	killed(child("unsafe", "kill"), "K2 first run");
	const k2 = looked(child("unsafe", "look"), "K2 reopen");
	assert.equal(k2.runs.length, 2, "K2: the model called the tool again");
	assert.notEqual(k2.runs[0], k2.runs[1], "K2: the second call is a new task");
	assert.equal(k2.designs, 2, "K2: a twin design entry");
	assert.ok(k2.interrupted, "K2: the model saw an interrupted result");
	console.log(`K2 ok: default-replay tool was not rerun; the model's second call (task ${k2.runs[1]}) appended a twin`);

	const loop = (name, kills) => {
		const states = [];
		for (let i = 0; i < kills; i++) {
			const run = child(name, "kill");
			if (run.signal !== "SIGKILL") {
				states.push(looked(run, `${name} open ${i + 1}`));
				return states;
			}
			states.push(run.seen);
		}
		states.push(looked(child(name, "look"), `${name} last open`));
		return states;
	};
	const k3 = loop("wait", 7);
	const last3 = k3.at(-1);
	assert.equal(last3.status, "terminal", `K3: ${JSON.stringify(k3)}`);
	assert.equal(last3.outcome, "faulted", "K3: faulted");
	assert.ok(last3.reports.includes("task_faulted:restart_limit"), `K3: ${JSON.stringify(last3.reports)}`);
	console.log(`K3 ok: a waiting task was faulted on open ${k3.length} after ${k3.length - 1} kills; onReport heard it`);

	const k4 = looked(child("wait", "redrive"), "K4");
	assert.equal(k4.replaced, "faulted", "K4: the commit read the faulted task");
	assert.equal(k4.status, "running", "K4: the replacement runs");
	console.log("K4 ok: a commit read the faulted task, created a replacement, and the replacement runs");

	const k5 = loop("bump", 7);
	const last5 = k5.at(-1);
	assert.notEqual(last5.status, "terminal", `K5: ${JSON.stringify(k5)}`);
	assert.equal(last5.entered, 8, "K5: the phase entered its wait on every open");
	console.log(`K5 ok: with a changed checkpoint before the wait, the task is ${last5.status} after 7 kills`);

	killed(child("answer", "inside"), "K6 kill inside the commit");
	const open = looked(child("answer", "look"), "K6 reopen");
	assert.deepEqual(open, { decision: "open", continuation: false, tasks: 0 }, "K6: nothing landed");
	killed(child("answer", "after"), "K6 kill after the commit");
	const answered = looked(child("answer", "look"), "K6 second reopen");
	assert.deepEqual(answered, { decision: "answered", continuation: true, tasks: 1 }, "K6: both landed");
	console.log("K6 ok: killed inside the commit, neither the answer nor the task landed; killed after it, both did");
	console.log("ok: checks K1-K6 passed");
	process.exit(0);
}

const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } = await import(
	`${base}/pi-ai/dist/providers/faux.js`
);
const { obj, str } = await import(`${base}/pi-schema/dist/index.js`);
const d = await import(`${base}/pi-durable/dist/index.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const { createRegistry, defineDoc, defineEntry, defineExtension, defineTask, defineTool, Harness } = d;

const say = (value) => writeSync(1, `${JSON.stringify(value)}\n`);
const die = () => process.kill(process.pid, "SIGKILL");
const forever = () => new Promise(() => {});
const Probe = defineDoc({
	kind: "probe.crash",
	version: 1,
	scope: "session",
	initial: () => ({ receipts: {}, runs: [], task: null, decision: { status: "open", continuation: null } }),
	checkpointWhen: () => false,
});
const Design = defineEntry("probe.design");

const record = (replay) =>
	defineTool({
		name: "record",
		description: "Record a design.",
		parameters: obj({ text: str() }),
		...(replay ? { replay } : {}),
		execute: async (args, api, c) => {
			await api.commit(async (tx) => {
				const probe = await tx.doc(Probe);
				probe.runs.push(api.taskId);
				if (probe.receipts[api.taskId] !== undefined) return;
				const entry = await tx.appendEntry(Design, api.conversationId, { data: { text: args.text } });
				probe.receipts[api.taskId] = entry.id;
			}, c);
			if (flag === "kill") {
				die();
				await forever();
			}
			return { output: [{ type: "text", text: "Recorded." }], control: { terminate: true } };
		},
	});

const Wait = defineTask({
	name: "probe.wait",
	version: 1,
	initial: () => ({ phase: "wait", entered: 0 }),
	phases: {
		wait: async (task, runtime, c) => {
			const entered = task.state.checkpoint.entered + 1;
			if (task.input.bump) {
				await runtime.commit(() => ({ status: "running", checkpoint: { phase: "wait", entered } }), c);
			}
			waiting(entered);
			await forever();
		},
	},
	abort: (_task, runtime, c) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c),
});
let waiting = () => {};

const tool = scenario === "safe" ? record("safe") : record(undefined);
const registry = createRegistry();
registry.install(defineExtension({ name: "probe", tools: [tool], tasks: [Wait] }));
const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
const call = fauxAssistantMessage([fauxToolCall("record", { text: "design v1" })], { stopReason: "toolUse" });
faux.setResponses([call, fauxAssistantMessage([fauxText("done")])]);
const reports = [];
const storage = await openNodeSqliteStorage(file);
const harness = await Harness.open(
	storage,
	{
		models,
		registry,
		now: () => Date.UTC(2026, 10, 11),
		onReport: (report) => reports.push(`${report.kind}:${report.reason ?? ""}`),
	},
	ctx,
);
const root = await harness.root(ctx, { agent: { model: { provider: "faux", modelId: "faux-1" } } });
const probe = () => harness.commit(async (tx) => JSON.parse(JSON.stringify(await tx.doc(Probe))), ctx);

if (scenario === "safe" || scenario === "unsafe") {
	const before = await probe();
	if (before.runs.length === 0) await root.submit({ type: "input", content: "Add a --json flag." }, ctx);
	await root.waitForIdle(ctx);
	const entries = (await root.entries({ order: "ascending" }, 200, undefined, ctx)).items;
	say({
		runs: (await probe()).runs,
		designs: entries.filter((entry) => entry.kind === "probe.design").length,
		modelCalls: faux.state.callCount,
		interrupted: JSON.stringify(entries).includes("was interrupted and may have partially run"),
	});
	await harness.close(ctx);
	process.exit(0);
}

if (scenario === "answer") {
	if (flag !== "look") {
		await harness.commit(async (tx) => {
			const state = await tx.doc(Probe);
			const continuation = await tx.createTask(
				Wait,
				{ bump: true },
				{ ownership: { kind: "conversation" }, conversationId: root.id, background: true },
			);
			state.decision = { status: "answered", continuation };
			if (flag === "inside") {
				die();
				await forever();
			}
		}, ctx);
		die();
		await forever();
	}
	const { decision } = await probe();
	const task = decision.continuation === null ? undefined : await harness.getTask(decision.continuation, ctx);
	const live = (await harness.inspect(ctx)).tasks.filter((item) => JSON.stringify(item).includes("probe.wait"));
	say({ decision: decision.status, continuation: task !== undefined, tasks: live.length });
	process.exit(0);
}

const state = await probe();
let taskId = state.task;
let replaced;
const look = async (entered) => {
	const task = await harness.getTask(taskId, ctx);
	say({
		replaced,
		status: task?.state.status ?? "gone",
		outcome: task?.state.outcome?.status,
		restarts: task?.restarts ?? 0,
		entered: entered ?? task?.state.checkpoint?.entered,
		reports,
	});
};
waiting = async (entered) => {
	await look(entered);
	if (flag === "kill") die();
};
if (taskId === null) {
	taskId = await harness.commit(async (tx) => {
		const id = await tx.createTask(
			Wait,
			{ bump: scenario === "bump" },
			{ ownership: { kind: "conversation" }, conversationId: root.id, background: true },
		);
		(await tx.doc(Probe)).task = id;
		return id;
	}, ctx);
}
if (flag === "redrive") {
	taskId = await harness.commit(async (tx) => {
		const state = await tx.doc(Probe);
		const dead = await tx.task(state.task);
		replaced = dead.state.outcome.status;
		const id = await tx.createTask(
			Wait,
			{ bump: false },
			{ ownership: { kind: "conversation" }, conversationId: root.id, background: true },
		);
		state.task = id;
		return id;
	}, ctx);
}
harness.resume();
// A faulted task never reaches `waiting`, so look after a pause and leave.
await new Promise((resolve) => setTimeout(resolve, 1500));
await look();
process.exit(0);
