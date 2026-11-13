import type { Task, Tx, TypedEntry } from "@earendil-works/pi-durable";
import type { Decision, DecisionId } from "./types.js";

export type DecisionInput<C extends string> = {
	decision: DecisionId;
	choice: C;
};
export type RequestDraft<
	C extends string,
	S extends { phase: string },
	R,
	H extends object,
> = {
	subject: string;
	title: string;
	basis: TypedEntry<{ text: string }>;
	choices: readonly [C, ...C[]];
	conversation: Decision["conversation"];
	then: Task<DecisionInput<NoInfer<C>>, S, R, H>;
	requestedAt: number;
};

/** Documents only. Compare every draft field except requestedAt.
 * Never look up the basis in a table. Receipts remain the caller's responsibility.
 * docs/core/primitives.md, request table.
 */
export async function request<
	const C extends string,
	S extends { phase: string },
	R,
	H extends object,
>(tx: Tx, draft: RequestDraft<C, S, R, H>): Promise<Decision<C>> {
	// TODO read the subject slot and record; equal draft is a no-write return.
	// TODO supersede prior open record; allocate next per-subject number in documents.
	// TODO store then.definition.name, not its executable code. No emit here.
	throw new Error("not implemented");
}
export async function withdraw(tx: Tx, subject: string): Promise<void> {
	// TODO mark only the open record withdrawn and clear the subject slot.
	throw new Error("not implemented");
}
export async function decision(
	tx: Tx,
	id: DecisionId,
): Promise<Decision | undefined> {
	throw new Error("not implemented");
}
