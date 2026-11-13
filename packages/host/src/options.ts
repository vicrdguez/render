import type { Models } from "@earendil-works/pi-ai";
import type { JsonObject, JsonValue, Tx } from "@earendil-works/pi-durable";
import {
	compile,
	type JsonSchema,
	type ValidationError,
	type Validator,
} from "@earendil-works/pi-schema";
import type { ExtensionModule } from "./index.js";

type Contract = NonNullable<ExtensionModule["options"]>;
type Property = { readonly default?: JsonValue; readonly format?: unknown };

const propertiesOf = (schema: JsonSchema): Record<string, Property> => {
	if (typeof schema !== "object" || schema === null) return {};
	const properties = (schema as { properties?: unknown }).properties;
	return typeof properties === "object" && properties !== null
		? (properties as Record<string, Property>)
		: {};
};

/** Splits `provider/modelId` at the first slash. */
export function modelRef(value: string) {
	const cut = value.indexOf("/");
	return cut <= 0
		? undefined
		: { provider: value.slice(0, cut), modelId: value.slice(cut + 1) };
}

export const hasModel = (models: () => Models, value: string) => {
	const ref = modelRef(value);
	return ref !== undefined && models().getModel(ref.provider, ref.modelId) !== undefined;
};

/** The host's half of the options contract: checks with defaults filled, and replies with secrets hidden. */
export class Options {
	readonly #contract: Contract;
	readonly #check: Validator;
	readonly #defaults: JsonObject;
	readonly #secrets: ReadonlySet<string>;

	constructor(contract: Contract, models: () => Models) {
		this.#contract = contract;
		this.#check = compile(contract.schema, {
			formats: { model: (value) => hasModel(models, value) },
		});
		const properties = Object.entries(propertiesOf(contract.schema));
		this.#defaults = Object.fromEntries(
			properties.flatMap(([key, p]) =>
				p.default === undefined ? [] : [[key, p.default]],
			),
		);
		this.#secrets = new Set(
			properties.filter(([, p]) => p.format === "secret").map(([key]) => key),
		);
	}

	get schema(): JsonSchema {
		return this.#contract.schema;
	}

	/** The errors of the set keys with the defaults filled, missing keys included. */
	errors(value: JsonObject): ValidationError[] {
		return this.#check.errors({ ...this.#defaults, ...value });
	}

	hide(value: JsonObject): JsonObject {
		return Object.fromEntries(
			Object.entries(value).map(([key, v]) => [key, this.#secrets.has(key) ? true : v]),
		);
	}

	async view(tx: Tx): Promise<{ value: JsonObject; errors: ValidationError[] }> {
		const value = await this.#contract.get(tx);
		return { value: this.hide(value), errors: this.errors(value) };
	}

	async patch(
		tx: Tx,
		patch: Readonly<Record<string, unknown>>,
	): Promise<{ value: JsonObject } | { errors: ValidationError[] }> {
		const merged: JsonObject = { ...(await this.#contract.get(tx)) };
		for (const [key, value] of Object.entries(patch)) {
			if (value === null) delete merged[key];
			else merged[key] = value as JsonValue;
		}
		const errors = this.errors(merged).filter((e) => e.keyword !== "required");
		if (errors.length > 0) return { errors };
		await this.#contract.set(tx, merged);
		return { value: this.hide(merged) };
	}
}
