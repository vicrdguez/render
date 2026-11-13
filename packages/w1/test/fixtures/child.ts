import { existsSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { Storage } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
	answered,
	call,
	commitStep,
	data,
	git,
	plannedPath,
	subjects,
	toolResults,
	world,
} from "../setup.js";

// One run of a crash scenario on a SQLite store and a real repository in `dir`. This process kills itself with
// SIGKILL at the point under test; the parent opens the same files again in a new process and looks.
const [scenario = "", dir = "", step = ""] = process.argv.slice(2);
const say = (value: unknown) => writeSync(1, `${JSON.stringify(value)}\n`);
const die = () => process.kill(process.pid, "SIGKILL");
const repo = join(dir, "export-tool");
process.env.TAU_TEST_PID = String(process.pid);

const real = await openNodeSqliteStorage(join(dir, "store.sqlite"));
/** Forwards to SQLite, and dies around the commit that the scenario names. */
const storage = new Proxy(real, {
	get(target, key) {
		const value = Reflect.get(target, key, target);
		if (key !== "commit" || typeof value !== "function")
			return typeof value === "function" ? value.bind(target) : value;
		return async (...args: Parameters<Storage["commit"]>) => {
			const write = JSON.stringify(args[0]);
			if (step === "first" && scenario === "worktree" && worktreeExists())
				die();
			const result = await value.apply(target, args);
			if (step === "first" && scenario === "publish" && write.includes('"w1.design"'))
				die();
			if (step === "first" && scenario === "plan" && write.includes('"w1.prepare"'))
				die();
			return result;
		};
	},
});
let k: number | undefined;
const worktreeExists = () =>
	k !== undefined && existsSync(join(plannedPath(repo, k as never), ".git"));

const w = await world({ storage, repo, now: () => Date.UTC(2026, 10, 14) });

if (step === "first") {
	await w.setOptions({
		designer: "faux/faux-a",
		implementer: "faux/faux-a",
		reviewer: "faux/faux-b",
	});
	k = await w.create();
	say({ k });
	w.script("designer", call("publish_design", { text: "The design." }));
	if (scenario === "g1")
		w.script(
			"implementer",
			call("bash", {
				command:
					"printf 'json' > export.js && git add -A && git commit -qm 'Add --json' && kill -9 $TAU_TEST_PID",
			}),
		);
	await w.submit(k, "Add a --json flag.");
	await w.settle();
	answered(await w.reply(subjects(k).design(1), "approve"));
	await w.settle();
	say({ k, survived: true });
	process.exit(0);
}

const found = (await w.events()).find((e) => e.stage === "design_review");
k = found?.conversation as number;
const s = subjects(k as never);
if (scenario === "plan") await w.setOptions({ base: "other" });
if (scenario === "g1")
	w.script("implementer", call("publish_build", { text: "Built." }));
await w.settle();
const events = await w.events();
const I = events.find((e) => e.stage === "building")?.conversation as never;
const path = plannedPath(repo, k as never);
const builds = I === undefined ? [] : await w.entries(I, "w1.build");
say({
	designs: (await w.entries(k as never, "w1.design")).length,
	design1: (await w.read(s.design(1)))?.status ?? null,
	design2: (await w.read(s.design(2)))?.status ?? null,
	stages: events.map((e) => e.stage),
	designerRequests: w.requests.filter((r) => r.role === "designer").length,
	worktrees: git(repo, "worktree", "list", "--porcelain")
		.split("\n")
		.filter((line) => line.startsWith("worktree ")).length,
	base: git(repo, "rev-parse", "main"),
	forkPoint: existsSync(path) ? git(path, "merge-base", "HEAD", "main") : null,
	implementers: events.filter((e) => e.stage === "building").length,
	commitsOnBranch: existsSync(path)
		? Number(git(path, "rev-list", "--count", "main..HEAD"))
		: null,
	head: existsSync(path) ? git(path, "rev-parse", "HEAD") : null,
	buildShas: builds.map((b) => data(b).sha),
	bash:
		I === undefined
			? []
			: (await toolResults(w, I))
					.filter((r) => r.tool === "bash")
					.map((r) => ({ isError: r.isError, text: r.text })),
});
await w.close();
process.exit(0);
