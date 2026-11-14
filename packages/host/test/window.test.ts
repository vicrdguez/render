import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { start } from "./helpers.js";

test("open starts at 50 entries, keeps 100, and drops to 50 only past 100", async () => {
	let enter!: () => void;
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let append!: (count: number) => Promise<void>;
	let index = 0;
	const extension = defineExtension({
		name: "window",
		tools: [
			defineTool({
				name: "fill",
				description: "Append entries while held.",
				parameters: obj({}),
				execute: async (_args, api, c) => {
					append = async (count) => {
						for (let i = 0; i < count; i++)
							await api.commit(async (tx) => {
								await tx.appendEntry(api.conversationId, {
									kind: "window.note",
									data: { index: index++ },
								});
							}, c);
					};
					enter();
					await held;
					return { output: [{ type: "text", text: "done" }] };
				},
			}),
		],
	});
	const s = await start({ modules: { window: { extension } } });
	try {
		await s.call("bind", {
			project: "p",
			workdir: "/tmp",
			extensions: ["window"],
		});
		const conversation = (
			await s.call("create", { project: "p", model: "faux/a" })
		).body.result.conversation;
		s.faux.setResponses([
			fauxAssistantMessage([fauxToolCall("fill", {})], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("Done."),
		]);
		await s.call("input", {
			project: "p",
			conversation,
			text: "fill",
			requestId: "fill",
		});
		await entered;
		await append(60);
		const live = s.watch("open", { project: "p", conversation });
		await live.until((w) => w.value !== undefined);
		assert.equal(
			live.value.entries.length,
			50,
			"the first window is exactly 50",
		);
		assert.equal(live.value.entries[0].data.index, 10);
		const before = live.value.before;
		assert.equal(typeof before, "number");
		await append(50);
		await live.until((w) => w.value.entries.at(-1).data.index === 109);
		assert.equal(
			live.value.entries.length,
			100,
			"100 entries do not cause a drop",
		);
		assert.equal(live.value.before, before);
		const dropped = live.value.entries[50].id;
		await append(1);
		await live.until((w) => w.value.entries.at(-1).data.index === 110);
		assert.equal(
			live.value.entries.length,
			50,
			"the 101st entry drops the oldest 51",
		);
		assert.equal(live.value.before, dropped);
		assert.equal(live.value.entries[0].data.index, 61);
		live.close();
	} finally {
		release();
		await s.close();
	}
});
