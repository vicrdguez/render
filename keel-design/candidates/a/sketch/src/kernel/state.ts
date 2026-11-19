/**
 * Every record keel stores is defined here, so the version and migration story is one rule, not a habit.
 *
 * Rules, checked by `test/state.test.ts` over every `StateDef` the extension exports:
 * 1. A stored type has no optional properties. Absence is `null`. Adding a field therefore breaks the
 *    shape fixture below, which forces rule 2.
 * 2. Any change to a stored type bumps `version`. From version 2 on, `migrate` is required and converts every
 *    older version. pi-durable runs it on read and stores a new base at once.
 * 3. Each kind has a fixture file `test/state/<kind>.ts`: `current` (typed as the state, so it must compile)
 *    and `history: Record<version, unknown>` (the JSON of every older version). The test checks that the key
 *    paths of `current` equal the recorded paths for `version`, and that `migrate(history[v], v)` produces a
 *    value with the current paths.
 *
 * Entries keel writes (`keel.input`, `keel.basis`, `keel.event`) are never versioned: their data is append-only
 * and keel reads back only `keel.input.token` and `keel.basis.text`.
 */

export type StateScope = "session" | "conversation" | "task";

/** The pi-durable document token, as returned by `defineDoc`. Opaque to lanes. */
export type DocToken<S extends object> = { readonly kind: string; readonly __state?: S };

export interface StateDef<S extends object> {
	/** `keel.<name>`. */
	readonly kind: string;
	readonly version: number;
	readonly scope: StateScope;
	readonly doc: DocToken<S>;
	initial(): S;
}

export function defineState<S extends object>(definition: {
	readonly kind: `keel.${string}`;
	readonly version: number;
	readonly scope: StateScope;
	readonly initial: () => S;
	/** Required from version 2 on; converts any older stored value. */
	readonly migrate?: (value: unknown, fromVersion: number) => S;
	/** Store a full base every `n` changes, bounding replay. Default 64. */
	readonly checkpointEvery?: number;
}): StateDef<S> {
	// defineDoc({ kind, version, scope, history: "latest", fork: "initial", initial, migrate,
	//             checkpointWhen: (_value, _ops, info) => info.changesSinceBase >= n })
	throw new Error("not implemented");
}
