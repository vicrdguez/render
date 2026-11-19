/**
 * The contract between a lane and the kernel.
 *
 * A lane is a pure reducer over one stored state, plus three pure declarations derived from that state:
 * what it asks the owner (`asks`), which agents it keeps and what it expects from them (`agents`), and which
 * external effects it needs (`effects`). The kernel is the only code that touches `Tx`, decisions,
 * conversations, tasks, submissions and git. After every reduction it reconciles the world to the declarations:
 *
 * | Declaration appears           | Kernel does, in the same commit                                  |
 * | ----------------------------- | ---------------------------------------------------------------- |
 * | an ask (new subject or basis) | appends a basis entry and calls `request`                         |
 * | an ask disappears             | calls `withdraw`                                                  |
 * | an agent key                  | creates and configures its conversation, writes its binding      |
 * | an agent key disappears       | plans a `keel.stop` task (runs after the commit is stored)        |
 * | an agent becomes paused       | plans a `keel.stop` task; the conversation is kept for resuming  |
 * | an expectation token          | plans a `keel.deliver` task with the rendered input              |
 * | an effect key                 | plans a `keel.effect` task with the spec                          |
 *
 * So a situation is recorded once, in the lane's state, and every decision, input and effect follows from it.
 * A lane cannot forget to withdraw a decision, deliver an input twice, or start an effect it did not record.
 */
import type { Annotation, DecisionId } from "tau";
import type { DispatchJob, JobResult } from "../dispatch/index.ts";
import type { RepoOp, RepoResult, RepoInfo } from "../repo/index.ts";
import type { KeelOptions, RoleName } from "../roles/index.ts";
import type {
	AgentKey,
	EffectKey,
	LaneName,
	Scope,
	SubjectLocal,
	Token,
	WorkId,
} from "./ids.ts";
import type { StateDef } from "./state.ts";

export interface Lane<L extends LaneName, S extends object, E, V> {
	readonly name: L;
	readonly scope: "work" | "project";
	readonly state: StateDef<S>;
	/**
	 * Pure. Handles the lane's own tool events, messages from other lanes, and kernel events.
	 * Invariant: an `effect_done` for a key the state recorded is always recorded as a fact, whatever the current
	 * situation, because the effect happened.
	 */
	reduce(state: S, event: E | KernelEvent, world: World): Reduction<S>;
	/** The read-only face other lanes see. Lanes never read each other's state shape. */
	view(state: S): V;
	asks(state: S, world: World): readonly Ask[];
	agents(state: S, world: World): readonly AgentDecl[];
	effects(state: S, world: World): readonly EffectDecl[];
}

export type Reduction<S> =
	| {
			readonly kind: "next";
			readonly state: S;
			/** Delivered to the receiving lanes in the same commit, before reconciliation. */
			readonly send?: readonly Message[];
			/** Emitted as `keel.event` entries for the timeline. */
			readonly notes?: readonly Note[];
			/** Text for the model when the event came from a tool call. */
			readonly reply?: string;
	  }
	/** Validation failed. Nothing is written; a tool call gets an error result with `reason`. */
	| { readonly kind: "reject"; readonly reason: string };

/** A typed message for another lane. Built only by that lane's `inbox.ts` helpers. */
export type Message = {
	readonly to: LaneName;
	/** `{ new }` asks the kernel to create a piece of work (anchor conversation, records) and deliver there. */
	readonly work: WorkId | null | { readonly new: { readonly title: string } };
	readonly event: object;
};

export type Note = { readonly text: string; readonly agent: AgentKey | null };

export type Ask = {
	readonly subject: SubjectLocal;
	readonly title: string;
	readonly choices: readonly [string, ...string[]];
	/** Markdown the owner reads and annotates. A changed basis re-asks (tau supersedes the old decision). */
	readonly basis: string;
};

export type AgentDecl = {
	readonly key: AgentKey;
	readonly role: RoleName;
	/** Working directory; a change is applied before the next delivery. `null`: the repository root. */
	readonly cwd: string | null;
	/**
	 * A paused agent keeps its conversation, binding and worktree, but the kernel stops its current run when it becomes
	 * paused (a held item), after the commit that paused it is stored. It has no expectations while paused.
	 */
	readonly paused: boolean;
	readonly expects: readonly Expectation[];
};

export type Expectation = {
	readonly token: Token;
	/** Tool calls that answer this expectation. A gated tool is refused without one. */
	readonly tools: readonly string[];
	/** Renders the input for this situation, once, when it is first declared. `null`: already delivered by the owner. */
	readonly input: (() => string) | null;
};

export type EffectDecl = { readonly key: EffectKey; readonly spec: EffectSpec };

/** Everything outside the store keel does, planned before it happens. */
export type EffectSpec =
	| { readonly kind: "repo"; readonly op: RepoOp }
	| { readonly kind: "dispatch"; readonly jobs: readonly DispatchJob[] };

export type EffectResult =
	| { readonly kind: "repo"; readonly result: RepoResult }
	| { readonly kind: "dispatch"; readonly results: readonly JobResult[] };

/** Owner annotations, numbered 1..n in answer order. Every number gets a reply where the lane requires one. */
export type NumberedAnnotation = Annotation & { readonly n: number };

export type KernelEvent =
	| {
			readonly kind: "answered";
			readonly subject: SubjectLocal;
			readonly decision: DecisionId;
			readonly choice: string;
			readonly annotations: readonly NumberedAnnotation[];
	  }
	| { readonly kind: "effect_done"; readonly key: EffectKey; readonly result: EffectResult }
	/** After the kernel's retries. The lane decides whether to re-plan or hold. */
	| { readonly kind: "effect_failed"; readonly key: EffectKey; readonly error: string }
	/** An agent ended runs owing a tool call, after one automatic nudge. */
	| {
			readonly kind: "agent_stalled";
			readonly agent: AgentKey;
			readonly tokens: readonly Token[];
			readonly lastWords: string;
	  };

/** Read-only context for reducers and declarations. Preloaded by the kernel; no I/O. */
export interface World {
	readonly scope: Scope;
	readonly now: number;
	readonly options: KeelOptions;
	readonly repo: RepoInfo;
	/**
	 * Another lane's public view: a project lane, or a work lane of `work` (default: this scope's work). Project lanes
	 * name the work explicitly. `null` before it exists or when the work is closed. The kernel preloads, in phase A,
	 * the project lanes and the work lanes of every open piece of work (a handful), so this is a synchronous read.
	 */
	view<L extends LaneName>(lane: L, work?: WorkId): LaneViews[L] | null;
}

/**
 * Filled by the lane registry (`lanes/index.ts`) through declaration merging, so the kernel stays ignorant of lanes
 * while `world.view("design")` is typed.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by lanes/index.ts
export interface LaneViews extends Record<LaneName, unknown> {}
