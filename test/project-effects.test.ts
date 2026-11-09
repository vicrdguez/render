// Project mirrors in Effects: real Git against local bare repositories as file:// remotes, and the owned fake GitHub
// for authenticated fetch and publication. No Ledger here: Engine passes project facts in each operation.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Effects } from "../src/effects/source.ts";
import type { ProjectFacts } from "../src/kernel/projects.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { git } from "./support/source.ts";

function commit(repo: string, text: string, parent?: string): string {
	const blob = git(repo, ["hash-object", "-w", "--stdin"], text).toString().trim();
	const tree = git(repo, ["mktree"], `100644 blob ${blob}\tvalue\n`).toString().trim();
	return git(repo, ["commit-tree", tree, ...(parent ? ["-p", parent] : [])], "Project fixture\n")
		.toString()
		.trim();
}
function advance(repo: string, text: string, branch = "main"): string {
	let parent: string | undefined;
	try {
		parent = git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])
			.toString()
			.trim();
	} catch {
		parent = undefined;
	}
	const next = commit(repo, text, parent);
	git(repo, ["update-ref", `refs/heads/${branch}`, next]);
	return next;
}
async function remotes(...names: string[]) {
	const root = await mkdtemp(join(tmpdir(), "render-projects-"));
	const repos = names.map((name) => {
		const repo = join(root, `${name}.git`);
		execFileSync("git", ["init", "--bare", "-q", repo]);
		return repo;
	});
	return { root, repos, close: () => rm(root, { recursive: true, force: true }) };
}
const run = Effect.runPromise;
async function files(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await files(path)));
		else if (entry.isFile()) out.push(path);
	}
	return out;
}

test("fetch observes the remote's current default branch, never a stale mirror ref", async () => {
	const r = await remotes("alpha");
	try {
		const repo = r.repos[0]!;
		const project: ProjectFacts = { id: "project:2", remote: `file://${repo}`, defaultBranch: "main" };
		const effects = new Effects({ root: join(r.root, "effects") });
		const first = advance(repo, "one\n");
		assert.deepEqual(await run(effects.perform({ type: "fetch", project })), { project: "project:2", branch: "main", commit: first });
		const second = advance(repo, "two\n");
		assert.deepEqual(await run(effects.perform({ type: "fetch", project })), { project: "project:2", branch: "main", commit: second });
		const source = await run(effects.perform({ type: "resolve", project, commit: second }));
		assert.equal(source.repository, "project:2", "sources name their project");
		assert.equal((await stat(join(r.root, "effects", "projects", "project:2.git"))).isDirectory(), true);
		const reopened = new Effects({ root: join(r.root, "effects") });
		const third = advance(repo, "three\n");
		assert.equal((await run(reopened.perform({ type: "fetch", project }))).commit, third, "a reopened mirror fetches again");
	} finally {
		await r.close();
	}
});

test("an unreachable remote fails the fetch with its reason; commits already mirrored stay resolvable", async () => {
	const r = await remotes("alpha");
	try {
		const repo = r.repos[0]!;
		const project: ProjectFacts = { id: "project:2", remote: `file://${repo}`, defaultBranch: "main" };
		const effects = new Effects({ root: join(r.root, "effects") });
		const pinned = advance(repo, "one\n");
		await run(effects.perform({ type: "fetch", project }));
		await rename(repo, `${repo}.gone`);
		await assert.rejects(run(effects.perform({ type: "fetch", project })), /fetch/);
		assert.equal((await run(effects.perform({ type: "resolve", project, commit: pinned }))).commit, pinned);
	} finally {
		await r.close();
	}
});

test("two projects keep separate mirrors: one project's commits are not readable through the other", async () => {
	const r = await remotes("alpha", "beta");
	try {
		const [a, b] = r.repos as [string, string];
		const alpha: ProjectFacts = { id: "project:2", remote: `file://${a}`, defaultBranch: "main" };
		const beta: ProjectFacts = { id: "project:3", remote: `file://${b}`, defaultBranch: "main" };
		const effects = new Effects({ root: join(r.root, "effects") });
		const onlyA = advance(a, "alpha\n");
		advance(b, "beta\n");
		await run(effects.perform({ type: "fetch", project: alpha }));
		await run(effects.perform({ type: "fetch", project: beta }));
		const source = await run(effects.perform({ type: "resolve", project: alpha, commit: onlyA }));
		await assert.rejects(run(effects.perform({ type: "read", project: beta, commit: onlyA })), "B's mirror lacks A's commit");
		await assert.rejects(run(effects.perform({ type: "resolve", project: beta, commit: onlyA })), "B's remote lacks A's commit");
		await assert.rejects(
			run(effects.perform({ type: "read", project: beta, commit: source.commit })),
			"a source is bound to its own project's mirror",
		);
		assert.deepEqual((await readdir(join(r.root, "effects", "projects"))).sort(), ["project:2.git", "project:3.git"]);
	} finally {
		await r.close();
	}
});

test("P7 each project publishes to its own remote's repository; another remote reports publication unsupported", async () => {
	const gh = await fakeGitHub({ owner: "octo", name: "alpha" });
	const r = await remotes("local");
	try {
		const betaRepo = gh.add("beta");
		const alpha: ProjectFacts = { id: "project:2", remote: `${gh.config.git}/octo/alpha.git`, defaultBranch: "main" };
		const beta: ProjectFacts = { id: "project:3", remote: `${gh.config.git}/octo/beta`, defaultBranch: "main" };
		const effects = new Effects({ root: join(r.root, "effects"), forge: gh.config });
		const published: Record<string, string> = {};
		for (const [project, repo] of [
			[alpha, gh.repo],
			[beta, betaRepo],
		] as const) {
			const base = advance(repo, `${project.id}\n`);
			const fetched = await run(effects.perform({ type: "fetch", project }));
			assert.equal(fetched.commit, base);
			await run(effects.perform({ type: "resolve", project, commit: base }));
			const proposal = `workflow:${project.id.split(":")[1]}`;
			const pushed = await run(
				effects.perform({ type: "publish", project, proposal, commit: base, expected: null, attempt: `push:${project.id}` }),
			);
			assert.equal(pushed.outcome, "applied", JSON.stringify(pushed));
			const created = await run(
				effects.perform({ type: "createProposal", project, proposal, title: project.id, body: "body", attempt: `pr:${project.id}` }),
			);
			assert.equal(created.outcome, "applied", JSON.stringify(created));
			published[project.id] = base;
		}
		assert.deepEqual(
			gh.pulls.map((p) => [p.head.repo.full_name, p.base.ref, p.title]),
			[
				["octo/alpha", "main", "project:2"],
				["octo/beta", "main", "project:3"],
			],
		);
		assert.equal(gh.branch("render/workflow-2"), published["project:2"]);
		assert.equal(gh.branch("render/workflow-3", "beta"), published["project:3"]);
		assert.equal(gh.branch("render/workflow-3"), null, "beta's proposal never lands on alpha");
		const local: ProjectFacts = { id: "project:4", remote: `file://${r.repos[0]}`, defaultBranch: "main" };
		advance(r.repos[0]!, "local\n");
		await run(effects.perform({ type: "fetch", project: local }));
		const seen = await run(effects.reconcile({ type: "publication", project: local, proposal: "workflow:4" }));
		assert.ok(
			Object.values(seen.capabilities).every((v) => v === false),
			"a non-GitHub remote supports no publication",
		);
	} finally {
		await gh.close();
		await r.close();
	}
});

test("a private remote authenticates with the forge token, which never lands in the mirror or a failure", async () => {
	const gh = await fakeGitHub({ owner: "octo", name: "private" });
	const r = await remotes();
	try {
		const project: ProjectFacts = { id: "project:2", remote: `${gh.config.git}/octo/private.git`, defaultBranch: "main" };
		const effects = new Effects({ root: join(r.root, "effects"), forge: gh.config });
		const head = advance(gh.repo, "private\n");
		assert.equal((await run(effects.perform({ type: "fetch", project }))).commit, head, "the fake refuses Git without the token");
		for (const path of await files(join(r.root, "effects")))
			assert.ok(!(await readFile(path)).includes(TOKEN), `${path} never holds the token`);
		const unauthenticated = new Effects({ root: join(r.root, "other") });
		await assert.rejects(run(unauthenticated.perform({ type: "fetch", project })), "without the forge there is no token");
		await gh.down();
		const failed = await run(Effect.flip(effects.perform({ type: "fetch", project })));
		assert.ok(!String(failed).includes(TOKEN), "a failure never carries the token");
	} finally {
		await gh.close();
		await r.close();
	}
});
