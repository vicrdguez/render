import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { journey, until } from "./journey.js";

test("W0: leave, restart, fill the history gap from a second device, and continue", {
	timeout: 20_000,
}, async () => {
	const j = await journey();
	try {
		const extensions = await j.ok("extensions", {});
		assert.deepEqual(
			extensions.items.map((m: any) => [m.name, m.workflow]).sort(),
			[
				["w1", true],
				["w2", true],
				["websearch", false],
			],
		);
		await j.ok("bind", { project: "p", workdir: j.root, extensions: [] });
		const { conversation } = await j.ok("create", {
			project: "p",
			model: "faux/a",
		});
		j.faux.setResponses(
			Array.from({ length: 57 }, (_, i) => fauxAssistantMessage(`reply-${i}`)),
		);
		const first = await j.watch("open", { project: "p", conversation });
		await j.ok("input", {
			project: "p",
			conversation,
			text: "First message",
			requestId: "r0",
		});
		await until("the laptop reads the reply on the stream", () =>
			JSON.stringify(first.value.entries).includes("reply-0"),
		);
		const held = new Map<number, any>(
			first.value.entries.map((e: any) => [e.id, e]),
		);
		const after = Math.max(...held.keys());
		first.close();
		for (let i = 1; i < 56; i++) {
			await j.ok("input", {
				project: "p",
				conversation,
				text: `message-${i}`,
				requestId: `r${i}`,
			});
			await until(`reply-${i}`, async () =>
				JSON.stringify(
					await j.ok("history", { project: "p", conversation, limit: 2 }),
				).includes(`reply-${i}`),
			);
		}
		await j.restart();
		const second = await j.watch(
			"open",
			{ project: "p", conversation, after },
			j.phone,
		);
		assert.ok(second.value.before > after, "the reconnect has a real gap");
		for (const entry of second.value.entries) held.set(entry.id, entry);
		let cursor: string | undefined;
		let pages = 0;
		do {
			const page = await j.ok(
				"history",
				{
					project: "p",
					conversation,
					minEntryId: after + 1,
					maxEntryId: second.value.before,
					order: "ascending",
					limit: 7,
					...(cursor ? { cursor } : {}),
				},
				j.phone,
			);
			for (const entry of page.items) held.set(entry.id, entry);
			cursor = page.next;
			pages++;
		} while (cursor);
		assert.ok(pages > 1);
		const all = (
			await j.ok(
				"history",
				{ project: "p", conversation, order: "ascending", limit: 1000 },
				j.phone,
			)
		).items;
		assert.deepEqual(
			[...held.keys()].sort((a, b) => a - b),
			all.map((e: any) => e.id),
		);
		await j.ok(
			"input",
			{
				project: "p",
				conversation,
				text: "Continue from the phone",
				requestId: "r0",
			},
			j.phone,
		);
		await until("the second device continues", () =>
			JSON.stringify(second.value.entries).includes("reply-56"),
		);
		const timeline = await j.watch("timeline", { project: "p" }, j.phone);
		assert.deepEqual(timeline.value.entries, []);
		timeline.close();
		second.close();
	} finally {
		await j.close();
	}
});
