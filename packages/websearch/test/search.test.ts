import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import {
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import {
	type AgentChange,
	type Conversation,
	createRegistry,
	defineExtension,
	defineTool,
	type Extension,
	type JsonObject,
	MemoryStorage,
	type Storage,
	type Tx,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { compile, type JsonSchema, obj } from "@earendil-works/pi-schema";
import { eventLog } from "tau-store";
import { openStore } from "tau-store/host";
import * as module from "../src/index.js";
import { createSearchExtension } from "../src/web-search.js";

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

const KEY = "sk-unit3-not-a-real-key";
const model = { provider: "faux", modelId: "search-test" };
const call = (args: JsonObject = { query: "Tau durability" }) =>
	fauxAssistantMessage([fauxToolCall("web_search", args)], {
		stopReason: "toolUse",
	});

async function provider(t: TestContext) {
	const requests: {
		path: string;
		body: Record<string, unknown>;
		key: string | undefined;
	}[] = [];
	let status = 200;
	let body: unknown = {
		images: [],
		results: [
			{
				title: "Tau",
				url: "https://example.test/tau",
				text: "Durable work survives reconnect. EXA-CONTENT-END",
				content: "Durable work survives reconnect. TAVILY-CONTENT-END",
			},
		],
	};
	const server = createServer(async (request, response) => {
		let input = "";
		for await (const chunk of request) input += chunk;
		requests.push({
			path: request.url ?? "",
			body: JSON.parse(input),
			key: (request.headers["x-api-key"] ?? request.headers.authorization) as
				| string
				| undefined,
		});
		response.writeHead(status, { "content-type": "application/json" });
		response.end(JSON.stringify(body));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(
		() =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	);
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	return {
		url: `http://127.0.0.1:${address.port}`,
		requests,
		respond(value: unknown, code = 200) {
			body = value;
			status = code;
		},
	};
}

async function harness(
	t: TestContext,
	search: Extension = module.extension,
	storage: Storage = new MemoryStorage(),
	defaults: () => readonly Extension[] = () => [search],
) {
	const registry = createRegistry();
	registry.install(search);
	const faux = fauxProvider({
		models: [{ id: model.modelId, contextWindow: 200000, maxTokens: 4000 }],
	});
	const models = createModels();
	models.setProvider(faux.provider);
	const reports: unknown[] = [];
	const { harness: h } = await openStore(
		storage,
		{
			models,
			registry,
			settings: () => ({ extensions: defaults(), retry: { enabled: false } }),
			onReport: (report) => {
				reports.push(report);
			},
		},
		context,
	);
	t.after(() => h.close(context));
	const create = (agent: AgentChange = {}) =>
		h.createConversation(
			{ ownership: { kind: "ownerless" }, agent: { model, ...agent } },
			context,
		);
	return { h, registry, faux, reports, create };
}

async function search(
	f: Awaited<ReturnType<typeof harness>>,
	c: Conversation,
	args: JsonObject = { query: "Tau durability" },
) {
	const seen: unknown[] = [];
	f.faux.setResponses([
		(request) => {
			seen.push(request);
			return call(args);
		},
		(request) => {
			seen.push(request);
			return fauxAssistantMessage("Done.");
		},
	]);
	assert.equal(
		(
			await (
				await c.submit({ type: "input", content: "Search." }, context)
			).wait(context)
		).status,
		"done",
	);
	const entries = (await c.entries({}, 1000, undefined, context)).items;
	const messages = (await c.context(context)).messages;
	const result = messages
		.filter((message) => message.role === "toolResult")
		.at(-1);
	assert.ok(result && result.role === "toolResult");
	return {
		result,
		entries,
		seen,
		text: result.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n"),
	};
}

test("interrupted unsafe search returns an interruption after SIGKILL without repeating the provider call", {
	timeout: 15000,
}, async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "tau-search-crash-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const file = join(dir, "store.sqlite");
	const received = deferred();
	let requests = 0;
	const server = createServer(() => {
		requests++;
		received.resolve();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(() => {
		server.closeAllConnections();
		server.close();
	});
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const url = `http://127.0.0.1:${address.port}`;
	const child = fork(
		new URL("./crash-child.js", import.meta.url),
		[file, url],
		{ stdio: ["ignore", "pipe", "pipe", "ipc"] },
	);
	t.after(() => {
		if (child.exitCode === null) child.kill("SIGKILL");
	});
	const exited = once(child, "exit");
	const [id] = await once(child, "message");
	await Promise.race([
		received.promise,
		exited.then(() => {
			throw new Error("Search exited without reaching the provider");
		}),
	]);
	child.kill("SIGKILL");
	assert.deepEqual(await exited, [null, "SIGKILL"]);
	const f = await harness(
		t,
		createSearchExtension({ exa: url }),
		await openNodeSqliteStorage(file),
	);
	let seen = "";
	f.faux.setResponses([
		(request) => {
			seen = JSON.stringify(request);
			return fauxAssistantMessage("Interrupted search noted.");
		},
	]);
	await f.h.resume();
	const c = await f.h.conversation(id, context);
	assert.ok(c);
	await c.waitForIdle(context);
	assert.match(seen, /interrupted/i);
	assert.match(
		JSON.stringify((await c.entries({}, 1000, undefined, context)).items),
		/interrupted/i,
	);
	assert.ok(!seen.includes(KEY));
	assert.equal(requests, 1);
});

test("module exports only extension and options and fits ExtensionModule", () => {
	const contract: {
		extension: Extension;
		options?: {
			schema: JsonSchema;
			get(tx: Tx): Promise<JsonObject>;
			set(tx: Tx, value: JsonObject): Promise<void>;
		};
		entry?: AgentChange | ((tx: Tx) => Promise<AgentChange>);
	} = module;
	assert.deepEqual(Object.keys(module).sort(), ["extension", "options"]);
	assert.equal(contract.extension.name, "websearch");
	assert.deepEqual(
		contract.extension.tools?.map((tool) => tool.name),
		["web_search"],
	);
	assert.equal(contract.extension.tasks?.length ?? 0, 0);
	assert.equal(contract.extension.sections?.length ?? 0, 0);
	assert.equal(contract.extension.tools?.[0]?.replay, "unsafe");
	assert.notDeepEqual(contract.extension.tools?.[0]?.callers, ["model"]);
	assert.notEqual(contract.extension.tools?.[0]?.executionMode, "sequential");
	const schema = module.options.schema;
	assert.equal(
		(schema.properties as Record<string, { format?: string }>).apiKey?.format,
		"secret",
	);
	const check = compile(schema);
	assert.ok(check.check({ provider: "exa", apiKey: KEY }));
	assert.ok(check.check({ provider: "tavily", apiKey: KEY }));
	assert.ok(!check.check({ provider: "brave", apiKey: KEY }));
	assert.ok(!check.check({ provider: "exa", apiKey: "" }));
	assert.ok(
		!check.check({
			provider: "exa",
			apiKey: KEY,
			baseUrl: "https://example.test",
		}),
	);
});

test("project default reaches bare and open roles, never closed roles, including the next request of a running agent", async (t) => {
	const gate = deferred();
	const entered = deferred();
	const hold = defineTool({
		name: "hold",
		description: "Hold",
		parameters: obj({}),
		async execute() {
			entered.resolve();
			await gate.promise;
			return { output: [] };
		},
	});
	const coding = defineExtension({ name: "coding-tools", tools: [hold] });
	const review = defineTool({
		name: "review",
		description: "Review",
		parameters: obj({}),
		async execute() {
			return { output: [] };
		},
	});
	const workflow = defineExtension({
		name: "selection-fixture",
		tools: [review],
	});
	let defaults: readonly Extension[] = [coding];
	const f = await harness(t, coding, new MemoryStorage(), () => defaults);
	f.registry.install(workflow);
	const bare = await f.create();
	const open = await f.create({ extensions: { add: [workflow] } });
	const closed = await f.create({ extensions: [workflow], tools: [review] });
	const offered: boolean[] = [];
	f.faux.setResponses([
		(request) => {
			offered.push(JSON.stringify(request).includes('"name":"web_search"'));
			return fauxAssistantMessage([fauxToolCall("hold", {})], {
				stopReason: "toolUse",
			});
		},
		(request) => {
			offered.push(JSON.stringify(request).includes('"name":"web_search"'));
			return fauxAssistantMessage("Done.");
		},
	]);
	const running = await bare.submit(
		{ type: "input", content: "Wait." },
		context,
	);
	await entered.promise;
	f.registry.install(module.extension);
	defaults = [coding, module.extension];
	gate.resolve();
	assert.equal((await running.wait(context)).status, "done");
	assert.deepEqual(offered, [false, true]);
	assert.ok(
		(await open.agent(context)).tools.some(
			(tool) => tool.name === "web_search",
		),
	);
	const closedAgent = await closed.agent(context);
	assert.deepEqual(
		closedAgent.extensions.map((extension) => extension.name),
		[workflow.name],
	);
	assert.deepEqual(
		closedAgent.tools.map((tool) => tool.name),
		["review"],
	);
});

test("unset or invalid project options return a safe tool error and do not prevent conversation creation", async (t) => {
	const p = await provider(t);
	const f = await harness(
		t,
		createSearchExtension({ exa: p.url, tavily: p.url }),
	);
	const c = await f.create();
	for (const value of [
		{},
		{ provider: "exa" as const },
		{ apiKey: KEY },
		{ provider: "exa" as const, apiKey: "" },
	]) {
		await f.h.commit((tx) => module.options.set(tx, value), context);
		const out = await search(f, c);
		assert.equal(out.result.isError, true);
		assert.match(out.text, /not set up/);
		assert.ok(!JSON.stringify(out).includes(KEY));
	}
	assert.equal(p.requests.length, 0);
});

for (const name of ["exa", "tavily"] as const) {
	test(`${name} root Webfox content survives real pi-durable serialization and options are read at each call`, async (t) => {
		const p = await provider(t);
		const f = await harness(
			t,
			createSearchExtension({ exa: p.url, tavily: p.url }),
		);
		const c = await f.create();
		await f.h.commit(
			(tx) => module.options.set(tx, { provider: name, apiKey: KEY }),
			context,
		);
		const out = await search(f, c);
		assert.notEqual(out.result.isError, true, out.text);
		assert.match(out.text, new RegExp(`${name.toUpperCase()}-CONTENT-END`));
		assert.match(
			JSON.stringify(out.entries),
			/Durable work survives reconnect/,
		);
		assert.match(JSON.stringify(out.seen), /Durable work survives reconnect/);
		assert.equal(p.requests.length, 1);
		assert.equal(p.requests[0]?.path, "/search");
		assert.equal(p.requests[0]?.body.query, "Tau durability");
		assert.ok(p.requests[0]?.key?.includes(KEY));
		await f.h.commit(
			(tx) =>
				module.options.set(tx, { provider: name, apiKey: "replacement-key" }),
			context,
		);
		await search(f, c);
		assert.ok(p.requests[1]?.key?.includes("replacement-key"));
		t.diagnostic(out.text);
	});
}

for (const name of ["exa", "tavily"] as const) {
	test(`${name} leaves three matching key characters alone and redacts four`, async (t) => {
		const p = await provider(t);
		const f = await harness(t, createSearchExtension({ exa: p.url, tavily: p.url }));
		await f.h.commit((tx) => module.options.set(tx, { provider: name, apiKey: KEY }), context);
		p.respond({ images: [], results: [
			{ title: "Unrelated", url: "https://example.test/one", text: "Only sk- is ordinary text.", content: "Only sk- is ordinary text." },
			{ title: "Echo", url: "https://example.test/two", text: "Here is sk-u text.", content: "Here is sk-u text." },
		] });
		const out = await search(f, await f.create());
		assert.notEqual(out.result.isError, true, out.text);
		const results = JSON.parse(out.text).results;
		assert.equal(results[0].snippet, "Only sk- is ordinary text.");
		assert.equal(results[1].snippet, "[redacted]");
	});
}

test("empty search succeeds without fallback and malformed provider results become safe errors", async (t) => {
	const p = await provider(t);
	const f = await harness(t, createSearchExtension({ exa: p.url }));
	const c = await f.create();
	await f.h.commit(
		(tx) => module.options.set(tx, { provider: "exa", apiKey: KEY }),
		context,
	);
	p.respond({ results: [] });
	assert.notEqual((await search(f, c)).result.isError, true);
	for (const body of [
		{ results: "broken" },
		{ results: [{ text: "No URL" }] },
	]) {
		p.respond(body);
		assert.equal((await search(f, c)).result.isError, true);
	}
	assert.equal(p.requests.length, 3);
});

test("provider errors and echoed keys never reach results, entries, events, sections, errors or logs", async (t) => {
	const logs: unknown[] = [];
	for (const name of ["log", "info", "warn", "error", "debug"] as const)
		t.mock.method(console, name, (...args: unknown[]) => {
			logs.push(args);
		});
	const p = await provider(t);
	const f = await harness(
		t,
		createSearchExtension({ exa: p.url, tavily: p.url }),
	);
	const c = await f.create();
	for (const name of ["exa", "tavily"] as const) {
		await f.h.commit(
			(tx) => module.options.set(tx, { provider: name, apiKey: KEY }),
			context,
		);
		for (const status of [200, 401, 429, 500]) {
			p.respond(
				status === 200
					? {
							images: [],
							results: [
								{
									title: KEY,
									url: `https://example.test/${KEY}`,
									text: `echo ${KEY}`,
									content: `echo ${KEY}`,
								},
							],
							answer: KEY,
						}
					: { error: { message: KEY }, message: KEY },
				status,
			);
			const out = await search(f, c);
			assert.equal(out.result.isError === true, status !== 200);
			if (status !== 200) {
				assert.equal(
					out.text,
					"Web search failed. Check the provider and project options, then try again.",
				);
				assert.ok(JSON.stringify(out.seen[1]).includes(out.text));
			}
			for (const [surface, value] of Object.entries({
				result: out.result,
				entries: out.entries,
				sections: out.seen,
				errors: f.reports,
				logs,
			}))
				assert.ok(
					!JSON.stringify(value).includes(KEY),
					`${name} ${status} leaked in ${surface}`,
				);
		}
	}
	const log = await f.h.commit((tx) => eventLog(tx), context);
	const logConversation = await f.h.conversation(log, context);
	assert.ok(logConversation);
	const events = await logConversation.entries({}, 1000, undefined, context);
	assert.deepEqual(events.items, []);
	assert.equal(p.requests.length, 8, "no retries or fallback calls");
	for (const name of ["exa", "tavily"] as const) {
		for (const surviving of [
			KEY.length - 1,
			KEY.length - 2,
			Math.floor(KEY.length / 2),
			4,
		]) {
			await t.test(
				`${name} hides ${surviving} leading key characters after the snippet cut`,
				async () => {
					await f.h.commit(
						(tx) => module.options.set(tx, { provider: name, apiKey: KEY }),
						context,
					);
					const prefix = KEY.slice(0, surviving);
					const text = "x".repeat(299 - surviving) + KEY + " tail";
					p.respond({
						images: [],
						results: [
							{
								title: `title ${prefix}`,
								url: `https://example.test/${prefix}`,
								text,
								content: text,
							},
						],
					});
					const out = await search(f, await f.create());
					assert.notEqual(out.result.isError, true, out.text);
					for (const [surface, value] of Object.entries({
						result: out.result,
						entries: out.entries,
						nextRequest: out.seen[1],
						errors: f.reports,
						logs,
					})) {
						assert.ok(
							!JSON.stringify(value).includes(prefix),
							`${name} ${surviving} leaked in ${surface}`,
						);
					}
				},
			);
		}
	}
});

for (const name of ["exa", "tavily"] as const) {
	test(`${name} requests five hits and returns only titles URLs and snippets`, async (t) => {
		const p = await provider(t);
		p.respond({
			images: [],
			answer: "PRIVATE-ANSWER",
			results: Array.from({ length: 6 }, (_, i) => ({
				title: `Title ${i}`,
				url: `https://example.test/${i}`,
				text: `Snippet ${i}`,
				content: `Snippet ${i}`,
				score: 0.12345,
				metadata: { note: "PRIVATE-METADATA" },
			})),
		});
		const f = await harness(
			t,
			createSearchExtension({ exa: p.url, tavily: p.url }),
		);
		await f.h.commit(
			(tx) => module.options.set(tx, { provider: name, apiKey: KEY }),
			context,
		);
		const out = await search(f, await f.create());
		assert.notEqual(out.result.isError, true, out.text);
		assert.equal(
			p.requests[0]?.body[name === "exa" ? "numResults" : "max_results"],
			5,
		);
		assert.deepEqual(JSON.parse(out.text), {
			provider: name,
			results: Array.from({ length: 5 }, (_, i) => ({
				title: `Title ${i}`,
				url: `https://example.test/${i}`,
				snippet: `Snippet ${i}`,
			})),
		});
		for (const value of [out.result, out.entries, out.seen[1]]) {
			assert.doesNotMatch(
				JSON.stringify(value),
				/PRIVATE-ANSWER|PRIVATE-METADATA|0\.12345/,
			);
		}
	});
}

test("search does not read the server environment for Webfox configuration", async (t) => {
	const p = await provider(t);
	const f = await harness(t, createSearchExtension({ exa: p.url }));
	await f.h.commit(
		(tx) => module.options.set(tx, { provider: "exa", apiKey: KEY }),
		context,
	);
	const original = process.env;
	process.env = {
		...original,
		get WEBFOX_CONFIG(): string {
			throw new Error("Ambient Webfox configuration was read");
		},
	};
	t.after(() => {
		process.env = original;
	});
	const out = await search(f, await f.create());
	assert.notEqual(out.result.isError, true, out.text);
	assert.match(out.text, /EXA-CONTENT-END/);
	assert.equal(p.requests.length, 1);
});

test("model cannot set provider, key or base URL and another project cannot borrow its key", async (t) => {
	const p = await provider(t);
	const extension = createSearchExtension({ exa: p.url });
	const f = await harness(t, extension);
	const other = await harness(t, extension);
	await f.h.commit(
		(tx) => module.options.set(tx, { provider: "exa", apiKey: KEY }),
		context,
	);
	const c = await f.create();
	for (const args of [
		{ query: "" },
		{ query: "Tau", provider: "tavily" },
		{ query: "Tau", apiKey: "forged" },
		{ query: "Tau", baseUrl: p.url },
	])
		assert.equal((await search(f, c, args)).result.isError, true);
	assert.equal(
		(await search(other, await other.create())).result.isError,
		true,
	);
	assert.equal(p.requests.length, 0);
});

test("search is callable by another tool and introduces no sections to closed tool selections", async (t) => {
	const p = await provider(t);
	const f = await harness(t, createSearchExtension({ exa: p.url }));
	await f.h.commit(
		(tx) => module.options.set(tx, { provider: "exa", apiKey: KEY }),
		context,
	);
	const nested = defineTool({
		name: "nested",
		description: "Nested search",
		parameters: obj({}),
		async execute(_args, api, ctx) {
			const result = await api.executeTool(
				"web_search",
				{ query: "Tau durability" },
				ctx,
			);
			return {
				output: [{ type: "text" as const, text: JSON.stringify(result) }],
			};
		},
	});
	const caller = defineExtension({ name: "caller", tools: [nested] });
	f.registry.install(caller);
	const c = await f.create({ extensions: { add: [caller] } });
	f.faux.setResponses([
		fauxAssistantMessage([fauxToolCall("nested", {})], {
			stopReason: "toolUse",
		}),
		fauxAssistantMessage("Done."),
	]);
	assert.equal(
		(
			await (
				await c.submit({ type: "input", content: "Search." }, context)
			).wait(context)
		).status,
		"done",
	);
	assert.match(
		JSON.stringify((await c.entries({}, 1000, undefined, context)).items),
		/EXA-CONTENT-END/,
	);
	const closed = await f.create({ tools: [] });
	assert.deepEqual((await closed.agent(context)).sections, []);
});

test("missing code on reopen leaves options intact and search returns when code is installed", async (t) => {
	const dir = await mkdtemp(join(tmpdir(), "tau-search-reopen-"));
	t.after(() => rm(dir, { recursive: true, force: true }));
	const file = join(dir, "store.sqlite");
	const first = await harness(
		t,
		module.extension,
		await openNodeSqliteStorage(file),
	);
	await first.h.commit(
		(tx) => module.options.set(tx, { provider: "exa", apiKey: KEY }),
		context,
	);
	const c = await first.create();
	await first.h.close(context);
	const second = await harness(
		t,
		defineExtension({ name: "empty" }),
		await openNodeSqliteStorage(file),
		() => [module.extension],
	);
	assert.deepEqual(
		await second.h.commit((tx) => module.options.get(tx), context),
		{ provider: "exa", apiKey: KEY },
	);
	const reopened = await second.h.conversation(c.id, context);
	assert.ok(reopened);
	assert.deepEqual((await reopened.agent(context)).tools, []);
	second.registry.install(module.extension);
	assert.deepEqual(
		(await reopened.agent(context)).tools.map((tool) => tool.name),
		["web_search"],
	);
});
