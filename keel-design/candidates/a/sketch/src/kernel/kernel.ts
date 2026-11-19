/**
 * The kernel: keel's only contact with tau. It encodes each runtime property once.
 *
 * | Property (task.md)                                           | Mechanism here                                            |
 * | ------------------------------------------------------------ | --------------------------------------------------------- |
 * | A replayed tool call publishes once                          | `tool()`: receipt on the call's task, same commit         |
 * | A continuation created twice acts once                       | `keel.answer`: acts only if `asks[subject].decision` matches, and clears it in the same commit |
 * | A git effect is planned before it happens; reruns are safe   | effects are declared in lane state, recorded, then run by `keel.effect` through `repo` converge ops |
 * | Cancelling is durable before an agent stops                  | agents leave the declared set in the cancel commit; `keel.stop` tasks run after it is stored |
 * | A hash that matters comes from state or git                  | `Sha` is constructed only in `repo`; no tool schema has a hash field |
 * | Situations are recorded, not inferred                        | lanes keep one situation per subject; asks, inputs and effects derive from it |
 *
 * Commit order inside `transact`: phase A reads (table reads, documents) and runs the pure reductions; phase B
 * writes (documents, then entries, conversations, tasks, events). No phase-B step reads a table, and no kernel
 * commit submits; submission is always a later `keel.deliver` commit, which is also what tau requires after
 * creating a conversation.
 */
import type { DecisionInput } from "tau";
import type {
	AgentChange,
	ConversationId,
	Extension,
	ToolRegistration,
	Tx,
} from "tau/durable";
import type { RoleCatalog, RoleName } from "../roles/index.ts";
import type { AgentKey, EffectKey, LaneName, Scope, Token, WorkId } from "./ids.ts";
import type { EffectSpec, KernelEvent, Lane, World } from "./lane.ts";

// ---------------------------------------------------------------------------------------------------------------
// Tools

/** What the kernel knows about the agent calling a tool, from its binding and transcript. */
export type Self = {
	readonly agent: AgentKey;
	readonly role: RoleName;
	readonly conversation: ConversationId;
	readonly work: WorkId | null;
	readonly cwd: string;
	/**
	 * True when the latest input entry before this call is the owner's: a `pi.user` entry from the host's `input`
	 * call (a prompt, follow-up or steer). Keel's own inputs are `keel.input` entries, so this is structural, not a
	 * model's claim. Computed in phase A by scanning the conversation's entries backwards to the first input entry.
	 */
	readonly ownerInput: boolean;
	/** Principles this conversation pulled through the `principle` tool. */
	readonly pulled: readonly string[];
};

/** Read-only access outside the store for `observe`. Backed by `api.env.exec`. */
export type ObserveIO = {
	exec(argv: readonly string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }>;
};

/** Any lane tool, for the registry. */
export type AnyToolSpec = ToolSpec<never, never, unknown>;

export interface ToolSpec<P extends object, F, E> {
	readonly name: string;
	readonly description: string;
	readonly parameters: unknown /* pi-schema object for P */;
	/** The one list of who may call it. Role tool lists are derived from this. */
	readonly roles: readonly RoleName[];
	readonly lane: LaneName;
	/**
	 * `expectation`: refused unless the caller has an open expectation naming this tool (publish tools), with one
	 * exception: when the current run began with the owner's own message (`self.ownerInput`), the call reaches the
	 * lane, which may accept it and leave its situation. The owner acting directly therefore supersedes, and the
	 * derived decision for the old situation is withdrawn in the same commit.
	 * `binding`: any bound keel agent of an allowed role (record_ruling, file_finding).
	 * `adopt`: also accepted from an unbound ownerless conversation, which becomes a new piece of work (ground).
	 */
	readonly gate: "expectation" | "binding" | "adopt";
	/** Accepted calls end the run (`control.terminate`), so `afterRun` sees a settled situation. */
	readonly terminate: boolean | ((args: P) => boolean);
	/**
	 * Reads the world outside the store before the commit (git). Safe to repeat: it reruns on replay. `world` is built
	 * from committed snapshots; the reducer re-checks the facts against the state inside the commit.
	 */
	readonly observe?: (io: ObserveIO, self: Self, args: P, world: World) => Promise<F>;
	/** Pure: the lane event for this call. */
	readonly event: (args: P, facts: F, self: Self) => E;
}

// ---------------------------------------------------------------------------------------------------------------
// Construction

export type LaneRegistry = { readonly [L in LaneName]: Lane<L, object, unknown, unknown> };

export interface KernelConfig {
	readonly lanes: LaneRegistry;
	readonly tools: readonly AnyToolSpec[];
	/** Tools keel offers that do not move state: `principle`, `dispatch`, and the coding tools. */
	readonly plainTools: readonly ToolRegistration[];
	/** Literal prompt sections (`{ key, render }`), e.g. the principles index. */
	readonly sections: readonly unknown[];
	readonly roles: RoleCatalog;
}

export interface Kernel {
	/** The pi-durable extension: wrapped tools, the four kernel tasks (answer, effect, deliver, stop), sections. */
	readonly extension: Extension;
	/** Settings for a conversation `create` makes: the designer, unbound until its first `ground` call adopts it. */
	entry(tx: Tx): Promise<AgentChange>;
}

export function createKernel(config: KernelConfig): Kernel {
	// Validates at load (a failed import fails the extension): every role's derived tool list resolves, every lane's
	// tool spec names a lane in the registry, every RepoOp/dispatch kind has an executor (typed exhaustively).
	throw new Error("not implemented");
}

// ---------------------------------------------------------------------------------------------------------------
// The commit protocol (internal; shown for the scenario traces)

/** One input to a commit: a tool event, a kernel event, or a message. */
export type Delivery =
	| { readonly kind: "lane"; readonly scope: Scope; readonly lane: LaneName; readonly event: unknown }
	| { readonly kind: "kernel"; readonly scope: Scope; readonly lane: LaneName; readonly event: KernelEvent };

export type TransactResult =
	| { readonly kind: "applied"; readonly reply: string | null }
	| { readonly kind: "rejected"; readonly reason: string };

/**
 * Applies one delivery and every message it causes, then reconciles each touched lane. Runs inside the caller's
 * commit (tool `api.commit`, task `runtime.commit`).
 *
 * 1. Load states of the touched scope(s) and the kernel records; build `World`.
 * 2. Reduce the delivery; route `send` messages to their lanes (creating a piece of work for `{ new }`);
 *    repeat until no messages remain (at most 32 hops, else throw: a message loop is a bug).
 * 3. Write the changed lane states.
 * 4. Reconcile each changed lane (see `lane.ts`): asks -> request/withdraw; agents -> create/stop;
 *    expectations -> `keel.deliver`; effects -> `keel.effect`; mark undeclared planned effects `cancelled`.
 * 5. Emit notes as `keel.event` entries, naming any conversation created.
 */
export async function transact(tx: Tx, first: Delivery, now: number): Promise<TransactResult> {
	throw new Error("not implemented");
}

/**
 * Turns an unbound ownerless conversation into a new piece of work: records `works[id]`, the anchor's binding
 * (`designer`, design lane), the work record, and initial lane states with the owner's first `pi.user` entry as the
 * prompt. Called by an `adopt`-gated tool before its event is reduced. Table reads (`scanEntries` for the prompt)
 * happen here, in phase A.
 */
export async function adopt(tx: Tx, conversation: ConversationId, now: number): Promise<WorkId> {
	throw new Error("not implemented");
}

// ---------------------------------------------------------------------------------------------------------------
// Kernel tasks. Each is short-lived; no keel task outlives one step of the workflow, so an upgrade rarely meets a
// live task of an old shape. Long-lived state is only in versioned documents.

/** `then` of every keel decision. Phase `apply`: one commit; acts only if `asks[subject].decision === input.decision`. */
export type AnswerInput = DecisionInput<string>;

/**
 * Runs one declared effect. Phases: `run` (execute through repo/dispatch, then one commit that records the result
 * and delivers `effect_done`), `wait` (sleeping backoff after a failure; three attempts, then `effect_failed`).
 * A rerun after a crash repeats `run`; repo ops converge, dispatch finds its children.
 */
export type EffectInput = {
	readonly scope: Scope;
	readonly lane: LaneName;
	readonly key: EffectKey;
	readonly spec: EffectSpec;
};

/**
 * Submits one rendered input and watches it settle.
 *
 * Phase `submit`: obtain the handle, then one commit that re-reads the agent record, ends the task if `token` is no
 * longer open, reconfigures the agent from current options and role prose (model, cwd, instructions), and submits
 * `{ type: "input", content, requestId: token, entry: { kind: "keel.input", data: { token } } }`; checkpoint `watch`.
 *
 * Phase `watch`: submit again with the same `requestId` (tau returns the existing submission, so this also works
 * after a restart) and wait for it to settle. If the token is still open when it settles, the agent owes a tool call:
 * `done` (it answered without calling) or `unanswered` (the run failed). First time per token: deliver the fixed nudge
 * `inputs/owed.md` (a `continue` when the run failed). Second time: deliver `agent_stalled` to the owning lane.
 * `unanswered` with reason `aborted` is neither: someone stopped the agent (the owner from a client, or keel pausing
 * it), so the watcher ends quietly and the token stays open until the owner or keel moves it.
 * This replaces any `afterRun` hook: one mechanism covers answered-without-hand-off and failed runs.
 */
export type DeliverInput = {
	readonly scope: Scope;
	readonly agent: AgentKey;
	readonly token: Token;
	readonly text: string;
	readonly nudge: boolean;
};

/**
 * Aborts the ordinary work (`conversation.abort` without `background`) of conversations whose agents were retired
 * or paused. Created in the commit that retired or paused them, so it runs only after that commit is stored.
 */
export type StopInput = { readonly conversations: readonly ConversationId[] };
