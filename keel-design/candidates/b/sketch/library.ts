import type { ConversationId, Tx } from "tau/durable";
import type { Citation, Evidence, Page, Ticket } from "./facts.ts";
import type { RenderedInput, ToolCall } from "./turn.ts";

export type Principle = {name:string;scope:"keel"|"project";description:string;body:string;digest:string};
export type BindFacts = {stage:string;paths:readonly string[];events:readonly string[]};
export type Cases<U extends {kind:string}> = {[K in U["kind"]]:(at:string,scene:U & {kind:K})=>Promise<RenderedInput>};
export type Seen = {name:string;digest:string;actor:ConversationId;via:"pulled"|"bound"|"triggered"; at:Evidence};
export type PrincipleUse = {cited:Citation;delivery:Seen|null}; // missing delivery is evidence too
/** Literal extension.sections object delegates here before EACH request. Full stable sorted
 * name+description index iff principle tool is offered, else undefined. Read protected project files
 * from resolved current cwd (also after compaction); no dynamic body in index or shared mutable cache. */
export async function indexFor(cwd:string,offered:readonly string[]):Promise<string|undefined> {throw Error("not implemented")}
/** One file per role and per explicit situation in src/prose; checked slot sets via tau prose().
 * Frozen rendered text is durable before first submission. Bind by stage/role/path; trigger by
 * already-recorded event; both supply body+version to brief/input. Project playbooks resolved from
 * the same checkout. Verification receives ALL project statements plus project verification playbook. */
export function input<const S extends readonly string[]>(role:string,kind:string,slots:S):
  (cwd:string,facts:{[K in S[number]]:string},bind:BindFacts)=>Promise<RenderedInput> {throw Error("not implemented")}
/** Replay returns same stored body/digest even if file later changes. Use receipt wrappers for
 * delivery and publication; "cited" is not inferred from a pull. Never edits any prose file. */
export async function principle(call:ToolCall,ticket:Ticket,name:string):Promise<{body:string;seen:Page<"principle-seen">}> {throw Error("not implemented")}
export async function auditCites(tx:Tx,actor:ConversationId,refs:readonly Citation[]):Promise<readonly PrincipleUse[]> {throw Error("not implemented")}
