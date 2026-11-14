// What harness.inspect() says right after a replacement, before a stored task is due, and what a same-version
// replacement that drops a phase does to a task checkpointed in that phase. Real pi-durable 1.5.2, MemoryStorage.
import { pathToFileURL } from "node:url";
const parent = pathToFileURL("/tmp/c1-probe.kDWNfm/checkout/package.json").href;
const native = (s) => import(import.meta.resolve(s, parent));
const d = await native("@earendil-works/pi-durable");
const ai = await native("@earendil-works/pi-ai");
const { BACKGROUND_CONTEXT: ctx } = await native("@earendil-works/chord/context");
const print = (label, value) => console.log(label, JSON.stringify(value));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(label, test) { const end = Date.now() + 5000; while (Date.now() < end) { const v = await test(); if (v) return v; await sleep(5); } throw new Error(`timeout ${label}`); }
const done = (result) => ({ status: "terminal", outcome: { status: "completed", result } });

function timer({ version = 1, migrate, phases = ["sleep", "wake"], label }) {
	const handlers = {
		sleep: (t, r, c) => r.sleepUntil(t.input.at, { phase: phases.includes("wake") ? "wake" : phases[1] }, c),
	};
	for (const p of phases.slice(1)) handlers[p] = (t, r, c) => r.commit(() => done(`${label}:${p}`), c);
	return d.defineTask({
		name: "probe.timer", version, initial: () => ({ phase: "sleep" }), phases: handlers,
		...(migrate ? { migrate: (input, checkpoint) => ({ input, checkpoint }) } : {}),
		abort: (_t, r, c) => r.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c),
	});
}
const ext = (task) => d.defineExtension({ name: "probe", tasks: [task] });

async function scenario(name, next) {
	let clock = Date.UTC(2026, 10, 14);
	const timers = new Set();
	const registry = d.createRegistry();
	const first = timer({ label: "old" });
	registry.install(ext(first));
	const faux = ai.fauxProvider({ models: [{ id: "a" }] });
	const models = ai.createModels(); models.setProvider(faux.provider);
	const reports = [];
	const h = await d.Harness.open(new d.MemoryStorage(), {
		registry, models, now: () => clock,
		setTimer: (cb, delay) => { const t = { at: clock + delay, cb }; timers.add(t); return () => timers.delete(t); },
		onReport: (r) => reports.push({ kind: r.kind, reason: r.reason, error: r.error?.message }),
	}, ctx);
	h.resume();
	try {
		const C = await h.createConversation({ ownership: { kind: "ownerless" } }, ctx);
		const id = await h.commit((tx) => tx.createTask(first, { at: clock + 1000 }, { ownership: { kind: "conversation" }, conversationId: C.id, background: true }), ctx);
		await until("sleeping", async () => (await h.getTask(id, ctx)).state.status === "sleeping");
		registry.install(ext(next));
		await sleep(20);
		const inspected = (await h.inspect(ctx)).tasks.find((t) => t.record.id === id);
		const before = { state: inspected?.state, storedVersion: inspected?.record.version, checkpoint: inspected?.record.state.checkpoint };
		clock += 1001;
		for (const t of [...timers]) if (t.at <= clock) { timers.delete(t); t.cb(); }
		const after = await until("settled", async () => {
			const item = (await h.inspect(ctx)).tasks.find((t) => t.record.id === id);
			if (item?.state.kind === "blocked") return { inspect: item.state, record: item.record.state };
			const record = await h.getTask(id, ctx);
			return record.state.status === "terminal" ? { record: record.state, version: record.version } : undefined;
		});
		print(name, { beforeDue: before, afterDue: after, reports });
	} finally { await h.close(ctx); }
}

await scenario("v2 without migrate", timer({ version: 2, label: "new" }));
await scenario("v2 with migrate", timer({ version: 2, migrate: true, label: "new" }));
await scenario("same version, phase wake renamed to ring", timer({ phases: ["sleep", "ring"], label: "new" }));
