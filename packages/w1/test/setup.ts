import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	type FauxResponseStep,
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	type ConversationId,
	configure,
	createRegistry,
	defineExtension,
	defineTool,
	type EntryRecord,
	type JsonObject,
	MemoryStorage,
	type Storage,
	type SubmissionDraft,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { obj, str } from "@earendil-works/pi-schema";
import {
	type Annotation,
	type Decision,
	type DecisionId,
	decision,
	eventLog,
} from "tau-store";
import { answer, openStore } from "tau-store/host";
import * as W1 from "../src/index.js";

export { context, W1 };

// The test acts as the owner's shell: Git's identity comes from the environment, never from global configuration.
Object.assign(process.env, {
	GIT_AUTHOR_NAME: "Tau Test",
	GIT_AUTHOR_EMAIL: "tau@example.invalid",
	GIT_COMMITTER_NAME: "Tau Test",
	GIT_COMMITTER_EMAIL: "tau@example.invalid",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
});

export const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** A real repository with one commit on `main`, in a fresh temporary directory unless one is given. */
export function repository(
	root = realpathSync(mkdtempSync(join(tmpdir(), "tau-w1-"))),
) {
	const repo = join(root, "export-tool");
	mkdirSync(repo);
	git(repo, "init", "-q", "-b", "main");
	writeFileSync(join(repo, "export.js"), "export const format = 'csv';\n");
	git(repo, "add", "-A");
	git(repo, "commit", "-qm", "Start the export tool");
	return repo;
}

/** The worktree path W1 plans for a piece of work: a sibling of the repository. Recorded in the build notes. */
export const plannedPath = (repo: string, k: ConversationId) =>
	`${repo}.w1-${k}`;

export type Role = "designer" | "implementer" | "reviewer" | "other";
type Step = FauxResponseStep;

export const call = (name: string, args: JsonObject = {}) =>
	fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
export const calls = (...list: [string, JsonObject][]) =>
	fauxAssistantMessage(
		list.map(([name, args]) => fauxToolCall(name, args)),
		{ stopReason: "toolUse" },
	);
export const say = (text: string) => fauxAssistantMessage([fauxText(text)]);
export const failing = () =>
	fauxAssistantMessage("", {
		stopReason: "error",
		errorMessage: "provider said no",
	});
/** A model request that never answers, and ends when its run is stopped. */
export const hanging: Step = (_context, options) =>
	new Promise((_, reject) => {
		options?.signal?.addEventListener("abort", () =>
			reject(new Error("stopped")),
		);
	});

/** A stand-in for a tool extension in the project's default, such as web search. */
export const Search = defineExtension({
	name: "websearch",
	tools: [
		defineTool({
			name: "web_search",
			description: "Search the web.",
			parameters: obj({ query: str() }),
			execute: async () => ({ output: [{ type: "text", text: "nothing" }] }),
		}),
	],
});

/** A stand-in for codemode: one tool that calls another as a nested call. */
export const Script = defineExtension({
	name: "script",
	tools: [
		defineTool({
			name: "script",
			description: "Run a script that calls one tool.",
			parameters: obj({ tool: str(), text: str() }),
			execute: async (args, api, c) => {
				const nested = await api.executeTool(args.tool, { text: args.text }, c);
				return {
					output: [{ type: "text", text: JSON.stringify(nested) }],
				};
			},
		}),
	],
});

export type Request = { role: Role; model: string; seen: string };

/**
 * One project's store with W1 installed, as the host will open it: the coding tools and W1 in the registry, a project
 * default of the coding tools and a tool extension, the project's repository as `cwd`, and the faux provider as every
 * model. Each role takes its scripted model responses from its own queue.
 */
export async function world(
	options: { storage?: Storage; repo?: string; now?: () => number } = {},
) {
	const repo = options.repo ?? repository();
	const registry = createRegistry();
	for (const extension of [CodingTools, Search, Script, W1.extension])
		registry.install(extension);
	const faux = fauxProvider({ models: [{ id: "faux-a" }, { id: "faux-b" }] });
	const models = createModels();
	models.setProvider(faux.provider);
	const queues: Record<Role, Step[]> = {
		designer: [],
		implementer: [],
		reviewer: [],
		other: [],
	};
	const requests: Request[] = [];
	const respond: Step = (request, streamOptions, state, model) => {
		const tools = new Set(
			((request as { tools?: { name: string }[] }).tools ?? []).map(
				(tool) => tool.name,
			),
		);
		const role: Role = tools.has("publish_design")
			? "designer"
			: tools.has("publish_build")
				? "implementer"
				: tools.has("publish_review")
					? "reviewer"
					: "other";
		requests.push({ role, model: model.id, seen: JSON.stringify(request) });
		const step = queues[role].shift();
		if (step === undefined)
			return fauxAssistantMessage("", {
				stopReason: "error",
				errorMessage: `no scripted step for the ${role}`,
			});
		return typeof step === "function"
			? step(request, streamOptions, state, model)
			: step;
	};
	faux.setResponses(Array.from({ length: 1000 }, () => respond));
	const store = await openStore(
		options.storage ?? new MemoryStorage(),
		{
			models,
			registry,
			...(options.now === undefined ? {} : { now: options.now }),
			env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? repo }),
			settings: {
				extensions: [CodingTools, Search],
				retry: { enabled: false },
			},
		},
		context,
	);
	const { harness } = store;
	harness.resume();
	const commit = <T>(change: Parameters<typeof harness.commit<T>>[0]) =>
		harness.commit(change, context);

	const read = (id: DecisionId) => commit((tx) => decision(tx, id));
	const self = {
		store,
		harness,
		repo,
		requests,
		script(role: Role, ...steps: Step[]) {
			queues[role].push(...steps);
		},
		pending: (role: Role) => queues[role].length,
		setOptions: (value: JsonObject) =>
			commit(async (tx) =>
				W1.options.set(tx, { ...(await W1.options.get(tx)), ...value }),
			),
		/** The host's `create` commit for a W1 conversation (host.md, "How the first conversation gets its model"). */
		create: () =>
			commit(async (tx) => {
				const { id } = await tx.createConversation({
					ownership: { kind: "ownerless" },
				});
				const change =
					typeof W1.entry === "function" ? await W1.entry(tx) : W1.entry;
				await configure(tx, id, { cwd: repo, ...change });
				return id;
			}),
		async submit(
			conversation: ConversationId,
			draft: SubmissionDraft | string,
		) {
			const handle = await harness.conversation(conversation, context);
			assert.ok(handle, `conversation ${conversation} exists`);
			return handle.submit(
				typeof draft === "string" ? { type: "input", content: draft } : draft,
				context,
			);
		},
		/** Waits until no task is live and no submission is unsettled, background tasks included. */
		async settle(timeout = 20_000) {
			const end = Date.now() + timeout;
			for (;;) {
				const seen = await harness.inspect(context);
				if (seen.tasks.length === 0 && seen.submissions.length === 0) return;
				if (Date.now() > end)
					assert.fail(
						`never settled: ${JSON.stringify(seen.tasks.map((t) => [t.record.kind, t.state]))}`,
					);
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
		},
		read,
		async open(id: DecisionId) {
			const found = await read(id);
			assert.equal(found?.status, "open", `${id}: ${JSON.stringify(found)}`);
			return found as Decision;
		},
		/** The owner answers from a device, quoting the basis the decision names. */
		async reply(
			id: DecisionId,
			choice: string,
			annotations: Annotation[] = [],
			device = "laptop",
		) {
			const found = await read(id);
			assert.ok(found, `${id} exists`);
			return answer(
				store,
				id,
				{ basis: found.basis, choice, annotations },
				device,
				context,
			);
		},
		async events() {
			return (
				await commit(
					async (tx) =>
						(
							await tx.scanEntries(
								{ conversationId: await eventLog(tx), order: "ascending" },
								1000,
							)
						).items,
				)
			).map((entry) => ({ id: entry.id, kind: entry.kind, ...data(entry) }));
		},
		async entries(conversation: ConversationId, kind?: string) {
			const handle = await harness.conversation(conversation, context);
			assert.ok(handle);
			const { items } = await handle.entries(
				{ order: "ascending" },
				1000,
				undefined,
				context,
			);
			return kind === undefined
				? items
				: items.filter((entry) => entry.kind === kind);
		},
		async agent(conversation: ConversationId) {
			const handle = await harness.conversation(conversation, context);
			assert.ok(handle);
			return handle.agent(context);
		},
		async tasks(kind: string) {
			return (await commit((tx) => tx.scanTasks({ kind }, 1000))).items;
		},
		close: () => harness.close(context),
	};
	return self;
}

export type World = Awaited<ReturnType<typeof world>>;

/** The JSON data of an entry, as an object. */
export function data(entry: EntryRecord | undefined): Record<string, unknown> {
	const value = entry?.data;
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

/** The text a tool returned to the model, from the tool result entries of a conversation. */
export async function toolResults(w: World, conversation: ConversationId) {
	return (await w.entries(conversation, "pi.tool_result")).map((entry) => {
		const message = entry.model?.[0];
		return message?.role === "toolResult"
			? {
					tool: message.toolName,
					isError: message.isError,
					text: message.content
						.map((part) => (part.type === "text" ? part.text : ""))
						.join(""),
				}
			: { tool: "", isError: false, text: "" };
	});
}

export const subjects = (k: ConversationId) => ({
	design: (n: number): DecisionId => `w1:${k}:design#${n}`,
	merge: (n: number): DecisionId => `w1:${k}:merge#${n}`,
	stuck: (n: number): DecisionId => `w1:${k}:stuck#${n}`,
});

/** The conversation an event of a stage names. */
export async function named(w: World, stage: string) {
	const event = (await w.events()).find((e) => e.stage === stage);
	assert.ok(event, `an event for ${stage}`);
	return event.conversation as ConversationId;
}

export function answered(result: Awaited<ReturnType<typeof answer>>) {
	assert.equal(result.kind, "answered", JSON.stringify(result));
	if (result.kind !== "answered") throw new Error("not answered");
	return result;
}

/**
 * Rows 0 to 2, then the owner approves: D designs and publishes, and the approval starts I. The caller scripts I's
 * steps first.
 */
export async function approved(
	w: World,
	annotations: Annotation[] = [],
	design = "Add a --json flag that prints the rows as JSON.",
) {
	await w.setOptions({
		designer: "faux/faux-a",
		implementer: "faux/faux-a",
		reviewer: "faux/faux-b",
	});
	const k = await w.create();
	w.script("designer", call("publish_design", { text: design }));
	await w.submit(k, "Add a --json flag to the export command.");
	await w.settle();
	const s = subjects(k);
	const approval = answered(await w.reply(s.design(1), "approve", annotations));
	await w.settle();
	return { k, s, approval };
}

/** A Git commit by the implementer's own `bash` tool. */
export const commitStep = (file: string, content: string, message: string) =>
	call("bash", {
		command: `printf '%s' '${content}' > ${file} && git add -A && git commit -qm '${message}'`,
	});
