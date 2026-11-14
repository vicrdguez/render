// Does registry.install of a replacement write to storage by itself? Counts Storage.commit calls around the
// install, with two sleeping tasks (not due) of the replaced extension. Real pi-durable 1.5.2.
import { pathToFileURL } from "node:url";
const parent = pathToFileURL("/tmp/c1-probe.kDWNfm/checkout/package.json").href;
const native = (s) => import(import.meta.resolve(s, parent));
const d = await native("@earendil-works/pi-durable");
const ai = await native("@earendil-works/pi-ai");
const { BACKGROUND_CONTEXT: ctx } = await native("@earendil-works/chord/context");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test) { const end = Date.now() + 5000; while (Date.now() < end) { if (await test()) return; await sleep(5); } throw new Error("timeout"); }
const done = (result) => ({ status: "terminal", outcome: { status: "completed", result } });
const build = (label, version, migrate) => {
	const sleeper = d.defineTask({ name: "probe.sleep", version, initial: () => ({ phase: "sleep" }),
		...(migrate ? { migrate: (input, checkpoint) => ({ input, checkpoint }) } : {}),
		phases: { sleep: (t, r, c) => r.sleepUntil(t.input.at, { phase: "wake" }, c), wake: (t, r, c) => r.commit(() => done(label), c) },
		abort: (_t, r, c) => r.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c) });
	const waiter = d.defineTask({ name: "probe.later", version, initial: () => ({ phase: "sleep" }),
		...(migrate ? { migrate: (input, checkpoint) => ({ input, checkpoint }) } : {}),
		phases: { sleep: (t, r, c) => r.sleepUntil(t.input.at + 1, { phase: "wake" }, c), wake: (t, r, c) => r.commit(() => done(label), c) },
		abort: (_t, r, c) => r.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), c) });
	return { sleeper, waiter, extension: d.defineExtension({ name: "probe", tasks: [sleeper, waiter] }) };
};
for (const [name, version, migrate] of [["same version", 1, false], ["v2 with migrate", 2, true], ["v2 without migrate", 2, false]]) {
	let clock = Date.UTC(2026, 10, 14);
	let commits = 0;
	const { openNodeSqliteStorage } = await native("@earendil-works/pi-durable/storage/sqlite/node");
	const { mkdtemp } = await import("node:fs/promises");
	const memory = await openNodeSqliteStorage((await mkdtemp("/tmp/c1-probe.kDWNfm/p/c/db-")) + "/store.sqlite");
	const storage = new Proxy(memory, { get(target, key) {
		const value = Reflect.get(target, key, target);
		if (key === "commit" && typeof value === "function") return (...args) => { commits++; return value.apply(target, args); };
		return typeof value === "function" ? value.bind(target) : value;
	} });
	const registry = d.createRegistry();
	const old = build("old", 1, false);
	registry.install(old.extension);
	const faux = ai.fauxProvider({ models: [{ id: "a" }] });
	const models = ai.createModels(); models.setProvider(faux.provider);
	const h = await d.Harness.open(storage, { registry, models, now: () => clock, setTimer: () => () => {} }, ctx);
	h.resume();
	try {
		const C = await h.createConversation({ ownership: { kind: "ownerless" } }, ctx);
		const own = { ownership: { kind: "conversation" }, conversationId: C.id, background: true };
		const s = await h.commit((tx) => tx.createTask(old.sleeper, { at: clock + 60_000 }, own), ctx);
		const w = await h.commit((tx) => tx.createTask(old.waiter, { at: clock + 60_000 }, own), ctx);
		await until(async () => (await h.getTask(s, ctx)).state.status === "sleeping" && (await h.getTask(w, ctx)).state.status === "sleeping");
		await sleep(50);
		const before = commits;
		const t0 = performance.now();
		registry.install(build("new", version, migrate).extension);
		const installMs = +(performance.now() - t0).toFixed(3);
		await sleep(100);
		const inspected = (await h.inspect(ctx)).tasks.filter((t) => t.record.kind.startsWith("probe.")).map((t) => ({ kind: t.record.kind, version: t.record.version, state: t.state.kind }));
		console.log(name, JSON.stringify({ installMs, commitsDuringInstallAnd100ms: commits - before, inspected }));
	} finally { await h.close(ctx); }
}
