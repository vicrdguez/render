import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { promisify } from "node:util";
import type { Plan } from "./work.js";

const run = promisify(execFile);

/** Git with an argument list, never a shell. Rejects with Git's own message. */
async function git(cwd: string, ...args: string[]) {
	try {
		return (await run("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 }))
			.stdout;
	} catch (error) {
		const stderr = (error as { stderr?: string }).stderr?.trim();
		throw new Error(stderr || String(error));
	}
}

const SHA = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** The commit a ref names, checked to be a SHA that Git produced. */
export async function commitOf(cwd: string, ref: string) {
	const sha = (
		await git(cwd, "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`)
	).trim();
	if (!SHA.test(sha)) throw new Error(`Git named no commit for ${ref}.`);
	return sha;
}

/**
 * Row 9: no directory at the path, create the worktree; the planned worktree, carry on; anything else, say what is
 * there. Deletes nothing.
 */
export async function ensureWorktree(plan: Plan): Promise<string | undefined> {
	if (!existsSync(plan.path)) {
		try {
			await git(
				plan.repo,
				"worktree",
				"add",
				"-b",
				plan.branch,
				plan.path,
				plan.baseSha,
			);
			return undefined;
		} catch (error) {
			return `W1 could not create the worktree at ${plan.path}: ${(error as Error).message}`;
		}
	}
	const real = realpathSync(plan.path);
	const listed = (await git(plan.repo, "worktree", "list", "--porcelain"))
		.split("\n\n")
		.map((block) => block.split("\n"));
	const found = listed.find((lines) => lines[0] === `worktree ${real}`);
	if (found === undefined)
		return `${plan.path} exists and is not a worktree of ${plan.repo}. W1 deleted nothing.`;
	if (!found.includes(`branch refs/heads/${plan.branch}`))
		return `The worktree at ${plan.path} is not on branch ${plan.branch}. W1 deleted nothing.`;
	try {
		await git(plan.path, "merge-base", "--is-ancestor", plan.baseSha, "HEAD");
		return undefined;
	} catch {
		return `The worktree at ${plan.path} does not start at ${plan.baseSha}. W1 deleted nothing.`;
	}
}

/** Row 11: the head of the plan's branch in a clean worktree, or why there is none to publish. */
export async function publishedHead(
	plan: Plan,
): Promise<{ sha: string } | { refused: string }> {
	if ((await git(plan.path, "status", "--porcelain")).trim() !== "")
		return {
			refused:
				"The worktree has changes that are not committed. Commit them, then publish.",
		};
	const branch = (
		await git(plan.path, "rev-parse", "--abbrev-ref", "HEAD")
	).trim();
	if (branch !== plan.branch)
		return { refused: `Check out ${plan.branch} before you publish.` };
	return { sha: await commitOf(plan.path, "HEAD") };
}

/** Row 19: where the plan's branch points now. */
export const branchHead = (plan: Plan) =>
	commitOf(plan.repo, `refs/heads/${plan.branch}`);

/** Git objects only: the published commit against the plan's base. */
export const diffAt = (plan: Plan, sha: string) =>
	git(plan.repo, "diff", plan.baseSha, sha, "--");

export const fileAt = (plan: Plan, sha: string, path: string) =>
	git(plan.repo, "cat-file", "blob", `${sha}:${path}`);
