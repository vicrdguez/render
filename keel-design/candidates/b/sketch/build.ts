import type { ConversationId, Tx } from "tau/durable";
import type { Citation, Commit, Cost, Evidence, HeldFor, HoldScope, Item, Node, Nonempty, Page, RulesUsed, Ticket, Work } from "./facts.ts";
import type { Turn } from "./turn.ts";
import type { DesignExit } from "./design.ts";
export type PresentedFix = {block:Page<"block">;submission:Page<"worker-report">};

export type Goal = {key:string; goal:string; needs:readonly string[]};
export type PlanEdit = {expect:number;forEdition:Page<"edition">; pending:readonly Goal[]}; // ordered full REPLACEMENT of pending only
export type Brief = {item:Item; goal:string; at:Commit; terms:RulesUsed; evidence:readonly Evidence[];
  fences:{read:readonly string[];write:readonly string[];protected:readonly string[]}; checks:readonly string[];
  stage:"encode"|"implementation"; playbook:string};
export type Ruling = Cost & {item:Item; why:string; decision:string; cites:Nonempty<Citation>};
export type Submission = {item:Item; ticket:Ticket; brief:Page<"brief">; head:Commit;
  rulings:readonly Page<"ruling">[]; report:string; fixes:readonly PresentedFix[]};
export type ItemRecord = {item:Item; goal:Goal; lastBuild:Page<"item-build">; workerHead:Commit;
  integrated:Commit; itemPass:Page<"verdict">; combinationProof:Page<"verdict">; brief:Page<"brief">};
type Active = {goal:Goal; worker:ConversationId; situation:{kind:"starting";base:Commit}|{kind:"building";brief:Page<"brief">}
  |{kind:"sealing";operation:Page<"intent">}|{kind:"reviewing";build:Page<"item-build">}
  |{kind:"fix-in-place";review:Page<"verdict">}|{kind:"resolve-integration";conflict:Page<"conflict">}
  |{kind:"paused"; interrupted:Page<"assignment">}
  |{kind:"rebrief"; prior:Page<"brief">; edition:Page<"edition">}};
type PlanDoc = {coordinator:ConversationId; serial:number; edition:Page<"edition">|null;
  pending:readonly Goal[]; active:Record<string,Active>; verified:Record<string,Page<"item-record">>;
  holds:readonly {scope:HoldScope;reason:HeldFor}[]; proposedEdits:readonly Page<"discovery">[];
  stage:{kind:"first-plan";approved:Page<"edition">}|{kind:"encode"}|{kind:"build"}|{kind:"replan"; from:Page<"edition">; into:Page<"edition">}
    |{kind:"checking-set"; closure:Page<"closure">}|{kind:"landed"; at:Commit}};
export declare const inputs: import("./library.ts").Cases<BuildInput>;
export type BuildInput = {kind:"encode";brief:Page<"brief">}|{kind:"implement";brief:Page<"brief">}
 | {kind:"plan";edition:Page<"edition">}|{kind:"plan-revision";edition:Page<"edition">;serial:number}
 | {kind:"fix-verdict";verdict:Page<"verdict">}|{kind:"resolve-conflict";conflict:Page<"conflict">}
 | {kind:"rebrief";old:Page<"brief">;current:Page<"brief">}|{kind:"repair-set";verdict:Page<"verdict">};
type WorkerDoc = {brief:Page<"brief">; rulings:Page<"ruling">[]; submissions:Page<"item-build">[];
  processNotes:Page<"breach">[]};
/** Bounded read projection for coordinator/planner, investigator duplicate search and replacement
 * coordinator. Never hand out mutable plan docs. Results include the serial for edits. */
export type PlanView = {serial:number;pending:readonly Goal[];active:readonly {goal:Goal;brief:Page<"brief">|null;reason:string}[];
  finished:readonly {goal:Goal;record:Page<"item-record">}[];discoveries:readonly Page<"discovery">[]};
export async function view(work:Work,read:Pick<Tx,"doc"|"entry">):Promise<PlanView> {throw Error("not implemented")}
export type Closure = {work:Work; edition:Page<"edition">; serial:number; buildHead:Commit; items:readonly Page<"item-record">[]};
export type BuildMessage =
  | Extract<DesignExit,{kind:"edition"}> | {kind:"revise-plan"; edit:PlanEdit}
  | {kind:"claim-ready"; key:string} | {kind:"brief-ready";brief:Brief}
  | {kind:"ruling";ruling:Ruling} | {kind:"report";report:string; addresses:readonly Page<"block">[]}
  | {kind:"sealed";head:Commit;report:Page<"worker-report">}
  | {kind:"rework"; target:Item|Closure; verdict:Page<"verdict">; fixes:Nonempty<Page<"block">>}
  | {kind:"integrated"; record:ItemRecord} | {kind:"conflict"; work:Work; item?:Item; conflict:Page<"conflict">}
  | {kind:"discovery";finding:Page<"finding">;goal:string}
  | {kind:"pause";scope:HoldScope; reason:HeldFor} | {kind:"release";reason:HeldFor;scope:HoldScope}
  | {kind:"close-plan"; expect:number} | {kind:"landed"; commit:Commit};
export type BuildExit = {kind:"plan-bound";edition:Page<"edition">} | {kind:"item-ready"; build:Page<"item-build">;item:Item}
  | {kind:"set-ready";closure:Page<"closure">;work:Work}
  | {kind:"unapproved-precedent";ruling:Page<"ruling">;item:Item};
/** Sole plan writer. Coordinator proposes goal/dependency edits, code checks expected serial, unique
 * stable keys, DAG, no dangling edges (including into active goals), no changes to non-pending
 * goals, no closure while holds/discoveries/unfinished items exist. For a pivot, keep only the affected
 * keys held. Installing coordinator's edit for the approved edition emits plan-bound on the same turn.
 * Recheck ready dependencies at start. Encode passes before fanout. In a one-item bug, encode is the first protected proof/test
 * step of that worker's item, not a second worker. No fabricated nodes for a paragraph mandate.
 * Only after a slot/worktree exists: render current head/files + edition into frozen brief; recheck
 * before issue. Paused workers keep their trees; old tickets cannot publish or install. A stale
 * edition blocks only an item depending on changed terms. Verified corrections get NEW keys. */
export async function receive(work:Work,m:BuildMessage,t:Turn):Promise<readonly BuildExit[]> {throw Error("not implemented")}

/** Pure validation: current version, untouched active/verified goals and acyclic full dependency graph. */
function replacePending(current:PlanDoc,edit:PlanEdit):readonly Goal[] {throw Error("not implemented")}
