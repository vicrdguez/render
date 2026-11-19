/**
 * Identities keel stores. Every one is chosen by keel code from stored facts, never by a model.
 *
 * A lane names things in its own terms (an agent key, an effect key, a subject); the kernel maps those
 * names to tau's identities (conversation, task, decision). A lane therefore never holds an ID that only
 * exists after a table write, and its reducer stays pure.
 */
import type { ConversationId } from "tau/durable";

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** A piece of work is addressed by its anchor conversation: the designer conversation that `create` or the queue made. */
export type WorkId = Brand<ConversationId, "WorkId">;

/** The fixed set of lanes. Work lanes have one state per piece of work; project lanes have one per project. */
export type WorkLane = "design" | "build" | "verify";
export type ProjectLane = "queue" | "trunk";
export type LaneName = WorkLane | ProjectLane;

export type Scope = { readonly kind: "work"; readonly work: WorkId } | { readonly kind: "project" };

/**
 * A lane-chosen name for one agent, stable within its scope: `coordinator`, `item/i2/worker/1`, `item/i2/verifier`.
 * The kernel maps it to a conversation the first time the lane declares it.
 */
export type AgentKey = Brand<string, "AgentKey">;

/** A lane-chosen name for one planned external effect, unique within its scope: `item/i2/checkout/b3`. */
export type EffectKey = Brand<string, "EffectKey">;

/**
 * A lane-chosen name for one thing the owner may be asked about: `mandate`, `rider/r3`, `handover`, `triage/b2`.
 * The kernel turns it into the tau decision subject `keel:<scope>:<lane>:<local>`, so tau's "one open decision
 * per subject" is keel's "one open question per subject".
 */
export type SubjectLocal = Brand<string, "SubjectLocal">;

/**
 * One instance of an agent-facing situation: `${subject}@${seq}`. A lane bumps `seq` whenever it enters a new
 * situation that expects an agent. The token is the delivery's `requestId`, so a rerun cannot deliver twice and a
 * stale tool call cannot match a newer situation.
 */
export type Token = Brand<string, "Token">;

export function token(subject: string, seq: number): Token {
	throw new Error("not implemented");
}

/** `keel:<work id | project>:<lane>:<local>`; the only place the decision subject format is written. */
export function subjectKey(scope: Scope, lane: LaneName, local: SubjectLocal): string {
	throw new Error("not implemented");
}

/** Inverse of `subjectKey`; `null` for a subject keel did not write. */
export function parseSubject(
	subject: string,
): { scope: Scope; lane: LaneName; local: SubjectLocal } | null {
	throw new Error("not implemented");
}
