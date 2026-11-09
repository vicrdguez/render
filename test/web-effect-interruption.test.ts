import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { research } from "../src/engine/web.ts";
import { webHttpFixture } from "./support/web-http.ts";

for (const provider of ["exa", "tavily"] as const)
	test(`interrupting ${provider} research never admits another charged request`, { timeout: 10000 }, async () => {
		const reached = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const completed = Promise.withResolvers<void>();
		const http = await webHttpFixture(async (path) => {
			if (!path.startsWith(`/${provider}`)) return { status: 429, body: { error: "rate limit" } };
			reached.resolve();
			await release.promise;
			completed.resolve();
			return { status: 429, body: { error: "rate limit" } };
		});
		const fiber = Effect.runFork(
			research(
				{
					exaKey: "fixture",
					tavilyKey: "fixture2",
					exaBaseUrl: `${http.url}/exa`,
					tavilyBaseUrl: `${http.url}/tavily`,
				},
				"search",
				["held", "later"],
				{ assignment: "assignment:fixture", generation: 1, attempt: "attempt:fixture" },
				new AbortController().signal,
				() => true,
			),
		);
		try {
			await reached.promise;
			await Effect.runPromise(Fiber.interrupt(fiber));
			assert.equal(fiber.pollUnsafe()?._tag, "Failure", "interruption is not a settled research observation");
			release.resolve();
			await completed.promise;
			await new Promise<void>((resolve) => setImmediate(resolve));
			assert.deepEqual(
				http.calls.map((call) => call.path),
				provider === "exa" ? ["/exa/search"] : ["/exa/search", "/tavily/search"],
				"neither fallback nor later input may run after interruption",
			);
		} finally {
			release.resolve();
			await Effect.runPromise(Fiber.interrupt(fiber));
			await http.close();
		}
	});
