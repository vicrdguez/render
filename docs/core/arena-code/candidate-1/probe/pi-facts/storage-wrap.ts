// The crash seam of unit 1's K6 test, with no hook in production code: the test passes a wrapped `Storage` to the
// harness, and the wrapper kills the process inside `Storage.commit`, before or after the real commit.
//   inside: killed before the SQLite commit runs, the reopened store has neither the document nor the task.
//   after:  killed once the SQLite commit returned, the reopened store has both.
// After `npm install --ignore-scripts` in ../toolchain: `ln -s ../toolchain/node_modules node_modules`, then
// `node storage-wrap.ts` from this directory. Stores go under ./.scratch/.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import type { Storage } from "@earendil-works/pi-durable";
import { createRegistry, defineDoc, defineExtension, defineTask, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

const [mode, file, when] = process.argv.slice(2);

if (mode === undefined) {
	const dir = join(import.meta.dirname, ".scratch");
	mkdirSync(dir, { recursive: true });
	const run = (...args: string[]) =>
		spawnSync(process.execPath, [import.meta.filename, ...args], { encoding: "utf8", timeout: 30_000 });
	for (const point of ["inside", "after"] as const) {
		const store = join(dir, `${point}-${process.pid}.sqlite`);
		const killed = run("child", store, point);
		assert.equal(killed.signal, "SIGKILL", killed.stderr);
		const look = run("look", store, point);
		assert.equal(look.status, 0, look.stderr);
		console.log(`${point}: killed with ${killed.signal}; reopened: ${look.stdout.trim()}`);
	}
	process.exit(0);
}

const Answer = defineDoc<{ status: string; continuation: number | null }>({
	kind: "probe.answer",
	version: 1,
	scope: "session",
	initial: () => ({ status: "open", continuation: null }),
	checkpointWhen: () => false,
});
const Then = defineTask<null, { phase: "wait" }, null>({
	name: "probe.then",
	version: 1,
	initial: () => ({ phase: "wait" }),
	phases: { wait: () => new Promise(() => {}) },
	abort: async () => {},
});
const registry = createRegistry();
registry.install(defineExtension({ name: "probe", tasks: [Then] }));

let armed = false;
/** Forwards every call to the real storage. Once armed, kills the process at `when` in the next commit. */
function dying(storage: Storage): Storage {
	return new Proxy(storage, {
		get(target, key, receiver) {
			const value = Reflect.get(target, key, receiver);
			if (key !== "commit" || typeof value !== "function") return typeof value === "function" ? value.bind(target) : value;
			return async (...args: Parameters<Storage["commit"]>) => {
				if (armed && when === "inside") process.kill(process.pid, "SIGKILL");
				const result = await value.apply(target, args);
				if (armed && when === "after") process.kill(process.pid, "SIGKILL");
				return result;
			};
		},
	});
}

const real = await openNodeSqliteStorage(file as string);
const harness = await Harness.open(mode === "child" ? dying(real) : real, { models: createModels(), registry }, ctx);
const root = await harness.root(ctx);

if (mode === "child") {
	armed = true;
	await harness.commit(async (tx) => {
		const answer = await tx.doc(Answer);
		const id = await tx.createTask(Then, null, { ownership: { kind: "conversation" }, conversationId: root.id, background: true });
		answer.status = "answered";
		answer.continuation = id;
	}, ctx);
	await new Promise(() => {});
}

const seen = await harness.snapshot(Answer, ctx);
const tasks = (await harness.inspect(ctx)).tasks.filter((t) => t.record.kind === "probe.then").length;
console.log(JSON.stringify({ answer: seen?.status ?? "none", tasks }));
await harness.close(ctx);
