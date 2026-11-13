import type { Context } from "@earendil-works/chord/context";
import type {
	ConversationId,
	EntryId,
	RunningTask,
	Task,
	TaskRuntime,
} from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-store";

export type Choice = "yes" | "no" | "void" | "not yet";
export type DueInput = { subject: string; forecast: EntryId; dueAt: number };
export type DuePhase = { phase: "sleep" } | { phase: "ask" };
export type ScoreInput = { decision: DecisionId; choice: Choice };
export type ScorePhase = { phase: "score" };

// Stored names and versions belong to this extension. Every created task is background in F.
// Declarations are intentional type sketches, not executable task definitions.
export declare const due: Task<DueInput, DuePhase, void, object>; // name w2.due, version 1
export declare const score: Task<ScoreInput, ScorePhase, void, object>; // name w2.score, version 1
export async function runDue(
	task: RunningTask<DueInput, DuePhase, void>,
	runtime: TaskRuntime<DueInput, DuePhase, void, object>,
	context: Context,
): Promise<void> {
	// TODO sleep checkpoint -> runtime.sleepUntil(dueAt,{phase:"ask"}).
	// TODO ask commit: latest forecast AND live timer must match; otherwise terminal, no writes.
	// TODO request yes/no/void/not yet on exact forecast entry; Book + event + terminal together.
	throw new Error("not implemented");
}
export async function runScore(
	task: RunningTask<ScoreInput, ScorePhase, void>,
	runtime: TaskRuntime<ScoreInput, ScorePhase, void, object>,
	context: Context,
): Promise<void> {
	// TODO read decision through decision(tx,id); require expected round and unscored latest forecast.
	// TODO yes/no Brier=(p-outcome)^2; Book + Resolved + terminal in same commit.
	// TODO void emits w2.voided; no score.
	// TODO not yet creates background due at answered.at + 7*24*60*60*1000, NEVER now()+7d.
	// TODO dedup by decision ID, including recreated then tasks after fault.
	throw new Error("not implemented");
}
