import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createWebfox } from "webfox";

// Dependency diagnosis, not a successful Render fallback: only the external HTTP response is controlled.
test("B1/A1 supported root loses the invalid-request versus allowance distinction", async () => {
	let status = 400;
	let calls = 0;
	const server = createServer(async (req, res) => {
		for await (const _ of req) {
			// Drain the real SDK request.
		}
		calls++;
		res.writeHead(status, { "content-type": "application/json" });
		res.end(
			JSON.stringify(
				status === 200
					? {
							results: [],
							statuses: [{ id: "https://example.org/page", status: "error", error: { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 } }],
						}
					: { error: "Request rejected", tag: status === 400 ? "INVALID_REQUEST_BODY" : "NO_MORE_CREDITS" },
			),
		);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const client = createWebfox({
			cwd: "/",
			env: {},
			config: {
				execution: { retries: 0, concurrency: 1 },
				providers: {
					exa: { credentials: { api: { value: "fixture" } }, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` },
				},
			},
		});
		for (const capability of ["search", "contents"] as const) {
			const errors = [];
			for (status of [400, 402]) {
				const document =
					capability === "search"
						? await client.search({ provider: "exa", queries: ["fixture"] })
						: await client.contents({ provider: "exa", urls: ["https://example.org/page"] });
				const result = document.results[0]!;
				assert.equal(result.ok, false);
				if (result.ok) throw new Error("Expected provider refusal.");
				assert.deepEqual(result.error, { code: "PROVIDER_FAILURE", message: "Request rejected", retryable: false });
				errors.push(result.error);
				console.log(JSON.stringify({ capability, fixtureStatus: status, error: result.error }));
			}
			assert.deepEqual(errors[0], errors[1], "public errors collide for excluded invalid request and allowance refusal");
		}
		assert.equal(calls, 4, "one request per input without retries");

		status = 200;
		const page = await client.contents({ provider: "exa", urls: ["https://example.org/page"] });
		const missing = page.results[0]!;
		assert.equal(missing.ok, false);
		if (missing.ok) throw new Error("Expected missing page.");
		assert.deepEqual(missing.error, { code: "PROVIDER_FAILURE", message: "No content returned for this URL." });
		console.log(JSON.stringify({ category: "page", error: missing.error }));
		assert.equal(calls, 5);

		await assert.rejects(client.contents({ provider: "exa", urls: ["file:///private/example"] }), { code: "INVALID_INPUT" });
		assert.equal(calls, 5, "unsupported local scheme must be rejected before HTTP");
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
