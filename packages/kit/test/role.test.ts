import assert from "node:assert/strict";
import { test } from "node:test";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";
import {
	AgentDoc,
	createRegistry,
	defineExtension,
	defineTask,
	defineTool,
	Harness,
	MemoryStorage,
	ReadAfterWrite,
} from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { type RoleSettings, role } from "tau-kit";
import { context, fixture } from "./fixture.js";

const settings = {
	model: { provider: "local", modelId: "chosen" },
	extensions: [],
	instructions: "Review only.",
	cwd: "/work",
} satisfies RoleSettings;

test("role creates an ownerless conversation with settings and no first input", async (t) => {
	const h = await fixture(t);
	const id = await h.commit(
		(tx) => role(tx, settings, { kind: "ownerless" }),
		context,
	);
	const conversation = await h.conversation(id, context);
	assert.ok(conversation);
	assert.deepEqual(await h.snapshot(AgentDoc, id, context), settings);
	const record = await h.commit((tx) => tx.conversation(id), context);
	assert.equal(record?.owner, undefined);
	assert.deepEqual(
		(await conversation.entries({}, 10, undefined, context)).items,
		[],
	);
});

test("role rolls back conversation creation when configuration or the caller fails", async (t) => {
	const h = await fixture(t);
	await assert.rejects(
		h.commit(
			(tx) => role(tx, { ...settings, maxTurns: 0 }, { kind: "ownerless" }),
			context,
		),
		RangeError,
	);
	await assert.rejects(
		h.commit(async (tx) => {
			await role(tx, settings, { kind: "ownerless" });
			throw new Error("caller failed");
		}, context),
		/caller failed/,
	);
	assert.deepEqual(
		(await h.commit((tx) => tx.scanConversations({}, 10), context)).items,
		[],
	);
});

test("role preserves task ownership and inherited fields it does not name", async (t) => {
	const h = await fixture(t);
	const parent = await h.createConversation(
		{
			ownership: { kind: "ownerless" },
			agent: { instructions: "Inherited.", cwd: "/parent", maxTurns: 4 },
		},
		context,
	);
	const task = defineTask<null, { phase: "done" }, null>({
		name: "kit.owner",
		version: 1,
		initial: () => ({ phase: "done" }),
		phases: {
			done: async (_task, runtime, ctx) => {
				await runtime.commit(
					() => ({
						status: "terminal",
						outcome: { status: "completed", result: null },
					}),
					ctx,
				);
			},
		},
		abort: async (_task, runtime, ctx) => {
			await runtime.commit(
				() => ({ status: "terminal", outcome: { status: "aborted" } }),
				ctx,
			);
		},
	});
	const taskId = await parent.commit(
		(tx) => tx.createTask(task, null, { ownership: { kind: "conversation" } }),
		context,
	);
	const id = await h.commit(
		(tx) =>
			role(
				tx,
				{ model: settings.model, extensions: [], cwd: "/child" },
				{ kind: "task", taskId },
			),
		context,
	);
	assert.deepEqual(
		(await h.commit((tx) => tx.conversation(id), context))?.owner,
		{ conversationId: parent.id, taskId },
	);
	assert.deepEqual(await h.snapshot(AgentDoc, id, context), {
		model: settings.model,
		extensions: [],
		cwd: "/child",
		instructions: "Inherited.",
		maxTurns: 4,
	});
});

test("input after role in the same commit is refused", async (t) => {
	const h = await fixture(t);
	const existing = await h.createConversation(
		{ ownership: { kind: "ownerless" } },
		context,
	);
	await assert.rejects(
		h.commit(async (tx) => {
			await role(tx, settings, { kind: "ownerless" });
			await existing.submit(tx, {
				type: "input",
				content: "Not in this commit.",
			});
		}, context),
		ReadAfterWrite,
	);
	assert.equal(
		(await h.commit((tx) => tx.scanConversations({}, 10), context)).items
			.length,
		1,
	);
});

test("role model and tool selection reach requests; only open roles gain later defaults", async (t) => {
	const tool = (name: string) =>
		defineTool({
			name,
			description: name,
			parameters: obj({}),
			execute: async () => ({
				output: [{ type: "text" as const, text: "ok" }],
			}),
		});
	const read = tool("read");
	const write = tool("write");
	const publish = tool("publish");
	const review = tool("review");
	const search = tool("search");
	const coding = defineExtension({ name: "coding", tools: [read, write] });
	const workflow = defineExtension({
		name: "workflow",
		tools: [publish, review],
	});
	const web = defineExtension({ name: "web", tools: [search] });
	const registry = createRegistry();
	registry.install(coding);
	registry.install(workflow);
	const defaults = [coding];
	const faux = fauxProvider({ provider: "kit", models: [{ id: "chosen" }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const seen: { model: string; tools: string[] }[] = [];
	faux.setResponses(
		Array.from({ length: 4 }, () => (request, _options, _state, model) => {
			const names = new Set<string>();
			for (const message of request.messages) {
				if (message.role !== "system") continue;
				for (const item of message.toolsRemoved ?? []) names.delete(item.name);
				for (const item of message.toolsAdded ?? []) names.add(item.name);
			}
			seen.push({ model: model.id, tools: [...names].sort() });
			return fauxAssistantMessage("Done.");
		}),
	);
	const h = await Harness.open(
		new MemoryStorage(),
		{ models, registry, settings: () => ({ extensions: defaults }) },
		context,
	);
	t.after(() => h.close(context));
	const open = await h.commit(
		(tx) =>
			role(
				tx,
				{
					model: { provider: "kit", modelId: "chosen" },
					extensions: { add: [workflow] },
					tools: { remove: [write, review] },
				},
				{ kind: "ownerless" },
			),
		context,
	);
	const closed = await h.commit(
		(tx) =>
			role(
				tx,
				{
					model: { provider: "kit", modelId: "chosen" },
					extensions: [workflow],
					tools: [review],
				},
				{ kind: "ownerless" },
			),
		context,
	);
	for (const afterInstall of [false, true]) {
		if (afterInstall) {
			registry.install(web);
			defaults.push(web);
		}
		for (const id of [open, closed]) {
			const conversation = await h.conversation(id, context);
			assert.ok(conversation);
			const submission = await conversation.submit(
				{ type: "input", content: "Work." },
				context,
			);
			assert.equal((await submission.wait(context)).status, "done");
		}
	}
	assert.deepEqual(seen, [
		{ model: "chosen", tools: ["publish", "read"] },
		{ model: "chosen", tools: ["review"] },
		{ model: "chosen", tools: ["publish", "read", "search"] },
		{ model: "chosen", tools: ["review"] },
	]);
});
