import type { DecisionId } from "tau";
import type { EntryId } from "tau/durable";
import type { Answer, Turn } from "./turn.ts";
import type { Approved, Commit, Evidence, Item, Node, Nonempty, Page, Proof, Reply, Work } from "./facts.ts";

export type TaskShape = "bug"|"performance"|"precedent"|"new-design"|"investigation"|"refactor";
export type Ground = {shape:TaskShape; audit:readonly Evidence[]; gaps:readonly string[]; contradictions:readonly string[];
  authority:{kind:"determined"; references:Nonempty<Approved>; reproduce:string; predicate:string}
           |{kind:"sets-precedent"; frontier:Nonempty<Node>}};
export type Rationale = {problem:string; callersUsage:string; shape:string; synthesis:string;
  tradeoffs:readonly string[]; alternatives:readonly string[]; openQuestions:readonly string[]};
export type Candidate = {seat:string; family:string; answer:EntryId; rationale:Rationale; files:readonly {path:string;text:string}[]};
export type Experiment = {question:string; axis:string; decisionRule:string; plan:Page<"experiment">;
  observation:Evidence; conclusion:string; unasked:readonly string[]};
export type Arena = {prompt:Page<"frame">; candidates:readonly [Page<"candidate">,Page<"candidate">,...Page<"candidate">[]];
  judge:{report:EntryId;base:Page<"candidate">;unasked:readonly string[]}; experiments:readonly Experiment[];
  synthesis:{base:Page<"candidate">; grafts:readonly {part:string;from:Page<"candidate">}[];unasked:readonly string[]};
  challenge:{report:EntryId; resolution:string}};
export type Rider = {id:string; origin:"evidence"|"incidental"|"agent-seeded"; choice:string;
  changesLater:string; source:Evidence};
export type Disposition = {kind:"keep"|"drop"|"defer"|"design"; by:DecisionId; rider:string};
export type Authority = {kind:"reference"; ref:Approved}|{kind:"owner"; by:DecisionId};
export type LabeledNode<A = Authority> = {id:Node; layer:"direction"|"seam"|"contract"|"rule"|"proof"|"first-of-kind";
  claim:string; dependsOn:readonly Node[]; authority:A};
export type Seam = {node:Node; callersNow:readonly string[]; callersLater:readonly string[];
  usage:string; signatures:string; owner:string; mayImport:readonly string[]};
type MandateText<A> = {work:Work; previous:Page<"edition">|null; intent:string; done:string; precedence:readonly string[];
  content:{kind:"prompt"; original:EntryId; repro:string; references:Nonempty<Approved>}
    |{kind:"shaped"; rationale:Rationale; files:Candidate["files"]; nodes:readonly LabeledNode<A>[];
      seams:readonly Seam[]; rules:readonly {node:Node; claim:string; falsifier:string}[];
      never:readonly string[]; proof:readonly Proof[]; rounds:readonly Page<"round">[]}};
export type Edition = MandateText<Authority>;
export type Draft = MandateText<Authority|{kind:"proposed";reason:string}>;
export type Round = {node:Node; basedOn:Page<"edition">|null; support:{kind:"owner-direction";discussion:Nonempty<EntryId>}|{kind:"arena";arena:Page<"arena">}; draft:Page<"draft">;
  riders:readonly Rider[]; decisions:readonly DecisionId[]; replies:readonly Reply[]; dispositions:readonly Disposition[]};
export type Proposal = {work:Work; finding:Page<"finding">; changes:Nonempty<Node>; affected:readonly Item[]; intent:string};
export type NodeChoice = "approve"|"revise"|"new-arena:fresh"|"new-arena:seeded"|"decline"|`base:${number}`;
export type RiderChoice = "keep"|"drop"|"defer"|"design"|"decline";
export type DesignPurpose = {kind:"node"; node:Node; round:Page<"round">} |
  {kind:"rider"; round:Page<"round">; rider:string} | {kind:"direction"; node:Node};
type DesignState = {binding:Page<"edition">|null; proposals:readonly Proposal[];
  cursor:{kind:"ground"; ownerPrompt:EntryId}|{kind:"direction"; node:Node}|{kind:"shape"; node:Node; seed:Page<"candidate">|null}
       |{kind:"asking"; round:Page<"round">}|{kind:"revise"; prior:Page<"round">; answers:Nonempty<DecisionId>}
       |{kind:"approved-awaiting-plan"; edition:Page<"edition">}|{kind:"settled"; at:Page<"edition">}|{kind:"declined"; reason:DecisionId};
  history:readonly Page<"round">[]; priorArenas:readonly Page<"arena">[]};
/** Each arena/job artifact lands whole, independently of synthesis/join success. Node acceptance is
 * never blanket rider approval. A new edition requires all binding nodes and EACH rider accounted
 * for; rejected/deferred riders excluded; design-riders go back onto frontier. A changed rider
 * invalidates its disposition. Old rounds/bases and answers are immutable. */
/** The compiler requires one situation renderer for each case, local to this lane. */
export declare const inputs: import("./library.ts").Cases<DesignInput>;
export type DesignInput = {kind:"ground";prompt:EntryId}|{kind:"shape-node";node:Node;frame:Page<"frame">}
  | {kind:"reply-to-annotations"; round:Page<"round">;answers:Nonempty<DecisionId>}
  | {kind:"change-base"; candidate:Page<"candidate">}|{kind:"fresh-arena";node:Node}|{kind:"seeded-arena";round:Page<"round">}
  | {kind:"resolve-rider";rider:string;by:DecisionId}|{kind:"mandate-proposal";proposal:Proposal};
export type DesignMessage = {kind:"start";work:Work;prompt:EntryId}|{kind:"ground";report:Ground}
  |{kind:"propose"; proposal:Proposal}|{kind:"frame";node:Node;question:string;rubric:string[]}
  |{kind:"plan-experiment";node:Node;axis:string;question:string;decisionRule:string}
  |{kind:"submit-round";node:Node;support:{kind:"owner-direction";discussion:Nonempty<EntryId>}|{kind:"arena";arena:Arena};draft:Draft;riders:readonly Rider[];replies:readonly Reply[]}
  |{kind:"answer"; answer:Answer<DesignPurpose>}|{kind:"activate";approved:Page<"edition">};
export type DesignExit = {kind:"edition"; edition:Page<"edition">; previous:Page<"edition">|null;
  changed:readonly Node[]; from:readonly Page<"finding">[]}|
  {kind:"leave-open"; proposal:Proposal; why:string}|{kind:"follow-up"; finding:string; source:EntryId};
/** Receives only facts validated against frozen evidence. Ground follow-through is code, not another
 * router model. Bug/perf with an actual seam change is not a fast pass. Numbered replies cover all
 * annotations, including on approvals; changed terms require a new basis. */
export async function receive(work:Work, m:DesignMessage,t:Turn):Promise<readonly DesignExit[]> {throw Error("not implemented")}

/** Pure policy, private: is this exact proposed node ready to bind, not just free of open decisions? */
function settleNode(round:Round, current:Draft, annotations:readonly {decision:DecisionId;number:number}[]):LabeledNode<Authority> {throw Error("not implemented")}
