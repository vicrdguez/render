import type { Context } from "tau/chord";
import type { ToolExecutionApi, ToolRegistration, AgentChange, ConversationId, EntryId, TaskId, Tx } from "tau/durable";

/** Sole reusable interface. Supply a namespace, allowed seat names and a trusted resolver.
 * The caller supplies rendered inputs/settings, not arbitrary tool lists from the model.
 * Resolver sees parent identity to enforce stage permissions, minimum family diversity, common
 * arena frame, & cwd in caller code. No Keel type, disk path convention or lane import here. */
export type Job<S extends string> = {seat:S; question:string};
export type ClosedChild = {cwd:string;model:NonNullable<AgentChange["model"]>;instructions:string;
  extensions:readonly import("tau/durable").Extension[];tools:readonly ToolRegistration[];input:string};
export type Joined<S extends string> = {index:number;seat:S;child:ConversationId;model:string} &
  ({kind:"answer";entry:EntryId;text:string}|{kind:"unanswered";reason:string});
export type Roster<S extends string> = {namespace:string;toolName:string; seats:readonly S[];
  resolve(tx:Tx,parent:ConversationId,jobs:readonly Job<S>[]):Promise<readonly ClosedChild[]>};
export function dispatchTool<S extends string>(roster:Roster<S>):ToolRegistration {throw Error("not implemented")}

type Batch<S extends string> = {owner:TaskId;children:readonly {index:number;child:ConversationId;
  seat:S;model:string;input:string;requestId:string}[];joined:readonly Joined<S>[]|null};
/** Invocation-local fan-out, durable join evidence. One immediate commit resolves once, creates
 * ALL children owned by the pi.tool task, records ordered manifest in a versioned task document AND immutable parent entry listing each child.
 * Exact selections, clear inherited modelTools, reject selected dispatch tool/child caller even
 * on replay; no child-to-child relay. Outside commit submit separately with saved IDs and await
 * all settled; reopen same handle/submission on replay. Read answers by actual answer entry;
 * don't ask parent to relay their content. No drop on partial failure; preserve transcript + results
 * as immutable joined page in the parent before tool success (task documents retire). Codes distinguish invalid jobs, non-answer and interruption. Some children
 * may already have finished when interrupted. Ordinary enclosing abort cascades; no detached jobs. */
async function collect<S extends string>(b:Batch<S>,api:ToolExecutionApi,ctx:Context):Promise<readonly Joined<S>[]> {throw Error("not implemented")}
