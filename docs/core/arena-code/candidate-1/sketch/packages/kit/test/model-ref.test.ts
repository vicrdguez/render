/** `modelRef()` (docs/core/kit.md). Unit 4. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { modelRef } from "../src/model-ref.ts";

test("modelRef cuts at the first /", () => {
	assert.deepEqual(modelRef("openrouter/anthropic/claude"), { provider: "openrouter", modelId: "anthropic/claude" });
});
