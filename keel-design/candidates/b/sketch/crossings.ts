import type { ConversationId, EntryId } from "tau/durable";
import type { Work, Item, Page, HeldFor } from "./facts.ts";
import type { Turn } from "./turn.ts";
import type { DesignMessage, DesignExit } from "./design.ts";
import type { BuildMessage, BuildExit } from "./build.ts";
import type { VerifyMessage, VerifyExit } from "./verify.ts";
import type { QueueMessage, QueueExit } from "./queue.ts";
import type { Result } from "./repository.ts";

/** Not a persisted bus. This is an exhaustive switch of synchronous, bounded calls ON THE SAME
 * TURN. Lane owners mutate their own doc and return facts, not "go to stage X" instructions.
 * Transitions needing a table read not supplied by the origin schedule a background job with the
 * page reference before returning. Such a job loads the immutable page in its fresh read phase.
 * No polling lane status, generic workflow engine, global work-stage enum or replay of old events. */
export type Arrival = {to:"design";work:Work;message:DesignMessage}|{to:"build";work:Work;message:BuildMessage}
  |{to:"verify";work:Work;message:VerifyMessage}|{to:"queue";message:QueueMessage};
export type Departure = DesignExit|BuildExit|VerifyExit|QueueExit;
export async function deliver(arrival:Arrival,turn:Turn):Promise<void> {throw Error("not implemented")}
/** Mapping with policy (using one receiver's constructors, not an agent):
 * edition -> Build.edition (prepare coordinator edit; hold affected authority); plan-bound ->
 * Design.activate (binding edition and edited plan become visible together)
 * leave-open/follow-up/unapproved-precedent/note/rejected-handover -> Queue.file
 * item-ready/set-ready -> Verify.item/full
 * failed/conflict/item-installed/landed -> Build.rework/conflict/integrated/landed
 * stopped -> Build.pause + Queue.file, same turn
 * repair -> Build.discovery; hold/release -> Build.pause/release; revise -> Design.propose
 * direct-build -> allocate new Work, Design.ground w/authenticated prompt + checked reference (no arena)
 * design-work -> allocate new Work, Design.start; in-place revision always uses old Work.
 * Stops scoped to full-build closure gate don't pause every unrelated item.
 */
async function cross(work:Work|null,out:Departure,t:Turn):Promise<void> {throw Error("not implemented")}
/** Typed completion from journal, authenticated by operation, NOT a role tool. Select only by stored
 * intent purpose. Applied in same commit as operation receipt. Review checkout ready -> Verify.candidate;
 * worker ready -> brief + Build.brief-ready; worker seal -> Build.sealed; candidate -> verifying
 * the combination; slot install -> Verify.item-installed/trunk-installed. Mismatches/foreign paths
 * become visible interruptions with diagnostic evidence; no automatic destructive cleanup. */
export async function completed(result:Result,op:Page<"intent">,t:Turn):Promise<void> {throw Error("not implemented")}
