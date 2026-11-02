import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { research } from "../src/engine/web.ts";

// Observe Engine's mapping directly: revoking a role must not depend on it committing another tool output.
for (const provider of ["exa", "tavily"] as const)
	test(`B2/B3 in-flight ${provider} cancellation retains possibly-charged uncertainty`, { timeout: 10000 }, async () => {
		const reached = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const completed = Promise.withResolvers<void>();
		const calls: string[] = [];
		const server = createServer(async (req, res) => {
			for await (const _ of req) {
				/* Drain the actual SDK request. */
			}
			calls.push(req.url!);
			if (req.url!.startsWith(`/${provider}`)) {
				reached.resolve();
				await release.promise;
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ results: [], images: [] }));
				completed.resolve();
			} else {
				res.writeHead(429, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "rate limit" }));
			}
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const abort = new AbortController();
		try {
			const pending = research(
				{ exaKey: "fixture", tavilyKey: "fixture2", exaBaseUrl: `${base}/exa`, tavilyBaseUrl: `${base}/tavily` },
				"search",
				["cancel", "later"],
				{ assignment: "assignment:fixture", generation: 1, attempt: "attempt:fixture" },
				abort.signal,
				() => true,
			);
			await reached.promise;
			abort.abort();
			const result = await pending;
			const observation = result.inputs[0]!.observations.at(-1)!;
			assert.equal(observation.error, "CANCELLED");
			assert.equal(observation.outcome, "uncertain", "in-flight cancellation must retain possibly-charged uncertainty");
			assert.match(observation.uncertainty!, /settlement unconfirmed; possibly charged/);
			assert.equal(result.inputs[0]!.fallback, "canceled");
			assert.equal(result.inputs[1]!.observations.length, 0);
			assert.deepEqual(calls, provider === "exa" ? ["/exa/search"] : ["/exa/search", "/tavily/search"]);
			release.resolve();
			await completed.promise;
			assert.equal(result.status, "failure");
		} finally {
			abort.abort();
			release.resolve();
			server.closeAllConnections();
			await new Promise<void>((r) => server.close(() => r()));
		}
	});
