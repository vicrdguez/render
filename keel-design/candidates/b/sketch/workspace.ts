import type { ToolCall } from "./turn.ts";
import type { ConversationId } from "tau/durable";
import type { Commit, Evidence, Page, Ticket } from "./facts.ts";

/** Project's approved verification strategy, read at trusted base. Recipe IDs, not agent shell
 * strings. Run modified project code only in the project's designated isolated test environment,
 * no write-through .git, protected paths, credentials, live trading connection or host shell.
 * Keel does not implement a sandbox or claim NodeExecutionEnv is one. */
export type Recipe = {id:string;trustedSource:Evidence;argv:readonly string[];rules:readonly string[]};
export type Check = {recipe:Recipe;head:Commit;actor:ConversationId;exit:number;
  output:string; evidence:readonly Evidence[]; before:Commit; after:Commit};
type EditPlan = {call:string;lease:Page<"tree-lease">;files:readonly Edit[];status:"prepared"|"complete"|"mismatch"};
type RunPlan = {call:string;target:Commit;recipe:Recipe;scratch:string;status:"prepared"|"running"|"complete"|"interrupted"};
export type Edit = {relative:string;expectContentDigest:string|null;replacement:string|null};
export type Access = {ticket:Ticket;lease:Page<"tree-lease">;mode:
  {kind:"read-only"}|{kind:"encode";authorized:readonly string[]}
 |{kind:"tests-first";testPaths:readonly string[]}|{kind:"body";write:readonly string[];deny:readonly string[]}};
/** No raw write/edit/bash to any model. Resolve canonical paths against current lease/fence; deny
 * git admin/Keel prose/principles/bindings and protected proofs/scaffold, including indirect
 * paths/symlinks. Project playbooks read-only except an approved Encode extension of the verification
 * strategy. Test extension/Encode is a separate scoped assignment, sealed BEFORE body access.
 * No caller may grant itself fence exceptions. Compare expected file content or recognize own write;
 * an observed tests-after-code breach is a permanent note, not a demand to fake or redo history. */
export async function change(call:ToolCall,ticket:Ticket, edits:readonly Edit[]):Promise<Page<"edit">> {throw Error("not implemented")}
/** Worker run is evidence for development; never substitutes for verifier-owned runs. Verifier can
 * run additional authorized probes; receipt includes independent output on immutable target. A worker
 * pre-publication run materializes its working diff as a private immutable preview first.
 * Execute in scratch derived from that target; don't interpret model's shell transcript as a pass. */
export async function runCheck(call:ToolCall,ticket:Ticket,check:string):Promise<Page<"check">> {throw Error("not implemented")}
export async function inspect(call:ToolCall,ticket:Ticket,relative:string):Promise<string> {throw Error("not implemented")}
