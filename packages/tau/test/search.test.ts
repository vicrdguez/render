import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { until } from "./journey.js";
import { processJourney } from "./process-journey.js";

test("search: project default calls the local provider and no device surface or log reveals the key", {
	timeout: 15_000,
}, async (t) => {
	const key = "sk-integration-secret-never-return";
	let requests = 0;
	const provider = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk;
		assert.equal(request.headers["x-api-key"], key);
		assert.equal(JSON.parse(body).query, "Tau durability");
		requests++;
		response.setHeader("content-type", "application/json");
		response.end(
			JSON.stringify({
				results: [
					{
						title: "Tau",
						url: "https://example.test/tau",
						text: "LOCAL-CONTENT",
					},
					{ title: key, url: "https://example.test/echo", text: key },
				],
			}),
		);
	});
	provider.listen(0, "127.0.0.1");
	await once(provider, "listening");
	t.after(
		() =>
			new Promise<void>((resolve) => {
				provider.closeAllConnections();
				provider.close(() => resolve());
			}),
	);
	const address = provider.address();
	assert.ok(address && typeof address !== "string");
	const j = await processJourney({
		searchUrl: `http://127.0.0.1:${address.port}`,
	});
	try {
		await j.ok("bind", {
			project: "p",
			workdir: j.root,
			extensions: ["websearch"],
		});
		assert.deepEqual(
			(
				await j.ok("setOptions", {
					project: "p",
					extension: "websearch",
					patch: { provider: "exa", apiKey: key },
				})
			).value,
			{ provider: "exa", apiKey: true },
		);
		const options = await j.ok("options", { project: "p" }, j.phone);
		assert.equal(options.items[0].value.apiKey, true);
		const { conversation } = await j.ok("create", {
			project: "p",
			model: "faux/a",
		});
		const open = await j.watch("open", { project: "p", conversation }, j.phone);
		const timeline = await j.watch("timeline", { project: "p" }, j.phone);
		const inbox = await j.watch("inbox", {}, j.phone);
		j.faux.setResponses([
			fauxAssistantMessage(
				[fauxToolCall("web_search", { query: "Tau durability" })],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage("Search finished."),
		]);
		await j.ok("input", {
			project: "p",
			conversation,
			text: "Search",
			requestId: "search",
		});
		await until("search reply", () =>
			JSON.stringify(open.value.entries).includes("Search finished."),
		);
		assert.equal(requests, 1);
		assert.ok(JSON.stringify(j.requests[0]).includes('"web_search"'));
		assert.ok(JSON.stringify(j.requests[1]).includes("LOCAL-CONTENT"));
		assert.ok(!JSON.stringify(j.requests).includes(key));
		await j.ok("history", { project: "p", conversation, limit: 1000 }, j.phone);
		await j.restart();
		assert.equal(
			(await j.ok("options", { project: "p" }, j.phone)).items[0].value.apiKey,
			true,
		);
		await j.ok("history", { project: "p", conversation, limit: 1000 }, j.phone);
		await j.stop();
		assert.ok(j.stdout.length > 0, "the child stdout was captured");
		for (const surface of [
			...j.wire,
			...open.frames,
			...timeline.frames,
			...inbox.frames,
			...j.stdout,
			...j.stderr,
		])
			assert.ok(!surface.includes(key), surface);
		assert.ok(JSON.stringify(open.value.entries).includes("LOCAL-CONTENT"));
		assert.ok(JSON.stringify(open.value.entries).includes("[redacted]"));
		open.close();
		timeline.close();
		inbox.close();
	} finally {
		await j.close();
	}
});
