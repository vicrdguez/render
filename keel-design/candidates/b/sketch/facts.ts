import type { ConversationId, EntryId, TaskId } from "tau/durable";
import type { DecisionId } from "tau";

/** Store-local identities. A piece IS its ownerless design conversation. An item key is never project-global. */
export type Work = ConversationId & {readonly __work: unique symbol};
export type Item = { work: Work; key: string };
export type Node = string; // unique persistent label within one Mandate; never recycle retired labels
export type Page<K extends string> = EntryId & {readonly __kind: K};
export type Commit = string & {readonly __gitCommit: unique symbol};
export type Tree = string & {readonly __gitTree: unique symbol};
export type Nonempty<T> = readonly [T, ...T[]];
export type Cost = {severity: "local"|"cross-seam"|"money"|"irreversible"; costIfWrong: string};
export type Selection = {conversation: ConversationId; entry: EntryId; range?: {start:number;end:number}};
export type Evidence =
  | {kind:"git"; at:Commit; path:string; lines?:readonly [number,number]}
  | {kind:"record"; entry:EntryId}
  | {kind:"run"; run: Page<"check">};
export type Approved =
  | {kind:"mandate"; edition:Page<"edition">; node:Node}
  | {kind:"owner"; decision:DecisionId; reference:Evidence}
  | {kind:"project"; reference:Evidence; authority:Evidence}; // spec/check/pattern AND evidence of approval
export type Citation = {kind:"approved"; ref:Approved} | {kind:"unapproved"; pattern:Evidence}
  | {kind:"principle"; name:string; digest:string};
export type HoldScope = {kind:"items";items:Nonempty<Item>}|{kind:"closure";work:Work};
export type StoredPage<K extends string,T> = {v:1;kind:K;text:string;value:T};
export type HeldFor = {kind:"proposal"; finding:Page<"finding">} | {kind:"stop"; basis:Page<"stop">};
export type Proof = {id:string; rule:Node; check:string; rank:string; protectedPaths:readonly string[]};
export type RulesUsed = {edition:Page<"edition">; nodes:readonly Node[]};
/** A capability's generation changes on rebrief/hold/cancel. Carry into all queued tasks, even cleanup
 * (cleanup authenticates ownership rather than requiring an active worker). Not a global work-version. */
export type Ticket = {actor:ConversationId; assignment:Page<"assignment">};
export type FindingInput = {prompt:string; evidence:readonly Evidence[]; selection?:Selection;
  risk?:{failure:string;likelihood:string;complexity:string}};
export type ReviewSubject =
  | {kind:"item"; item:Item; submission:Page<"item-build">}
  | {kind:"item-combination"; item:Item; submission:Page<"item-build">; on:Commit}
  | {kind:"full"; work:Work; closure:Page<"closure">}
  | {kind:"landing"; work:Work; closure:Page<"closure">; on:Commit};
export type ImmutableTarget = {subject:ReviewSubject; head:Commit; rules:RulesUsed};
export type Reply = {decision:DecisionId; number:number; answer:string}; // one-based, order in Tau answer
export type Cause = {kind:"tool"; id:TaskId} | {kind:"answer"; id:DecisionId} | {kind:"job"; id:TaskId};
