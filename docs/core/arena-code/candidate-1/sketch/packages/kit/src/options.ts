/**
 * `options()` (docs/core/kit.md, "`options()`"). Unit 3.
 *
 * One call defines one session document named `<extension>.options` in the store of whichever project the `tx` belongs
 * to. The document holds the keys that are set and nothing else. The extension's module exports the returned object as
 * its `options`; the host uses `schema`, `get`, and `set`, and the extension's own code uses `read`.
 */

import type { JsonObject, Tx } from "@earendil-works/pi-durable";
import type { Schema } from "@earendil-works/pi-schema";
import type { OptionsContract } from "tau-core";

export type Options<T extends JsonObject> = {
	readonly schema: Schema<T>;
	get(tx: Tx): Promise<Partial<T>>; // the keys that are set
	set(tx: Tx, value: Partial<T>): Promise<void>; // replaces the keys that are set
	read(tx: Tx): Promise<T>; // the set keys over the schema's defaults, checked
};

/**
 * @param extension the extension's name, which names the document
 * @param schema a closed pi-schema object, one top-level key per option. A new option ships with a `default`.
 */
export function options<T extends JsonObject>(extension: string, schema: Schema<T>): Options<T> {
	// TODO:
	//   Doc = defineDoc({ kind: `${extension}.options`, version: 1, scope: "session", initial: () => ({}), ... })
	//   get = copy of tx.doc(Doc); set = replace every key of the draft with `value`'s
	//   read = { ...defaults(schema), ...get } checked with compile(schema); throws when it does not fit, for example a
	//          key with no default that is unset. A `model` key is a string here; the host checked it when it was set.
	void extension;
	const missing = (): never => {
		throw new Error("not implemented");
	};
	return { schema, get: missing, set: missing, read: missing };
}

/** The kit's result is the host's contract. Fails to compile if the two drift apart. */
export type OptionsFitTheHost = Assert<Options<{ key: string }> extends OptionsContract ? true : false>;
type Assert<T extends true> = T;
