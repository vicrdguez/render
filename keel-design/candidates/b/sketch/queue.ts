import type { DecisionId } from "tau";
import type { ConversationId, EntryId } from "tau/durable";
import type { Answer, Turn } from "./turn.ts";
import type { Approved, Evidence, FindingInput, HoldScope, Item, Node, Nonempty, Page, Selection, Work } from "./facts.ts";
import type { Proposal } from "./design.ts";

export type Origin = {kind:"owner";mark:Selection; answer:DecisionId;number:number}
  | {kind:"agent";actor:ConversationId;output:EntryId};
export type Finding = FindingInput & {source:Origin; context:{work?:Work;item?:Item;revision:Evidence;report?:EntryId}};
export type Route = {kind:"duplicate";of:Page<"finding">|Item}|{kind:"defect";work:Work;goal:string}
  |{kind:"determined";reference:Approved}|{kind:"precedent";nodes:Nonempty<Node>}
  |{kind:"wrong-mandate";proposal:Proposal}|{kind:"owner-stop";work:Work;affected:HoldScope;
  reason:"ambiguity"|"external-effect"|"convergence"|"scrap"|"weakened-check";recommendation:string};
export type Investigation = {finding:Page<"finding">;reproductionOrMeasure:Evidence;searchedQueue:readonly Page<"finding">[];
  searchedPlan:readonly Item[];size:string;cause:string;route:Route};
export type Batch = {oneCause:string;oneDecision:string;findings:Nonempty<Page<"finding">>;recommend:string;default:"build"|"defer"|"drop"};
/** The compiler requires one situation renderer for each case, local to this lane. */
export declare const inputs: import("./library.ts").Cases<QueueInput>;
export type QueueInput = {kind:"cheap-investigation";finding:Page<"finding">}|{kind:"batch-investigations";reports:Nonempty<Page<"investigation">>}
 |{kind:"periodic-sweep";trunk:Evidence;scope:readonly string[]}|{kind:"capture-override";by:DecisionId;original:EntryId};
export type Obligation = {source:DecisionId;contradicted:Evidence;state:{kind:"owed"}|{kind:"proposed";finding:Page<"finding">}
 |{kind:"encoded";evidence:Evidence}|{kind:"owner-deferred";decision:DecisionId}};
export type QueuePurpose = {kind:"triage";batch:Page<"batch">}|{kind:"mark-inlet";desk:ConversationId};
type Row = {kind:"new"}|{kind:"investigating";actor:ConversationId}|{kind:"investigated";report:Page<"investigation">}
 |{kind:"offered";batch:Page<"batch">}|{kind:"deferred";by:string}|{kind:"dropped";by:string}
 |{kind:"routed";destination:Work|Item|Page<"finding">};
type QueueDoc = {overrides:Record<string,Obligation>; rows:Record<string,Row>; address:ConversationId; lastSweep:{phase:"sleep";due:number;task:string}
  |{phase:"running";source:EntryId}};
export type QueueMessage = {kind:"file";finding:Finding}|{kind:"assess";result:Investigation}
  |{kind:"group";batch:Batch}|{kind:"answer";answer:Answer<QueuePurpose>}
  |{kind:"override";by:DecisionId;contradicted:Evidence}|{kind:"encoded";by:DecisionId;proof:Evidence}
  |{kind:"revisit";finding:Page<"finding">}|{kind:"sweep-due";at:number};
export type QueueExit =
  | {kind:"repair";work:Work;finding:Page<"finding">;goal:string}
  | {kind:"direct-build";finding:Page<"finding">;approved:Approved}
  | {kind:"design-work";finding:Page<"finding">;nodes:Nonempty<Node>}
  | {kind:"hold";work:Work;scope:HoldScope;cause:Page<"finding">}
  | {kind:"release";work:Work;scope:HoldScope;cause:Page<"finding">}
  | {kind:"revise";proposal:Proposal};
/** File is non-blocking and never a model's authority to change a contract. First do cheap how/why,
 * reproduce/measure, duplicate+plan search, classify+size. Only diagnosed wrong terms/explicit stops
 * hold named work. Ordinary demonstrated in-scope defects add work automatically. Investigator groups
 * same cause AND same disposition in a batch; reject incompatible destinations/held sets/overlap.
 * Build/defer/drop apply atomically to every member; defer/drop never approve a proposed rule.
 * A stop with no safe path remains explicitly suspended (or cancel affected work); never auto-resume
 * money movement or known wrong semantics. Weekly sweep uses the SAME filing path, no privileged fix. */
export async function receive(m:QueueMessage,t:Turn):Promise<readonly QueueExit[]> {throw Error("not implemented")}

/** Grouping itself is investigator judgment; this pure guard forbids contradictory or already-spent members. */
function eligible(batch:Batch,reports:readonly Investigation[],state:QueueDoc):boolean {throw Error("not implemented")}
