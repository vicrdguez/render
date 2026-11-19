/**
 * Convergence by finding, not by round. Pure; tests first.
 *
 * Rules:
 * - A block in verdict k with `repeats: m` is the same finding as block m of verdict k-1 in the same scope: its
 *   thread's `survived` goes up by one. `repeats` naming no block of the previous verdict rejects the verdict.
 * - A block without `repeats` opens a new thread. A previous thread not repeated is resolved.
 * - A thread that reaches `survived >= 2` stops automatic rework of its scope: a fresh diagnosis by another agent,
 *   then the queue (non-convergence), and the scope is held until the owner triages it. There is no round cap.
 * - Integration (merge conflicts, trunk) never produces a verdict, so it never counts.
 */
import type { ItemId } from "../build/public.ts";
import type { Thread, ThreadId, Verdict } from "./state.ts";

export type Convergence =
	| { readonly kind: "rework"; readonly threads: Readonly<Record<string, Thread>> }
	| { readonly kind: "diagnose"; readonly threads: Readonly<Record<string, Thread>>; readonly thread: ThreadId }
	| { readonly kind: "pass"; readonly threads: Readonly<Record<string, Thread>> }
	| { readonly kind: "invalid"; readonly reason: string };

export function converge(
	threads: Readonly<Record<string, Thread>>,
	previous: Verdict | null,
	verdict: Verdict,
	scope: "full" | ItemId,
	nextThread: () => ThreadId,
): Convergence {
	throw new Error("not implemented");
}

/** Validation of a verdict before it is recorded: blocks have grounds, harm blocks carry an edge case, pass has no block. */
export function validateVerdict(verdict: Omit<Verdict, "n" | "at" | "verifier">): readonly string[] {
	throw new Error("not implemented");
}
