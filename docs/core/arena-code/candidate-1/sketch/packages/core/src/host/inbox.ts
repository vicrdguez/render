/**
 * The inbox: the open decisions of all projects, then each change (docs/core/protocol.md, "`inbox`").
 *
 * The value is `{ "<project>": { "<subject>": { id, title, requestedAt, conversation } } }`. The host watches each
 * store's open list (`watchOpen` in src/store/decision.ts) and puts the project's name in front of every path.
 * A project bound while the feed is open arrives as an `s` op (W7 of spikes/wire.mjs). If one store's watch fails,
 * the feed ends with `failed`; a project never just drops out.
 */

import type { Context } from "@earendil-works/chord/context";
import type { DeviceId } from "../store/decision.ts";
import type { Feed } from "./feed.ts";
import type { HostState } from "./host.ts";
import type { OpenProject } from "./project.ts";
import type { Outcome } from "./refusals.ts";

export async function inbox(host: HostState, device: DeviceId, context: Context): Promise<Outcome<Feed>> {
	void [host, device, context];
	throw new Error("not implemented");
}

/** `bind` calls this once the project is open, so every open inbox takes it in. */
export async function joinInboxes(host: HostState, project: OpenProject, context: Context): Promise<void> {
	void [host, project, context];
	throw new Error("not implemented");
}
