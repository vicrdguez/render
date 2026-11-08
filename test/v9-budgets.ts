// V9 time budgets (B6, spec §13): cheap deterministic V1 (10,000 schedules per remaining seeded oracle and explicit
// Watchdog and checkpoint cases) plus sampled V2 (32 real-SQLite schedules) under 60 s, and the subprocess smoke
// (every V3 process-fault barrier once, plus the real
// two-process owner lock) under 5 min, on the checked-out source. The CPU-bound V1/V2 files run four at a time, as the
// fast selection does; process faults and containers run serially. A failing or slow selection fails this job. Prints measured wall times with source and selections; nothing here weakens a check.
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const SELECTIONS = [
	{
		name: "cheap-v1-sampled-v2",
		budgetMs: 60_000,
		concurrency: 4,
		env: { RENDER_V1_SCHEDULES: "10000", RENDER_V2_SCHEDULES: "32" },
		files: [
			"test/kernel-authority-schedules.test.ts",
			"test/checkpoint-authority.test.ts",
			"test/implementation-pass-schedules.test.ts",
			"test/watchdog-rework-schedules.test.ts",
			"test/canonical-integration-schedules.test.ts",
			"test/sqlite-command-atomicity.test.ts",
			"test/sqlite-command-schedules.integration.ts",
		],
	},
	{
		name: "subprocess-smoke",
		budgetMs: 300_000,
		concurrency: 1,
		env: { RENDER_V3_REPETITIONS: "1" },
		files: [
			"test/persistence-startup.integration.ts",
			"test/command-crash-recovery.integration.ts",
			"test/durable-tool-replay.integration.ts",
			"test/web-crash.integration.ts",
			"test/investigation-crash.integration.ts",
			"test/implementation-lifecycle-crash.integration.ts",
			"test/source-root-crash.integration.ts",
			"test/owned-check-crash.integration.ts",
			"test/owned-check-cancellation.integration.ts",
			"test/experiment-crash.integration.ts",
			"test/target-preparation-crash.integration.ts",
			"test/watchdog-crash.integration.ts",
			"test/canonical-integration-crash.integration.ts",
		],
	},
];
const git = (args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout.trim();
let failed = false;
for (const selection of SELECTIONS) {
	const began = performance.now();
	const run = spawnSync(process.execPath, ["--test", `--test-concurrency=${selection.concurrency}`, ...selection.files], {
		cwd: ROOT,
		env: { ...process.env, ...selection.env },
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	const ms = Math.round(performance.now() - began);
	const passed = run.status === 0;
	const within = ms < selection.budgetMs;
	if (!passed || !within) failed = true;
	if (!passed)
		process.stderr.write(
			run.stdout
				.split("\n")
				.filter((l) => /✖|Error|not ok/.test(l))
				.join("\n"),
		);
	process.stdout.write(
		`${JSON.stringify({
			measure: `v9_budget_${selection.name}`,
			source: { commit: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "" },
			node: process.version,
			platform: `${process.platform}-${process.arch}`,
			env: selection.env,
			files: selection.files.length,
			concurrency: selection.concurrency,
			passed,
			ms,
			budgetMs: selection.budgetMs,
			within,
		})}\n`,
	);
}
process.exit(failed ? 1 : 0);
