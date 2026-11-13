/**
 * W1's entries and events. The chain of evidence is entries and Git objects, never the transcript (walk.md, "The chain
 * of evidence"). Each entry and event carries `text`.
 */

import type { ConversationId, EntryId } from "@earendil-works/pi-durable";
import { defineEntry } from "@earendil-works/pi-durable";

type Reply = { annotation: number; text: string };

/** V1, V2: a design. `replies` answers each annotation of the answer it follows (row 5). */
export const Design = defineEntry<{ text: string; replies: Reply[] }>("w1.design");
/** B1, B2: a build at a SHA. */
export const Build = defineEntry<{ text: string; design: EntryId; sha: string; fixes?: EntryId; replies: Reply[] }>(
	"w1.build",
);
/** R1, R2: a review of a build at its SHA. */
export const Review = defineEntry<{
	text: string;
	build: EntryId;
	sha: string;
	verdict: "pass" | "fail";
	findings: string[];
}>("w1.review");
/** M: the basis of the final decision. */
export const Merge = defineEntry<{
	text: string;
	design: EntryId;
	sha: string;
	build: EntryId;
	review: EntryId;
	branch: string;
}>("w1.merge");
/** The basis of a `stuck` decision: the agent's last message, or both SHAs when the branch moved. */
export const Stuck = defineEntry<{ text: string }>("w1.stuck");

type Event = { text: string; at: number; conversation?: ConversationId };

/** One kind per handoff a client shows. The event of the commit that first submits to a conversation names it. */
export const Moved = defineEntry<Event & { stage: string }>("w1.moved");
