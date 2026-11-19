import type { AgentChange, ConversationId, Tx } from "tau/durable";
import type { ClosedChild, Job } from "./dispatch.ts";

export type Lane = "design"|"build"|"verify"|"queue";
export type Seat = "designer"|"coordinator"|"encoder"|"worker"|"verifier"|"integrator"|"investigator"|"sweeper"
  |"explorer"|"source-investigator"|"candidate-a"|"candidate-b"|"judge"|"challenger"|"prototype"|"diagnostician";
type LaneKey = `${Lane}Model`;
type SeatKey = `${Seat}Model`;
export type Settings = {model:string} & Partial<Record<LaneKey|SeatKey,string>>;
/** One typed roster: per seat role template, owning lane, tool definitions, allowed child seats and
 * cases/slot schemas. Generate closed format:model options (base -> lane -> seat override), extension
 * registrations, and prompt binding checks from it. A candidate seat's effective lane is its CALLING
 * lane. Each sub-role can be changed without changing the parent. Reviewer cannot equal actual author
 * model. Candidates must span families, judge differs from synthesizer; validate actual configured
 * provider/model against trusted family mapping, not provider alone. No silent fallback violating it. */
export async function settingsFor(tx:Tx,actor:ConversationId,lane:Lane,seat:Seat,cwd:string):Promise<AgentChange> {throw Error("not implemented")}
/** Dispatch resolver: no model-supplied cwd, tools, role prose, family, candidates or evidence.
 * Different child capabilities for each allowed situation; child-owned context read-only by default. */
export async function resolveChildren(tx:Tx,parent:ConversationId,jobs:readonly Job<Seat>[]):Promise<readonly ClosedChild[]> {throw Error("not implemented")}
