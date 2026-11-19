/**
 * Everything keel does to the working repository: git and the Mandate's check commands. Nothing else in keel runs
 * git or constructs a `Sha`.
 *
 * Every operation is a converge step, not a command: it reads what is on disk, decides whether the planned target
 * already holds, and acts only to reach it. A rerun after a crash therefore neither repeats an effect nor destroys
 * anything keel cannot prove is its own.
 *
 * Ownership proofs, checked before anything is changed or removed:
 * - A worktree or checkout keel made is locked with reason `keel <effect key>` (`git worktree add --lock --reason`).
 * - A commit keel made carries the trailer `Keel-Effect: <effect key>`.
 * - A branch keel made is in `keel/<work>/...` and is changed only by compare-and-swap from a hash keel recorded.
 * Anything that fails its proof is reported (`occupied`, `moved`), never reset or deleted.
 *
 * Keel never writes `main` (or the configured base). `land` refuses when trunk equals base.
 */
import type { Brand } from "../kernel/ids.ts";

declare const shaBrand: unique symbol;
/** A commit hash read from git by this module. No other module can make one. */
export type Sha = string & { readonly [shaBrand]: true };
export type BranchName = Brand<string, "BranchName">;

export type RepoInfo = {
	/** Absolute path of the project's working repository (the project workdir's toplevel). */
	readonly root: string;
	/** `git rev-parse --git-common-dir`; keel's worktrees live in `<commonDir>/keel/<work>/<name>`. */
	readonly commonDir: string;
	/** The branch agents own and builds land on (option `trunk`, default `trunk`). */
	readonly trunk: BranchName;
	/** The owner's branch (option `base`, default `main`). Read once to create trunk; never written. */
	readonly base: BranchName;
};

/** A command from the Mandate's Proof, run by keel itself at merge and landing. */
export type Check = { readonly id: string; readonly argv: readonly string[] };
export type CheckReport = { readonly id: string; readonly code: number; readonly tail: string };

/** A project principle read from `.keel/principles/*.md` in a worktree, as it stood at that commit. */
export type ProjectPrincipleFile = {
	readonly name: string;
	readonly description: string;
	readonly body: string;
	readonly bind: { readonly roles: readonly string[]; readonly paths: readonly string[] } | null;
};

export type RepoOp =
	/** Create trunk at base if absent, then the build branch at trunk's head. */
	| { readonly kind: "start_build"; readonly key: string; readonly branch: BranchName }
	/** A worker's worktree on a new item branch from `from`. */
	| {
			readonly kind: "worktree";
			readonly key: string;
			readonly path: string;
			readonly branch: BranchName;
			readonly from: BranchName;
	  }
	/** A verifier's detached checkout of a published commit. */
	| { readonly kind: "checkout"; readonly key: string; readonly path: string; readonly sha: Sha }
	/** Remove a checkout or worktree keel made (proof: lock reason), only if clean. */
	| { readonly kind: "remove"; readonly key: string; readonly path: string; readonly madeBy: string }
	/**
	 * Merge a verified item into the build branch in keel's integration worktree, run the checks on the result, and
	 * advance the branch by compare-and-swap from `expected`. One at a time per build (the Verify lane serializes).
	 */
	| {
			readonly kind: "merge_item";
			readonly key: string;
			readonly integration: string;
			readonly into: BranchName;
			readonly expected: Sha;
			readonly item: Sha;
			readonly checks: readonly Check[];
			readonly message: string;
	  }
	/** Take trunk into the build branch the same way; a no-op when trunk is already an ancestor. */
	| {
			readonly kind: "take_trunk";
			readonly key: string;
			readonly integration: string;
			readonly build: BranchName;
			readonly expected: Sha;
			readonly checks: readonly Check[];
	  }
	/**
	 * One commit on trunk with the tree of `combined` and parent `expectedTrunk`, then
	 * `update-ref trunk <new> <expectedTrunk>`. If trunk already has a commit with this key's trailer on
	 * `expectedTrunk`, that is the landing. Revertible as a unit because it is one commit.
	 */
	| {
			readonly kind: "land";
			readonly key: string;
			readonly expectedTrunk: Sha;
			readonly combined: Sha;
			readonly message: string;
	  };

export type RepoResult =
	| { readonly kind: "started"; readonly base: Sha }
	| {
			readonly kind: "worktree";
			readonly base: Sha;
			readonly principles: readonly ProjectPrincipleFile[];
	  }
	| { readonly kind: "checkout"; readonly playbook: string | null }
	| { readonly kind: "removed" }
	| { readonly kind: "kept"; readonly reason: string }
	| { readonly kind: "occupied"; readonly path: string }
	| { readonly kind: "merged"; readonly sha: Sha; readonly checks: readonly CheckReport[] }
	| { readonly kind: "combined"; readonly sha: Sha; readonly trunk: Sha; readonly checks: readonly CheckReport[] }
	| { readonly kind: "conflict"; readonly paths: readonly string[]; readonly against: Sha }
	| { readonly kind: "checks_failed"; readonly checks: readonly CheckReport[] }
	| { readonly kind: "moved"; readonly actual: Sha }
	| { readonly kind: "landed"; readonly sha: Sha };

export type Exec = (
	argv: readonly string[],
	cwd: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Executes one op to convergence. Called only by the kernel's `keel.effect` task. */
export async function converge(exec: Exec, repo: RepoInfo, op: RepoOp): Promise<RepoResult> {
	throw new Error("not implemented");
}

/**
 * Read-only: what a worker's publish would hand over. Used by `publish_build`'s `observe`.
 * `dirty`: uncommitted changes; `not_descendant`: HEAD does not contain the attempt's base.
 * `touched` lists changed paths matching `protectedGlobs` (the tripwire for weakened checks).
 */
export async function readPublishable(
	exec: Exec,
	worktree: string,
	base: Sha,
	protectedGlobs: readonly string[],
): Promise<
	| { readonly kind: "ok"; readonly sha: Sha; readonly touched: readonly string[] }
	| { readonly kind: "dirty"; readonly files: readonly string[] }
	| { readonly kind: "not_descendant" }
> {
	throw new Error("not implemented");
}

/** Read-only: the toplevel and common dir of the repository at `cwd`. Used when a piece of work is adopted. */
export async function readRepo(exec: Exec, cwd: string): Promise<{ root: string; commonDir: string }> {
	throw new Error("not implemented");
}

/** The single source of keel's on-disk layout. Paths include the effect key so a retry never collides with itself. */
export const layout = {
	worktree(repo: RepoInfo, work: string, name: string): string {
		throw new Error("not implemented");
	},
	integration(repo: RepoInfo, work: string): string {
		throw new Error("not implemented");
	},
	buildBranch(work: string): BranchName {
		throw new Error("not implemented");
	},
	itemBranch(work: string, item: string, attempt: number): BranchName {
		throw new Error("not implemented");
	},
};
