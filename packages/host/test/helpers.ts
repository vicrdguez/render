import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyImmutable, type Op } from "@earendil-works/chord/delta";
import {
	createModels,
	type FauxProviderHandle,
	fauxProvider,
} from "@earendil-works/pi-ai";
import {
	requestAdmin,
	type Server,
	type ServerOptions,
	startServer,
} from "../src/index.js";

export type Reply = {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: {
		result?: any;
		refused?: { code: string; message: string; [key: string]: any };
		unknown?: { code: string; message: string };
	};
};

export const newHome = () => mkdtemp(path.join(tmpdir(), "tau-host-"));

export function faux(ids: readonly string[] = ["a", "b", "c"]): {
	faux: FauxProviderHandle;
	models: ReturnType<typeof createModels>;
} {
	const handle = fauxProvider({ models: ids.map((id) => ({ id })) });
	const models = createModels();
	models.setProvider(handle.provider);
	return { faux: handle, models };
}

export function send(
	url: string,
	pathname: string,
	body: string | undefined,
	headers: Record<string, string> = {},
	method = "POST",
): Promise<Reply> {
	return new Promise((resolve, reject) => {
		const request = http.request(
			`${url}${pathname}`,
			{ method, headers: { "Content-Type": "application/json", ...headers } },
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () => {
					const text = Buffer.concat(chunks).toString();
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						body: text === "" ? {} : JSON.parse(text),
					});
				});
			},
		);
		request.on("error", reject);
		request.end(body);
	});
}

export type Running = {
	readonly server: Server;
	readonly url: string;
	readonly home: string;
	readonly token: string;
	readonly faux: FauxProviderHandle;
	call(name: string, body: unknown, token?: string): Promise<Reply>;
	pair(device: string): Promise<string>;
	watch(name: string, body: unknown, token?: string): Watch;
	restart(changes?: TestOptions): Promise<Running>;
	close(): Promise<void>;
};

export type TestOptions = Partial<Omit<ServerOptions, "models">> & {
	models?: ReturnType<typeof faux>;
	token?: string;
};

export async function start(
	options: TestOptions = {},
	device = "laptop",
): Promise<Running> {
	const home = options.home ?? (await newHome());
	const models = options.models ?? faux();
	const { token: existing, ...rest } = options;
	const server = await startServer({
		modules: {},
		port: 0,
		...rest,
		home,
		models: models.models,
	});
	const url = `http://127.0.0.1:${server.address.port}`;
	const call = (name: string, body: unknown, token?: string) =>
		send(
			url,
			`/v1/${name}`,
			JSON.stringify(body),
			token === undefined ? {} : { Authorization: `Bearer ${token}` },
		);
	const pair = async (name: string) => {
		const issued = await requestAdmin(home, { command: "pair", device: name });
		assert.ok("code" in issued, JSON.stringify(issued));
		const paired = await call("pair", { code: issued.code });
		assert.ok(paired.body.result, JSON.stringify(paired.body));
		return paired.body.result.token as string;
	};
	const token = existing ?? (await pair(device));
	return {
		server,
		url,
		home,
		token,
		faux: models.faux,
		call: (name, body, as = token) => call(name, body, as),
		pair,
		watch: (name, body, as = token) => watch(url, name, body, as),
		restart: async (changes = {}) => {
			await server.close();
			return start({ ...options, home, models, token, ...changes });
		},
		close: () => server.close(),
	};
}

export type Watch = {
	status: number;
	headers: http.IncomingHttpHeaders;
	value: any;
	frames: number;
	heartbeats: number;
	end: string | undefined;
	closed: boolean;
	refused: Reply["body"] | undefined;
	newest: number;
	held: Map<number, any>;
	gaps: { minEntryId: number; maxEntryId: number }[];
	response: http.IncomingMessage | undefined;
	until(test: (watch: Watch) => boolean, what?: string): Promise<void>;
	close(): void;
};

export function watch(
	url: string,
	name: string,
	body: unknown,
	token: string,
): Watch {
	const waiters = new Set<{
		test: (w: Watch) => boolean;
		resolve: () => void;
	}>();
	const wake = () => {
		for (const waiter of [...waiters]) {
			if (waiter.test(state)) {
				waiters.delete(waiter);
				waiter.resolve();
			}
		}
	};
	const request = http.request(`${url}/v1/${name}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
	});
	const state: Watch = {
		status: 0,
		headers: {},
		value: undefined,
		frames: 0,
		heartbeats: 0,
		end: undefined,
		closed: false,
		refused: undefined,
		newest: 0,
		held: new Map(),
		gaps: [],
		response: undefined,
		until: (test, what = "the watch") =>
			test(state)
				? Promise.resolve()
				: new Promise((resolve, reject) => {
						const timer = setTimeout(
							() => reject(new Error(`timed out waiting for ${what}`)),
							10_000,
						);
						waiters.add({
							test,
							resolve: () => {
								clearTimeout(timer);
								resolve();
							},
						});
					}),
		close: () => request.destroy(),
	};
	request.on("response", (response) => {
		state.response = response;
		state.status = response.statusCode ?? 0;
		state.headers = response.headers;
		response.setEncoding("utf8");
		let pending = "";
		response.on("data", (chunk: string) => {
			pending += chunk;
			if (state.status !== 200) return;
			for (
				let cut = pending.indexOf("\n\n");
				cut >= 0;
				cut = pending.indexOf("\n\n")
			) {
				const block = pending.slice(0, cut);
				pending = pending.slice(cut + 2);
				if (block.startsWith(":")) {
					state.heartbeats++;
					continue;
				}
				assert.ok(block.startsWith("data: "), block);
				const frame = JSON.parse(block.slice(6));
				state.frames++;
				if (frame.end !== undefined) {
					state.end = frame.end.reason;
					continue;
				}
				const before = state.newest;
				state.value = applyImmutable(state.value, frame.ops as Op[]);
				const entries = state.value?.entries;
				if (Array.isArray(entries)) {
					for (const entry of entries) state.held.set(entry.id, entry);
					for (const id of state.held.keys())
						state.newest = Math.max(state.newest, id);
					const gapEnd = state.value.before;
					if (before > 0 && gapEnd !== undefined && gapEnd > before) {
						state.gaps.push({ minEntryId: before + 1, maxEntryId: gapEnd });
					}
				}
			}
			wake();
		});
		const finish = () => {
			if (state.status !== 200 && pending !== "")
				state.refused = JSON.parse(pending);
			state.closed = true;
			wake();
		};
		response.on("end", finish);
		response.on("close", finish);
		response.on("error", finish);
	});
	request.on("error", () => {
		state.closed = true;
		wake();
	});
	request.end(JSON.stringify(body));
	return state;
}

export async function until(
	what: string,
	test: () => boolean | Promise<boolean>,
): Promise<void> {
	for (let i = 0; i < 1000; i++) {
		if (await test()) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert.fail(`never: ${what}`);
}

export const TWENTY_CALLS = [
	"extensions",
	"models",
	"projects",
	"bind",
	"addExtensions",
	"options",
	"setOptions",
	"create",
	"conversations",
	"open",
	"history",
	"input",
	"continue",
	"stop",
	"setModel",
	"inbox",
	"decision",
	"answer",
	"timeline",
	"faults",
] as const;
