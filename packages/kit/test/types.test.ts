import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	AgentChange,
	ConversationId,
	ConversationOwnership,
	JsonObject,
	ModelRef,
	Tx,
} from "@earendil-works/pi-durable";
import {
	type JsonSchema,
	obj,
	type Schema,
	str,
} from "@earendil-works/pi-schema";
import type { RoleSettings } from "tau-kit";
import * as kit from "tau-kit";

type ExpectedRoleSettings = AgentChange & {
	readonly model: ModelRef;
	readonly extensions: NonNullable<AgentChange["extensions"]>;
};
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const roleShape: Equal<RoleSettings, ExpectedRoleSettings> = true;
const roleCall: (
	tx: Tx,
	settings: ExpectedRoleSettings,
	ownership: ConversationOwnership,
) => Promise<ConversationId> = kit.role;
const modelCall: (value: string) => ModelRef = kit.modelRef;
const optionsCall: <T extends JsonObject>(
	extension: string,
	schema: Schema<T>,
) => {
	readonly schema: Schema<T>;
	get(tx: Tx): Promise<Partial<T>>;
	set(tx: Tx, value: Partial<T>): Promise<void>;
	read(tx: Tx): Promise<T>;
} = kit.options;

function compileContracts(tx: Tx) {
	const model = { provider: "local", modelId: "chosen" };
	// @ts-expect-error Every role must name its model.
	kit.role(tx, { extensions: [] }, { kind: "ownerless" });
	// @ts-expect-error Every role must name its extension selection.
	kit.role(tx, { model }, { kind: "ownerless" });
	// @ts-expect-error A null model is not a role model.
	kit.role(tx, { model: null, extensions: [] }, { kind: "ownerless" });
	// @ts-expect-error A null selection is not an explicit selection.
	kit.role(tx, { model, extensions: null }, { kind: "ownerless" });
	const render = kit.prose("/module", "instructions.md", ["pass", "contract"]);
	render({ pass: "2", contract: "C4" });
	// @ts-expect-error A declared fact is required.
	render({ pass: "2" });
	// @ts-expect-error Facts are strings.
	render({ pass: 2, contract: "C4" });
	const port = kit.options("workflow", obj({ model: str() }));
	const host: {
		readonly schema: JsonSchema;
		get(tx: Tx): Promise<JsonObject>;
		set(tx: Tx, value: JsonObject): Promise<void>;
	} = port;
	void host;
	// @ts-expect-error Stored keys follow the schema type.
	port.set(tx, { model: 42 });
}
void compileContracts;

test("emitted package exports exactly the four helpers with locked signatures", () => {
	assert.deepEqual(Object.keys(kit).sort(), [
		"modelRef",
		"options",
		"prose",
		"role",
	]);
	assert.equal(roleShape, true);
	assert.equal(roleCall, kit.role);
	assert.equal(modelCall, kit.modelRef);
	assert.equal(optionsCall, kit.options);
});
