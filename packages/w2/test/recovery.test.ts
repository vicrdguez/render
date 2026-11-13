import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const child = fileURLToPath(new URL("./fixtures/crash.js", import.meta.url));
type Seen = {
	forecasts: number;
	recorded: number;
	revised: number;
	asked: number;
	resolved: { score: number }[];
	modelCalls: number;
	reports: unknown[];
};
function run(scenario: string, file: string, step: string) {
	return new Promise<{ signal: string | null; seen: Seen }>(
		(resolve, reject) => {
			execFile(
				process.execPath,
				[child, scenario, file, step],
				{ timeout: 15_000 },
				(error, stdout, stderr) => {
					if (error && error.signal !== "SIGKILL")
						return reject(
							new Error(`${scenario} ${step}: ${stderr}\n${stdout}`),
						);
					const line = stdout
						.split("\n")
						.findLast((line) => line.startsWith("{"));
					resolve({
						signal: error?.signal ?? null,
						seen: line ? JSON.parse(line) : {},
					});
				},
			);
		},
	);
}

for (const scenario of [
	"record",
	"revise",
	"overdue",
	"stale",
	"score-before",
	"score-after",
]) {
	test(`SQLite SIGKILL ${scenario}: recovery preserves one effect without a model call`, async (t) => {
		const dir = await mkdtemp(join(tmpdir(), "tau-w2-"));
		t.after(() => rm(dir, { recursive: true, force: true }));
		const file = join(dir, "store.sqlite");
		assert.equal((await run(scenario, file, "kill")).signal, "SIGKILL");
		const result = await run(scenario, file, "look");
		assert.equal(result.signal, null);
		const seen = result.seen;
		assert.equal(
			seen.forecasts,
			["revise", "stale"].includes(scenario) ? 2 : 1,
		);
		assert.equal(seen.recorded, 1);
		assert.equal(seen.revised, ["revise", "stale"].includes(scenario) ? 1 : 0);
		assert.equal(seen.asked, 1);
		assert.equal(seen.modelCalls, 0);
		assert.deepEqual(seen.reports, []);
		if (scenario.startsWith("score")) {
			assert.equal(seen.resolved.length, 1);
			assert.ok(Math.abs((seen.resolved[0]?.score ?? -1) - 0.09) < 1e-12);
		} else assert.deepEqual(seen.resolved, []);
	});
}
