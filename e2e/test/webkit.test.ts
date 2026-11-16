import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { until } from "./journey.ts";
import { processJourney } from "./process-journey.ts";

test("webkit searches without setup, reads a page, and preserves safe history through a server crash", {
	timeout: 180_000,
}, async (t) => {
	const key = "sk-webkit-integration-secret";
	const requests: { path: string; key?: string }[] = [];
	const provider = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk;
		const path = request.url ?? "/";
		const apiKey = request.headers["x-api-key"];
		requests.push({
			path,
			...(typeof apiKey === "string" ? { key: apiKey } : {}),
		});
		if (path === "/page") {
			response.setHeader("content-type", "text/html");
			response.end(
				`<html><head><title>Durable sources</title></head><body><article><h1>Durable sources</h1><p>${"A fetched source remains available after reconnect. ".repeat(30)}WEBKIT-PAGE-END</p></article></body></html>`,
			);
			return;
		}
		response.setHeader("content-type", "application/json");
		const results = [
			{
				title: "Tau",
				url: "https://example.test/page",
				text: "WEBKIT-SEARCH-CONTENT",
			},
			{ title: key, url: "https://example.test/echo", text: key },
		];
		if (path.startsWith("/mcp")) {
			const rpc = JSON.parse(body);
			assert.equal(rpc.method, "tools/call");
			assert.equal(rpc.params.name, "web_search_advanced_exa");
			response.end(
				JSON.stringify({
					jsonrpc: "2.0",
					id: rpc.id,
					result: {
						content: [
							{
								type: "text",
								text: JSON.stringify({ results: results.slice(0, 1) }),
							},
						],
					},
				}),
			);
		} else {
			assert.equal(apiKey, key);
			response.end(JSON.stringify({ results }));
		}
	});
	provider.listen(0, "127.0.0.1");
	await once(provider, "listening");
	t.after(
		() =>
			new Promise<void>((done) => {
				provider.closeAllConnections();
				provider.close(() => done());
			}),
	);
	const address = provider.address();
	assert.ok(address && typeof address !== "string");
	const j = await processJourney({
		webkitUrl: `http://127.0.0.1:${address.port}`,
	});
	try {
		await j.ok("bind", {
			project: "p",
			workdir: j.root,
			extensions: ["webkit"],
		});
		const { conversation } = await j.ok("create", {
			project: "p",
			model: "faux/a",
		});
		const open = await j.watch("open", { project: "p", conversation });
		async function callTool(
			name: string,
			args: Record<string, string>,
			id: string,
		) {
			j.faux.setResponses([
				fauxAssistantMessage([fauxToolCall(name, args)], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage(`done-${id}`),
			]);
			await j.ok("input", {
				project: "p",
				conversation,
				text: id,
				requestId: id,
			});
			await until(id, () =>
				JSON.stringify(open.value.entries).includes(`done-${id}`),
			);
		}
		await callTool(
			"web_search",
			{ query: "Tau durability" },
			"anonymous-search",
		);
		assert.ok(JSON.stringify(j.requests).includes("WEBKIT-SEARCH-CONTENT"));
		assert.equal(requests.length, 1);
		assert.equal(requests[0]?.key, undefined);
		await callTool(
			"fetch_content",
			{ url: "https://example.test/page" },
			"read-page",
		);
		assert.ok(JSON.stringify(j.requests).includes("WEBKIT-PAGE-END"));
		const configured = await j.ok("setOptions", {
			project: "p",
			extension: "webkit",
			patch: { provider: "exa", exaApiKey: key },
		});
		assert.equal(configured.value.exaApiKey, true);
		await callTool(
			"web_search",
			{ query: "Configured search" },
			"keyed-search",
		);
		assert.ok(!JSON.stringify(j.requests).includes(key));
		assert.ok(JSON.stringify(open.value.entries).includes("[redacted]"));
		const count = requests.length;
		open.close();
		await j.restart();
		const history = await j.ok(
			"history",
			{ project: "p", conversation, limit: 1000 },
			j.phone,
		);
		assert.ok(JSON.stringify(history).includes("WEBKIT-PAGE-END"));
		assert.equal(requests.length, count);
		const options = await j.ok("options", { project: "p" }, j.phone);
		assert.equal(options.items[0].value.exaApiKey, true);
		await j.stop();
		for (const output of [...j.wire, ...j.stdout, ...j.stderr])
			assert.ok(!output.includes(key), output);
	} finally {
		await j.close();
	}
});
