import assert from "node:assert/strict";
import { test } from "node:test";
import { failureOf, redact, WebkitError } from "../src/domain.ts";

test("known failures keep their kind and unknown failures hide provider text", () => {
	assert.deepEqual(
		failureOf(
			new WebkitError("quota", "Search quota exhausted", {
				retryAfterMs: 1000,
			}),
		),
		{
			kind: "quota",
			message: "Search quota exhausted",
			retryAfterMs: 1000,
		},
	);
	assert.deepEqual(failureOf(new Error("provider echoed sk-secret-value")), {
		kind: "network",
		message: "The web request failed.",
	});
});

test("caller cancellation stays distinct from an operation timeout", () => {
	const caller = new AbortController();
	caller.abort();
	assert.equal(failureOf(new Error("late"), caller.signal).kind, "cancelled");
	assert.equal(
		failureOf(new WebkitError("timeout", "The request timed out.")).kind,
		"timeout",
	);
	const deadline = new AbortController();
	deadline.abort(new WebkitError("timeout", "The request timed out."));
	assert.equal(failureOf(new Error("late"), deadline.signal).kind, "timeout");
});

test("secret protection covers complete, truncated and URL-encoded echoes", () => {
	const key = "sk-unit3-not-a-real-key";
	for (const text of [
		key,
		key.slice(0, 4),
		key.slice(0, 12),
		"sk%2Dunit3-not-a-real-key",
	])
		assert.equal(
			redact(`before ${text} after`, [key]),
			"before [redacted] after",
		);
	assert.equal(
		redact("Only sk- is ordinary text.", [key]),
		"Only sk- is ordinary text.",
	);
	assert.equal(redact("Readable content", ["", "abc"]), "Readable content");
	assert.equal(
		redact("Secret abc was echoed", ["abc"]),
		"Secret [redacted] was echoed",
	);
});

test("proxy secrets do not redact unrelated public URLs", () => {
	const proxy = "http://user:password@proxy.example:8000";
	assert.equal(
		redact("https://example.com/article", [proxy]),
		"https://example.com/article",
	);
	assert.equal(
		redact(`Failed to connect to ${proxy}`, [proxy]),
		"Failed to connect to [redacted]",
	);
});

test("ordinary provider examples and embedded short prefixes remain readable", () => {
	const text =
		"Commit 83f2a91 fixed the parser. TavilyClient(api_key=tvly-YOUR_API_KEY).";
	assert.equal(
		redact(text, [
			"3f2a638b-715c-4c48-8395-d1e89b035d3e",
			"tvly-real-private-provider-key",
		]),
		text,
	);
});

test("encoded key echoes are removed even when unrelated percent encoding is malformed", () => {
	assert.equal(
		redact("Page 100% ready. sk%2Dunit3-not-a-real-key. Keep this paragraph.", [
			"sk-unit3-not-a-real-key",
		]),
		"Page 100% ready. [redacted]. Keep this paragraph.",
	);
});
