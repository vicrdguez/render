import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	AgentChange,
	Extension,
	JsonObject,
	Tx,
} from "@earendil-works/pi-durable";
import type { JsonSchema } from "@earendil-works/pi-schema";
import * as W1 from "../src/index.js";

// Copied from docs/core/extensions.md, "What an extension is".
type ExtensionModule = {
	readonly extension: Extension;
	readonly options?: {
		schema: JsonSchema;
		get(tx: Tx): Promise<JsonObject>;
		set(tx: Tx, value: JsonObject): Promise<void>;
	};
	readonly entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
};

test("the module is an ExtensionModule with entry, so the host treats it as a workflow", () => {
	const module: ExtensionModule = W1;
	assert.deepEqual(Object.keys(module).sort(), [
		"entry",
		"extension",
		"options",
	]);
	assert.equal(module.extension.name, "w1");
});

test("tool names carry no prefix; every publish is replay-safe, sequential, and for the model only", () => {
	const tools = W1.extension.tools ?? [];
	assert.deepEqual(
		tools.map((tool) => tool.name),
		[
			"publish_design",
			"publish_build",
			"show_diff",
			"show_file",
			"publish_review",
		],
	);
	for (const tool of tools.filter((t) => t.name.startsWith("publish_"))) {
		assert.equal(tool.replay, "safe", tool.name);
		assert.equal(tool.executionMode, "sequential", tool.name);
		assert.deepEqual(tool.callers, ["model"], tool.name);
	}
	assert.ok(
		(W1.extension.tasks ?? []).every((task) =>
			task.definition.name.startsWith("w1."),
		),
	);
	assert.equal(W1.extension.hooks?.length, 1);
});
