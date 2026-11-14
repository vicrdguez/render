import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	type Conversation,
	type ConversationId,
	type Cursor,
	configure,
	createRegistry,
	type EntryRecord,
	type Harness,
	type JsonObject,
	MemoryStorage,
	type Registry,
	type Storage,
	type TaskId,
} from "@earendil-works/pi-durable";
import { type DecisionId, decision, eventLog } from "tau-store";
import { answer, openStore, type Store } from "tau-store/host";
import { entry, extension, options } from "../src/index.js";

export { context };
export const START = Date.UTC(2026, 10, 14);
export const WEEK = 604_800_000;
export const args = (resolveBy: number, p = 0.7, key = "release") => ({
	key,
	text: "pi-durable ships 2.0 before March.",
	p,
	resolveBy,
	rule: "A public 2.0 release before March 1.",
});

export class Clock {
	at = START;
	private timers = new Set<{ at: number; callback: () => void }>();
	now = () => this.at;
	setTimer = (callback: () => void, delay: number) => {
		const timer = { at: this.at + delay, callback };
		this.timers.add(timer);
		return () => {
			this.timers.delete(timer);
		};
	};
	advance(at: number) {
		this.at = at;
		for (const timer of [...this.timers])
			if (timer.at <= at) {
				this.timers.delete(timer);
				timer.callback();
			}
	}
}

export async function until<T>(
	read: () => Promise<T>,
	accepts: (value: T) => boolean,
	message: string,
): Promise<T> {
	const end = performance.now() + 5_000;
	let value = await read();
	while (!accepts(value) && performance.now() < end) {
		await setImmediate();
		value = await read();
	}
	assert.ok(accepts(value), `${message}: ${JSON.stringify(value)}`);
	return value;
}

type Fixture = {
	store: Store;
	h: Harness;
	root: Conversation;
	registry: Registry;
	faux: ReturnType<typeof fauxProvider>;
	reports: unknown[];
	clock: Clock;
	subject(conversation?: ConversationId, key?: string): string;
	read(id: DecisionId): ReturnType<typeof decision>;
	events(): Promise<EntryRecord[]>;
	forecasts(conversation?: Conversation): Promise<EntryRecord[]>;
	tasks(
		kind?: string,
		conversation?: ConversationId,
	): Promise<
		Awaited<
			ReturnType<import("@earendil-works/pi-durable").Tx["scanTasks"]>
		>["items"]
	>;
	sleeping(): ReturnType<Fixture["tasks"]>;
	call(
		name: string,
		value: JsonObject,
		conversation?: Conversation,
	): Promise<readonly EntryRecord[]>;
	respond(id: DecisionId, choice: string): Promise<TaskId>;
	finished(id: TaskId): ReturnType<Harness["getTask"]>;
};

export async function open(
	storage: Storage = new MemoryStorage(),
	clock = new Clock(),
): Promise<Fixture> {
	const registry: Registry = createRegistry();
	registry.install(extension);
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	const reports: unknown[] = [];
	const store: Store = await openStore(
		storage,
		{
			registry,
			models,
			now: clock.now,
			setTimer: clock.setTimer,
			onReport: (report) => {
				reports.push(report);
			},
		},
		context,
	);
	const h: Harness = store.harness;
	await h.commit((tx) => options.set(tx, { model: "faux/faux-1" }), context);
	const root: Conversation = await h.root(context);
	await h.commit(
		async (tx) => configure(tx, root.id, await entry(tx)),
		context,
	);
	const subject = (conversation: ConversationId = root.id, key = "release") =>
		`w2:${conversation}:${key}`;
	const read = (id: DecisionId) => h.commit((tx) => decision(tx, id), context);
	const events = () =>
		h.commit(async (tx) => {
			const id = await eventLog(tx);
			const items: EntryRecord[] = [];
			let cursor: Cursor | undefined;
			do {
				const page = await tx.scanEntries(
					{ conversationId: id, order: "ascending" },
					100,
					cursor,
				);
				items.push(...page.items);
				cursor = page.next;
			} while (cursor !== undefined);
			return items;
		}, context);
	const forecasts = async (conversation = root) =>
		(
			await conversation.entries(
				{ order: "ascending" },
				500,
				undefined,
				context,
			)
		).items.filter((e) => e.kind === "w2.forecast");
	const tasks = (kind = "w2.due", conversation = root.id) =>
		h.commit(
			async (tx) =>
				(await tx.scanTasks({ kind, conversationId: conversation }, 500)).items,
			context,
		);
	const sleeping = async () =>
		until(
			() => tasks(),
			(rows) =>
				rows.length > 0 &&
				rows.every(
					(t) => t.state.status === "sleeping" || t.state.status === "terminal",
				),
			"timers sleep",
		);
	const call = async (
		name: string,
		value: JsonObject,
		conversation: Conversation = root,
	) => {
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall(name, value)], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("done"),
		]);
		const submission = await conversation.submit(
			{ type: "input", content: name },
			context,
		);
		await submission.wait(context);
		await conversation.waitForIdle(context);
		return (
			await conversation.entries(
				{ order: "ascending" },
				500,
				undefined,
				context,
			)
		).items;
	};
	const respond = async (id: DecisionId, choice: string) => {
		const d = await read(id);
		assert.ok(d);
		const result = await answer(
			store,
			id,
			{ basis: d.basis, choice, annotations: [] },
			"phone",
			context,
		);
		assert.equal(result.kind, "answered", JSON.stringify(result));
		if (result.kind !== "answered") throw new Error("not answered");
		return result.decision.continuation;
	};
	const finished = (id: TaskId) =>
		until(
			() => h.getTask(id, context),
			(task) => task?.state.status === "terminal",
			"task finishes",
		);
	return {
		store,
		h,
		root,
		registry,
		faux,
		reports,
		clock,
		subject,
		read,
		events,
		forecasts,
		tasks,
		sleeping,
		call,
		respond,
		finished,
	};
}
