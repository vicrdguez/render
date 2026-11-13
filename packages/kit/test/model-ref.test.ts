import assert from "node:assert/strict";
import { test } from "node:test";
import { modelRef } from "tau-kit";

test("modelRef cuts at the first slash and keeps the rest of the model ID", () => {
	assert.deepEqual(modelRef("provider/model"), {
		provider: "provider",
		modelId: "model",
	});
	assert.deepEqual(modelRef("openrouter/anthropic/claude"), {
		provider: "openrouter",
		modelId: "anthropic/claude",
	});
});
