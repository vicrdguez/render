import type { ExtensionModule } from "tau";
import type { AgentChange, Extension, Tx } from "tau/durable";

/** At runtime these two declarations are values from defineExtension and tau.options("keel",schema).
 * Top-level work only installs definitions and checks packaged prose slots; no per-project state.
 * Tasks remain registered when no conversation selects Keel. No core changes or default extension edits. */
export declare const extension: Extension;
export declare const options: NonNullable<ExtensionModule["options"]>;
/** Doc reads only: host already did createConversation. Do not override the project's cwd.
 * Entry is designer on its first Ground input. Claim its Work ID lazily on first trusted tool turn,
 * not in entry(tx), which has neither the new ID argument nor permission for a table read. */
export async function entry(tx:Tx):Promise<AgentChange> {throw Error("not implemented")}
