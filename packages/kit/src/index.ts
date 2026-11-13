import type {
	AgentChange,
	ConversationId,
	ConversationOwnership,
	JsonObject,
	ModelRef,
	Tx,
} from "@earendil-works/pi-durable";
import type { Schema } from "@earendil-works/pi-schema";

// Copied from docs/core/kit.md. Lands in unit 5, W1 rows 9 and 11.
export type RoleSettings = AgentChange & {
	readonly model: ModelRef;
	readonly extensions: NonNullable<AgentChange["extensions"]>;
};
export async function role(
	tx: Tx,
	settings: RoleSettings,
	ownership: ConversationOwnership,
): Promise<ConversationId> {
	// TODO createConversation({ownership}) -> configure -> return id; no submit in this commit.
	throw new Error("not implemented");
}

// Copied from docs/core/kit.md. Lands in unit 3, first caller web_search.
export function options<T extends JsonObject>(
	extension: string,
	schema: Schema<T>,
): {
	readonly schema: Schema<T>;
	get(tx: Tx): Promise<Partial<T>>;
	set(tx: Tx, value: Partial<T>): Promise<void>;
	read(tx: Tx): Promise<T>;
} {
	// TODO define ONE session doc <extension>.options holding only explicitly set keys.
	// TODO get/set operate through caller tx. read overlays schema defaults and validates.
	// Never make a commit, a timer, a project namespace, or a host dependency.
	throw new Error("not implemented");
}

// Copied from docs/core/kit.md. Lands in unit 4, W2 entry.
export function modelRef(value: string): ModelRef {
	// TODO split at FIRST slash, preserve every later slash.
	throw new Error("not implemented");
}

// docs/core/prose.md. Lands in unit 4, W2's agent instruction files.
export function prose<const S extends readonly string[]>(
	directory: string,
	file: string,
	slots: S,
): (facts: { [K in S[number]]: string }) => string {
	// TODO load synchronously when module loads. Reject missing/extra/undeclared slots.
	// TODO one-pass replacement. Slot-looking value text is not interpreted again.
	// No conditionals, includes or loops. Code selects among files.
	throw new Error("not implemented");
}
