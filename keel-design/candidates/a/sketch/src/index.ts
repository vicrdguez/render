/**
 * Keel's module contract for tau's host: `{ extension, entry, options }`. The composition root; nothing imports it.
 *
 * Top-level code only builds values: it reads prose files (through `prose()` in each lane's `texts.ts`) and
 * constructs the kernel. No durable write, no git, no network.
 */
import type { AgentChange, Tx } from "tau/durable";
import { createKernel } from "./kernel/kernel.ts";
import { dispatchTool } from "./dispatch/index.ts";
import { LANES, TOOLS } from "./lanes/index.ts";
import { principlesSection, principleTool } from "./principles/index.ts";
import { options as keelOptions, type RoleCatalog } from "./roles/index.ts";

declare const catalog: RoleCatalog; // built in roles/ from ROLES, prose/roles/*.md and the tool registry

const kernel = createKernel({
	lanes: LANES,
	tools: TOOLS,
	plainTools: [
		principleTool,
		dispatchTool({
			toolName: "dispatch",
			// seats(tx, caller): read the caller's binding and current options; catalog.seats(role, options)
			seats: async () => {
				throw new Error("not implemented");
			},
		}),
		// CodingTools' read, bash, edit, write are selected per role by name
	],
	sections: [principlesSection],
	roles: catalog,
});

export const extension = kernel.extension;
export const options = keelOptions;

/** A workflow: `create` makes an ownerless designer conversation; its first `ground` call adopts it as work. */
export async function entry(tx: Tx): Promise<AgentChange> {
	return kernel.entry(tx);
}
