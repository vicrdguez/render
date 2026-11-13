/**
 * `role()` (docs/core/kit.md, "`role()`"). Unit 5: W1 rows 9 and 11 are its two callers.
 *
 * The missing form of `createConversation` with `agent` for code that runs inside a commit. When pi-durable gains it,
 * `role()` is deleted. What it adds is the type: the caller must name a model and an extension list.
 */

import type { AgentChange, ConversationId, ConversationOwnership, ModelRef, Tx } from "@earendil-works/pi-durable";

// ---- Copied from docs/core/kit.md. ---------------------------------------------------------------------------------

export type RoleSettings = AgentChange & {
	readonly model: ModelRef;
	readonly extensions: NonNullable<AgentChange["extensions"]>; // an exact list, or { add, remove } over the project default
};

/**
 * A conversation and its role in the caller's commit. A table write (`createConversation`), so the first input goes in
 * the next commit: `submit(tx, draft)` throws after a table write (P4).
 */
export async function role(tx: Tx, settings: RoleSettings, ownership: ConversationOwnership): Promise<ConversationId> {
	// const { id } = await tx.createConversation({ ownership });
	// await configure(tx, id, settings);
	// return id;
	void [tx, settings, ownership];
	throw new Error("not implemented");
}
