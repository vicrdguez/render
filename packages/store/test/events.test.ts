import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	type ConversationId,
	createRegistry,
	defineEntry,
	defineExtension,
	defineTool,
	type EntryRecord,
	MemoryStorage,
	type TaskId,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { obj, str } from "@earendil-works/pi-schema";
import { emit, eventLog, request } from "tau-store";
import { openStore, type Store } from "tau-store/host";
import { context, setup } from "./setup.js";

const Revised = defineEntry<{
	text: string;
	at: number;
	version: number;
	conversation?: ConversationId;
}>("test.revised");

async function events(store: Store) {
	const log = await store.harness.commit((tx) => eventLog(tx), context);
	const page = await store.harness.commit(
		(tx) => tx.scanEntries({ conversationId: log, order: "ascending" }, 100),
		context,
	);
	return page.items;
}

async function ownerless(store: Store) {
	return (
		await store.harness.commit((tx) => tx.scanConversations({}, 100), context)
	).items.filter((record) => record.owner === undefined);
}

test("the first open creates exactly one ownerless event log, and a reopen reuses it", async () => {
	const file = path.join(
		await mkdtemp(path.join(tmpdir(), "tau-store-log-")),
		"store.sqlite",
	);
	const options = { models: createModels(), registry: createRegistry() };
	const first = await openStore(
		await openNodeSqliteStorage(file),
		options,
		context,
	);
	const log = await first.harness.commit((tx) => eventLog(tx), context);
	assert.deepEqual(
		(await ownerless(first)).map((record) => record.id),
		[log],
	);
	await first.harness.close(context);
	const second = await openStore(
		await openNodeSqliteStorage(file),
		options,
		context,
	);
	assert.equal(await second.harness.commit((tx) => eventLog(tx), context), log);
	assert.deepEqual(
		(await ownerless(second)).map((record) => record.id),
		[log],
	);
	await second.harness.close(context);
});

test("emit lands only with the commit it is in", async () => {
	const s = await setup();
	await assert.rejects(
		s.store.harness.commit(async (tx) => {
			await emit(tx, Revised, {
				text: "Design v2 is ready.",
				at: 1,
				version: 2,
			});
			throw new Error("the change it describes failed");
		}, context),
	);
	assert.deepEqual(await events(s.store), []);
	const id = await s.store.harness.commit(
		(tx) =>
			emit(tx, Revised, { text: "Design v2 is ready.", at: 1, version: 2 }),
		context,
	);
	assert.deepEqual(
		(await events(s.store)).map((entry) => entry.id),
		[id],
	);
});

test("an event keeps its text, time, conversation, own fields, and the task that emitted it", async () => {
	const registry = createRegistry();
	const tool = defineTool({
		name: "publish",
		description: "Publish a design.",
		parameters: obj({ text: str() }),
		execute: async (args, api, c) => {
			await api.commit(
				(tx) =>
					emit(tx, Revised, {
						text: args.text,
						at: api.now(),
						conversation: api.conversationId,
						version: 3,
					}),
				c,
			);
			return {
				output: [{ type: "text", text: "Published." }],
				control: { terminate: true },
			};
		},
	});
	registry.install(defineExtension({ name: "test", tools: [tool] }));
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	faux.setResponses([
		fauxAssistantMessage(
			[fauxToolCall("publish", { text: "Design v3 is ready." })],
			{
				stopReason: "toolUse",
			},
		),
		fauxAssistantMessage([fauxText("done")]),
	]);
	const store = await openStore(
		new MemoryStorage(),
		{ models, registry, now: () => 4_000 },
		context,
	);
	const root = await store.harness.root(context, {
		agent: { model: { provider: "faux", modelId: "faux-1" } },
	});
	await root.submit({ type: "input", content: "Publish it." }, context);
	await root.waitForIdle(context);
	const [event] = await events(store);
	assert.ok(Revised.is(event));
	assert.deepEqual(event.data, {
		text: "Design v3 is ready.",
		at: 4_000,
		conversation: root.id,
		version: 3,
	});
	const by = event.byTaskId as TaskId;
	assert.equal((await store.harness.getTask(by, context))?.kind, "pi.tool");
});

test("eventLog is a document read, so it runs after a table write", async () => {
	const s = await setup();
	const log = await s.store.harness.commit(async (tx) => {
		await emit(tx, Revised, { text: "One.", at: 1, version: 1 });
		return eventLog(tx);
	}, context);
	assert.equal((await events(s.store))[0]?.conversationId, log);
});

test("request emits nothing and leaves table reads open in its commit", async () => {
	const s = await setup();
	const draft = await s.draft();
	await s.store.harness.commit(async (tx) => {
		await request(tx, draft);
		assert.equal((await tx.entry(draft.basis.id))?.id, draft.basis.id);
	}, context);
	assert.deepEqual(await events(s.store), []);
});

test("events survive a SQLite close and reopen in their order", async () => {
	const file = path.join(
		await mkdtemp(path.join(tmpdir(), "tau-store-events-")),
		"store.sqlite",
	);
	const options = { models: createModels(), registry: createRegistry() };
	const first = await openStore(
		await openNodeSqliteStorage(file),
		options,
		context,
	);
	for (const version of [1, 2, 3]) {
		await first.harness.commit(
			(tx) =>
				emit(tx, Revised, {
					text: `Version ${version}.`,
					at: version,
					version,
				}),
			context,
		);
	}
	const before = await events(first);
	await first.harness.close(context);
	const second = await openStore(
		await openNodeSqliteStorage(file),
		options,
		context,
	);
	const after: readonly EntryRecord[] = await events(second);
	assert.deepEqual(after, before);
	assert.deepEqual(
		after.map((entry) => (Revised.is(entry) ? entry.data.version : undefined)),
		[1, 2, 3],
	);
	await second.harness.close(context);
});
