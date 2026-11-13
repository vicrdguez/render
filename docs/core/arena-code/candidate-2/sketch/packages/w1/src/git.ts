import type { Plan } from "./work.js";

// Private outside-effect module. Uses real Git in tests, never a fake repository adapter.
// Shell tools remain pi-durable's. This module only prepares worktrees and reads Git evidence.
export async function inspectBase(
	workdir: string,
	base: string,
): Promise<string> {
	// TODO argv exec, validate Git-produced SHA. No shell interpolation of client/model input.
	throw new Error("not implemented");
}
export async function ensureWorktree(
	workdir: string,
	plan: Plan,
): Promise<"ready" | { mismatch: string }> {
	// TODO no path -> create; same path/branch/base -> reuse; else refuse and preserve all files.
	throw new Error("not implemented");
}
export async function publishedHead(
	path: string,
): Promise<{ sha: string; clean: boolean }> {
	throw new Error("not implemented");
}
export async function readPublished(
	path: string,
	sha: string,
	file: string,
): Promise<string> {
	throw new Error("not implemented");
}
export async function diffPublished(
	path: string,
	baseSha: string,
	sha: string,
): Promise<string> {
	throw new Error("not implemented");
}
