import type { JsonObject, Tx } from "@earendil-works/pi-durable";
import type { ValidationError } from "@earendil-works/pi-schema";
import type { ExtensionModule } from "./index.js";

export type OptionsView = {
	extension: string;
	schema: NonNullable<ExtensionModule["options"]>["schema"];
	value: JsonObject; // only set keys; secret is true, not its value
	errors: readonly ValidationError[];
};
/** Host owns external validation and redaction, never storage or meaning of keys. */
export async function inspectOptions(
	tx: Tx,
	name: string,
	module: ExtensionModule,
	availableModel: (value: string) => boolean,
): Promise<OptionsView> {
	// TODO get set keys, fill defaults only for validation, return missing errors.
	// TODO redact every secret before producing any response.
	throw new Error("not implemented");
}
export async function patchOptions(
	tx: Tx,
	module: ExtensionModule,
	patch: JsonObject,
	availableModel: (value: string) => boolean,
): Promise<
	| { value: JsonObject }
	| {
			refused: {
				code: "bad_options";
				message: string;
				errors: readonly ValidationError[];
			};
	  }
> {
	// TODO docs only: get -> merge patch (null deletes) -> defaults for check -> pi-schema.
	// TODO ignore required/missing only here; unknown keys and wrong model refuse without writes.
	// TODO set raw merged keys, NOT default-expanded keys; return redacted set keys.
	throw new Error("not implemented");
}
