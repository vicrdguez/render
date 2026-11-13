/**
 * W2's entry kinds and event kinds. Each carries `text`, so a client that knows no workflow shows it
 * (workflows.md, "A basis entry and an event carry `text`"). Kinds are stored names and carry the `w2.` prefix.
 */

import type { ConversationId, EntryId } from "@earendil-works/pi-durable";
import { defineEntry } from "@earendil-works/pi-durable";
import type { DecisionId } from "tau-core";

/** A forecast, in F. The basis of its decision. `replaces` names the version it revises (row 8). */
export const Forecast = defineEntry<{
	text: string;
	key: string;
	p: number;
	resolveBy: number;
	rule: string;
	replaces?: EntryId;
}>("w2.forecast");

type Event = { text: string; at: number; conversation?: ConversationId };

export const Recorded = defineEntry<Event & { forecast: EntryId }>("w2.recorded");
export const Revised = defineEntry<Event & { forecast: EntryId; replaces: EntryId }>("w2.revised");
export const Asked = defineEntry<Event & { forecast: EntryId; decision: DecisionId }>("w2.asked");
export const Rescheduled = defineEntry<Event & { decision: DecisionId; due: number }>("w2.rescheduled");
/** Read back by `calibration` (row 15). */
export const Resolved = defineEntry<
	Event & { forecast: EntryId; decision: DecisionId; p: number; outcome: 0 | 1; score: number }
>("w2.resolved");
export const Voided = defineEntry<Event & { forecast: EntryId; decision: DecisionId }>("w2.voided");
