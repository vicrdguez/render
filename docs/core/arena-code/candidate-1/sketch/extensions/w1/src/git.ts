/**
 * The outside effects of W1: Git, read and written from tasks and tools, never from the model's word. Before an outside
 * effect, store the plan; then look, act, and stop on a mismatch (workflows.md, "Rules for workflow authors").
 */

export type Worktree = {
	readonly path: string;
	readonly branch: string;
	readonly base: string;
	readonly baseSha: string;
};

/** What is at the planned path: nothing, the planned worktree, or something else. */
export async function inspectWorktree(plan: Worktree): Promise<"absent" | "planned" | "other"> {
	void plan;
	throw new Error("not implemented");
}

export async function createWorktree(repository: string, plan: Worktree): Promise<void> {
	void [repository, plan];
	throw new Error("not implemented");
}

/** The SHA of a branch's head, or of `HEAD` in a worktree that must be clean. */
export async function headSha(directory: string, ref: string): Promise<string> {
	void [directory, ref];
	throw new Error("not implemented");
}

/** `git diff <base>..<sha>` and `git show <sha>:<path>`, from Git objects, for the reviewer's tools. */
export async function diffAt(repository: string, base: string, sha: string): Promise<string> {
	void [repository, base, sha];
	throw new Error("not implemented");
}

export async function fileAt(repository: string, sha: string, path: string): Promise<string> {
	void [repository, sha, path];
	throw new Error("not implemented");
}
