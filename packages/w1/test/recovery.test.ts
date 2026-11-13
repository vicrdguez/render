import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, repository } from "./setup.js";

const child = fileURLToPath(new URL("./fixtures/child.js", import.meta.url));

type Run = { signal: string | null; seen: Record<string, unknown> };

function run(scenario: string, dir: string, step: string): Promise<Run> {
	return new Promise((resolve, reject) => {
		execFile(
			process.execPath,
			[child, scenario, dir, step],
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

/** Runs the scenario until the process kills itself, then opens the same files again and returns what it saw. */
async function crashThenLook(scenario: string, prepare?: (repo: string) => void) {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), `tau-w1-${scenario}-`)));
	const repo = repository(dir);
	prepare?.(repo);
	const first = await run(scenario, dir, "first");
	assert.equal(first.signal, "SIGKILL", `${scenario} was killed`);
	const look = await run(scenario, dir, "look");
	assert.equal(look.signal, null, `${scenario} reopened`);
	return look.seen;
}

describe("W1 across a killed server, SQLite, SIGKILL", { concurrency: true }, () => {
	test("a publish killed after its commit and before its result keeps one entry and one decision", async () => {
		const seen = await crashThenLook("publish");
		assert.equal(seen.designs, 1, "one design entry");
		assert.equal(seen.design1, "open", "one decision, still open");
		assert.equal(seen.design2, null, "no twin decision");
		assert.deepEqual(seen.stages, ["design_review"], "one event");
		assert.equal(seen.designerRequests, 0, "no model request after reopen");
	});

	test("row 8 stores the plan before the worktree; the plan, not a changed option, decides the base", async () => {
		const seen = await crashThenLook("plan", (repo) => {
			git(repo, "checkout", "-q", "-b", "other");
			writeFileSync(join(repo, "other.txt"), "other");
			git(repo, "add", "-A");
			git(repo, "commit", "-qm", "Other");
			git(repo, "checkout", "-q", "main");
		});
		assert.equal(seen.worktrees, 2, "the repository and one worktree");
		assert.equal(seen.forkPoint, seen.base, "the worktree starts at main");
		assert.equal(seen.implementers, 1);
	});

	test("killed after the worktree exists and before its commit, prepare finds it and carries on", async () => {
		const seen = await crashThenLook("worktree");
		assert.equal(seen.worktrees, 2, "one worktree, not two");
		assert.equal(seen.forkPoint, seen.base);
		assert.equal(seen.implementers, 1, "one implementer");
	});

	test("G1 then a kill: the cut-off bash is not run again, and the model publishes the commit it finds", async () => {
		const seen = await crashThenLook("g1");
		assert.equal(seen.commitsOnBranch, 1, "git commit ran once");
		assert.deepEqual(seen.buildShas, [seen.head], "B1 names S1");
		const bash = seen.bash as { isError: boolean; text: string }[];
		assert.equal(bash.length, 1);
		assert.equal(bash[0]?.isError, true, "the model saw an error result");
	});
});
