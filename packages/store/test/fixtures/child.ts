import { writeSync } from "node:fs";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	createRegistry,
	defineDoc,
	defineEntry,
	defineExtension,
	defineTask,
	defineTool,
	type Storage,
	type TaskId,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { obj, str } from "@earendil-works/pi-schema";
import {
	type DecisionId,
	type DecisionInput,
	decision,
	emit,
	eventLog,
	request,
} from "tau-store";
import { answer, openStore } from "tau-store/host";

// One run of a crash scenario on a SQLite file. The parent kills nothing: this process kills itself with SIGKILL at
// the point under test, and the parent reopens the file in a new process.
const [scenario = "", file = "", step = ""] = process.argv.slice(2);
const say = (value: unknown) => writeSync(1, `${JSON.stringify(value)}\n`);
const die = () => process.kill(process.pid, "SIGKILL");
const forever = () => new Promise<never>(() => {});

const Design = defineEntry<{ text: string }>("k.design");
const Published = defineEntry<{ text: string; at: number }>("k.published");
const Probe = defineDoc<{
	runs: number[];
	receipts: Record<string, DecisionId>;
	done: Record<string, number>;
	skipped: number[];
}>({
	kind: "k.probe",
	version: 1,
	scope: "session",
	initial: () => ({ runs: [], receipts: {}, done: {}, skipped: [] }),
	checkpointWhen: () => false,
});

let onWait = (_entered: number) => {};
/** A then task that keys its effect by the decision ID, then waits in memory. "bump" commits a new checkpoint first. */
const Then = defineTask<
	DecisionInput<"hold" | "bump">,
	{ phase: "act" } | { phase: "wait"; entered: number },
	null
>({
	name: "k.then",
	version: 1,
	initial: () => ({ phase: "act" }),
	phases: {
		act: (task, runtime, c) =>
			runtime.commit(async (tx) => {
				const probe = await tx.doc(Probe);
				if (probe.done[task.input.decision] !== undefined) {
					probe.skipped.push(task.id);
					return {
						status: "terminal",
						outcome: { status: "completed", result: null },
					};
				}
				probe.done[task.input.decision] = task.id;
				return {
					status: "running",
					checkpoint: { phase: "wait", entered: 0 },
				};
			}, c),
		wait: async (task, runtime, c) => {
			const entered = task.state.checkpoint.entered + 1;
			if (task.input.choice === "bump") {
				await runtime.commit(
					() => ({
						status: "running",
						checkpoint: { phase: "wait", entered },
					}),
					c,
				);
			}
			onWait(entered);
			await forever();
		},
	},
	abort: (_task, runtime, c) =>
		runtime.commit(
			() => ({ status: "terminal", outcome: { status: "aborted" } }),
			c,
		),
});

const publish = defineTool({
	name: "publish",
	description: "Publish a design for review.",
	parameters: obj({ text: str() }),
	...(scenario === "safe" ? { replay: "safe" as const } : {}),
	execute: async (args, api, c) => {
		const id = await api.commit(async (tx) => {
			const probe = await tx.doc(Probe);
			probe.runs.push(api.taskId);
			const receipt = probe.receipts[String(api.taskId)];
			if (receipt !== undefined) return receipt;
			const basis = await tx.appendEntry(Design, api.conversationId, {
				data: { text: args.text },
			});
			const asked = await request(tx, {
				subject: "k:design",
				title: "Review the design",
				basis,
				choices: ["hold", "bump"],
				conversation: api.conversationId,
				then: Then,
				requestedAt: api.now(),
			});
			await emit(tx, Published, { text: "Design ready.", at: api.now() });
			probe.receipts[String(api.taskId)] = asked.id;
			return asked.id;
		}, c);
		if (step === "kill") {
			die();
			await forever();
		}
		return {
			output: [{ type: "text", text: id }],
			control: { terminate: true },
		};
	},
});

let armed = false;
const real = await openNodeSqliteStorage(file);
/** Forwards to SQLite. Once armed, kills the process in the next storage commit, before or after it is stored. */
const storage = new Proxy(real, {
	get(target, key) {
		const value = Reflect.get(target, key, target);
		if (key !== "commit" || typeof value !== "function")
			return typeof value === "function" ? value.bind(target) : value;
		return async (...args: Parameters<Storage["commit"]>) => {
			if (armed && step === "inside") die();
			const result = await value.apply(target, args);
			if (armed && step === "after") die();
			return result;
		};
	},
});

const registry = createRegistry();
registry.install(
	defineExtension({ name: "k", tools: [publish], tasks: [Then] }),
);
const faux = fauxProvider();
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
	fauxAssistantMessage([fauxToolCall("publish", { text: "Design v1." })], {
		stopReason: "toolUse",
	}),
	fauxAssistantMessage([fauxText("done")]),
]);
const reports: string[] = [];
const store = await openStore(
	storage,
	{
		models,
		registry,
		now: () => Date.UTC(2026, 10, 14),
		onReport: (report) =>
			reports.push(`${report.kind}:${"reason" in report ? report.reason : ""}`),
	},
	context,
);
const root = await store.harness.root(context, {
	agent: { model: { provider: "faux", modelId: "faux-1" } },
});
const probe = async () =>
	(await store.harness.snapshot(Probe, context)) ?? {
		runs: [],
		receipts: {},
		done: {},
		skipped: [],
	};
const read = (id: DecisionId) =>
	store.harness.commit((tx) => decision(tx, id), context);

if (scenario === "safe" || scenario === "unsafe") {
	if ((await probe()).runs.length === 0) {
		await root.submit({ type: "input", content: "Publish a design." }, context);
	}
	await root.waitForIdle(context);
	const entries = (
		await root.entries({ order: "ascending" }, 200, undefined, context)
	).items;
	const events = await store.harness.commit(
		async (tx) =>
			(
				await tx.scanEntries(
					{ conversationId: await eventLog(tx), order: "ascending" },
					100,
				)
			).items.length,
		context,
	);
	const { runs, receipts } = await probe();
	say({
		runs,
		receipts,
		designs: entries.filter((entry) => Design.is(entry)).length,
		first: (await read("k:design#1"))?.status ?? null,
		second: (await read("k:design#2"))?.status ?? null,
		events,
		modelCalls: faux.state.callCount,
		interrupted: JSON.stringify(entries).includes("was interrupted"),
	});
	process.exit(0);
}

const subject = `k:${scenario}`;
const id: DecisionId = `${subject}#1`;
if ((await read(id)) === undefined) {
	await store.harness.commit(async (tx) => {
		const basis = await tx.appendEntry(Design, root.id, {
			data: { text: `The ${scenario} design.` },
		});
		await request(tx, {
			subject,
			title: "Review the design",
			basis,
			choices: ["hold", "bump"],
			conversation: root.id,
			then: Then,
			requestedAt: 0,
		});
	}, context);
}
const asked = await read(id);
if (asked === undefined) throw new Error("the decision was not requested");
const input = {
	basis: asked.basis,
	choice: scenario === "bump" ? "bump" : "hold",
	annotations: [],
};

if (scenario === "answer") {
	if (step !== "look") {
		armed = true;
		await answer(store, id, input, "phone", context);
		die();
	}
	const live = (await store.harness.inspect(context)).tasks.filter(
		(task) => task.record.kind === "k.then",
	);
	say({
		decision: asked.status,
		continuation:
			asked.status === "answered" &&
			(await store.harness.getTask(asked.continuation, context)) !== undefined,
		tasks: live.length,
	});
	process.exit(0);
}

let replaced: string | null = null;
let continuation: TaskId;
if (asked.status === "open") {
	const result = await answer(store, id, input, "phone", context);
	if (result.kind !== "answered") throw new Error(JSON.stringify(result));
	continuation = result.decision.continuation;
} else if (asked.status === "answered") {
	continuation = asked.continuation;
	if (step === "redrive") {
		replaced =
			(await store.harness.getTask(continuation, context))?.state.outcome
				?.status ?? null;
		const result = await answer(store, id, input, "laptop", context);
		if (result.kind !== "answered") throw new Error(JSON.stringify(result));
		if (result.decision.continuation === continuation)
			throw new Error("no replacement");
		continuation = result.decision.continuation;
	}
} else throw new Error(`decision is ${asked.status}`);

const waiting = new Promise<number>((resolve) => {
	onWait = resolve;
});
store.harness.resume();
const ended = await Promise.race([
	waiting,
	store.harness.waitForTask(continuation, context),
]);
const task = await store.harness.getTask(continuation, context);
const { done, skipped } = await probe();
say({
	replaced,
	entered: typeof ended === "number" ? ended : null,
	status: task?.state.status ?? null,
	outcome: task?.state.outcome?.status ?? null,
	reports,
	effects: Object.keys(done).length,
	skipped: skipped.length,
});
if (typeof ended === "number" && step === "kill") die();
process.exit(0);
