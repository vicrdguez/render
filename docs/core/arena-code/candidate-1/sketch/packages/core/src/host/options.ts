/**
 * An extension's options, as the host sees them (docs/core/host.md, "Options per project").
 *
 * The host stores nothing. It reaches the values through the module's `options` contract, checks what a client sends
 * at this boundary with pi-schema, and knows two format names: `model` and `secret`. It never reads a key's meaning and
 * never decides which conversation an option governs.
 */

import type { Context } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import type { JsonObject, Tx } from "@earendil-works/pi-durable";
import type { FormatCheck, JsonSchema, ValidationError } from "@earendil-works/pi-schema";
import type { OptionsContract } from "../module.ts";
import type { HostState } from "./host.ts";
import type { OpenProject } from "./project.ts";
import type { Outcome } from "./refusals.ts";

/** The formats the host checks. `model`: the server has it. `secret`: any string, never returned to a client. */
export function formats(models: Models): Readonly<Record<string, FormatCheck>> {
	void models;
	throw new Error("not implemented");
}

/** One row of the `options` call. A set secret travels as `true` (extensions.md, "Options and secrets"). */
export type OptionsItem = {
	readonly extension: string;
	readonly schema: JsonSchema;
	readonly value: JsonObject; // the keys that are set, secrets as `true`
	readonly errors: readonly ValidationError[]; // what is still wrong, missing keys included
};

/** The `options` call: one commit that writes nothing, over each listed extension that has options. */
export async function readOptions(
	host: HostState,
	project: OpenProject,
	context: Context,
): Promise<Outcome<{ readonly items: readonly OptionsItem[] }>> {
	void [host, project, context];
	throw new Error("not implemented");
}

/**
 * The `setOptions` call, one commit, documents only (host.md, "What `setOptions` does"):
 * `get`, merge the patch (`null` removes a key), fill the schema's defaults and check with the formats, ignore
 * `required` errors so a client can set one key at a time, refuse anything else with `bad_options` and write nothing,
 * else `set` the merged keys. Only the keys that were set are stored.
 */
export async function setOptions(
	host: HostState,
	project: OpenProject,
	extension: string,
	patch: Readonly<Record<string, unknown>>,
	context: Context,
): Promise<Outcome<{ readonly value: JsonObject }>> {
	void [host, project, extension, patch, context];
	throw new Error("not implemented");
}

/**
 * What `create` checks before it makes a conversation of a workflow: the set keys over the defaults, with `required`
 * errors this time. Called inside `create`'s commit, before its table write.
 */
export async function errorsForCreate(
	options: OptionsContract,
	tx: Tx,
	models: Models,
): Promise<readonly ValidationError[]> {
	void [options, tx, models];
	throw new Error("not implemented");
}

/** The schema's `default` values. pi-schema never inserts a default by itself (packages/schema/README.md:74). */
export function defaultsOf(schema: JsonSchema): JsonObject {
	void schema;
	throw new Error("not implemented");
}
