import type { Commit, Tree, Item, Page, ReviewSubject, RulesUsed, Work } from "./facts.ts";
import type { JobRun, Turn } from "./turn.ts";

/** Domain requests, not shell commands. Only this module mints Commit/Tree and Git attestation.
 * No ref, cwd, arbitrary revision or commit hash accepted from an agent. Repo identity and trunk
 * ref are bound once per project; main, remote refs and checked-out foreign branches are never targets. */
export type Intent = {kind:"open-build";work:Work;base:Commit}
 |{kind:"open-worker";item:Item;from:Commit}
 |{kind:"seal-worker";item:Item;report:Page<"worker-report">;parent:Commit;fence:Page<"brief">}
 |{kind:"review-tree";subject:ReviewSubject;head:Commit}
 |{kind:"remove-tree";owned:Page<"tree-lease">}
 |{kind:"combine-item";item:Item;worker:Commit;on:Commit;pass:Page<"verdict">}
 |{kind:"combine-trunk";work:Work;build:Commit;on:Commit;closure:Page<"closure">}
 |{kind:"advance-build-to-combination";work:Work;old:Commit;combined:Commit;closure:Page<"closure">}
 |{kind:"install-item";candidate:Page<"candidate-commit">;proof:Page<"verdict">}
 |{kind:"install-trunk";candidate:Page<"candidate-commit">;proof:Page<"verdict">};
export type Lease = {work:Work;item?:Item;repoIdentity:string;privateRoot:string;path:string;
  nonce:string;registration:string;ref:string;base:Commit;purpose:"worker"|"review"|"resolve"};
export type CandidateCommit = {work:Work;subject:ReviewSubject;previous:Commit;candidate:Commit;
  tree:Tree;sources:readonly Commit[];rules:RulesUsed;operation:Page<"intent">};
type Reservation = {kind:"integration";item:Item;pass:Page<"verdict">}|{kind:"landing";work:Work;closure:Page<"closure">};
type Lock = {holder:Reservation|null; wait:readonly Reservation[]};
type GitBook = {repo:{gitCommonDir:string;identity:string;trunk:"refs/heads/trunk"};
  landing:Lock; integration:Record<string,Lock>; leases:Record<string,Lease>};
type Operation = {id:Page<"intent">;reservation:Reservation|null;repoIdentity:string;intent:Intent;ownedPaths:readonly string[];
  receiptRef:string; author:string; timestamp:number;
  state:{kind:"planned"}|{kind:"sealing";manifest:Page<"files">;privateIndex:string}|{kind:"materialized";expected:Commit|null;candidate:Commit;target:string}
   |{kind:"install-authorized";expected:Commit|null;candidate:Commit;target:string}
   |{kind:"done";result:Result}|{kind:"needs-inspection";observed:string}};
export type Result = {kind:"build-open";at:Commit}|{kind:"worker-open";item:Item;lease:Page<"tree-lease">}
 |{kind:"worker-sealed";item:Item;at:Commit;report:Page<"worker-report">}
 |{kind:"review-open";head:Commit;lease:Page<"tree-lease">}
 |{kind:"build-combined";work:Work;combined:Commit;trunkParent:Commit;closure:Page<"closure">}
 |{kind:"candidate";value:CandidateCommit}|{kind:"conflict";subject:ReviewSubject;report:Page<"conflict">}
 |{kind:"installed";value:CandidateCommit;proof:Page<"verdict">}|{kind:"removed";lease:Page<"tree-lease">};
/** Stage an exact recipe AND durable executor in this store commit. Worktree ownership witness
 * includes exclusive reserved path/marker + matching Git common-dir, registration, expected ref/head.
 * Never clean/reset/force-remove an unknown or dirty tree. Missing partial evidence -> stop. */
export async function plan(intent:Intent,t:Turn):Promise<Page<"intent">> {throw Error("not implemented")}
/** Private task: read plan -> inspect -> realize -> conditional publish. Create objects in private
 * namespace with frozen parents, tree, bytes, committer & time. Store candidate oid BEFORE updating a
 * named ref. Install target old->new AND create immutable operation witness ref in ONE native
 * update-ref transaction. Replay: witness=new -> acknowledge, not another merge; absent+old -> install;
 * any unexpected witness/ref/path -> quarantine. A later ref tip is not evidence of this operation.
 * Commit result + wake successor/release slot together. No timer lease steals a live install. */
async function reconcile(op:Operation,run:JobRun<{op:Page<"intent">},{phase:"inspect"|"prepare"|"install"|"ack"}>,
  complete:(result:Result,id:Page<"intent">,t:Turn)=>Promise<void>):Promise<void> {throw Error("not implemented")}
