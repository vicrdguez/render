import type { Context } from "tau/chord";
import type { DecisionId, DecisionInput, Annotation } from "tau";
import type { TaskId, Tx, EntryId, ConversationId, ToolExecutionApi, TaskRuntime } from "tau/durable";
import type { Lane, Seat } from "./seats.ts";
import type { Cause, Nonempty, Page, Ticket, Work } from "./facts.ts";

/** Domain modules have a write-side Tx: document access at ANY point; immutable pages with text
 * visible in open/history; only namespaced events. Table reads/submit are intentionally NOT here. */
export interface Turn {
  readonly doc: Tx["doc"];
  page<K extends string,T>(at:ConversationId, kind:K, text:string, value:T):Promise<Page<K>>;
  event(at:ConversationId, text:string, source:EntryId):Promise<void>;
  job<I>(def:DurableJob<I>, at:ConversationId, input:I):Promise<TaskId>;
  /** Creates and configures a closed ownerless role, registers membership before it is addressable.
   * Never submits here. An assignment is 1 current authority per actor; revoke before changing cwd. */
  seat(scope:Work|{queue:ConversationId}, settings:SeatSettings):Promise<ConversationId>;
  /** For accepted stand-alone queue builds; unlike seat(), establishes independent work membership. */
  startWork(source:EntryId):Promise<Work>;
  tell(at:ConversationId, situation:RenderedInput):Promise<Ticket>;
  offer<P>(draft:Offer<P>):Promise<void>;
  invalidate(slot:Slot):Promise<void>;
  cancel(work:Work, reason:string):Promise<void>;
}
export type ToolCall = {api:ToolExecutionApi; context:Context};
export type JobRun<I,S extends {phase:string}> = {runtime:TaskRuntime<I,S,null,object>; context:Context};
export type DurableJob<I> = ReturnType<typeof import("tau/durable").defineTask<I,{phase:string},null>>;
export type SeatSettings = {role:Seat; lane:Lane; cwd:string};
export type RenderedInput = {kind:string; role:string; facts:Readonly<Record<string,string>>;
  text:string; delivered:readonly {name:string;digest:string;via:"bound"|"triggered"}[]};
export type Slot = {address:ConversationId; key:string}; // subject = keel:<address>:<escaped key>
export type Offer<P> = {slot:Slot; purpose:P; basis:Page<"basis">; choices:Nonempty<string>;
  recommend:string; default:string; ends:string; authority:
    {kind:"assignment";witnesses:Nonempty<InputWitness>;ticket:Ticket}|{kind:"mark-inlet";desk:ConversationId}};
export type InputWitness = {actor:ConversationId; lastOwnerInput:EntryId|null};
export type Answer<P> = {id:DecisionId; basis:Page<"basis">; purpose:P; choice:string; annotations:readonly Annotation[]};
type FrozenResult = {entries:readonly EntryId[]; text:string};
/** Session singleton, registration-only. No replicated work stages. Role-local address doc avoids
 * scanning work roots to discover the principal/assignment of a tool invocation. */
type Directory = {roots:readonly Work[];queue:ConversationId|null};
type Address = {scope:{kind:"work";work:Work}|{kind:"queue";desk:ConversationId};role:Seat;lane:Lane};
type TurnBook = {receipts:Record<string,FrozenResult>; expected:Record<string,
  {kind:"arming"; offer:Offer<unknown>}|{kind:"open"; decision:DecisionId; offer:Offer<unknown>}>;
  tickets:Record<string,Ticket>; members:ConversationId[];
  life:{kind:"active"}|{kind:"cancelled"; cause:Cause; reason:string; stops:ConversationId[]}};
type DeliveryState = {phase:"prepare"; to:ConversationId; ticket:Ticket; input:RenderedInput} |
  {phase:"submit"; to:ConversationId; ticket:Ticket; input:RenderedInput; requestId:string} |
  {phase:"observe"; to:ConversationId; ticket:Ticket; requestId:string};
type QuestionState = {phase:"arm-after-idle"; slot:Slot; basis:Page<"basis">}
  | {phase:"watch-open"; slot:Slot; decision:DecisionId; witnesses:Nonempty<InputWitness>};
type StopState = {phase:"drain"; remaining:ConversationId[]};

/** Shared adapter for every publishing tool (including ruling, queue, citation reads): safe, sequential,
 * model-only. In ONE immediate api.commit: return first receipt if present; do ALL table reads and
 * validation, including source kind/stamp/authorization, before providing Turn. Reduce, cross desks,
 * enqueue consequences and save result atomically. Caller never decides if this is a replay. */
export async function publish<Args,Facts,R extends FrozenResult>(call:ToolCall, input:Args,
  read:(tx:Tx,i:Args)=>Promise<Facts>, apply:(turn:Turn,i:Facts)=>Promise<R>):Promise<R> {throw Error("not implemented")}

/** One versioned then task for Tau. Reads decision(tx,id), stamps, entries and active assignments BEFORE
 * table writes. Resolve purpose from expected slot, not choice text. Ignore/record obsolete answer;
 * by decision ID, never replacement task ID. Apply and receipt in same runtime.commit as terminal. */
export async function acceptAnswer<P>(input:DecisionInput<string>, run:JobRun<DecisionInput<string>,{phase:"accept"}>, apply:(answer:Answer<P>, t:Turn)=>Promise<void>):Promise<void> {throw Error("not implemented")}

/** Private arming/delivery/stop phases. Arm when offered actor returns successfully to idle with
 * unchanged input witness. No later internal input to a watched actor without invalidation.
 * Handle outside commit; configure then submit(tx) with immutable requestId/content in a LATER
 * commit after creation. On each resumed observe, reattach to same submission; no in-memory wake
 * is needed for progress. Failure/no publication -> visible recoverable interruption, no fake result. */
async function drive(state:DeliveryState|QuestionState|StopState, run:JobRun<unknown,DeliveryState|QuestionState|StopState>):Promise<void> {throw Error("not implemented")}
