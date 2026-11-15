import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_RESTART_LIMIT } from "@earendil-works/pi-durable";

const child = fileURLToPath(new URL("./fixtures/child.js", import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(), "tau-store-crash-"));

type Run = { signal: string | null; seen: Record<string, unknown> };

function run(scenario: string, step: string): Promise<Run> {
	const file = path.join(dir, `${scenario}.sqlite`);
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[child, scenario, file, step],
			{ timeout: 60_000 },
			(error, stdout, stderr) => {
				if (error && error.signal !== "SIGKILL")
					return reject(new Error(`${scenario} ${step}: ${stderr}`));
				const last = stdout
					.split("\n")
					.filter((line) => line.startsWith("{"))
					.at(-1);
				resolve({
					signal: error?.signal ?? null,
					seen: last === undefined ? {} : JSON.parse(last),
				});
			},
		);
	});
}

async function killed(scenario: string, step: string) {
	const result = await run(scenario, step);
	assert.equal(result.signal, "SIGKILL", `${scenario} ${step} was killed`);
	return result.seen;
}

async function looked(scenario: string, step: string) {
	const result = await run(scenario, step);
	assert.equal(result.signal, null, `${scenario} ${step} exited`);
	return result.seen;
}

/** Opens the store again after every kill, until a run ends without one. */
async function untilAlive(scenario: string, kills: number) {
	const seen = [];
	for (let i = 0; i < kills; i++) {
		const result = await run(scenario, "kill");
		seen.push(result.seen);
		if (result.signal === null) return seen;
	}
	seen.push(await looked(scenario, "look"));
	return seen;
}

describe("K1 to K6 on the real store functions, SQLite, SIGKILL", {
	concurrency: true,
}, () => {
	test("K1 a replay-safe publish runs again under the same task ID and returns its stored receipt", async () => {
		await killed("safe", "kill");
		const seen = await looked("safe", "look");
		const runs = seen.runs as number[];
		assert.equal(runs.length, 2, "the tool ran twice");
		assert.equal(runs[0], runs[1], "with one api.taskId");
		assert.equal(seen.designs, 1, "one basis entry");
		assert.equal(seen.first, "open", "one decision, still open");
		assert.equal(seen.second, null, "no second decision");
		assert.equal(seen.events, 1, "one event");
		assert.equal(seen.modelCalls, 0, "no model request after reopen");
	});

	test("K2 without replay safety the model calls again, so request supersedes on the twin basis", async () => {
		await killed("unsafe", "kill");
		const seen = await looked("unsafe", "look");
		const runs = seen.runs as number[];
		assert.equal(runs.length, 2);
		assert.notEqual(runs[0], runs[1], "the second call is a new task");
		assert.equal(seen.interrupted, true, "the model saw an interrupted result");
		assert.equal(seen.designs, 2, "a twin basis entry");
		assert.equal(
			seen.first,
			"superseded",
			"equality did not make the rerun safe",
		);
		assert.equal(seen.second, "open");
		assert.equal(seen.events, 2);
	});

	test("K3 and K4 a then task that waits unchanged faults, and an equal resend replaces it without repeating its effect", async () => {
		const seen = await untilAlive("hold", DEFAULT_RESTART_LIMIT + 2);
		const kills = seen.length - 1;
		const last = seen.at(-1) ?? {};
		assert.equal(kills, DEFAULT_RESTART_LIMIT, `K3: ${JSON.stringify(seen)}`);
		assert.equal(last.status, "terminal");
		assert.equal(last.outcome, "faulted");
		assert.ok(
			(last.reports as string[]).includes("task_faulted:restart_limit"),
			"onReport heard the fault",
		);
		const redrive = await looked("hold", "redrive");
		assert.equal(redrive.replaced, "faulted", "K4 read the faulted task");
		assert.equal(redrive.outcome, "completed", "the replacement ran");
		assert.equal(redrive.effects, 1, "the effect happened once");
		assert.equal(
			redrive.skipped,
			1,
			"the replacement skipped it by decision ID",
		);
	});

	test("K5 a then task that commits a new checkpoint before its wait outlives the restart limit", async () => {
		const seen = await untilAlive("bump", DEFAULT_RESTART_LIMIT + 2);
		const last = seen.at(-1) ?? {};
		assert.equal(seen.length, DEFAULT_RESTART_LIMIT + 3, JSON.stringify(seen));
		assert.equal(last.status, "running");
		assert.equal(
			last.entered,
			DEFAULT_RESTART_LIMIT + 3,
			"it entered its wait on every open",
		);
	});

	test("K6 killed inside the answer commit leaves it open with no task; killed after, both landed", async () => {
		await killed("answer", "inside");
		assert.deepEqual(await looked("answer", "look"), {
			decision: "open",
			continuation: false,
			tasks: 0,
		});
		await killed("answer", "after");
		assert.deepEqual(await looked("answer", "look"), {
			decision: "answered",
			continuation: true,
			tasks: 1,
		});
	});
});
