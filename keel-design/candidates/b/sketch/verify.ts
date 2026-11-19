import type { ConversationId, EntryId } from "tau/durable";
import type { Commit, Evidence, ImmutableTarget, Item, Node, Nonempty, Page, ReviewSubject, Work } from "./facts.ts";
import type { Answer, Turn } from "./turn.ts";
import type { Closure, ItemRecord, PresentedFix } from "./build.ts";

export type BlockReason =
 | {kind:"failing-head";run:Page<"check">} | {kind:"mandate";node:Node;evidence:Evidence}
 | {kind:"weakened-check";path:string;baseline:Evidence;observed:Evidence}
 | {kind:"false-claim";claim:EntryId;refutes:Evidence} | {kind:"missing-probe";node:Node}
 | {kind:"supported-harm";zone:string;trigger:string;harm:string;evidence:Evidence};
export type Block = {id:Page<"block">;criterion:string; repro:Evidence; reason:BlockReason};
export type Note = {summary:string;evidence:Evidence; unlikely?:{failure:string;likelihood:string;complexity:string}};
export type Tripwire = {kind:"scrap";repetitions:Nonempty<Evidence>}|{kind:"weakened-check";old:Evidence;now:Evidence};
export type Observation = {block:Page<"block">; outcome:"resolved"|"survives"; evidence:Evidence};
export type Verdict = {target:ImmutableTarget; verifiedBy:ConversationId; checks:readonly Page<"check">[];
  prior:readonly Observation[]; notes:readonly Note[]; tripwires:readonly Tripwire[]; result:{kind:"pass"}|{kind:"blocked";blocks:Nonempty<Block>}};
type Thread = {block:Page<"block">;identity:{ruleOrProbe:string;observable:string};first:Page<"verdict">;
  attempts:readonly {fix:PresentedFix; verdict:Page<"verdict">;observed:Observation}[];
  status:"open"|"closed"|"diagnosing"|"with-owner"};
type ReviewDoc = {target:ImmutableTarget; assignment:ConversationId; history:readonly Page<"verdict">[];
  threads:Record<string,Thread>; situation:{kind:"first-pass"}|{kind:"repeat";fixes:readonly PresentedFix[]}
  |{kind:"diagnosis";blocks:Nonempty<Page<"block">>}|{kind:"passed";pass:Page<"verdict">}};
export type ReaderEvidence = {actor:ConversationId;actualModel:string;actualAuthorModels:readonly string[];
  receipts:readonly Page<"check">[];target:ImmutableTarget};
export type Handover = {work:Work;trunk:Commit;intent:string;landed:string;rulingsByCost:readonly Page<"ruling">[]; residualRisk:readonly string[]};
/** The compiler requires one situation renderer for each case, local to this lane. */
export declare const inputs: import("./library.ts").Cases<VerifyInput>;
export type VerifyInput = {kind:"review-item"|"review-set"|"review-item-combination"|"review-landing";target:ImmutableTarget}
 | {kind:"review-fixes";target:ImmutableTarget;prior:Page<"verdict">;fixes:readonly PresentedFix[]}
 | {kind:"fresh-diagnosis";thread:Page<"block">;attempts:readonly PresentedFix[]}
 | {kind:"hand-over";closure:Page<"closure">;at:Commit};
export type VerifyPurpose = {kind:"handover";page:Page<"handover">;at:Commit}
  |{kind:"tripwire";basis:Page<"stop">;subject:ReviewSubject};
export type VerifyMessage = {kind:"item";item:Item;submission:Page<"item-build">}
  |{kind:"full";work:Work;closure:Page<"closure">}
  |{kind:"candidate";target:ImmutableTarget;baselineChecks:readonly string[]}
  |{kind:"verdict";result:Verdict} |{kind:"diagnosed";blocks:Nonempty<Page<"block">>;diagnosis:EntryId}
  |{kind:"item-installed";record:ItemRecord}|{kind:"integration-conflict";subject:ReviewSubject;report:Page<"conflict">}
  |{kind:"trunk-installed";at:Commit;closure:Page<"closure">}|{kind:"handover";landed:string;risk:readonly string[]}
  |{kind:"answer";answer:Answer<VerifyPurpose>};
export type VerifyExit =
  | {kind:"failed";target:Item|Closure;verdict:Page<"verdict">;fixes:Nonempty<Page<"block">>}
  | {kind:"item-installed";record:ItemRecord}|{kind:"conflict";subject:ReviewSubject;report:Page<"conflict">}
  | {kind:"stopped";subject:ReviewSubject;stop:Page<"stop">;why:"convergence"|"scrap"|"weakened-check"}
  | {kind:"note";entry:Page<"note">;note:Note}
  | {kind:"rejected-handover";handover:Page<"handover">; missingCheck:string}
  | {kind:"landed";commit:Commit};
/** Verdict tool accepts claims/receipt IDs, NOT target identity; attach actual opening's target/model
 * and run receipts. Must cover required checks/rules and account for every prior block; pass only
 * with none open. Match repeated observation to existing stable block, not report wording. Count
 * distinct reviewed attempted fixes, NOT submissions for other findings, merge attempts or retries.
 * Second surviving fix freezes affected target and commissions a different diagnostician; only after
 * its evidence goes to queue. No limit on distinct findings/rounds. Subsequent review limited to
 * regressions/concrete harm (including still-open violations). Fresh checkout for each immutable
 * target, disposed after verdict. Land and Hand over are parts of this lane, not agent permissions. */
export async function receive(work:Work,m:VerifyMessage,t:Turn):Promise<readonly VerifyExit[]> {throw Error("not implemented")}

/** Pure convergence rule applied to completed observations only; no side effects or global round count. */
function nextThread(thread:Thread,fix:PresentedFix,observation:Observation,review:Page<"verdict">):Thread {throw Error("not implemented")}
