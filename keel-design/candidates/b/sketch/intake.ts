import type { ConversationId, EntryId, Tx } from "tau/durable";
import type { DecisionId } from "tau";
import type { Selection, Work } from "./facts.ts";
import type { Finding } from "./queue.ts";

/** Client projection, not a new Tau transport. Native annotation ranges refer ONLY to their
 * Decision.basis. "Mark" anywhere else answers the project's nonblocking finding inlet: attach
 * the target selection + comment inside a range-less annotation. No generation, run-end hook
 * or model transcription is part of accepting a mark. */
export type Mark = {source:Selection;text:string};
export type OwnerMark = {kind:"inlet";decision:DecisionId;number:number}|{kind:"review";decision:DecisionId;number:number};
/** Before writes in the answer adapter, resolve authenticated answer + source entry. For a review
 * mark anchor to actual decision basis/range; for the inlet validate linked conversation/entry,
 * UTF-16 offsets against its display projection, quote and provenance from Keel/Git, not client.
 * Malformed links produce a correction basis, not a false filing or partial batch. One decision
 * and ordinal = one mark. Consume, Queue.file and re-arm the inlet on the same store line. */
export async function readFinding(tx:Tx,mark:OwnerMark):Promise<Finding> {throw Error("not implemented")}

export type OwnerInput = {kind:"direction";work:Work;entry:EntryId;text:string}
 |{kind:"cancel-work";work:Work;entry:EntryId}|{kind:"resume-interruption";entry:EntryId};
/** Trusted raw pi.user rows, separate from keel.input and from actual answers. Apply only explicit
 * workflow commands; other direct messages redirect the receiving role. Bound by caller's cursor. */
export async function placed(tx:Tx,conversation:ConversationId,after:EntryId|null):Promise<readonly OwnerInput[]> {throw Error("not implemented")}
