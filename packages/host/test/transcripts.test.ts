import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { defineExtension } from "@earendil-works/pi-durable";

import { start, until } from "./helpers.js";

test("the bind and input calls of protocol.md replay against the real server", async () => {
	const websearch = defineExtension({ name: "websearch" });
	const s = await start({
		modules: {
			websearch: { extension: websearch },
			w1: { extension: defineExtension({ name: "w1" }), entry: {} },
		},
	});
	try {
		const bind = await fetch(`${s.url}/v1/bind`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${s.token}`,
				"Content-Type": "application/json",
			},
			body: '{"project":"p","workdir":"/home/owner/src/export","extensions":["websearch","w1"]}',
		});
		assert.equal(bind.status, 200);
		assert.equal(
			await bind.text(),
			'{"result":{"project":{"project":"p","workdir":"/home/owner/src/export","extensions":["websearch","w1"],"missing":[]},"repeated":false}}',
		);

		let release = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let asked = false;
		s.faux.setResponses([
			async () => {
				asked = true;
				await held;
				return fauxAssistantMessage("Done.");
			},
			fauxAssistantMessage("Steered."),
		]);
		const d = (await s.call("create", { project: "p", model: "faux/a" })).body
			.result.conversation;
		await s.call("input", {
			project: "p",
			conversation: d,
			text: "Start.",
			requestId: "r-01",
		});
		await until("the model is asked", () => asked);
		const input = await s.call("input", {
			project: "p",
			conversation: d,
			text: "Use the existing serializer.",
			requestId: "r-02",
			whenBusy: "steer",
		});
		assert.deepEqual(Object.keys(input.body), ["result"]);
		const submission = input.body.result.submission;
		assert.deepEqual(
			{
				conversationId: submission.conversationId,
				requestId: submission.requestId,
				type: submission.type,
				status: submission.status,
			},
			{
				conversationId: d,
				requestId: "client:laptop:r-02",
				type: "input",
				status: "queued",
			},
		);
		assert.equal(typeof submission.id, "number");
		release();
		await until("the run ends", async () => {
			const page = await s.call("conversations", { project: "p" });
			return page.body.result.items.every(
				(c: { state: string }) => c.state === "idle",
			);
		});
	} finally {
		await s.close();
	}
});
