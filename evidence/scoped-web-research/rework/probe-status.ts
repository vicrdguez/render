// Actual locked root library, no Render mapping or live provider. Run from repository root.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createWebfox } from "webfox";

let status = 402;
const server = createServer(async (req, res) => {
	for await (const _ of req) { /* Drain the actual request. */ }
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify({ error: "Account unavailable", tag: status === 402 ? "NO_MORE_CREDITS" : "FEATURE_DISABLED" }));
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
try {
	const client = createWebfox({
		cwd: "/", env: {},
		config: { execution: { retries: 0 }, providers: { exa: { credentials: { api: { value: "fixture" } }, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` } } },
	});
	for (const capability of ["search", "contents"] as const) {
		const errors: unknown[] = [];
		for (status of [402, 403]) {
			const result = capability === "search"
				? await client.search({ provider: "exa", queries: ["fixture"] })
				: await client.contents({ provider: "exa", urls: ["https://example.org"] });
			const value = result.results[0]!;
			assert.equal(value.ok, false);
			if (!value.ok) errors.push(value.error);
			console.log(JSON.stringify({ capability, httpStatus: status, result }));
		}
		assert.deepEqual(errors[0], errors[1], "locked root loses the status/tag distinction required by fallback");
	}
} finally {
	server.closeAllConnections();
	await new Promise<void>((r) => server.close(() => r()));
}
